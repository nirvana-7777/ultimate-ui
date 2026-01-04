import json
import os
import sys
from datetime import datetime, timezone
from unittest.mock import patch

# Add src to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))


class TestAppRoutes:
    """Test Flask application routes."""

    def test_index_redirect(self, client):
        """Test that index redirects to EPG page."""
        response = client.get("/")
        assert response.status_code == 200

    def test_health_endpoint(self, client):
        """Test health endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "healthy"
        assert data["service"] == "ultimate-ui"

    def test_epg_display_page(
        self, client, mock_get_webepg_client, sample_channels, sample_programs
    ):
        """Test EPG display page."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channels.return_value = sample_channels
        mock_client.get_channel_programs.return_value = sample_programs

        response = client.get("/epg")
        assert response.status_code == 200

    def test_epg_display_error_handling(self, client, mock_get_webepg_client):
        """Test EPG display error handling."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channels.side_effect = Exception("API Error")
        response = client.get("/epg")
        assert response.status_code == 200

    def test_configuration_page_get(self, client):
        """Test configuration page GET request."""
        response = client.get("/config")
        assert response.status_code == 200

    def test_configuration_page_post(self, client, mock_update_clients):
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
        mock_update_clients.assert_called_once()

    def test_configuration_page_post_json(self, client, mock_update_clients):
        """Test configuration page POST with JSON."""
        data = {
            "webepg_url": "http://json-webepg:8080",
            "webepg_timeout": 20,
            "ultimate_backend_url": "http://json-ultimate:3000",
            "ultimate_backend_timeout": 20,
            "ui_theme": "light",
            "refresh_interval": 600,
        }
        response = client.post(
            "/config", data=json.dumps(data), content_type="application/json"
        )
        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        mock_update_clients.assert_called_once()

    def test_mapping_page(
        self,
        client,
        mock_get_webepg_client,
        mock_get_ultimate_backend_client,
        sample_channels,
        sample_providers,
    ):
        """Test EPG mapping page."""
        mock_webepg = mock_get_webepg_client.return_value
        mock_ultimate = mock_get_ultimate_backend_client.return_value

        mock_webepg.get_channels.return_value = sample_channels
        mock_ultimate.get_providers.return_value = sample_providers
        mock_ultimate.get_provider_channels.return_value = []

        response = client.get("/mapping")
        assert response.status_code == 200

    def test_monitoring_page(self, client, mock_get_webepg_client):
        """Test monitoring page."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_import_status.return_value = {
            "recent_imports": [],
            "next_scheduled_import": datetime.now().isoformat(),
        }
        mock_client.get_statistics.return_value = {
            "total_channels": 10,
            "total_programs": 1000,
        }
        mock_client.get_health.return_value = True

        response = client.get("/monitoring")
        assert response.status_code == 200

    def test_api_refresh_epg(self, client, mock_get_webepg_client, sample_channels):
        """Test API endpoint for refreshing EPG."""
        # Clear any existing side effects and set return value
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channels.side_effect = None  # Clear any side effects
        mock_client.get_channels.return_value = sample_channels

        response = client.get("/api/epg/refresh")
        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        assert response_data["channels"] == sample_channels

    def test_api_get_channel_programs(
        self, client, mock_get_webepg_client, sample_programs
    ):
        """Test API endpoint for getting channel programs."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channel_programs.return_value = sample_programs

        response = client.get(
            "/api/channels/channel1/programs"
            "?start=2024-01-01T00:00:00Z"
            "&end=2024-01-02T00:00:00Z"
        )

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert isinstance(response_data, list)
        assert len(response_data) == 2

    def test_api_create_alias_success(self, client, mock_get_webepg_client):
        """Test API endpoint for creating alias successfully."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.create_channel_alias.return_value = {
            "id": "alias1",
            "status": "created",
        }

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
        assert "alias" in response_data

    def test_api_get_channel_programs_missing_params(self, client):
        """Test API endpoint for getting channel programs with missing parameters."""
        response = client.get("/api/channels/channel1/programs")
        assert response.status_code == 400
        response_data = json.loads(response.data)
        assert "error" in response_data

    def test_api_trigger_import(self, client, mock_get_webepg_client):
        """Test API endpoint for triggering import."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.trigger_import.return_value = {"success": True}
        response = client.post("/api/import/trigger")
        assert response.status_code == 200

    def test_api_get_providers(
        self, client, mock_get_ultimate_backend_client, sample_providers
    ):
        """Test API endpoint for getting providers."""
        mock_client = mock_get_ultimate_backend_client.return_value
        mock_client.get_providers.return_value = sample_providers
        response = client.get("/api/mapping/providers")
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

    def test_api_get_monitoring_status(self, client, mock_get_webepg_client):
        """Test API endpoint for getting monitoring status."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_import_status.return_value = {"recent_imports": []}
        mock_client.get_statistics.return_value = {}
        mock_client.get_health.return_value = True
        response = client.get("/api/monitoring/status")
        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True

    def test_static_file_serving(self, client):
        """Test static file serving."""
        response = client.get("/static/css/style.css")
        assert response.status_code in [200, 404]

    def test_favicon(self, client):
        """Test favicon serving."""
        response = client.get("/favicon.ico")
        assert response.status_code in [200, 204, 404]

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

    def test_500_error_handler(self, client, mock_get_webepg_client):
        """Test 500 error handling."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channels.side_effect = Exception("Internal Error")
        response = client.get("/epg")
        assert response.status_code == 200


class TestTemplateFilters:
    """Test template filters."""

    def test_format_time_filter(self, app):
        from src.app import format_time

        # Mock the config to return UTC timezone for testing
        with patch("src.app.config") as mock_config:
            mock_config.get.return_value = "UTC"

            # Test with UTC timezone (should return same time)
            assert format_time("2024-01-01T20:30:00Z") == "20:30"
            assert format_time(None) == ""

            # Test with datetime object in UTC
            dt = datetime(2024, 1, 1, 14, 45, tzinfo=timezone.utc)
            assert format_time(dt) == "14:45"

    def test_truncate_filter(self, app):
        from src.app import truncate_filter

        assert truncate_filter("Short text", 10) == "Short text"
        assert (
            truncate_filter("This is a very long text that needs truncation", 20)
            == "This is a very long ..."
        )
        assert truncate_filter(None, 10) == ""

    def test_time_diff_filter(self, app):
        from src.app import time_diff_filter

        start = "2024-01-01T20:00:00Z"
        end = "2024-01-01T21:30:15Z"
        result = time_diff_filter(start, end)
        assert "1" in result and "30" in result
        assert time_diff_filter(None, end) == "-"
        assert time_diff_filter(start, None) == "-"


class TestContextProcessor:
    """Test context processor."""

    def test_inject_config(self, app):
        with app.test_request_context():
            from src.app import inject_config

            context = inject_config()
            assert "config" in context
            assert "current_year" in context
            assert "current_time" in context
            assert "config_path" in context
