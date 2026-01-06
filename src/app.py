"""
Main Flask application for ultimate-ui - FIXED VERSION WITH PROVIDER PROXIES
"""

import logging
import os
from datetime import datetime, timedelta, timezone

import pytz
from flask import Flask, jsonify, render_template, request, send_from_directory

from .api_client import UltimateBackendClient, WebEPGClient
from .config import Config

# Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize configuration
config_path = os.getenv("ULTIMATE_UI_CONFIG", "config/config.yaml")
config = Config(config_path)

# Initialize API clients as None (lazy initialization)
_webepg_client = None
_ultimate_backend_client = None


def _get_config_value(key, default):
    """Safely get config value with fallback."""
    try:
        value = config.get(key)
        return value if value is not None else default
    except Exception:
        return default


def get_webepg_client():
    """Get or create WebEPG client with lazy initialization."""
    global _webepg_client
    if _webepg_client is None:
        _webepg_client = WebEPGClient(
            base_url=_get_config_value("webepg.url", "http://localhost:8080"),
            timeout=_get_config_value("webepg.timeout", 10),
        )
    return _webepg_client


def get_ultimate_backend_client():
    """Get or create Ultimate Backend client with lazy initialization."""
    global _ultimate_backend_client
    if _ultimate_backend_client is None:
        _ultimate_backend_client = UltimateBackendClient(
            base_url=_get_config_value("ultimate_backend.url", "http://localhost:3000"),
            timeout=_get_config_value("ultimate_backend.timeout", 10),
        )
    return _ultimate_backend_client


def update_clients():
    """Update clients with new configuration."""
    global _webepg_client, _ultimate_backend_client
    _webepg_client = WebEPGClient(
        base_url=_get_config_value("webepg.url", "http://localhost:8080"),
        timeout=_get_config_value("webepg.timeout", 10),
    )
    _ultimate_backend_client = UltimateBackendClient(
        base_url=_get_config_value("ultimate_backend.url", "http://localhost:3000"),
        timeout=_get_config_value("ultimate_backend.timeout", 10),
    )


# Create Flask app
app = Flask(__name__, template_folder="templates", static_folder="static")

# Add secret key for session management (generate a random one in production)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")


@app.template_filter("format_time")
def format_time(value):
    """Format datetime to HH:MM time string with timezone conversion."""
    if not value:
        return ""

    try:
        # Get timezone from config
        ui_timezone = config.get("ui.timezone", "Europe/Berlin")

        # Parse the date
        if isinstance(value, str):
            # Handle ISO format with timezone
            if "Z" in value:
                date = datetime.fromisoformat(value.replace("Z", "+00:00"))
            elif "+" in value or "-" in value[10:]:  # Has timezone offset
                date = datetime.fromisoformat(value)
            else:
                # Assume UTC if no timezone specified
                date = datetime.fromisoformat(value + "+00:00")
        else:
            date = value

        # Ensure datetime has timezone info
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)

        # Convert to configured timezone
        target_tz = pytz.timezone(ui_timezone)
        local_date = date.astimezone(target_tz)

        # Format as HH:MM
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
        # Get timezone from config
        ui_timezone = config.get("ui.timezone", "Europe/Berlin")

        # Parse the date
        if isinstance(value, str):
            if "Z" in value:
                date = datetime.fromisoformat(value.replace("Z", "+00:00"))
            elif "+" in value or "-" in value[10:]:
                date = datetime.fromisoformat(value)
            else:
                date = datetime.fromisoformat(value + "+00:00")
        else:
            date = value

        # Ensure datetime has timezone info
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)

        # Convert to configured timezone
        target_tz = pytz.timezone(ui_timezone)
        local_date = date.astimezone(target_tz)

        # Format as localized date/time
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


@app.context_processor
def inject_config():
    """Inject configuration and common variables into all templates - FIXED."""
    return {
        "config": config.to_dict(),
        "current_year": datetime.now().year,
        "current_time": datetime.now().strftime("%a, %d.%m %H:%M"),
        "config_path": config_path,  # ADDED - was missing
    }


@app.route("/")
def index():
    """Home page - redirect to EPG tab."""
    return render_template("epg_display.html", active_tab="epg")


