from datetime import datetime, timedelta

import pytest
import requests
import requests_mock

from src.api_client import UltimateBackendClient, UpstreamError, WebEPGClient


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
        """A broken WebEPG is an error, not an empty channel list."""
        mock_adapter.get("http://test-webepg:8080/api/v1/channels", status_code=500)

        with pytest.raises(UpstreamError) as exc:
            client.get_channels()

        assert exc.value.status == 502
        assert (
            "test-webepg" not in exc.value.message
        )  # no hostnames towards the browser

    def test_get_channels_timeout(self, client, mock_adapter):
        """Timeouts map to 504."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels", exc=requests.exceptions.Timeout
        )

        with pytest.raises(UpstreamError) as exc:
            client.get_channels()

        assert exc.value.status == 504

    def test_get_channels_unreachable(self, client, mock_adapter):
        """Connection errors map to 502."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels",
            exc=requests.exceptions.ConnectionError,
        )

        with pytest.raises(UpstreamError) as exc:
            client.get_channels()

        assert exc.value.status == 502

    def test_get_channels_unexpected_format(self, client, mock_adapter):
        """A non-list answer must not be passed on as channels."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels", json={"error": "nope"}
        )

        with pytest.raises(UpstreamError):
            client.get_channels()

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

    def test_get_channel_identifier_is_percent_encoded(self, client, mock_adapter):
        """A decoded '?' or '/' in an identifier must not rewrite the upstream URL."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels/a%3Fb%3Dc%2Fd", json={"id": 1}
        )

        assert client.get_channel("a?b=c/d") == {"id": 1}

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

    def test_get_channel_programs_forwards_provider(
        self, client, mock_adapter, sample_programs
    ):
        """The optional provider scopes provider-native channel ids."""
        m = mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels/channel1/programs",
            json=sample_programs,
        )

        client.get_channel_programs("channel1", "a", "b", provider="joyn")

        assert m.last_request.qs == {"start": ["a"], "end": ["b"], "provider": ["joyn"]}

    def test_get_channel_programs_error(self, client, mock_adapter):
        """Test getting channel programs with error."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/channels/channel1/programs", status_code=500
        )

        with pytest.raises(UpstreamError) as exc:
            client.get_channel_programs("channel1", "2024-01-01", "2024-01-02")

        assert exc.value.status == 502

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

    def test_create_provider_error(self, client, mock_adapter):
        """A failed create must not look like a created provider."""
        mock_adapter.post("http://test-webepg:8080/api/v1/providers", status_code=500)

        with pytest.raises(UpstreamError):
            client.create_provider("New Provider", "http://example.com/epg.xml")

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
        """A rejected alias (HTTP 400) keeps its 4xx status."""
        mock_adapter.post(
            "http://test-webepg:8080/api/v1/channels/channel1/aliases", status_code=400
        )

        with pytest.raises(UpstreamError) as exc:
            client.create_channel_alias("channel1", "ard_hd")

        assert exc.value.status == 400

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

    def test_get_import_status_is_tolerant(self, client, mock_adapter):
        """Monitoring must render while WebEPG is down."""
        mock_adapter.get(
            "http://test-webepg:8080/api/v1/import/status", status_code=500
        )

        assert client.get_import_status() == {}

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

    def test_trigger_import_error(self, client, mock_adapter):
        """A failed trigger raises instead of returning an error dict."""
        mock_adapter.post(
            "http://test-webepg:8080/api/v1/import/trigger", status_code=500
        )

        with pytest.raises(UpstreamError):
            client.trigger_import()

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
        """A broken Ultimate Backend is an error, not an empty provider list."""
        mock_adapter.get("http://test-ultimate:3000/api/providers", status_code=500)

        with pytest.raises(UpstreamError) as exc:
            client.get_providers()

        assert exc.value.status == 502

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

    def test_get_all_channels_skips_a_failing_provider(
        self, client, mock_adapter, sample_providers, sample_channels
    ):
        """One broken provider must not take the whole listing down."""
        mock_adapter.get(
            "http://test-ultimate:3000/api/providers", json=sample_providers
        )
        mock_adapter.get(
            "http://test-ultimate:3000/api/providers/provider1/channels",
            status_code=500,
        )
        mock_adapter.get(
            "http://test-ultimate:3000/api/providers/provider2/channels",
            json=sample_channels,
        )

        result = client.get_all_channels()

        assert list(result) == ["provider2"]
