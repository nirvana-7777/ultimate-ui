"""
Flask application for ultimate-ui.

Serves the React SPA (src/static/dist, built from ultimate-ui-react/) and a
JSON API that proxies WebEPG and the Ultimate Backend, so the browser never
needs CORS access to either of them.

Security model
--------------
* There is NO authentication here. Run the UI on a trusted network or put a
  reverse proxy with auth (see nginx/nginx.conf) in front of it.
* Every state-changing request (POST/PUT/PATCH/DELETE) must carry an
  ``X-Requested-With`` header. Browsers cannot send a custom header
  cross-origin without a CORS preflight, and this app sends no CORS headers,
  so a third-party web page cannot make a visitor's browser change settings
  (CSRF protection).
* Errors returned to the browser never contain upstream hostnames or Python
  exception text; details go to the log.
"""

import hashlib
import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

import pytz
import requests
from flask import (
    Flask,
    Response,
    jsonify,
    redirect,
    render_template,
    request,
    stream_with_context,
)
from werkzeug.exceptions import HTTPException

from . import __version__
from .api_client import UltimateBackendClient, UpstreamError, WebEPGClient
from .config import Config, ConfigError

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration + lazily created upstream clients
# ---------------------------------------------------------------------------
config_path = os.getenv("ULTIMATE_UI_CONFIG", "config/config.yaml")
config = Config(config_path)

_clients_lock = threading.Lock()
_webepg_client: Optional[WebEPGClient] = None
_ultimate_backend_client: Optional[UltimateBackendClient] = None


def _get_config_value(key, default):
    """Safely get config value with fallback."""
    value = config.get(key)
    return value if value is not None else default


def get_webepg_client() -> WebEPGClient:
    """Get or create WebEPG client with lazy initialization."""
    global _webepg_client
    with _clients_lock:
        if _webepg_client is None:
            _webepg_client = WebEPGClient(
                base_url=_get_config_value("webepg.url", "http://localhost:8080"),
                timeout=_get_config_value("webepg.timeout", 10),
            )
        return _webepg_client


def get_ultimate_backend_client() -> UltimateBackendClient:
    """Get or create Ultimate Backend client with lazy initialization."""
    global _ultimate_backend_client
    with _clients_lock:
        if _ultimate_backend_client is None:
            _ultimate_backend_client = UltimateBackendClient(
                base_url=_get_config_value(
                    "ultimate_backend.url", "http://localhost:3000"
                ),
                timeout=_get_config_value("ultimate_backend.timeout", 10),
            )
        return _ultimate_backend_client


def update_clients():
    """Drop cached clients so the next request uses the new configuration."""
    global _webepg_client, _ultimate_backend_client
    with _clients_lock:
        _webepg_client = None
        _ultimate_backend_client = None


app = Flask(__name__, template_folder="templates", static_folder="static")
# No SECRET_KEY: the app uses no sessions or signed cookies.

CSRF_HEADER = "X-Requested-With"
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class ClientError(Exception):
    """The request itself is invalid (answered with a 4xx JSON error)."""

    def __init__(self, message: str, status: int = 400, **extra: Any):
        super().__init__(message)
        self.message = message
        self.status = status
        self.extra = extra


def _err(message: str, http_status: int, **extra: Any):
    body = {"success": False, "error": message, "message": message}
    body.update(extra)
    return jsonify(body), http_status


# ---------------------------------------------------------------------------
# SPA bootstrap data
# ---------------------------------------------------------------------------
# Only what the React UI actually reads. Everything else in config.yaml is NOT
# sent to the browser. Any key added here ships to the browser and must not
# contain secrets.
SPA_CONFIG_KEYS = {
    "webepg": ["url", "timeout"],
    "ultimate_backend": ["url", "public_url", "timeout"],
    "ui": ["theme", "refresh_interval", "timezone"],
    "player": [
        "default_size",
        "default_bitrate",
        "autoplay",
        "muted",
        "default_volume",
    ],
    "database": ["retention_days"],
    "catchup": ["max_hours"],
}


def _public_spa_config(cfg: dict) -> dict:
    out = {}
    for section, keys in SPA_CONFIG_KEYS.items():
        src = cfg.get(section) or {}
        out[section] = (
            {k: src[k] for k in keys if k in src} if isinstance(src, dict) else {}
        )
    return out


