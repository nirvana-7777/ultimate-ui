"""
API clients for webepg and ultimate-backend.

Error model
-----------
Every request that the UI needs *data* from raises :class:`UpstreamError` when
the upstream service is unreachable, times out, answers with an error status
or returns something that is not JSON. The previous version swallowed these
errors and returned ``[]`` / ``{}``, which made "backend down" indistinguishable
from "backend has no data" - the React UI could therefore never show its error
banner. Only the monitoring helpers (:meth:`WebEPGClient.get_health`,
:meth:`~WebEPGClient.get_import_status`, :meth:`~WebEPGClient.get_statistics`)
stay tolerant on purpose: a status page must render while a service is down.
"""

import datetime
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests
from requests.exceptions import RequestException, Timeout

logger = logging.getLogger(__name__)


def _seg(value: Any) -> str:
    """Percent-encode a value for use as ONE URL path segment.

    Channel identifiers can be names or aliases ("ZDF HD", "Das Erste"), so
    they are encoded instead of validated. This also stops a decoded ``?``,
    ``#`` or ``/`` in a route parameter from rewriting the upstream URL.
    """
    encoded = quote(str(value), safe="")
    if encoded and set(encoded) == {"."}:
        # "." / ".." are dot-segments that HTTP clients normalise away.
        encoded = encoded.replace(".", "%2E")
    return encoded


class UpstreamError(Exception):
    """An upstream service could not deliver what the UI asked for.

    ``message`` is safe to show to the browser (no internal hostnames);
    ``detail`` is for the server log only; ``status`` is the HTTP status the
    Flask layer should answer with.
    """

    def __init__(
        self,
        service: str,
        message: str,
        status: int = 502,
        detail: Optional[str] = None,
    ):
        super().__init__(message)
        self.service = service
        self.message = message
        self.status = status
        self.detail = detail or message


def _upstream_message(resp: requests.Response) -> str:
    """Best-effort human message from an upstream error body (4xx only)."""
    try:
        body = resp.json()
    except ValueError:
        return ""
    if isinstance(body, dict):
        for key in ("error", "message", "detail"):
            value = body.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:200]
    return ""


class _BaseClient:
    service_name = "Upstream"

    def __init__(self, base_url: str, timeout: int = 10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Any = None,
        timeout: Optional[float] = None,
    ) -> Any:
        name = self.service_name
        url = f"{self.base_url}{path}"
        try:
            resp = self.session.request(
                method,
                url,
                params=params,
                json=json,
                timeout=timeout or self.timeout,
            )
        except Timeout as e:
            raise UpstreamError(
                name, f"{name} timed out", 504, f"{method} {url}: {e}"
            ) from e
        except RequestException as e:
            raise UpstreamError(
                name, f"{name} is not reachable", 502, f"{method} {url}: {e}"
            ) from e

        if resp.status_code >= 400:
            # 4xx = the request was wrong (e.g. unknown provider id): pass the
            # status through. 5xx = the upstream is broken: report a bad gateway.
            if resp.status_code < 500:
                msg = _upstream_message(resp) or f"{name} rejected the request"
                raise UpstreamError(
                    name,
                    msg,
                    resp.status_code,
                    f"{method} {url}: HTTP {resp.status_code}",
                )
            raise UpstreamError(
                name,
                f"{name} returned an error (HTTP {resp.status_code})",
                502,
                f"{method} {url}: HTTP {resp.status_code}",
            )

        if resp.status_code == 204 or not resp.content:
            return None
        try:
            return resp.json()
        except ValueError as e:
            raise UpstreamError(
                name,
                f"{name} returned an invalid response",
                502,
                f"{method} {url}: {e}",
            ) from e

    def _expect_list(self, data: Any, what: str) -> List[Dict]:
        if not isinstance(data, list):
            raise UpstreamError(
                self.service_name,
                f"{self.service_name} returned an unexpected {what} format",
                502,
            )
        return data


