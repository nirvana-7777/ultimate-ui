import os
import sys
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest
from flask import template_rendered

# Add src to path (if needed for other imports)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

# Global mocks storage
_GLOBAL_MOCKS = {"config": None, "webepg": None, "ultimate": None}


@pytest.fixture(scope="session", autouse=True)
def mock_config_for_app_import():
    """Mock config before app.py is imported to prevent initialization errors."""
    # Use the global variable directly, no need for 'global' keyword
    # since we're modifying the dictionary contents, not reassigning the variable

    # Mock the config class
    with patch("src.app.Config") as MockConfig:
        mock_config = Mock()
        mock_config.get = Mock(
            side_effect=lambda key, default=None: {
                "webepg.url": "http://test-webepg:8080",
                "webepg.timeout": 10,
                "ultimate_backend.url": "http://test-ultimate:3000",
                "ultimate_backend.timeout": 10,
                "ui.theme": "dark",
                "ui.refresh_interval": 300,
                "ui.timezone": "Europe/Berlin",
                "player.default_size": "medium",
                "player.default_bitrate": "auto",
                "database.retention_days": 7,
                "cache.enabled": False,
                "ui.show_icons": True,
                "ui.show_descriptions": True,
                "player.autoplay": True,
                "player.muted": False,
                "player.default_volume": 50,
                "cache.ttl": 300,
                "logging.level": "INFO",
            }.get(key, default)
        )
        mock_config.to_dict = Mock(
            return_value={
                "webepg": {"url": "http://test-webepg:8080", "timeout": 10},
                "ultimate_backend": {"url": "http://test-ultimate:3000", "timeout": 10},
                "ui": {
                    "theme": "dark",
                    "refresh_interval": 300,
                    "timezone": "Europe/Berlin",
                    "show_icons": True,
                    "show_descriptions": True,
                },
                "player": {
                    "default_size": "medium",
                    "default_bitrate": "auto",
                    "autoplay": True,
                    "muted": False,
                    "default_volume": 50,
                },
                "database": {"retention_days": 7},
                "cache": {"enabled": False, "ttl": 300},
                "logging": {"level": "INFO"},
            }
        )
        mock_config.save = Mock(return_value=True)
        mock_config.load = Mock(return_value=True)
        mock_config.merge = Mock(return_value=None)
        mock_config.config = mock_config.to_dict.return_value

        MockConfig.return_value = mock_config
        _GLOBAL_MOCKS["config"] = mock_config

        # Mock the API clients before importing
        with patch("src.app.WebEPGClient") as MockWebEPG:
            mock_webepg = Mock()
            mock_webepg.get_channels = Mock(return_value=[])
            mock_webepg.get_channel_programs = Mock(return_value=[])
            mock_webepg.create_channel_alias = Mock(
                return_value={"id": "alias1", "status": "created"}
            )
            mock_webepg.get_import_status = Mock(
                return_value={
                    "recent_imports": [],
                    "next_scheduled_import": "2024-01-01T12:00:00Z",
                }
            )
            mock_webepg.get_statistics = Mock(
                return_value={
                    "total_channels": 10,
                    "total_programs": 1000,
                    "total_providers": 2,
                    "total_aliases": 5,
                    "earliest_program": "2024-01-01T00:00:00Z",
                    "latest_program": "2024-01-07T23:59:59Z",
                    "days_covered": 7,
                }
            )
            mock_webepg.get_health = Mock(
                return_value={"status": "healthy", "version": "1.0.0"}
            )
            mock_webepg.trigger_import = Mock(
                return_value={"status": "started", "import_id": "123"}
            )
            MockWebEPG.return_value = mock_webepg
            _GLOBAL_MOCKS["webepg"] = mock_webepg

            with patch("src.app.UltimateBackendClient") as MockUltimate:
                mock_ultimate = Mock()
                mock_ultimate.get_providers = Mock(
                    return_value=[
                        {"id": "provider1", "name": "IPTV Provider 1"},
                        {"id": "provider2", "name": "IPTV Provider 2"},
                    ]
                )
                mock_ultimate.get_provider_channels = Mock(
                    return_value=[
                        {"id": "ultimate_channel1", "name": "Ultimate Channel 1"},
                        {"id": "ultimate_channel2", "name": "Ultimate Channel 2"},
                    ]
                )
                mock_ultimate.get_health = Mock(
                    return_value={"status": "healthy", "version": "1.0.0"}
                )
                mock_ultimate.get_alias = Mock(
                    return_value={
                        "id": "alias1",
                        "channel_id": "channel1",
                        "alias": "ARD HD",
                    }
                )
                mock_ultimate.create_alias = Mock(
                    return_value={"id": "alias1", "status": "created"}
                )
                mock_ultimate.refresh_epg = Mock(
                    return_value={
                        "status": "refreshed",
                        "timestamp": "2024-01-01T10:00:00Z",
                    }
                )
                mock_ultimate.get_monitoring_status = Mock(
                    return_value={
                        "webepg": {
                            "status": "healthy",
                            "last_check": "2024-01-01T10:00:00Z",
                        },
                        "ultimate_backend": {
                            "status": "healthy",
                            "last_check": "2024-01-01T10:00:00Z",
                        },
                        "ultimate_ui": {
                            "status": "healthy",
                            "last_check": "2024-01-01T10:00:00Z",
                        },
                    }
                )
                MockUltimate.return_value = mock_ultimate
                _GLOBAL_MOCKS["ultimate"] = mock_ultimate

        yield _GLOBAL_MOCKS["config"]


