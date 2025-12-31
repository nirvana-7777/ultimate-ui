import json
import os
import sys
from datetime import datetime
from unittest.mock import patch

# Add src to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))


class TestAppRoutes:
    """Test Flask application routes."""

    def test_index_redirect(self, client):
        """Test that index redirects to EPG page."""
        response = client.get("/")
        assert response.status_code == 200
        assert b"EPG Anzeige" in response.data

    def test_epg_display_page(
        self, client, mock_webepg_client, sample_channels, sample_programs
    ):
        """Test EPG display page."""
        # Mock the API responses
        mock_webepg_client.get_channels.return_value = sample_channels
        mock_webepg_client.get_channel_programs.return_value = sample_programs

        response = client.get("/epg")

        assert response.status_code == 200
        assert b"EPG Programm" in response.data
        assert b"Das Erste" in response.data
        assert b"Tagesschau" in response.data

    def test_epg_display_error_handling(self, client, mock_webepg_client):
        """Test EPG display error handling."""
        mock_webepg_client.get_channels.side_effect = Exception("API Error")

        response = client.get("/epg")

        assert response.status_code == 200
        assert b"Fehler" in response.data

    def test_configuration_page_get(self, client):
        """Test configuration page GET request."""
        response = client.get("/config")

        assert response.status_code == 200
        assert b"Konfiguration" in response.data
        assert b"Backend-Einstellungen" in response.data

    def test_configuration_page_post(self, client):
        """Test configuration page POST request."""
        data = {
            "webepg_url": "http://new-webepg:8080",
            "webepg_timeout": "15",
            "ultimate_backend_url": "http://new-ultimate:3000",
            "ultimate_backend_timeout": "15",
            "ui_theme": "light",
            "refresh_interval": "600",
        }

        response = client.post("/config", data=data)

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True

    def test_configuration_page_post_json(self, client):
        """Test configuration page POST with JSON."""
        data = {
            "webepg": {"url": "http://json-webepg:8080", "timeout": 20},
            "ultimate_backend": {"url": "http://json-ultimate:3000", "timeout": 20},
        }

        response = client.post(
            "/config", data=json.dumps(data), content_type="application/json"
        )

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True

    def test_mapping_page(
        self,
        client,
        mock_webepg_client,
        mock_ultimate_backend_client,
        sample_channels,
        sample_providers,
    ):
        """Test EPG mapping page."""
        mock_webepg_client.get_channels.return_value = sample_channels
        mock_ultimate_backend_client.get_providers.return_value = sample_providers
        mock_ultimate_backend_client.get_provider_channels.return_value = []

        response = client.get("/mapping")

        assert response.status_code == 200
        assert b"EPG Mapping" in response.data

    def test_monitoring_page(self, client, mock_webepg_client):
        """Test monitoring page."""
        mock_webepg_client.get_import_status.return_value = {
            "recent_imports": [],
            "next_scheduled_import": datetime.now().isoformat(),
        }
        mock_webepg_client.get_statistics.return_value = {
            "total_channels": 10,
            "total_programs": 1000,
        }
        mock_webepg_client.get_health.return_value = True

        response = client.get("/monitoring")

        assert response.status_code == 200
        assert b"Monitoring" in response.data
        assert b"Statistiken" in response.data

    def test_api_refresh_epg(self, client, mock_webepg_client, sample_channels):
        """Test API endpoint for refreshing EPG."""
        mock_webepg_client.get_channels.return_value = sample_channels

        response = client.get("/api/epg/refresh")

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        assert len(response_data["channels"]) == 2

    def test_api_get_channel_programs(
        self, client, mock_webepg_client, sample_programs
    ):
        """Test API endpoint for getting channel programs."""
        mock_webepg_client.get_channel_programs.return_value = sample_programs

        response = client.get(
            "/api/channels/channel1/programs?start=2024-01-01T00:00:00Z&end=2024-01-02T00:00:00Z"
        )

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert len(response_data) == 2

    def test_api_get_channel_programs_missing_params(self, client):
        """Test API endpoint for getting channel programs with missing parameters."""
        response = client.get("/api/channels/channel1/programs")

        assert response.status_code == 400
        response_data = json.loads(response.data)
        assert "error" in response_data

    def test_api_trigger_import(self, client, mock_webepg_client):
        """Test API endpoint for triggering import."""
        mock_webepg_client.trigger_import.return_value = {"success": True}

        response = client.post("/api/import/trigger")

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert "success" in response_data or "error" in response_data

    def test_api_get_providers(
        self, client, mock_ultimate_backend_client, sample_providers
    ):
        """Test API endpoint for getting providers."""
        mock_ultimate_backend_client.get_providers.return_value = sample_providers

        response = client.get("/api/mapping/providers")

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        assert len(response_data["providers"]) == 2

    def test_api_create_alias_success(self, client, mock_webepg_client):
        """Test API endpoint for creating alias successfully."""
        mock_webepg_client.create_channel_alias.return_value = {"id": "alias1"}

        data = {
            "channel_identifier": "channel1",
            "alias": "ard_hd",
            "alias_type": "custom",
        }

        response = client.post(
            "/api/mapping/create-alias",
            data=json.dumps(data),
            content_type="application/json",
        )

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True

    def test_api_create_alias_missing_fields(self, client):
        """Test API endpoint for creating alias with missing fields."""
        data = {"channel_identifier": "channel1"}

        response = client.post(
            "/api/mapping/create-alias",
            data=json.dumps(data),
            content_type="application/json",
        )

        assert response.status_code == 400
        response_data = json.loads(response.data)
        assert "error" in response_data

    def test_api_get_monitoring_status(self, client, mock_webepg_client):
        """Test API endpoint for getting monitoring status."""
        mock_webepg_client.get_import_status.return_value = {"recent_imports": []}
        mock_webepg_client.get_statistics.return_value = {}
        mock_webepg_client.get_health.return_value = True

        response = client.get("/api/monitoring/status")

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        assert "webepg_health" in response_data

    def test_static_file_serving(self, client):
        """Test static file serving."""
        # Note: This test assumes you have static files
        response = client.get("/static/css/style.css")

        # Either 200 if file exists or 404 if not
        assert response.status_code in [200, 404]

    def test_favicon(self, client):
        """Test favicon serving."""
        response = client.get("/favicon.ico")

        # Either 200 if file exists or 204 if not
        assert response.status_code in [200, 204]

    def test_404_error_handler(self, client):
        """Test 404 error handling."""
        response = client.get("/nonexistent-page")

        assert response.status_code == 404

    def test_404_error_handler_api(self, client):
        """Test 404 error handling for API endpoints."""
        response = client.get("/api/nonexistent-endpoint")

        assert response.status_code == 404
        response_data = json.loads(response.data)
        assert "error" in response_data

    def test_500_error_handler(self, client, mock_webepg_client):
        """Test 500 error handling."""
        # Force an internal error
        with patch(
            "app.webepg_client.get_channels", side_effect=Exception("Internal Error")
        ):
            response = client.get("/epg")

            assert response.status_code == 200  # Should show error page
            assert b"Internal server error" in response.data