@app.route("/health")
def health():
    """Simple health check endpoint."""
    return jsonify(
        {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "service": "ultimate-ui",
        }
    )


@app.route("/config", methods=["GET", "POST"])
def configuration():
    """Configuration tab - FIXED form handling."""
    if request.method == "POST":
        try:
            # Handle both JSON and form data
            if request.is_json:
                data = request.json
            else:
                data = request.form.to_dict()

            # Build config data structure
            config_data = {
                "webepg": {
                    "url": data.get("webepg_url"),
                    "timeout": int(data.get("webepg_timeout", 10)),
                },
                "ultimate_backend": {
                    "url": data.get("ultimate_backend_url"),
                    "timeout": int(data.get("ultimate_backend_timeout", 10)),
                },
                "ui": {
                    "theme": data.get("ui_theme", "dark"),
                    "refresh_interval": int(data.get("refresh_interval", 300)),
                    "timezone": data.get("timezone", "Europe/Berlin"),
                },
                "player": {
                    "default_size": data.get("player_size", "medium"),
                    "default_bitrate": data.get("player_bitrate", "auto"),
                },
            }

            config.save(config_data)
            update_clients()  # Update clients with new config

            return jsonify({"success": True, "message": "Configuration saved!"})

        except Exception as e:
            logger.error(f"Error saving configuration: {e}")
            return jsonify({"success": False, "message": str(e)}), 500

    # GET request - show current configuration
    return render_template("config.html", active_tab="config")


@app.route("/mapping")
def epg_mapping():
    """EPG Mapping tab."""
    try:
        webepg = get_webepg_client()
        ultimate = get_ultimate_backend_client()

        # Get channels from webepg
        webepg_channels = webepg.get_channels()

        # Get providers from ultimate-backend
        ultimate_providers = ultimate.get_providers()

        # Get first provider's channels if available
        ultimate_channels = []
        selected_provider = None

        if ultimate_providers:
            selected_provider = ultimate_providers[0].get("id")
            ultimate_channels = ultimate.get_provider_channels(selected_provider)

        return render_template(
            "epg_mapping.html",
            webepg_channels=webepg_channels,
            ultimate_providers=ultimate_providers,
            ultimate_channels=ultimate_channels,
            selected_provider=selected_provider,
            active_tab="mapping",
        )

    except Exception as e:
        logger.error(f"Error loading mapping: {e}")
        return render_template(
            "epg_mapping.html",
            webepg_channels=[],
            ultimate_providers=[],
            ultimate_channels=[],
            error=str(e),
            active_tab="mapping",
        )


@app.route("/monitoring")
def monitoring():
    """Monitoring tab - FIXED data structure."""
    try:
        webepg = get_webepg_client()

        # Get import status from webepg
        import_status = webepg.get_import_status()

        # Get statistics
        statistics = webepg.get_statistics()

        # Check backend health
        webepg_health = webepg.get_health()

        # Ensure recent_imports exists in import_status
        if "recent_imports" not in import_status:
            import_status["recent_imports"] = []

        return render_template(
            "monitoring.html",
            import_status=import_status,
            statistics=statistics,
            webepg_health=webepg_health,
            active_tab="monitoring",
        )

    except Exception as e:
        logger.error(f"Error loading monitoring: {e}")
        return render_template(
            "monitoring.html",
            import_status={"recent_imports": []},
            statistics={},
            webepg_health=False,
            error=str(e),
            active_tab="monitoring",
        )


@app.route("/providers")
def epg_providers():
    """EPG Providers tab."""
    return render_template(
        "providers.html",
        active_tab="providers",
        current_time=datetime.now().strftime("%H:%M"),
    )


# ============================================================================
# API PROXY ENDPOINTS - Avoid CORS by proxying WebEPG requests through Flask
# ============================================================================


@app.route("/api/providers", methods=["GET"])
def api_list_providers():
    """PROXY: List all providers from WebEPG backend."""
    try:
        webepg = get_webepg_client()
        providers = webepg.get_providers()
        return jsonify(providers)
    except Exception as e:
        logger.error(f"Error listing providers: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/providers/<int:provider_id>", methods=["GET"])
