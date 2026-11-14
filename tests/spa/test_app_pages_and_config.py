import os
import time

import yaml

CSRF = {"X-Requested-With": "ultimate-ui"}


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json["status"] == "healthy"


def test_spa_pages_inject_only_whitelisted_config(client):
    for path in ("/", "/config", "/providers", "/monitoring", "/mapping"):
        r = client.get(path)
        assert r.status_code == 200, path
        html = r.get_data(as_text=True)
        assert "window.__ULTIMATE_CONFIG__" in html
        assert "http://epg.internal:8080" in html  # needed by the Config page
        assert "do-not-leak" not in html  # never ship non-whitelisted sections
        assert 'data-theme="light"' in html
        assert "dist/assets/index.js?v=" in html


def test_unknown_browser_path_gets_spa_with_404_and_api_gets_json(client):
    r = client.get("/no-such-page")
    assert r.status_code == 404
    assert "window.__ULTIMATE_CONFIG__" in r.get_data(as_text=True)

    r = client.get("/api/no-such-endpoint")
    assert r.status_code == 404
    assert r.is_json and r.json["success"] is False

    r = client.get("/static/dist/assets/missing.js")
    assert r.status_code == 404
    assert "__ULTIMATE_CONFIG__" not in r.get_data(as_text=True)


def test_legacy_epg_route_redirects(client):
    r = client.get("/epg")
    assert r.status_code == 301 and r.headers["Location"].endswith("/")


def test_security_headers(client):
    r = client.get("/")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"


# ---------------------------------------------------------------- CSRF


def test_mutating_requests_require_custom_header(client):
    for method, url in [
        ("post", "/config"),
        ("post", "/config/reset"),
        ("post", "/api/import/trigger"),
        ("post", "/api/providers"),
        ("put", "/api/providers/1"),
        ("delete", "/api/providers/1"),
        ("delete", "/api/aliases/1"),
        ("post", "/api/mapping/create-alias"),
    ]:
        r = getattr(client, method)(url, json={})
        assert r.status_code == 403, (method, url)
        assert r.json["success"] is False


# ---------------------------------------------------------------- /config


def test_save_config_persists_and_applies(client, cfg_path, appmod):
    payload = {
        "webepg_url": "http://new-epg:9000",
        "webepg_timeout": "15",  # the form sends numbers as strings
        "ui_theme": "auto",
        "refresh_interval": 120,
        "timezone": "UTC",
        "player_size": "large",
        "player_bitrate": "3000000",
        "autoplay": False,
        "muted": True,
        "default_volume": 30,
        "retention_days": 14,
    }
    r = client.post("/config", json=payload, headers=CSRF)
    assert r.status_code == 200 and r.json["success"] is True

    saved = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    assert saved["webepg"] == {"url": "http://new-epg:9000", "timeout": 15}
    assert saved["ui"]["theme"] == "auto"
    assert saved["player"]["autoplay"] is False and saved["player"]["muted"] is True
    assert saved["database"]["retention_days"] == 14  # was silently dropped before
    # untouched + unknown sections survive a UI save
    assert saved["ultimate_backend"]["url"] == "http://backend.internal:7777"
    assert saved["secret_section"]["api_token"] == "do-not-leak"
    # new values are live immediately
    assert appmod.config.get("webepg.url") == "http://new-epg:9000"
    assert appmod.get_webepg_client().base_url == "http://new-epg:9000"


def test_save_config_rejects_bad_input_and_writes_nothing(client, cfg_path):
    before = cfg_path.read_text(encoding="utf-8")
    bad = {
        "webepg_url": "file:///etc/passwd",
        "webepg_timeout": 0,
        "ui_theme": "neon",
        "refresh_interval": 5,
        "timezone": "Mars/Base",
        "player_bitrate": "fast",
        "default_volume": 101,
        "autoplay": "maybe",
    }
    r = client.post("/config", json=bad, headers=CSRF)
    assert r.status_code == 400
    assert set(r.json["errors"]) == set(bad)
    assert cfg_path.read_text(encoding="utf-8") == before


def test_save_config_requires_json_object(client):
    r = client.post("/config", data="webepg_url=x", headers=CSRF)
    assert r.status_code == 400
    r = client.post("/config", json=["a"], headers=CSRF)
    assert r.status_code == 400


def test_save_config_unwritable_returns_generic_500(client, appmod, monkeypatch):
    def boom(*a, **k):
        raise PermissionError("/secret/path/config.yaml")

    monkeypatch.setattr(appmod.config, "save", boom)
    r = client.post("/config", json={"ui_theme": "dark"}, headers=CSRF)
    assert r.status_code == 500
    assert "/secret/path" not in r.get_data(as_text=True)


def test_reset_restores_defaults(client, cfg_path, appmod):
    client.post(
        "/config", json={"ui_theme": "dark", "retention_days": 30}, headers=CSRF
    )
    r = client.post("/config/reset", headers=CSRF)
    assert r.status_code == 200 and r.json["success"] is True
    saved = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    assert saved == appmod.Config.DEFAULT_CONFIG
    assert "secret_section" not in saved


def test_env_override_is_reported(client, monkeypatch, appmod):
    monkeypatch.setenv("WEBEPG_URL", "http://from-env:8080")
    appmod.config.reload()
    r = client.post(
        "/config", json={"webepg_url": "http://typed-in-ui:8080"}, headers=CSRF
    )
    assert r.status_code == 200
    assert any("WEBEPG_URL" in w for w in r.json["warnings"])
    assert appmod.config.get("webepg.url") == "http://from-env:8080"


def test_other_worker_save_is_picked_up(client, cfg_path, appmod):
    """gunicorn runs several workers; a save by one must reach the others."""
    assert 'data-theme="light"' in client.get("/").get_data(as_text=True)
    data = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    data["ui"]["theme"] = "dark"
    data["webepg"]["url"] = "http://elsewhere:1234"
    cfg_path.write_text(yaml.safe_dump(data), encoding="utf-8")
    future = time.time() + 5
    os.utime(cfg_path, (future, future))  # guarantee a different mtime

    html = client.get("/").get_data(as_text=True)
    assert 'data-theme="dark"' in html
    assert appmod.get_webepg_client().base_url == "http://elsewhere:1234"


def test_broken_yaml_keeps_last_good_config(client, cfg_path, appmod):
    cfg_path.write_text("webepg: [unclosed", encoding="utf-8")
    future = time.time() + 5
    os.utime(cfg_path, (future, future))
    r = client.get("/health")
    assert r.status_code == 200
    assert appmod.config.get("webepg.url") == "http://epg.internal:8080"