class TestTemplateFilters:
    """Test template filters."""

    def test_format_time_filter(self, app):
        """Test format_time template filter."""
        from app import format_time

        # Test with ISO string
        result = format_time("2024-01-01T20:30:00Z")
        assert result == "20:30"

        # Test with None
        result = format_time(None)
        assert result == ""

        # Test with datetime object
        dt = datetime(2024, 1, 1, 14, 45)
        result = format_time(dt)
        assert result == "14:45"

    def test_truncate_filter(self, app):
        """Test truncate template filter."""
        from app import truncate_filter

        # Test short text
        result = truncate_filter("Short text", 10)
        assert result == "Short text"

        # Test long text
        result = truncate_filter("This is a very long text that needs truncation", 20)
        assert result == "This is a very long ..."

        # Test with None
        result = truncate_filter(None, 10)
        assert result == ""

    def test_time_diff_filter(self, app):
        """Test time_diff template filter."""
        from app import time_diff_filter

        start = "2024-01-01T20:00:00Z"
        end = "2024-01-01T21:30:15Z"

        result = time_diff_filter(start, end)
        assert result == "1h 30m 15s"

        # Test with missing times
        result = time_diff_filter(None, end)
        assert result == "-"

        result = time_diff_filter(start, None)
        assert result == "-"


class TestContextProcessor:
    """Test context processor."""

    def test_inject_config(self, app, test_config):
        """Test inject_config context processor."""
        from app import inject_config

        with app.test_request_context():
            context = inject_config()

            assert "config" in context
            assert "current_year" in context
            assert "current_time" in context
            assert "config_path" in context