def api_get_provider(provider_id):
    """PROXY: Get provider by ID from WebEPG backend."""
    try:
        webepg = get_webepg_client()
        # WebEPGClient doesn't have get_provider, use session directly
        response = webepg.session.get(
            f"{webepg.base_url}/api/v1/providers/{provider_id}", timeout=webepg.timeout
        )
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as e:
        logger.error(f"Error getting provider {provider_id}: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/providers", methods=["POST"])
def api_create_provider():
    """PROXY: Create a new provider in WebEPG backend."""
    try:
        webepg = get_webepg_client()
        data = request.get_json()

        if not data:
            return jsonify({"error": "Request body is required"}), 400

        # Use the existing create_provider method but pass all data
        result = webepg.create_provider(
            name=data.get("name"), xmltv_url=data.get("xmltv_url")
        )

        # If enabled flag was provided, update it
        if result and "enabled" in data:
            provider_id = result.get("id")
            if provider_id:
                response = webepg.session.put(
                    f"{webepg.base_url}/api/v1/providers/{provider_id}",
                    json=data,
                    timeout=webepg.timeout,
                )
                response.raise_for_status()
                return jsonify(response.json()), 201

        return jsonify(result), 201
    except Exception as e:
        logger.error(f"Error creating provider: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/providers/<int:provider_id>", methods=["PUT"])
def api_update_provider(provider_id):
    """PROXY: Update a provider in WebEPG backend."""
    try:
        webepg = get_webepg_client()
        data = request.get_json()

        if not data:
            return jsonify({"error": "Request body is required"}), 400

        response = webepg.session.put(
            f"{webepg.base_url}/api/v1/providers/{provider_id}",
            json=data,
            timeout=webepg.timeout,
        )
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as e:
        logger.error(f"Error updating provider {provider_id}: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/providers/<int:provider_id>", methods=["DELETE"])
def api_delete_provider(provider_id):
    """PROXY: Delete a provider from WebEPG backend."""
    try:
        webepg = get_webepg_client()
        response = webepg.session.delete(
            f"{webepg.base_url}/api/v1/providers/{provider_id}", timeout=webepg.timeout
        )
        response.raise_for_status()
        return "", 204
    except Exception as e:
        logger.error(f"Error deleting provider {provider_id}: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/providers/<int:provider_id>/test", methods=["GET"])
def api_test_provider(provider_id):
    """PROXY: Test provider connection via WebEPG backend."""
    try:
        webepg = get_webepg_client()
        response = webepg.session.get(
            f"{webepg.base_url}/api/v1/providers/{provider_id}/test",
            timeout=webepg.timeout,
        )
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as e:
        logger.error(f"Error testing provider {provider_id}: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/providers/<int:provider_id>/import/trigger", methods=["POST"])
def api_trigger_provider_import(provider_id):
    """PROXY: Trigger import for specific provider via WebEPG backend."""
    try:
        webepg = get_webepg_client()
        response = webepg.session.post(
            f"{webepg.base_url}/api/v1/providers/{provider_id}/import/trigger",
            timeout=webepg.timeout,
        )
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as e:
        logger.error(f"Error triggering import for provider {provider_id}: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/import/status", methods=["GET"])