_asset_hash_cache: Dict[str, Tuple[int, str]] = {}


def _asset_version(name: str) -> str:
    """SHA-256 prefix of a built asset, used as ?v= (re-hashed only on change)."""
    path = os.path.join(app.static_folder or "static", "dist", "assets", name)
    try:
        mtime = os.stat(path).st_mtime_ns
        cached = _asset_hash_cache.get(name)
        if cached and cached[0] == mtime:
            return cached[1]
        with open(path, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()[:12]
        _asset_hash_cache[name] = (mtime, digest)
        return digest
    except OSError:
        return "0"


@app.context_processor
def inject_config():
    """Template variables.

    ``config`` / ``current_year`` / ``current_time`` / ``config_path`` are the
    original (pre-SPA) variables; ``spa_config`` and ``asset_v`` are what
    templates/spa.html uses. Only ``spa_config`` is ever sent to the browser.
    """
    cfg = config.to_dict()
    return {
        "config": cfg,
        "current_year": datetime.now().year,
        "current_time": datetime.now().strftime("%a, %d.%m %H:%M"),
        "config_path": config_path,
        "spa_config": _public_spa_config(cfg),
        "asset_v": {
            "js": _asset_version("index.js"),
            "css": _asset_version("index.css"),
        },
    }


# ---------------------------------------------------------------------------
# Jinja filters
# ---------------------------------------------------------------------------
# Unused by templates/spa.html; kept unchanged for existing tests and any custom
# template that still relies on them.
def _parse_iso(value):
    """ISO string (with Z / offset / naive=UTC) or datetime -> aware datetime."""
    if isinstance(value, str):
        if "Z" in value:
            date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        elif "+" in value or "-" in value[10:]:  # has timezone offset
            date = datetime.fromisoformat(value)
        else:
            date = datetime.fromisoformat(value + "+00:00")  # assume UTC
    else:
        date = value
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return date


@app.template_filter("format_time")
def format_time(value):
    """Format datetime to HH:MM time string with timezone conversion."""
    if not value:
        return ""

    try:
        ui_timezone = config.get("ui.timezone", "Europe/Berlin")
        local_date = _parse_iso(value).astimezone(pytz.timezone(ui_timezone))
        return local_date.strftime("%H:%M")

    except Exception as e:
        logger.warning(f"Could not format time {value}: {e}")
        # Fallback: try to return just the time part if it's a string
        if isinstance(value, str) and "T" in value:
            try:
                return value.split("T")[1][:5]  # Extract HH:MM from ISO string
            except (IndexError, ValueError, AttributeError) as fallback_error:
                logger.debug(f"Fallback formatting also failed: {fallback_error}")

        # Return a safe representation
        if isinstance(value, str):
            return value[:16]  # Return first 16 chars of string
        elif hasattr(value, "__str__"):
            return str(value)
        else:
            return ""


@app.template_filter("format_datetime")
def format_datetime(value):
    """Format datetime with date and time in local timezone."""
    if not value:
        return ""

    try:
        ui_timezone = config.get("ui.timezone", "Europe/Berlin")
        local_date = _parse_iso(value).astimezone(pytz.timezone(ui_timezone))
        return local_date.strftime("%d.%m.%Y %H:%M")

    except Exception as e:
        logger.warning(f"Could not format datetime {value}: {e}")
        return str(value)


@app.template_filter("truncate")
def truncate_filter(text, length=100):
    """Truncate text to specified length."""
    if not text:
        return ""
    if len(text) <= length:
        return text
    return text[:length] + "..."


@app.template_filter("time_diff")
def time_diff_filter(start, end):
    """Calculate time difference between two datetimes."""
    if not start or not end:
        return "-"
    try:
        if isinstance(start, str):
            start = datetime.fromisoformat(start.replace("Z", "+00:00"))
        if isinstance(end, str):
            end = datetime.fromisoformat(end.replace("Z", "+00:00"))

        diff = end - start
        hours = diff.seconds // 3600
        minutes = (diff.seconds % 3600) // 60
        seconds = diff.seconds % 60

        if hours > 0:
            return f"{hours}h {minutes}m {seconds}s"
        elif minutes > 0:
            return f"{minutes}m {seconds}s"
        else:
            return f"{seconds}s"
    except Exception as e:
        logger.warning(f"Could not calculate time diff: {e}")
        return "-"


# ---------------------------------------------------------------------------
# Request hooks
# ---------------------------------------------------------------------------
@app.before_request
def _before_request():
    if request.path.startswith("/static/"):
        return None

    # Another gunicorn worker may have saved a new config.yaml.
    if config.reload_if_changed():
        update_clients()
        logger.info("config file changed on disk - configuration reloaded")

    if request.method in _MUTATING_METHODS and not request.headers.get(CSRF_HEADER):
        return _err(f"Missing {CSRF_HEADER} header", 403)
    return None


@app.after_request
def _after_request(resp: Response):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    # Built assets are content-addressed (?v=<hash> / hashed chunk names).
    if request.path.startswith("/static/dist/assets/") and resp.status_code == 200:
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.path.startswith("/api/") or request.path in ("/config", "/health"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.errorhandler(ClientError)
def _handle_client_error(e: ClientError):
    return _err(e.message, e.status, **e.extra)


@app.errorhandler(UpstreamError)
def _handle_upstream_error(e: UpstreamError):
    logger.warning(f"{e.service}: {e.detail}")
    return _err(e.message, e.status)


@app.errorhandler(HTTPException)
def _handle_http_exception(e: HTTPException):
    code = e.code or 500
    if request.path.startswith("/api/") or request.method != "GET":
        return _err(e.name, code)
    if code == 404 and not request.path.startswith("/static/"):
        # Unknown browser URL: hand it to the SPA (its router redirects to /).
        return render_template("spa.html"), 404
    return e.name, code


@app.errorhandler(Exception)
def _handle_unexpected(e: Exception):
    logger.exception(f"Unhandled error on {request.method} {request.path}")
    return _err("Internal server error", 500)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
_IDENT_RE = re.compile(r"^(?!\.+$)[A-Za-z0-9._-]+$")  # no "." / ".." only


def _json_body() -> Dict[str, Any]:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ClientError("Request body must be a JSON object")
    return data


def _int_arg(name: str, default: int, lo: int, hi: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ClientError(f"{name} must be an integer")
    if not lo <= value <= hi:
        raise ClientError(f"{name} must be between {lo} and {hi}")
    return value


def _check_http_url(value: Any, field: str, allow_empty: bool = False) -> str:
    if value is None or (isinstance(value, str) and not value.strip()):
        if allow_empty:
            return ""
        raise ValueError(f"{field} is required")
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError(f"{field} must be a URL string")
    value = value.strip()
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"{field} must be an http(s) URL")
    if any(c.isspace() for c in value):
        raise ValueError(f"{field} must not contain whitespace")
    return value


def _int_in(lo: int, hi: int):
    def check(value: Any, field: str) -> int:
        if isinstance(value, bool):
            raise ValueError(f"{field} must be an integer")
        try:
            number = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"{field} must be an integer")
        if not lo <= number <= hi:
            raise ValueError(f"{field} must be between {lo} and {hi}")
        return number

    return check


def _choice(*options: str):
    def check(value: Any, field: str) -> str:
        if value not in options:
            raise ValueError(f"{field} must be one of: {', '.join(options)}")
        return value

    return check


def _bool(value: Any, field: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.lower() in ("true", "false"):
        return value.lower() == "true"
    raise ValueError(f"{field} must be true or false")


def _timezone(value: Any, field: str) -> str:
    if not isinstance(value, str) or value not in pytz.all_timezones_set:
        raise ValueError(f"{field} is not a known timezone")
    return value


def _bitrate(value: Any, field: str) -> str:
    value = str(value)
    if value == "auto" or (value.isdigit() and 100_000 <= int(value) <= 100_000_000):
        return value
    raise ValueError(f"{field} must be 'auto' or a bitrate in bit/s")


# payload key -> (config path, validator). Keys that are absent from the
# payload are left untouched (partial updates are fine).
_CONFIG_FIELDS = {
    "webepg_url": ("webepg.url", lambda v, f: _check_http_url(v, f)),
    "webepg_timeout": ("webepg.timeout", _int_in(1, 120)),
    "ultimate_backend_url": (
        "ultimate_backend.url",
        lambda v, f: _check_http_url(v, f),
    ),
    "ultimate_backend_public_url": (
        "ultimate_backend.public_url",
        lambda v, f: _check_http_url(v, f, allow_empty=True),
    ),
    "ultimate_backend_timeout": ("ultimate_backend.timeout", _int_in(1, 120)),
    "ui_theme": ("ui.theme", _choice("dark", "light", "auto")),
    "refresh_interval": ("ui.refresh_interval", _int_in(30, 86400)),
    "timezone": ("ui.timezone", _timezone),
    "player_size": ("player.default_size", _choice("small", "medium", "large")),
    "player_bitrate": ("player.default_bitrate", _bitrate),
    "autoplay": ("player.autoplay", _bool),
    "muted": ("player.muted", _bool),
    "default_volume": ("player.default_volume", _int_in(0, 100)),
    "catchup_max_hours": ("catchup.max_hours", _int_in(1, 8760)),
    "retention_days": ("database.retention_days", _int_in(1, 365)),
}


def validate_config_payload(
    data: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, str]]:
    """Validate the flat settings payload and return (nested_update, errors)."""
    cleaned: Dict[str, Any] = {}
    errors: Dict[str, str] = {}
    for key, (dotted, validator) in _CONFIG_FIELDS.items():
        if key not in data:
            continue
        try:
            value = validator(data[key], key)
        except ValueError as e:
            errors[key] = str(e)
            continue
        section, name = dotted.split(".")
        cleaned.setdefault(section, {})[name] = value
    return cleaned, errors


def _env_override_warnings(submitted: Dict[str, Any]) -> list:
    """Warn when an environment variable beats the value the user just saved."""
    warnings = []
    for dotted, env_name in config.overridden_by_env().items():
        section, name = dotted.split(".")
        if section in submitted and name in submitted[section]:
            if submitted[section][name] != config.get(dotted):
                warnings.append(
                    f"{env_name} is set in the container environment and overrides "
                    f"the saved value for {dotted}; remove it to use the UI setting."
                )
    return warnings


# ---------------------------------------------------------------------------
# Pages (all served by the React SPA)
# ---------------------------------------------------------------------------
@app.route("/", methods=["GET"])
@app.route("/providers", methods=["GET"])
@app.route("/monitoring", methods=["GET"])
@app.route("/mapping", methods=["GET"])
def spa_index():
    return render_template("spa.html")


@app.route("/epg", methods=["GET"])
def legacy_epg_redirect():
    """Old server-rendered EPG page; the SPA shows the EPG at '/'."""
    return redirect("/", code=301)


@app.route("/health")
def health():
    """Simple health check endpoint (does not call upstream services)."""
    return jsonify(
        {"status": "healthy", "service": "ultimate-ui", "version": __version__}
    )


@app.route("/favicon.ico")
def favicon():
    return "", 204


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
@app.route("/config", methods=["GET", "POST"])
def configuration():
    """GET: SPA page. POST: validate and persist settings (JSON body)."""
    if request.method == "GET":
        return render_template("spa.html")

    data = _json_body()
    cleaned, errors = validate_config_payload(data)
    if errors:
        summary = "Invalid settings: " + "; ".join(errors.values())
        return _err(summary, 400, errors=errors)

    try:
        config.save(cleaned)
    except (OSError, ConfigError) as e:
        logger.error(f"Could not save configuration to {config.path}: {e}")
        return _err(
            "Configuration could not be saved (is the config directory writable "
            "for the container user?)",
            500,
        )
    update_clients()
    return jsonify(
        {
            "success": True,
            "message": "Configuration saved!",
            "warnings": _env_override_warnings(cleaned),
        }
    )


@app.route("/config/reset", methods=["POST"])
def configuration_reset():
    """Overwrite the saved settings with the built-in defaults."""
    try:
        config.reset()
    except (OSError, ConfigError) as e:
        logger.error(f"Could not reset configuration at {config.path}: {e}")
        return _err(
            "Configuration could not be reset (config directory not writable?)", 500
        )
    update_clients()
    return jsonify(
        {
            "success": True,
            "message": "Configuration reset to defaults",
            "warnings": _env_override_warnings(Config.DEFAULT_CONFIG),
        }
    )


# ---------------------------------------------------------------------------
# WebEPG proxy: providers
# ---------------------------------------------------------------------------
@app.route("/api/providers", methods=["GET"])
def api_list_providers():
    return jsonify(get_webepg_client().get_providers())


@app.route("/api/providers/<int:provider_id>", methods=["GET"])
def api_get_provider(provider_id):
    return jsonify(get_webepg_client().get_provider(provider_id))


@app.route("/api/providers", methods=["POST"])
def api_create_provider():
    data = _json_body()
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ClientError("name is required")
    try:
        xmltv_url = _check_http_url(data.get("xmltv_url"), "xmltv_url")
    except ValueError as e:
        raise ClientError(str(e))
    enabled = data.get("enabled")
    if enabled is not None and not isinstance(enabled, bool):
        raise ClientError("enabled must be true or false")
    result = get_webepg_client().create_provider(name.strip(), xmltv_url, enabled)
    return jsonify(result), 201


@app.route("/api/providers/<int:provider_id>", methods=["PUT"])
def api_update_provider(provider_id):
    data = _json_body()
    if "xmltv_url" in data:
        try:
            data["xmltv_url"] = _check_http_url(data["xmltv_url"], "xmltv_url")
        except ValueError as e:
            raise ClientError(str(e))
    return jsonify(get_webepg_client().update_provider(provider_id, data))


@app.route("/api/providers/<int:provider_id>", methods=["DELETE"])
def api_delete_provider(provider_id):
    get_webepg_client().delete_provider(provider_id)
    return "", 204


@app.route("/api/providers/<int:provider_id>/test", methods=["GET"])
def api_test_provider(provider_id):
    return jsonify(get_webepg_client().test_provider(provider_id))


@app.route("/api/providers/<int:provider_id>/import/trigger", methods=["POST"])
def api_trigger_provider_import(provider_id):
    return jsonify(get_webepg_client().trigger_provider_import(provider_id))


# ---------------------------------------------------------------------------
# WebEPG proxy: import, channels, aliases
# ---------------------------------------------------------------------------
@app.route("/api/import/status", methods=["GET"])
def api_import_status():
    # Tolerant on purpose: {} when WebEPG is down (the providers page still renders).
    return jsonify(get_webepg_client().get_import_status())


@app.route("/api/import/trigger", methods=["POST"])
def api_trigger_import():
    return jsonify(get_webepg_client().trigger_import())


@app.route("/api/channels", methods=["GET"])
def api_list_channels():
    return jsonify(get_webepg_client().get_channels())


@app.route("/api/aliases", methods=["GET"])
def api_list_all_aliases():
    return jsonify(get_webepg_client().list_aliases())


@app.route("/api/aliases/paginated", methods=["GET"])
def api_list_aliases_paginated():
    page = _int_arg("page", 1, 1, 1_000_000)
    per_page = _int_arg("per_page", 100, 1, 1000)
    params: Dict[str, Any] = {"page": page, "per_page": per_page}
    alias_type = request.args.get("alias_type")
    if alias_type:
        params["alias_type"] = alias_type
    channel_id = _int_arg("channel_id", 0, 0, 2**31)
    if channel_id:
        params["channel_id"] = channel_id
    return jsonify(get_webepg_client().list_aliases_paginated(params))


@app.route("/api/aliases/statistics", methods=["GET"])
def api_get_alias_statistics():
    return jsonify(get_webepg_client().get_alias_statistics())


@app.route("/api/aliases/mapping", methods=["GET"])
def api_get_alias_mapping():
    return jsonify(get_webepg_client().get_alias_mapping())


@app.route("/api/channels/<channel_identifier>/aliases", methods=["GET"])
def api_list_channel_aliases(channel_identifier):
    return jsonify(get_webepg_client().list_channel_aliases(channel_identifier))


@app.route("/api/aliases/<int:alias_id>", methods=["DELETE"])
def api_delete_alias(alias_id):
    get_webepg_client().delete_alias(alias_id)
    return "", 204


@app.route("/api/epg/channels")
def api_get_channels():
    """Channels with pagination support for infinite scroll."""
    page = _int_arg("page", 0, 0, 1_000_000)
    limit = _int_arg("limit", 20, 1, 200)

    all_channels = get_webepg_client().get_channels()
    start_idx = page * limit
    end_idx = start_idx + limit
    return jsonify(
        {
            "success": True,
            "channels": all_channels[start_idx:end_idx],
            "page": page,
            "limit": limit,
            "total": len(all_channels),
            "has_more": end_idx < len(all_channels),
        }
    )


@app.route("/api/channels/<channel_id>/programs")
def api_get_channel_programs(channel_id):
    """Programs for one channel; ``provider`` scopes provider-native ids."""
    start = request.args.get("start")
    end = request.args.get("end")
    if not start:
        start = datetime.now(timezone.utc).isoformat()
    if not end:
        end = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

    programs = get_webepg_client().get_channel_programs(
        channel_id, start, end, provider=request.args.get("provider") or None
    )
    return jsonify({"success": True, "programs": programs, "channel_id": channel_id})


@app.route("/api/epg/refresh")
def api_refresh_epg():
    """Fresh channel list."""
    channels = get_webepg_client().get_channels()
    return jsonify(
        {
            "success": True,
            "channels": channels,
            "total": len(channels),
            "timestamp": datetime.now().isoformat(),
        }
    )


# ---------------------------------------------------------------------------
# Ultimate Backend proxy (channel mapping)
# ---------------------------------------------------------------------------
@app.route("/api/mapping/providers")
def api_get_mapping_providers():
    return jsonify(
        {"success": True, "providers": get_ultimate_backend_client().get_providers()}
    )


@app.route("/api/mapping/channels/<provider_id>")
def api_get_provider_channels(provider_id):
    if not _IDENT_RE.match(provider_id):
        raise ClientError("invalid provider identifier")
    return jsonify(
        {
            "success": True,
            "channels": get_ultimate_backend_client().get_provider_channels(
                provider_id
            ),
        }
    )


@app.route("/api/mapping/create-alias", methods=["POST"])
def api_create_alias():
    """Create a channel alias in webepg-service."""
    data = _json_body()
    channel_identifier = data.get("channel_identifier")
    alias = data.get("alias")
    alias_type = data.get("alias_type")
    if (
        not isinstance(channel_identifier, (str, int))
        or not str(channel_identifier).strip()
    ):
        raise ClientError("channel_identifier is required")
    if not isinstance(alias, str) or not alias.strip():
        raise ClientError("alias is required")
    if alias_type is not None and not isinstance(alias_type, str):
        raise ClientError("alias_type must be a string")

    result = get_webepg_client().create_channel_alias(
        str(channel_identifier), alias, alias_type
    )
    return jsonify(
        {"success": True, "alias": result, "message": "Alias created successfully"}
    )


# ---------------------------------------------------------------------------
# Catchup download proxy
# ---------------------------------------------------------------------------
# The browser fetches catchup manifests directly from the Ultimate Backend
# (ultimate_backend.public_url, CORS required). Only the .ts download goes
# through Flask: it needs the internal URL and streams server-side.

_manifest_cache: Dict[Any, Any] = {}  # (provider, channel_id) -> (manifest, expiry_ts)
_manifest_cache_lock = threading.Lock()
_MANIFEST_CACHE_TTL = 60  # seconds
_MAX_DOWNLOAD_SECONDS = 24 * 3600


def _get_manifest_cached(provider: str, channel_id: str) -> Dict[str, Any]:
    """Server-side manifest fetch (internal URL, 60 s cache). Never returned
    to the browser."""
    key = (provider, str(channel_id))
    with _manifest_cache_lock:
        entry = _manifest_cache.get(key)
        if entry and entry[1] > time.time():
            return entry[0]

    data = get_ultimate_backend_client().get_manifest(provider, channel_id)

    with _manifest_cache_lock:
        _manifest_cache[key] = (data, time.time() + _MANIFEST_CACHE_TTL)
        if len(_manifest_cache) > 512:  # bound memory on long-running workers
            now = time.time()
            for k in [k for k, v in _manifest_cache.items() if v[1] <= now]:
                _manifest_cache.pop(k, None)
    return data


@app.route("/api/proxy/catchup/download")
def proxy_catchup_download():
    """Stream a catchup recording as a downloadable .ts file.

    The URL is rebuilt server-side from the manifest's TS template - the
    client never supplies a URL (no SSRF surface). Flask answers HEAD for
    GET routes automatically; HEAD is used by the frontend as a pre-flight.
    """
    provider = request.args.get("provider", "")
    channel_id = request.args.get("channel", "")
    start = request.args.get("start", type=int)
    end = request.args.get("end", type=int)
    filename = request.args.get("filename", "")

    if not _IDENT_RE.match(provider):
        return _err("invalid provider identifier", 400)
    if not _IDENT_RE.match(channel_id):
        return _err("invalid channel identifier", 400)
    if (
        start is None
        or end is None
        or end <= start
        or end - start > _MAX_DOWNLOAD_SECONDS
    ):
        return _err("invalid start/end", 400)

    manifest = _get_manifest_cached(provider, channel_id)

    template = manifest.get("ts_catchup_stream_url_template")
    if not template or not isinstance(template, str):
        return _err(
            "catchup download not available for this channel",
            503,
            hint="TS_PROXY_URL is not configured on the Ultimate Backend",
        )

    if request.method == "HEAD":
        return "", 200  # pre-flight only: template exists, no bytes streamed

    stream_url = template.replace("{start_time}", str(start)).replace(
        "{end_time}", str(end)
    )
    if urlparse(stream_url).scheme not in ("http", "https"):
        logger.error(
            f"Refusing non-http(s) catchup template for {provider}/{channel_id}"
        )
        return _err("catchup download not available for this channel", 502)

    fwd_headers = {}
    rng = request.headers.get("Range")
    if rng:
        fwd_headers["Range"] = rng

    try:
        upstream = requests.get(
            stream_url, headers=fwd_headers, stream=True, timeout=(10, 300)
        )
    except requests.RequestException as e:
        logger.error(f"Download upstream fetch failed for {provider}/{channel_id}: {e}")
        return _err("upstream fetch failed", 502)

    if upstream.status_code not in (200, 206):
        code = upstream.status_code
        upstream.close()
        return _err(f"upstream returned {code}", code if 400 <= code < 600 else 502)

    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", filename or f"{channel_id}_{start}")[
        :100
    ]
    if not safe_name.endswith(".ts"):
        safe_name += ".ts"

    resp = Response(
        stream_with_context(upstream.iter_content(65536)),
        status=upstream.status_code,
        content_type=upstream.headers.get("Content-Type", "video/mp2t"),
    )
    resp.call_on_close(upstream.close)
    for h in ("Content-Length", "Content-Range", "Accept-Ranges"):
        if h in upstream.headers:
            resp.headers[h] = upstream.headers[h]
    resp.headers["Content-Disposition"] = f'attachment; filename="{safe_name}"'
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------------------------------------------------------------------------
# Monitoring / connection tests
# ---------------------------------------------------------------------------
@app.route("/api/monitoring/status")
def api_get_monitoring_status():
    """Monitoring snapshot. Tolerant: renders even when WebEPG is down."""
    webepg = get_webepg_client()
    import_status = webepg.get_import_status()
    import_status.setdefault("recent_imports", [])
    return jsonify(
        {
            "success": True,
            "import_status": import_status,
            "statistics": webepg.get_statistics(),
            "webepg_health": webepg.get_health(),
            "timestamp": datetime.now().isoformat(),
        }
    )


