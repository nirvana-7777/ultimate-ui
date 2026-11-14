import os
import stat

import pytest
import requests

from src.api_client import UltimateBackendClient, UpstreamError, WebEPGClient, _seg
from src.config import ENV_VARS, Config, ConfigError


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for env_name, _, _ in ENV_VARS:
        monkeypatch.delenv(env_name, raising=False)


def test_precedence_defaults_yaml_env(tmp_path, monkeypatch):
    p = tmp_path / "c.yaml"
    p.write_text("webepg:\n  url: http://yaml:1\n  timeout: 7\n")
    assert Config(str(p)).get("webepg.url") == "http://yaml:1"
    monkeypatch.setenv("WEBEPG_URL", "http://env:2")
    c = Config(str(p))
    assert c.get("webepg.url") == "http://env:2"
    assert c.get("webepg.timeout") == 7
    assert c.get("ui.theme") == "dark"  # default
    assert c.overridden_by_env() == {"webepg.url": "WEBEPG_URL"}


def test_empty_env_var_does_not_blank_the_setting(tmp_path, monkeypatch):
    p = tmp_path / "c.yaml"
    p.write_text("webepg:\n  url: http://yaml:1\n")
    monkeypatch.setenv("WEBEPG_URL", "")
    assert Config(str(p)).get("webepg.url") == "http://yaml:1"


def test_bad_integer_env_fails_with_clear_message(tmp_path, monkeypatch):
    monkeypatch.setenv("WEBEPG_TIMEOUT", "soon")
    with pytest.raises(ConfigError, match="WEBEPG_TIMEOUT"):
        Config(str(tmp_path / "c.yaml"))


def test_invalid_yaml_is_a_config_error(tmp_path):
    p = tmp_path / "c.yaml"
    p.write_text("a: [")
    with pytest.raises(ConfigError):
        Config(str(p))


def test_save_is_atomic_merges_and_keeps_file_mode(tmp_path):
    p = tmp_path / "sub" / "c.yaml"
    c = Config(str(p))
    c.save({"ui": {"theme": "light"}})
    assert c.get("ui.theme") == "light"
    p.chmod(0o640)
    c.save({"ui": {"refresh_interval": 90}})
    assert c.get("ui.theme") == "light" and c.get("ui.refresh_interval") == 90
    assert stat.S_IMODE(os.stat(p).st_mode) == 0o640
    assert [f for f in os.listdir(p.parent) if f.endswith(".tmp")] == []


def test_reload_if_changed(tmp_path):
    p = tmp_path / "c.yaml"
    p.write_text("ui:\n  theme: light\n")
    c = Config(str(p))
    assert c.reload_if_changed() is False
    p.write_text("ui:\n  theme: dark\n")
    os.utime(p, (os.stat(p).st_atime + 5, os.stat(p).st_mtime + 5))
    assert c.reload_if_changed() is True and c.get("ui.theme") == "dark"


# ------------------------------------------------------------------ api client


def test_seg_encodes_separators_and_dot_segments():
    assert _seg("a/b?c#d e") == "a%2Fb%3Fc%23d%20e"
    assert _seg("..") == "%2E%2E"
    assert _seg(12) == "12"


def make(cls=WebEPGClient):
    return cls("http://svc:1/", timeout=3)


def test_error_mapping(requests_mock):
    c = make()
    requests_mock.get("http://svc:1/api/v1/channels", exc=requests.Timeout())
    with pytest.raises(UpstreamError) as e:
        c.get_channels()
    assert e.value.status == 504 and "svc" not in e.value.message

    requests_mock.get("http://svc:1/api/v1/channels", exc=requests.ConnectionError("x"))
    with pytest.raises(UpstreamError) as e:
        c.get_channels()
    assert e.value.status == 502

    requests_mock.get("http://svc:1/api/v1/channels", status_code=503)
    with pytest.raises(UpstreamError) as e:
        c.get_channels()
    assert e.value.status == 502

    requests_mock.get("http://svc:1/api/v1/channels", text="<html>")
    with pytest.raises(UpstreamError) as e:
        c.get_channels()
    assert e.value.status == 502

    requests_mock.get("http://svc:1/api/v1/channels", json={"not": "a list"})
    with pytest.raises(UpstreamError):
        c.get_channels()


def test_get_channel_unknown_is_none(requests_mock):
    requests_mock.get("http://svc:1/api/v1/channels/nope", status_code=404)
    assert make().get_channel("nope") is None


def test_tolerant_monitoring_helpers(requests_mock):
    c = make()
    requests_mock.get("http://svc:1/api/v1/health", exc=requests.ConnectionError())
    requests_mock.get("http://svc:1/api/v1/import/status", status_code=500)
    requests_mock.get("http://svc:1/api/v1/statistics", status_code=500)
    requests_mock.get("http://svc:1/api/v1/channels", status_code=500)
    assert c.get_health() is False
    assert c.get_import_status() == {}
    assert c.get_statistics() == {"total_channels": 0, "estimated_programs_today": 0}


def test_get_all_channels_skips_failing_provider(requests_mock):
    c = make(UltimateBackendClient)
    requests_mock.get(
        "http://svc:1/api/providers", json={"providers": [{"id": "a"}, {"id": "b"}]}
    )
    requests_mock.get("http://svc:1/api/providers/a/channels", status_code=500)
    requests_mock.get("http://svc:1/api/providers/b/channels", json={"channels": []})
    assert list(c.get_all_channels()) == ["b"]


def test_config_without_explicit_path_is_defaults_plus_env(tmp_path, monkeypatch):
    """Regression: Config() must not load ./config/config.yaml or $ULTIMATE_UI_CONFIG."""
    (tmp_path / "config").mkdir()
    (tmp_path / "config" / "config.yaml").write_text(
        "webepg:\n  url: http://from-cwd:1\n"
    )
    other = tmp_path / "other.yaml"
    other.write_text("webepg:\n  url: http://from-env-path:2\n")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("ULTIMATE_UI_CONFIG", str(other))
    c = Config()
    assert c.get("webepg.url") == "http://localhost:8080"
    assert c.to_dict() == Config.DEFAULT_CONFIG
    assert c.reload_if_changed() is False  # nothing to watch yet

    # save() still goes to $ULTIMATE_UI_CONFIG, and the file is loaded from then on
    c.save({"ui": {"theme": "light"}})
    assert c.get("ui.theme") == "light"
    assert (
        c.get("webepg.url") == "http://from-env-path:2"
    )  # merged into the existing file