def api_import_status():
    """PROXY: Get import status from WebEPG backend."""
    try:
        webepg = get_webepg_client()
        status = webepg.get_import_status()
        return jsonify(status)
    except Exception as e:
        logger.error(f"Error getting import status: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================================
# EXISTING API ENDPOINTS
# ============================================================================


@app.route("/api/import/trigger", methods=["POST"])
def api_trigger_import():
    """Trigger import job."""
    try:
        webepg = get_webepg_client()
        result = webepg.trigger_import()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error triggering import: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/mapping/providers")
def api_get_mapping_providers():
    """Get providers from ultimate-backend."""
    try:
        ultimate = get_ultimate_backend_client()
        providers = ultimate.get_providers()
        return jsonify({"success": True, "providers": providers})
    except Exception as e:
        logger.error(f"Error getting providers: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/mapping/channels/<provider_id>")
def api_get_provider_channels(provider_id):
    """Get channels for a specific provider."""
    try:
        ultimate = get_ultimate_backend_client()
        channels = ultimate.get_provider_channels(provider_id)
        return jsonify({"success": True, "channels": channels})
    except Exception as e:
        logger.error(f"Error getting provider channels: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/mapping/create-alias", methods=["POST"])
def api_create_alias():
    """Create a channel alias in webepg-service."""
    try:
        webepg = get_webepg_client()
        data = request.json
        channel_identifier = data.get("channel_identifier")
        alias = data.get("alias")
        alias_type = data.get("alias_type")

        if not channel_identifier or not alias:
            return jsonify({"success": False, "error": "Missing required fields"}), 400

        result = webepg.create_channel_alias(channel_identifier, alias, alias_type)

        if result:
            return jsonify({"success": True, "alias": result})
        else:
            return jsonify({"success": False, "error": "Failed to create alias"}), 500

    except Exception as e:
        logger.error(f"Error creating alias: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/monitoring/status")
def api_get_monitoring_status():
    """Get comprehensive monitoring status."""
    try:
        webepg = get_webepg_client()
        import_status = webepg.get_import_status()
        statistics = webepg.get_statistics()
        webepg_health = webepg.get_health()

        # Ensure recent_imports exists
        if "recent_imports" not in import_status:
            import_status["recent_imports"] = []

        return jsonify(
            {
                "success": True,
                "import_status": import_status,
                "statistics": statistics,
                "webepg_health": webepg_health,
                "timestamp": datetime.now().isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"Error getting monitoring status: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/test/webepg")
def api_test_webepg():
    """Test WebEPG connection."""
    try:
        webepg = get_webepg_client()

        # Test health endpoint
        is_healthy = webepg.get_health()

        if is_healthy:
            # Get some basic stats to verify connection
            channels = webepg.get_channels()
            return jsonify(
                {
                    "success": True,
                    "status": "online",
                    "channels_count": len(channels),
                    "url": webepg.base_url,
                }
            )
        else:
            return (
                jsonify(
                    {
                        "success": False,
                        "status": "offline",
                        "error": "Health check failed",
                        "url": webepg.base_url,
                    }
                ),
                503,
            )

    except Exception as e:
        logger.error(f"Error testing WebEPG: {e}")
        return (
            jsonify(
                {
                    "success": False,
                    "status": "offline",
                    "error": str(e),
                    "url": _get_config_value("webepg.url", "http://localhost:8080"),
                }
            ),
            500,
        )


@app.route("/api/test/ultimate-backend")
def api_test_ultimate_backend():
    """Test ultimate-backend connection."""
    try:
        ultimate = get_ultimate_backend_client()
        providers = ultimate.get_providers()
        return jsonify(
            {"success": True, "status": "online", "providers_count": len(providers)}
        )
    except Exception as e:
        logger.error(f"Error testing ultimate-backend: {e}")
        return jsonify({"success": False, "status": "offline", "error": str(e)}), 500


@app.route("/epg")
def epg_display():
    """EPG Display tab - Optimized for client-side rendering."""
    try:
        webepg = get_webepg_client()

        # Only load initial batch of channels for faster page load
        # The rest will be loaded by JavaScript
        all_channels = webepg.get_channels()
        initial_channels = all_channels[:10]  # Just 10 for initial render

        # Get programs for initial channels only
        now = datetime.now(timezone.utc)
        tomorrow = now + timedelta(days=1)

        channels_with_programs = []
        for channel in initial_channels:
            if "id" in channel:
                channel_id = channel["id"]
                try:
                    programs = webepg.get_channel_programs(
                        str(channel_id), now.isoformat(), tomorrow.isoformat()
                    )

                    # Ensure programs have proper datetime objects
                    for program in programs:
                        for time_field in ["start_time", "end_time"]:
                            if time_field in program and isinstance(
                                program[time_field], str
                            ):
                                try:
                                    time_str = program[time_field]
                                    if "Z" in time_str:
                                        program[time_field] = datetime.fromisoformat(
                                            time_str.replace("Z", "+00:00")
                                        )
                                    elif "+" in time_str or "-" in time_str[10:]:
                                        program[time_field] = datetime.fromisoformat(
                                            time_str
                                        )
                                    else:
                                        program[time_field] = datetime.fromisoformat(
                                            time_str + "+00:00"
                                        )
                                except Exception as e:
                                    logger.warning(
                                        f"Could not parse {time_field}: {program[time_field]}: {e}"
                                    )

                    channel["programs"] = programs[:10]  # Limit to 10 programs
                    channels_with_programs.append(channel)
                except Exception as e:
                    logger.warning(
                        f"Could not load programs for channel {channel_id}: {e}"
                    )
                    channel["programs"] = []
                    channels_with_programs.append(channel)

        return render_template(
            "epg_display.html",
            channels=channels_with_programs,
            current_date=now.strftime("%Y-%m-%d"),
            active_tab="epg",
        )
    except Exception as e:
        logger.error(f"Error loading EPG: {e}")
        return render_template(
            "epg_display.html",
            channels=[],
            error=str(e),
            current_date=datetime.now().strftime("%Y-%m-%d"),
            active_tab="epg",
        )


@app.route("/api/epg/channels")
def api_get_channels():
    """Get channels with pagination support for infinite scroll."""
    try:
        page = int(request.args.get("page", 0))
        limit = int(request.args.get("limit", 20))

        webepg = get_webepg_client()
        all_channels = webepg.get_channels()

        # Calculate pagination
        start_idx = page * limit
        end_idx = start_idx + limit

        paginated_channels = all_channels[start_idx:end_idx]
        has_more = end_idx < len(all_channels)

        return jsonify(
            {
                "success": True,
                "channels": paginated_channels,
                "page": page,
                "limit": limit,
                "total": len(all_channels),
                "has_more": has_more,
            }
        )

    except Exception as e:
        logger.error(f"Error getting channels: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/channels/<channel_id>/programs")
def api_get_channel_programs(channel_id):
    """Get programs for a specific channel."""
    try:
        webepg = get_webepg_client()
        start = request.args.get("start")
        end = request.args.get("end")

        # Use defaults if not provided
        if not start:
            start = datetime.now(timezone.utc).isoformat()
        if not end:
            end = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

        programs = webepg.get_channel_programs(channel_id, start, end)

        # Process programs to ensure consistent format
        processed_programs = []
        for program in programs:
            # Ensure times are ISO strings
            if isinstance(program.get("start_time"), datetime):
                program["start_time"] = program["start_time"].isoformat()
            if isinstance(program.get("end_time"), datetime):
                program["end_time"] = program["end_time"].isoformat()
            processed_programs.append(program)

        return jsonify(
            {"success": True, "programs": processed_programs, "channel_id": channel_id}
        )

    except Exception as e:
        logger.error(f"Error getting channel programs: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/epg/refresh")
def api_refresh_epg():
    """Refresh EPG data - returns fresh channel list."""
    try:
        webepg = get_webepg_client()
        channels = webepg.get_channels()
        return jsonify(
            {
                "success": True,
                "channels": channels,
                "total": len(channels),
                "timestamp": datetime.now().isoformat(),
            }
        )
    except Exception as e:
        logger.error(f"Error refreshing EPG: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# Static file serving
@app.route("/static/<path:filename>")
def serve_static(filename):
    """Serve static files."""
    return send_from_directory("static", filename)


@app.route("/favicon.ico")
def favicon():
    """Serve favicon."""
    try:
        return send_from_directory("static", "favicon.ico")
    except FileNotFoundError:
        # Return 204 No Content if favicon doesn't exist
        return "", 204


# Error handlers
@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors."""
    if request.path.startswith("/api/"):
        return jsonify({"error": "Endpoint not found"}), 404
    return (
        render_template("epg_display.html", error="Page not found", active_tab="epg"),
        404,
    )


@app.errorhandler(500)
def internal_error(e):
    """Handle 500 errors."""
    logger.error(f"Internal error: {e}")
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error"}), 500
    return (
        render_template(
            "epg_display.html", error="Internal server error", active_tab="epg"
        ),
        500,
    )


if __name__ == "__main__":
    import os

    debug_mode = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    host = os.getenv("FLASK_HOST", "127.0.0.1")  # Localhost by default
    port = int(os.getenv("FLASK_PORT", "7779"))

    app.run(debug=debug_mode, host=host, port=port)