class WebEPGClient(_BaseClient):
    """Client for interacting with webepg backend."""

    service_name = "WebEPG"

    # ------------------------------------------------------------------
    # Tolerant helpers (monitoring)
    # ------------------------------------------------------------------
    def get_health(self) -> bool:
        """Check if webepg is healthy. Never raises."""
        try:
            response = self.session.get(
                f"{self.base_url}/api/v1/health",
                timeout=min(self.timeout, 2),  # shorter timeout for health check
            )
            return response.status_code == 200
        except RequestException:
            logger.debug("WebEPG health check failed: could not connect")
            return False
        except Exception as e:  # pragma: no cover - defensive
            logger.debug(f"WebEPG health check failed: {e}")
            return False

    def get_import_status(self) -> Dict:
        """Get import job status. Returns {} when webepg is unavailable."""
        try:
            data = self._request("GET", "/api/v1/import/status")
        except UpstreamError as e:
            logger.warning(f"Import status unavailable: {e.detail}")
            return {}
        return data if isinstance(data, dict) else {}

    def get_statistics(self) -> Dict:
        """Get EPG statistics, falling back to a rough estimate."""
        try:
            data = self._request("GET", "/api/v1/statistics")
            if isinstance(data, dict):
                return data
        except UpstreamError as e:
            logger.warning(f"Statistics unavailable, estimating: {e.detail}")
        return self._calculate_basic_stats()

    def _calculate_basic_stats(self) -> Dict:
        """Calculate basic statistics from available data."""
        stats = {"total_channels": 0, "estimated_programs_today": 0}
        try:
            channels = self.get_channels()
            stats["total_channels"] = len(channels)

            now = datetime.datetime.now(datetime.timezone.utc)
            today = now.isoformat()
            tomorrow = (now + datetime.timedelta(days=1)).isoformat()

            programs_today = 0
            for channel in channels[:5]:  # sample first 5 channels
                if "id" in channel:
                    programs_today += len(
                        self.get_channel_programs(str(channel["id"]), today, tomorrow)
                    )
            stats["estimated_programs_today"] = programs_today
        except Exception as e:
            logger.debug(f"Basic statistics fallback incomplete: {e}")
        return stats

    # ------------------------------------------------------------------
    # Channels / programs
    # ------------------------------------------------------------------
    def get_channels(self) -> List[Dict]:
        """Get all channels. Raises UpstreamError on any failure."""
        data = self._request("GET", "/api/v1/channels")
        return self._expect_list(data, "channel list")

    def get_channel(self, channel_identifier: str) -> Optional[Dict]:
        """Get specific channel by ID, name, or alias (None if unknown)."""
        try:
            return self._request("GET", f"/api/v1/channels/{_seg(channel_identifier)}")
        except UpstreamError as e:
            if e.status == 404:
                return None
            raise

    def get_channel_programs(
        self,
        channel_identifier: str,
        start: str,
        end: str,
        provider: Optional[str] = None,
    ) -> List[Dict]:
        """Get programs for a channel within a time range.

        ``provider`` scopes provider-native channel ids (Ultimate Backend ids
        are only unambiguous together with their provider).
        """
        params = {"start": start, "end": end}
        if provider:
            params["provider"] = provider
        data = self._request(
            "GET",
            f"/api/v1/channels/{_seg(channel_identifier)}/programs",
            params=params,
        )
        return self._expect_list(data, "program list")

    # ------------------------------------------------------------------
    # Providers
    # ------------------------------------------------------------------
    def get_providers(self) -> List[Dict]:
        """Get all EPG providers."""
        data = self._request("GET", "/api/v1/providers")
        return self._expect_list(data, "provider list")

    def get_provider(self, provider_id: int) -> Any:
        return self._request("GET", f"/api/v1/providers/{_seg(provider_id)}")

    def create_provider(
        self, name: str, xmltv_url: str, enabled: Optional[bool] = None
    ) -> Any:
        """Create a new EPG provider (optionally with an explicit enabled flag)."""
        result = self._request(
            "POST", "/api/v1/providers", json={"name": name, "xmltv_url": xmltv_url}
        )
        if enabled is not None and isinstance(result, dict) and result.get("id"):
            return self.update_provider(
                result["id"],
                {"name": name, "xmltv_url": xmltv_url, "enabled": enabled},
            )
        return result

    def update_provider(self, provider_id: int, data: Dict[str, Any]) -> Any:
        return self._request("PUT", f"/api/v1/providers/{_seg(provider_id)}", json=data)

    def delete_provider(self, provider_id: int) -> None:
        self._request("DELETE", f"/api/v1/providers/{_seg(provider_id)}")

    def test_provider(self, provider_id: int) -> Any:
        return self._request("GET", f"/api/v1/providers/{_seg(provider_id)}/test")

    def trigger_provider_import(self, provider_id: int) -> Any:
        return self._request(
            "POST", f"/api/v1/providers/{_seg(provider_id)}/import/trigger"
        )

    # ------------------------------------------------------------------
    # Aliases
    # ------------------------------------------------------------------
    def create_channel_alias(
        self, channel_identifier: str, alias: str, alias_type: Optional[str] = None
    ) -> Any:
        """Create a channel alias."""
        data = {"alias": alias}
        if alias_type:
            data["alias_type"] = alias_type
        return self._request(
            "POST",
            f"/api/v1/channels/{_seg(channel_identifier)}/aliases",
            json=data,
        )

    def list_channel_aliases(self, channel_identifier: str) -> Any:
        return self._request(
            "GET", f"/api/v1/channels/{_seg(channel_identifier)}/aliases"
        )

    def list_aliases(self) -> Any:
        return self._request("GET", "/api/v1/aliases")

    def list_aliases_paginated(self, params: Dict[str, Any]) -> Any:
        return self._request("GET", "/api/v1/aliases/paginated", params=params)

    def get_alias_statistics(self) -> Any:
        return self._request("GET", "/api/v1/aliases/statistics")

    def get_alias_mapping(self) -> Any:
        return self._request("GET", "/api/v1/aliases/mapping")

    def delete_alias(self, alias_id: int) -> None:
        self._request("DELETE", f"/api/v1/aliases/{_seg(alias_id)}")

    # ------------------------------------------------------------------
    # Import
    # ------------------------------------------------------------------
    def trigger_import(self) -> Any:
        """Manually trigger import job. Raises UpstreamError on failure."""
        data = self._request("POST", "/api/v1/import/trigger", timeout=30)
        return data if data is not None else {}


