import pytest
import requests
import requests_mock
from datetime import datetime, timedelta
from api_client import WebEPGClient, UltimateBackendClient


class TestWebEPGClient:
    """Test WebEPGClient class."""

    @pytest.fixture
    def client(self):
        return WebEPGClient(base_url="http://test-webepg:8080", timeout=5)

    @pytest.fixture
    def mock_adapter(self, client):
        with requests_mock.Mocker() as m:
            yield m

    def test_get_health_success(self, client, mock_adapter):
        """Test health check success."""
        mock_adapter.get("http://test-webepg:8080/api/v1/health", status_code=200)

        assert client.get_health() is True

    def test_get_health_failure(self, client, mock_adapter):
        """Test health check failure."""
        mock_adapter.get("http://test-webepg:8080/api/v1/health", status_code=500)

        assert client.get_health() is False

    def test_get_health_timeout(self, client, mock_adapter):
        """Test health check timeout."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/health", exc=requests.exceptions.Timeout
        )

        assert client.get_health() is False

    def test_get_channels_success(self, client, mock_adapter, sample_channels):
        """Test getting channels successfully."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels",
            json=sample_channels,
            status_code=200,
        )

        result = client.get_channels()

        assert len(result) == 2
        assert result[0]["id"] == "channel1"
        assert result[1]["name"] == "ZDF"

    def test_get_channels_error(self, client, mock_adapter):
        """Test getting channels with error."""
        mock_adapter.get("http://test-webepg:8080/api/v1/channels", status_code=500)

        result = client.get_channels()

        assert result == []

    def test_get_channel_success(self, client, mock_adapter, sample_channels):
        """Test getting specific channel successfully."""
        channel = sample_channels[0]
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels/channel1",
            json=channel,
            status_code=200,
        )

        result = client.get_channel("channel1")

        assert result["id"] == "channel1"
        assert result["display_name"] == "Das Erste"

    def test_get_channel_not_found(self, client, mock_adapter):
        """Test getting non-existent channel."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels/nonexistent", status_code=404
        )

        result = client.get_channel("nonexistent")

        assert result is None

    def test_get_channel_programs_success(self, client, mock_adapter, sample_programs):
        """Test getting channel programs successfully."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels/channel1/programs",
            json=sample_programs,
            status_code=200,
        )

        start = datetime.now().isoformat()
        end = (datetime.now() + timedelta(days=1)).isoformat()

        result = client.get_channel_programs("channel1", start, end)

        assert len(result) == 2
        assert result[0]["title"] == "Tagesschau"
        assert result[1]["category"] == "sport"

    def test_get_channel_programs_error(self, client, mock_adapter):
        """Test getting channel programs with error."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels/channel1/programs", status_code=500
        )

        result = client.get_channel_programs("channel1", "2024-01-01", "2024-01-02")

        assert result == []

    def test_get_providers_success(self, client, mock_adapter):
        """Test getting providers successfully."""
        providers = [{"id": "provider1", "name": "Test Provider"}]
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/providers", json=providers, status_code=200
        )

        result = client.get_providers()

        assert len(result) == 1
        assert result[0]["name"] == "Test Provider"

    def test_create_provider_success(self, client, mock_adapter):
        """Test creating provider successfully."""
        provider_data = {"id": "new_provider", "name": "New Provider"}
        mock_adapter.post(
            "http://test-webepg:8080/api/v1/providers",
            json=provider_data,
            status_code=201,
        )

        result = client.create_provider("New Provider", "http://example.com/epg.xml")

        assert result["id"] == "new_provider"

    def test_create_channel_alias_success(self, client, mock_adapter):
        """Test creating channel alias successfully."""
        alias_data = {"id": "alias1", "alias": "ard_hd"}
        mock_adapter.post(
            "http://test-webepg:8080/api/v1/channels/channel1/aliases",
            json=alias_data,
            status_code=201,
        )

        result = client.create_channel_alias("channel1", "ard_hd", "custom")

        assert result["id"] == "alias1"

    def test_create_channel_alias_error(self, client, mock_adapter):
        """Test creating channel alias with error."""
        mock_adapter.post(
            "http://test-webepg:8080/api/v1/channels/channel1/aliases", status_code=400
        )

        result = client.create_channel_alias("channel1", "ard_hd")

        assert result is None

    def test_get_import_status_success(self, client, mock_adapter):
        """Test getting import status successfully."""
        status_data = {
            "recent_imports": [],
            "next_scheduled_import": datetime.now().isoformat(),
        }
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/import/status",
            json=status_data,
            status_code=200,
        )

        result = client.get_import_status()

        assert "recent_imports" in result
        assert "next_scheduled_import" in result

    def test_trigger_import_success(self, client, mock_adapter):
        """Test triggering import successfully."""
        result_data = {"success": True, "message": "Import started"}
        mock_adapter.post(
            "http://test-webepg:8080/api/v1/import/trigger",
            json=result_data,
            status_code=200,
        )

        result = client.trigger_import()

        assert result["success"] is True

    def test_get_statistics_success(self, client, mock_adapter):
        """Test getting statistics successfully."""
        stats_data = {"total_channels": 50, "total_programs": 5000}
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/statistics",
            json=stats_data,
            status_code=200,
        )

        result = client.get_statistics()

        assert result["total_channels"] == 50
        assert result["total_programs"] == 5000

    def test_get_statistics_fallback(
        self, client, mock_adapter, sample_channels, sample_programs
    ):
        """Test statistics fallback when endpoint not available."""
        # Mock the statistics endpoint to fail
        mock_adapter.get("http://test-webepg:8080/api/v1/statistics", status_code=404)

        # Mock channels endpoint for fallback
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels",
            json=sample_channels,
            status_code=200,
        )

        # Mock programs endpoint for fallback
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels/channel1/programs",
            json=sample_programs,
            status_code=200,
        )

        result = client.get_statistics()

        assert "total_channels" in result
        assert result["total_channels"] == 2


class TestUltimateBackendClient:
    """Test UltimateBackendClient class."""

    @pytest.fixture
    def client(self):
        return UltimateBackendClient(base_url="http://test-ultimate:3000", timeout=5)

    @pytest.fixture
    def mock_adapter(self, client):
        with requests_mock.Mocker() as m:
            yield m

    def test_get_providers_success(self, client, mock_adapter, sample_providers):
        """Test getting providers successfully."""
        mock_adapter.get(
            "http://test-ultimate:3000/api/providers",
            json=sample_providers,
            status_code=200,
        )

        result = client.get_providers()

        assert len(result) == 2
        assert result[0]["id"] == "provider1"
        assert result[1]["name"] == "IPTV Provider 2"

    def test_get_providers_error(self, client, mock_adapter):
        """Test getting providers with error."""
        mock_adapter.get("http://test-ultimate:3000/api/providers", status_code=500)

        result = client.get_providers()

        assert result == []

    def test_get_provider_channels_success(self, client, mock_adapter, sample_channels):
        """Test getting provider channels successfully."""
        mock_adapter.get(
            "http://test-ultimate:3000/api/providers/provider1/channels",
            json=sample_channels,
            status_code=200,
        )

        result = client.get_provider_channels("provider1")

        assert len(result) == 2
        assert result[0]["name"] == "ARD"
        assert result[1]["display_name"] == "ZDF"

    def test_get_all_channels_success(
        self, client, mock_adapter, sample_providers, sample_channels
    ):
        """Test getting all channels grouped by provider."""
        mock_adapter.get(
            "http://test-ultimate:3000/api/providers",
            json=sample_providers,
            status_code=200,
        )

        # Mock channels for each provider
        mock_adapter.get(
            "http://test-ultimate:3000/api/providers/provider1/channels",
            json=sample_channels,
            status_code=200,
        )

        mock_adapter.get(
            "http://test-ultimate:3000/api/providers/provider2/channels",
            json=sample_channels[:1],  # Only first channel for provider2
            status_code=200,
        )

        result = client.get_all_channels()

        assert "provider1" in result
        assert "provider2" in result
        assert len(result["provider1"]["channels"]) == 2
        assert len(result["provider2"]["channels"]) == 1
