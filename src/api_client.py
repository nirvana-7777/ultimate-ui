"""
API clients for webepg and ultimate-backend.
"""

import requests
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


class WebEPGClient:
    """Client for interacting with webepg backend."""

    def __init__(self, base_url: str, timeout: int = 10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get_health(self) -> bool:
        """Check if webepg is healthy."""
        try:
            response = requests.get(
                f"{self.base_url}/api/v1/health", timeout=self.timeout
            )
            return response.status_code == 200
        except:
            return False

    def get_channels(self) -> List[Dict]:
        """Get all channels."""
        try:
            response = requests.get(
                f"{self.base_url}/api/v1/channels", timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching channels: {e}")
            return []

    def get_channel(self, channel_identifier: str) -> Optional[Dict]:
        """Get specific channel by ID, name, or alias."""
        try:
            response = requests.get(
                f"{self.base_url}/api/v1/channels/{channel_identifier}",
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()
        except:
            return None

    def get_channel_programs(
        self, channel_identifier: str, start: str, end: str
    ) -> List[Dict]:
        """Get programs for a channel within time range."""
        try:
            params = {"start": start, "end": end}
            response = requests.get(
                f"{self.base_url}/api/v1/channels/{channel_identifier}/programs",
                params=params,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching programs: {e}")
            return []

    def get_providers(self) -> List[Dict]:
        """Get all EPG providers."""
        try:
            response = requests.get(
                f"{self.base_url}/api/v1/providers", timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except:
            return []

    def create_provider(self, name: str, xmltv_url: str) -> Optional[Dict]:
        """Create a new EPG provider."""
        try:
            data = {"name": name, "xmltv_url": xmltv_url}
            response = requests.post(
                f"{self.base_url}/api/v1/providers", json=data, timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except:
            return None

    def create_channel_alias(
            self, channel_identifier: str, alias: str, alias_type: Optional[str] = None
    ) -> Optional[Dict]:
        """Create a channel alias."""
        try:
            data = {"alias": alias}
            if alias_type:
                data["alias_type"] = alias_type

            response = requests.post(
                f"{self.base_url}/api/v1/channels/{channel_identifier}/aliases",
                json=data,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error creating alias: {e}")
            return None

    def get_import_status(self) -> Dict:
        """Get import job status."""
        try:
            response = requests.get(
                f"{self.base_url}/api/v1/import/status", timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except:
            return {}

    def trigger_import(self) -> Dict:
        """Manually trigger import job."""
        try:
            response = requests.post(
                f"{self.base_url}/api/v1/import/trigger", timeout=30
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}

    def get_statistics(self) -> Dict:
        """Get EPG statistics."""
        try:
            # This endpoint needs to be added to webepg
            response = requests.get(
                f"{self.base_url}/api/v1/statistics", timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except:
            # Fallback: Try to calculate basic stats from other endpoints
            return self._calculate_basic_stats()

    def _calculate_basic_stats(self) -> Dict:
        """Calculate basic statistics from available data."""
        stats = {}
        try:
            channels = self.get_channels()
            stats["total_channels"] = len(channels)

            # Get programs for today to estimate
            import datetime

            today = datetime.datetime.now().isoformat()
            tomorrow = (
                datetime.datetime.now() + datetime.timedelta(days=1)
            ).isoformat()

            programs_today = 0
            for channel in channels[:5]:  # Sample first 5 channels
                if "id" in channel:
                    programs = self.get_channel_programs(
                        str(channel["id"]), today, tomorrow
                    )
                    programs_today += len(programs)

            stats["estimated_programs_today"] = programs_today

        except:
            pass

        return stats


class UltimateBackendClient:
    """Client for interacting with ultimate-backend."""

    def __init__(self, base_url: str, timeout: int = 10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get_providers(self) -> List[Dict]:
        """Get available providers from ultimate-backend."""
        try:
            response = requests.get(
                f"{self.base_url}/api/providers", timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except:
            return []

    def get_provider_channels(self, provider_id: str) -> List[Dict]:
        """Get channels for a specific provider."""
        try:
            response = requests.get(
                f"{self.base_url}/api/providers/{provider_id}/channels",
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()
        except:
            return []

    def get_all_channels(self) -> Dict[str, List[Dict]]:
        """Get all channels grouped by provider."""
        providers = self.get_providers()
        all_channels = {}

        for provider in providers:
            provider_id = provider.get("id")
            if provider_id:
                channels = self.get_provider_channels(provider_id)
                all_channels[provider_id] = {
                    "provider_info": provider,
                    "channels": channels,
                }

        return all_channels