class UltimateBackendClient(_BaseClient):
    """Client for interacting with ultimate-backend."""

    service_name = "Ultimate Backend"

    def get_providers(self) -> Any:
        """Get available providers from ultimate-backend."""
        return self._request("GET", "/api/providers")

    def get_provider_channels(self, provider_id: str) -> Any:
        """Get channels for a specific provider."""
        return self._request("GET", f"/api/providers/{_seg(provider_id)}/channels")

    def get_manifest(self, provider_id: str, channel_id: str) -> Dict[str, Any]:
        """Get the catchup manifest of one channel."""
        data = self._request(
            "GET",
            f"/api/providers/{_seg(provider_id)}/channels/{_seg(channel_id)}/manifest",
        )
        if not isinstance(data, dict):
            raise UpstreamError(
                self.service_name,
                "Ultimate Backend returned an unexpected manifest",
                502,
            )
        return data

    def get_all_channels(self) -> Dict[str, Any]:
        """Get all channels grouped by provider (failing providers are skipped)."""
        providers = self.get_providers()
        if isinstance(providers, dict):
            providers = providers.get("providers", [])
        all_channels: Dict[str, Any] = {}

        for provider in providers or []:
            provider_id = provider.get("id")
            if not provider_id:
                continue
            try:
                channels = self.get_provider_channels(provider_id)
            except UpstreamError as e:
                logger.warning(f"Skipping provider {provider_id}: {e.detail}")
                continue
            all_channels[provider_id] = {
                "provider_info": provider,
                "channels": channels,
            }

        return all_channels