@pytest.fixture(autouse=True)
def setup_mocks():
    """Apply mocks for each test."""
    # Reset mock calls before each test
    for mock in _GLOBAL_MOCKS.values():
        if mock:
            mock.reset_mock()

    yield


@pytest.fixture
def app():
    """Create and configure a Flask app for testing."""
    from src.app import app as flask_app

    flask_app.config["TESTING"] = True
    flask_app.config["SECRET_KEY"] = "test-secret-key"
    flask_app.config["WTF_CSRF_ENABLED"] = False
    flask_app.config["SERVER_NAME"] = "localhost.localdomain"  # For URL generation

    # Create a test client context
    with flask_app.app_context():
        yield flask_app


@pytest.fixture
def client(app):
    """Create a test client."""
    return app.test_client()


@pytest.fixture
def runner(app):
    """Create a CLI runner."""
    return app.test_cli_runner()


@pytest.fixture
def mock_webepg_client():
    """Mock WebEPGClient for testing."""
    # Return the global mock that's already set up
    return _GLOBAL_MOCKS["webepg"]


@pytest.fixture
def mock_ultimate_backend_client():
    """Mock UltimateBackendClient for testing."""
    # Return the global mock that's already set up
    return _GLOBAL_MOCKS["ultimate"]


@pytest.fixture
def test_config():
    """Create a test configuration."""
    config = Mock()
    config.config = {
        "webepg": {"url": "http://test-webepg:8080", "timeout": 5},
        "ultimate_backend": {"url": "http://test-ultimate:3000", "timeout": 5},
        "ui": {"theme": "dark", "refresh_interval": 300, "timezone": "Europe/Berlin"},
        "player": {"default_size": "medium", "default_bitrate": "auto"},
        "database": {"retention_days": 7},
        "cache": {"enabled": False},
    }
    config.get = Mock(
        side_effect=lambda key, default=None: {
            "webepg.url": "http://test-webepg:8080",
            "webepg.timeout": 5,
            "ultimate_backend.url": "http://test-ultimate:3000",
            "ultimate_backend.timeout": 5,
            "ui.theme": "dark",
            "ui.refresh_interval": 300,
            "ui.timezone": "Europe/Berlin",
            "player.default_size": "medium",
            "player.default_bitrate": "auto",
            "database.retention_days": 7,
            "cache.enabled": False,
        }.get(key, default)
    )
    config.to_dict = Mock(
        return_value={
            "webepg": {"url": "http://test-webepg:8080", "timeout": 5},
            "ultimate_backend": {"url": "http://test-ultimate:3000", "timeout": 5},
            "ui": {
                "theme": "dark",
                "refresh_interval": 300,
                "timezone": "Europe/Berlin",
            },
            "player": {"default_size": "medium", "default_bitrate": "auto"},
            "database": {"retention_days": 7},
            "cache": {"enabled": False},
        }
    )
    config.save = Mock(return_value=True)
    return config


@contextmanager
def captured_templates(app):
    """Capture templates rendered during a request."""
    recorded = []

    def record(sender, template, context, **extra):
        recorded.append((template, context))

    template_rendered.connect(record, app)
    try:
        yield recorded
    finally:
        template_rendered.disconnect(record, app)


@pytest.fixture
def sample_channels():
    """Sample channel data for testing."""
    return [
        {
            "id": "channel1",
            "name": "ARD",
            "display_name": "Das Erste",
            "icon_url": "http://example.com/ard.png",
        },
        {
            "id": "channel2",
            "name": "ZDF",
            "display_name": "ZDF",
            "icon_url": "http://example.com/zdf.png",
        },
    ]


@pytest.fixture
def sample_programs():
    """Sample program data for testing."""
    return [
        {
            "id": "program1",
            "title": "Tagesschau",
            "subtitle": "20:00 Uhr",
            "description": "Nachrichtensendung",
            "start_time": "2024-01-01T20:00:00Z",
            "end_time": "2024-01-01T20:15:00Z",
            "category": "news",
            "stream": "http://example.com/stream1.m3u8",
        },
        {
            "id": "program2",
            "title": "Sportschau",
            "subtitle": "Fußball",
            "description": "Sportsendung",
            "start_time": "2024-01-01T20:15:00Z",
            "end_time": "2024-01-01T21:00:00Z",
            "category": "sport",
            "stream": "http://example.com/stream2.m3u8",
        },
    ]


@pytest.fixture
def sample_providers():
    """Sample provider data for testing."""
    return [
        {"id": "provider1", "name": "IPTV Provider 1"},
        {"id": "provider2", "name": "IPTV Provider 2"},
    ]


@pytest.fixture
def sample_import_status():
    """Sample import status data for testing."""
    return {
        "recent_imports": [
            {
                "id": "import1",
                "provider_id": "provider1",
                "started_at": "2024-01-01T10:00:00Z",
                "completed_at": "2024-01-01T10:05:00Z",
                "status": "success",
                "programs_imported": 100,
                "programs_skipped": 5,
            }
        ],
        "next_scheduled_import": "2024-01-01T12:00:00Z",
    }


@pytest.fixture
def sample_statistics():
    """Sample statistics data for testing."""
    return {
        "total_channels": 10,
        "total_programs": 1000,
        "total_providers": 2,
        "total_aliases": 5,
        "earliest_program": "2024-01-01T00:00:00Z",
        "latest_program": "2024-01-07T23:59:59Z",
        "days_covered": 7,
    }
