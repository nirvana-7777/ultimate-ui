import os
import sys
from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest
from flask import template_rendered

# Add src to path (if needed for other imports)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))


# Mock the config before importing app
@pytest.fixture(scope="session", autouse=True)
def mock_config_for_app_import():
    """Mock config before app.py is imported to prevent initialization errors."""
    mock_config = Mock()
    mock_config.get = Mock(
        side_effect=lambda key, default=None: {
            "webepg.url": "http://test-webepg:8080",
            "webepg.timeout": 10,
            "ultimate_backend.url": "http://test-ultimate:3000",
            "ultimate_backend.timeout": 10,
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
            },
            "player": {"default_size": "medium", "default_bitrate": "auto"},
        }
    )

    with patch("src.app.Config") as MockConfig:
        MockConfig.return_value = mock_config
        yield mock_config


from src import UltimateBackendClient, WebEPGClient, Config
from src.app import app as flask_app


@pytest.fixture
def app():
    """Create and configure a Flask app for testing."""
    flask_app.config["TESTING"] = True
    flask_app.config["SECRET_KEY"] = "test-secret-key"
    flask_app.config["WTF_CSRF_ENABLED"] = False

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
    with patch("src.app.webepg_client") as mock:
        client = Mock(spec=WebEPGClient)
        for attr in dir(WebEPGClient):
            if not attr.startswith("_") and callable(getattr(WebEPGClient, attr)):
                setattr(client, attr, Mock())
        mock.return_value = client
        # Replace the module-level client
        yield client


@pytest.fixture
def mock_ultimate_backend_client():
    """Mock UltimateBackendClient for testing."""
    with patch("src.app.ultimate_backend_client") as mock:
        client = Mock(spec=UltimateBackendClient)
        for attr in dir(UltimateBackendClient):
            if not attr.startswith("_") and callable(
                getattr(UltimateBackendClient, attr)
            ):
                setattr(client, attr, Mock())
        mock.return_value = client
        # Replace the module-level client
        yield client


@pytest.fixture
def test_config():
    """Create a test configuration."""
    config = Config()
    config.config = {
        "webepg": {"url": "http://test-webepg:8080", "timeout": 5},
        "ultimate_backend": {"url": "http://test-ultimate:3000", "timeout": 5},
        "ui": {"theme": "dark", "refresh_interval": 300, "timezone": "Europe/Berlin"},
        "player": {"default_size": "medium", "default_bitrate": "auto"},
        "database": {"retention_days": 7},
    }
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
