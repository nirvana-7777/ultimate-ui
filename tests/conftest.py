import importlib
import sys

import pytest

from src.config import ENV_VARS

CSRF = {"X-Requested-With": "ultimate-ui"}

BASE_YAML = """\
webepg:
  url: http://epg.internal:8080
  timeout: 5
ultimate_backend:
  url: http://backend.internal:7777
  public_url: ""
  timeout: 5
ui:
  theme: light
  refresh_interval: 600
  timezone: Europe/Berlin
secret_section:
  api_token: do-not-leak
"""


@pytest.fixture
def cfg_path(tmp_path, monkeypatch):
    for env_name, _, _ in ENV_VARS:
        monkeypatch.delenv(env_name, raising=False)
    path = tmp_path / "config" / "config.yaml"
    path.parent.mkdir()
    path.write_text(BASE_YAML, encoding="utf-8")
    monkeypatch.setenv("ULTIMATE_UI_CONFIG", str(path))
    return path


@pytest.fixture
def appmod(cfg_path):
    """Fresh src.app module (module-level Config is built at import time)."""
    sys.modules.pop("src.app", None)
    module = importlib.import_module("src.app")
    module.app.config["TESTING"] = False  # exercise the real error handlers
    yield module
    sys.modules.pop("src.app", None)


@pytest.fixture
def client(appmod):
    return appmod.app.test_client()


@pytest.fixture
def csrf():
    return dict(CSRF)
