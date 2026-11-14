import json
from datetime import datetime
from unittest.mock import patch

from src.api_client import UpstreamError

# State-changing requests must carry a custom header (CSRF guard).
CSRF = {"X-Requested-With": "pytest"}


def post_json(client, url, data, headers=CSRF):
    return client.post(
        url, data=json.dumps(data), content_type="application/json", headers=headers
    )


class TestAppRoutes:
    """Test Flask application routes."""

    def test_index_serves_spa(self, client):
        """The EPG page is the SPA shell at '/'."""
        response = client.get("/")
        assert response.status_code == 200
        assert b"__ULTIMATE_CONFIG__" in response.data

    def test_health_endpoint(self, client):
        """Test health endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "healthy"
        assert data["service"] == "ultimate-ui"

    def test_legacy_epg_route_redirects(self, client):
        """The old server-rendered /epg page now lives at '/'."""
        response = client.get("/epg")
        assert response.status_code == 301
        assert response.headers["Location"].endswith("/")

    def test_epg_channels_upstream_error_is_not_an_empty_list(
        self, client, mock_get_webepg_client
    ):
        """WebEPG failures reach the UI as errors so it can show its error banner."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channels.side_effect = UpstreamError(
            "WebEPG", "WebEPG is not reachable", 502
        )

        response = client.get("/api/epg/channels")

        assert response.status_code == 502
        response_data = json.loads(response.data)
        assert response_data["success"] is False
        assert "error" in response_data

    def test_configuration_page_get(self, client):
        """Test configuration page GET request."""
        response = client.get("/config")
        assert response.status_code == 200

    def test_configuration_page_post_json(self, client, mock_update_clients):
        """Settings are posted as JSON, validated, saved, and the clients are rebuilt."""
        data = {
            "webepg_url": "http://json-webepg:8080",
            "webepg_timeout": 20,
            "ultimate_backend_url": "http://json-ultimate:3000",
            "ultimate_backend_timeout": 20,
            "ui_theme": "light",
            "refresh_interval": 600,
            "timezone": "Europe/Berlin",
            "player_size": "medium",
            "player_bitrate": "auto",
        }
        with patch("src.app.config.save") as mock_save:
            response = post_json(client, "/config", data)

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        mock_save.assert_called_once()
        saved = mock_save.call_args.args[0]
        assert saved["webepg"] == {"url": "http://json-webepg:8080", "timeout": 20}
        assert saved["ui"]["theme"] == "light"
        mock_update_clients.assert_called_once()

    def test_configuration_page_post_numbers_as_strings(
        self, client, mock_update_clients
    ):
        """The form UI sends numbers as strings; they are coerced."""
        with patch("src.app.config.save") as mock_save:
            response = post_json(
                client,
                "/config",
                {"webepg_url": "http://new-webepg:8080", "webepg_timeout": "15"},
            )

        assert response.status_code == 200
        assert mock_save.call_args.args[0]["webepg"]["timeout"] == 15

    def test_configuration_page_post_rejects_invalid_values(
        self, client, mock_update_clients
    ):
        """Invalid settings are refused with field errors and nothing is saved."""
        with patch("src.app.config.save") as mock_save:
            response = post_json(
                client,
                "/config",
                {"webepg_url": "file:///etc/passwd", "refresh_interval": 5},
            )

        assert response.status_code == 400
        response_data = json.loads(response.data)
        assert set(response_data["errors"]) == {"webepg_url", "refresh_interval"}
        mock_save.assert_not_called()
        mock_update_clients.assert_not_called()

    def test_configuration_page_post_refuses_form_data(self, client):
        """POST /config takes a JSON object only."""
        response = client.post("/config", data={"webepg_url": "x"}, headers=CSRF)
        assert response.status_code == 400

    def test_mutating_requests_need_the_csrf_header(self, client, mock_update_clients):
        """Without X-Requested-With a cross-site page could change settings."""
        response = client.post(
            "/config", data=json.dumps({}), content_type="application/json"
        )
        assert response.status_code == 403
        mock_update_clients.assert_not_called()

    def test_configuration_reset(self, client, mock_update_clients):
        """Reset overwrites the saved settings with the defaults."""
        with patch("src.app.config.reset") as mock_reset:
            response = client.post("/config/reset", headers=CSRF)

        assert response.status_code == 200
        mock_reset.assert_called_once()
        mock_update_clients.assert_called_once()

    def test_mapping_page(self, client):
        """The mapping page is rendered by the SPA."""
        response = client.get("/mapping")
        assert response.status_code == 200

    def test_monitoring_page(self, client):
        """The monitoring page is rendered by the SPA; its data comes from the API."""
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
        assert "total" in response_data
        assert "timestamp" in response_data

    def test_api_get_channels_paginated(
        self, client, mock_get_webepg_client, sample_channels
    ):
        """Test API endpoint for getting paginated channels."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channels.return_value = sample_channels

        response = client.get("/api/epg/channels?page=0&limit=20")
        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        assert "channels" in response_data
        assert "page" in response_data
        assert "limit" in response_data
        assert "total" in response_data
        assert "has_more" in response_data

    def test_api_get_channels_default_params(
        self, client, mock_get_webepg_client, sample_channels
    ):
        """Test API endpoint for getting channels with default parameters."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channels.return_value = sample_channels

        response = client.get("/api/epg/channels")
        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        assert response_data["page"] == 0
        assert response_data["limit"] == 20

    def test_api_get_channels_rejects_bad_paging(self, client, mock_get_webepg_client):
        """Non-numeric or out-of-range paging is a 400, not a 500."""
        for query in ("page=abc", "page=-1", "limit=0", "limit=201"):
            response = client.get(f"/api/epg/channels?{query}")
            assert response.status_code == 400, query

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
        # Updated to expect new response format
        assert response_data["success"] is True
        assert "programs" in response_data
        assert "channel_id" in response_data
        assert isinstance(response_data["programs"], list)
        assert len(response_data["programs"]) == 2

    def test_api_get_channel_programs_with_defaults(
        self, client, mock_get_webepg_client, sample_programs
    ):
        """Test API endpoint for getting channel programs with default date range."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channel_programs.return_value = sample_programs

        # Test without start/end parameters - should use defaults
        response = client.get("/api/channels/channel1/programs")

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        assert "programs" in response_data

    def test_api_get_channel_programs_forwards_provider(
        self, client, mock_get_webepg_client, sample_programs
    ):
        """The provider query parameter scopes provider-native channel ids."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channel_programs.return_value = sample_programs

        client.get("/api/channels/channel1/programs?provider=joyn")

        assert mock_client.get_channel_programs.call_args.kwargs["provider"] == "joyn"

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

        response = post_json(client, "/api/mapping/create-alias", data)

        assert response.status_code == 200
        response_data = json.loads(response.data)
        assert response_data["success"] is True
        assert "alias" in response_data

    def test_api_get_channel_programs_upstream_down(
        self, client, mock_get_webepg_client
    ):
        """An unreachable WebEPG answers 502 (it used to be an unspecific 500)."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channel_programs.side_effect = UpstreamError(
            "WebEPG", "WebEPG is not reachable", 502
        )

        response = client.get("/api/channels/channel1/programs")

        assert response.status_code == 502
        assert json.loads(response.data)["success"] is False

    def test_api_trigger_import(self, client, mock_get_webepg_client):
        """Test API endpoint for triggering import."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.trigger_import.return_value = {"success": True}
        response = client.post("/api/import/trigger", headers=CSRF)
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
        response = post_json(client, "/api/mapping/create-alias", data)
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
        """Unknown browser URLs get the SPA shell with a 404 status."""
        response = client.get("/nonexistent-page")
        assert response.status_code == 404

    def test_404_error_handler_api(self, client):
        """Test 404 error handling for API endpoints."""
        response = client.get("/api/nonexistent-endpoint")
        assert response.status_code == 404
        response_data = json.loads(response.data)
        assert "error" in response_data

    def test_500_error_handler(self, client, mock_get_webepg_client):
        """Unexpected errors are answered with generic JSON, never exception text."""
        mock_client = mock_get_webepg_client.return_value
        mock_client.get_channels.side_effect = Exception("Internal Error")
        response = client.get("/api/epg/channels")
        assert response.status_code == 500
        response_data = json.loads(response.data)
        assert response_data["success"] is False
        assert "Internal Error" not in response.get_data(as_text=True)


class TestTemplateFilters:
    """Test template filters."""

    def test_format_time_filter(self, app):
        from src.app import format_time

        assert format_time("2024-01-01T20:30:00Z") == "21:30"
        assert format_time(None) == ""
        dt = datetime(2024, 1, 1, 14, 45)
        assert format_time(dt) == "15:45"

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