@app.route("/api/test/webepg")
def api_test_webepg():
    """Test WebEPG connection (used by the Config page)."""
    webepg = get_webepg_client()
    if not webepg.get_health():
        return _err("WebEPG health check failed", 503, status="offline")
    try:
        count = len(webepg.get_channels())
    except UpstreamError as e:
        logger.warning(f"WebEPG test: {e.detail}")
        return _err(e.message, 503, status="offline")
    return jsonify({"success": True, "status": "online", "channels_count": count})


@app.route("/api/test/ultimate-backend")
def api_test_ultimate_backend():
    """Test ultimate-backend connection (used by the Config page)."""
    try:
        providers = get_ultimate_backend_client().get_providers()
    except UpstreamError as e:
        logger.warning(f"Ultimate Backend test: {e.detail}")
        return _err(e.message, 503, status="offline")
    if isinstance(providers, dict):
        providers = providers.get("providers", [])
    count = len(providers) if isinstance(providers, list) else 0
    return jsonify({"success": True, "status": "online", "providers_count": count})


if __name__ == "__main__":
    # Development server only; production runs under gunicorn (see Dockerfile).
    debug_mode = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    host = os.getenv("FLASK_HOST", "127.0.0.1")  # localhost by default
    port = int(os.getenv("FLASK_PORT", "7779"))
    app.run(debug=debug_mode, host=host, port=port)
