"""
Main Flask application for ultimate-ui - FIXED VERSION
"""

import logging
import os
from datetime import datetime, timedelta

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

# Initialize API clients with safe defaults
def _get_config_value(key, default):
    """Safely get config value with fallback."""
    try:
        value = config.get(key)
        return value if value is not None else default
    except Exception:
        return default

webepg_client = WebEPGClient(
    base_url=_get_config_value("webepg.url", "http://localhost:8080"),
    timeout=_get_config_value("webepg.timeout", 10)
)

ultimate_backend_client = UltimateBackendClient(
    base_url=_get_config_value("ultimate_backend.url", "http://localhost:3000"),
    timeout=_get_config_value("ultimate_backend.timeout", 10),
)

# Create Flask app
app = Flask(__name__, template_folder="templates", static_folder="static")

# Add secret key for session management (generate a random one in production)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")


# Template filters - FIXED
@app.template_filter("format_time")
def format_time(value):
    """Format datetime to HH:MM time string."""
    if not value:
        return ""
    try:
        # Handle both string and datetime objects
        if isinstance(value, str):
            # Try to parse ISO format
            date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        else:
            date = value
        return date.strftime("%H:%M")
    except Exception as e:
        logger.warning(f"Could not format time {value}: {e}")
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


@app.route("/epg")
def epg_display():
    """EPG Display tab."""
    try:
        channels = webepg_client.get_channels()
        # Get programs for the next 24 hours
        now = datetime.now()
        tomorrow = now + timedelta(days=1)

        # For each channel, get upcoming programs
        channels_with_programs = []
        for channel in channels[:20]:  # Limit to 20 channels for performance
            if "id" in channel:
                channel_id = channel["id"]
                programs = webepg_client.get_channel_programs(
                    str(channel_id), now.isoformat(), tomorrow.isoformat()
                )
                channel["programs"] = programs[:10]  # Limit to 10 programs
                channels_with_programs.append(channel)

        return render_template(
            "epg_display.html",
            channels=channels_with_programs,
            current_date=now.strftime("%Y-%m-%d"),  # ADDED
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

            # Reinitialize clients with new URLs
            webepg_client.base_url = config_data["webepg"]["url"].rstrip("/")
            webepg_client.timeout = config_data["webepg"]["timeout"]

            ultimate_backend_client.base_url = config_data["ultimate_backend"][
                "url"
            ].rstrip("/")
            ultimate_backend_client.timeout = config_data["ultimate_backend"]["timeout"]

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
        # Get channels from webepg
        webepg_channels = webepg_client.get_channels()

        # Get providers from ultimate-backend
        ultimate_providers = ultimate_backend_client.get_providers()

        # Get first provider's channels if available
        ultimate_channels = []
        selected_provider = None

        if ultimate_providers:
            selected_provider = ultimate_providers[0].get("id")
            ultimate_channels = ultimate_backend_client.get_provider_channels(
                selected_provider
            )

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
        # Get import status from webepg
        import_status = webepg_client.get_import_status()

        # Get statistics
        statistics = webepg_client.get_statistics()

        # Check backend health
        webepg_health = webepg_client.get_health()

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


# API endpoints for AJAX calls


@app.route("/api/epg/refresh")
def api_refresh_epg():
    """Refresh EPG data."""
    try:
        channels = webepg_client.get_channels()
        return jsonify({"success": True, "channels": channels})
    except Exception as e:
        logger.error(f"Error refreshing EPG: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# NEW - Proxy endpoint for channel programs
@app.route("/api/channels/<channel_id>/programs")
def api_get_channel_programs(channel_id):
    """Get programs for a specific channel - PROXY to webepg."""
    try:
        start = request.args.get("start")
        end = request.args.get("end")

        if not start or not end:
            return jsonify({"error": "start and end parameters required"}), 400

        programs = webepg_client.get_channel_programs(channel_id, start, end)
        return jsonify(programs)
    except Exception as e:
        logger.error(f"Error getting channel programs: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/import/trigger", methods=["POST"])
def api_trigger_import():
    """Trigger import job."""
    try:
        result = webepg_client.trigger_import()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error triggering import: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/mapping/providers")
def api_get_providers():
    """Get providers from ultimate-backend."""
    try:
        providers = ultimate_backend_client.get_providers()
        return jsonify({"success": True, "providers": providers})
    except Exception as e:
        logger.error(f"Error getting providers: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/mapping/channels/<provider_id>")
def api_get_provider_channels(provider_id):
    """Get channels for a specific provider."""
    try:
        channels = ultimate_backend_client.get_provider_channels(provider_id)
        return jsonify({"success": True, "channels": channels})
    except Exception as e:
        logger.error(f"Error getting provider channels: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/mapping/create-alias", methods=["POST"])
def api_create_alias():
    """Create a channel alias in webepg."""
    try:
        data = request.json
        channel_identifier = data.get("channel_identifier")
        alias = data.get("alias")
        alias_type = data.get("alias_type")

        if not channel_identifier or not alias:
            return jsonify({"success": False, "error": "Missing required fields"}), 400

        result = webepg_client.create_channel_alias(
            channel_identifier, alias, alias_type
        )

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
        import_status = webepg_client.get_import_status()
        statistics = webepg_client.get_statistics()
        webepg_health = webepg_client.get_health()

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
    app.run(debug=True, host="0.0.0.0", port=5000)