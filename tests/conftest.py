"""FALLBACK fixtures - use ONLY if your own tests/conftest.py is gone.

Reconstructed from how the tests use them (I never saw the original), so keep your own
file if you can restore it from git. Provides: app, client, sample_channels,
sample_programs, sample_providers, mock_get_webepg_client,
mock_get_ultimate_backend_client, mock_update_clients.
"""

import atexit
import os
import shutil
import tempfile
from unittest.mock import patch

import pytest

# Isolate the app from the repo's real config/config.yaml (and stop tests that save
# settings from writing into it). Must happen before `src.app` is first imported.
_tmp_dir = tempfile.mkdtemp(prefix="ultimate-ui-tests-")
atexit.register(shutil.rmtree, _tmp_dir, ignore_errors=True)
os.environ["ULTIMATE_UI_CONFIG"] = os.path.join(_tmp_dir, "config.yaml")
for _name in (
    "WEBEPG_URL",
    "ULTIMATE_BACKEND_URL",
    "ULTIMATE_BACKEND_PUBLIC_URL",
    "UI_THEME",
    "UI_REFRESH_INTERVAL",
    "UI_TIMEZONE",
):
    os.environ.pop(_name, None)


@pytest.fixture
def app():
    from src.app import app as flask_app

    flask_app.config["TESTING"] = True
    return flask_app


@pytest.fixture
def client(app):
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def sample_channels():
    return [
        {"id": "channel1", "name": "ARD", "display_name": "Das Erste"},
        {"id": "channel2", "name": "ZDF", "display_name": "ZDF"},
    ]


@pytest.fixture
def sample_programs():
    return [
        {
            "id": "program1",
            "title": "Tagesschau",
            "category": "news",
            "start_time": "2024-01-01T20:00:00Z",
            "end_time": "2024-01-01T20:15:00Z",
        },
        {
            "id": "program2",
            "title": "Sportschau",
            "category": "sport",
            "start_time": "2024-01-01T20:15:00Z",
            "end_time": "2024-01-01T21:00:00Z",
        },
    ]


@pytest.fixture
def sample_providers():
    return [
        {"id": "provider1", "name": "IPTV Provider 1"},
        {"id": "provider2", "name": "IPTV Provider 2"},
    ]


@pytest.fixture
def mock_get_webepg_client():
    with patch("src.app.get_webepg_client") as mock:
        yield mock


@pytest.fixture
def mock_get_ultimate_backend_client():
    with patch("src.app.get_ultimate_backend_client") as mock:
        yield mock


@pytest.fixture
def mock_update_clients():
    with patch("src.app.update_clients") as mock:
        yield mock
