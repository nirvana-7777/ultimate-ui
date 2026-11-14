import requests

from tests.conftest import CSRF

EPG = "http://epg.internal:8080"
UB = "http://backend.internal:7777"


def channels(n):
    return [{"id": i, "name": f"ch{i}"} for i in range(n)]


# ---------------------------------------------------------------- EPG channels


def test_epg_channels_paginates(client, requests_mock):
    requests_mock.get(f"{EPG}/api/v1/channels", json=channels(5))
    r = client.get("/api/epg/channels?page=1&limit=2")
    assert r.status_code == 200
    assert [c["id"] for c in r.json["channels"]] == [2, 3]
    assert r.json["has_more"] is True and r.json["total"] == 5


def test_epg_channels_backend_down_is_an_error_not_an_empty_list(client, requests_mock):
    """Regression: the old client returned [] so the UI never showed its banner."""
    requests_mock.get(f"{EPG}/api/v1/channels", exc=requests.ConnectionError("boom"))
    r = client.get("/api/epg/channels")
    assert r.status_code == 502
    assert r.json["success"] is False
    assert "epg.internal" not in r.get_data(as_text=True)  # no topology leak


def test_epg_channels_timeout_is_504(client, requests_mock):
    requests_mock.get(f"{EPG}/api/v1/channels", exc=requests.Timeout())
    assert client.get("/api/epg/channels").status_code == 504


def test_epg_channels_bad_params(client):
    assert client.get("/api/epg/channels?page=-1").status_code == 400
    assert client.get("/api/epg/channels?limit=0").status_code == 400
    assert client.get("/api/epg/channels?limit=abc").status_code == 400


def test_programs_forwards_provider_and_encodes_identifier(client, requests_mock):
    m = requests_mock.get(f"{EPG}/api/v1/channels/1%3Fx%3Dy/programs", json=[])
    r = client.get("/api/channels/1%3Fx%3Dy/programs?start=a&end=b&provider=joyn")
    assert r.status_code == 200 and r.json["programs"] == []
    sent = m.last_request
    assert sent.qs == {
        "start": ["a"],
        "end": ["b"],
        "provider": ["joyn"],
    }  # no injected x=y


# ---------------------------------------------------------------- providers


def test_provider_list_and_upstream_error_passthrough(client, requests_mock):
    requests_mock.get(f"{EPG}/api/v1/providers", json=[{"id": 1}])
    assert client.get("/api/providers").json == [{"id": 1}]

    requests_mock.get(
        f"{EPG}/api/v1/providers/9",
        status_code=404,
        json={"error": "provider 9 not found"},
    )
    r = client.get("/api/providers/9")
    assert r.status_code == 404
    assert "provider 9 not found" in r.json["error"]


def test_create_provider_sets_enabled_flag(client, requests_mock):
    requests_mock.post(f"{EPG}/api/v1/providers", json={"id": 7, "name": "x"})
    put = requests_mock.put(
        f"{EPG}/api/v1/providers/7", json={"id": 7, "enabled": False}
    )
    r = client.post(
        "/api/providers",
        json={"name": "x", "xmltv_url": "https://e.com/a.xml", "enabled": False},
        headers=CSRF,
    )
    assert r.status_code == 201
    assert put.last_request.json()["enabled"] is False


def test_create_provider_failure_is_not_a_201(client, requests_mock):
    """Regression: a failed create used to answer 201 with `null`."""
    requests_mock.post(f"{EPG}/api/v1/providers", status_code=500)
    r = client.post(
        "/api/providers",
        json={"name": "x", "xmltv_url": "https://e.com/a.xml"},
        headers=CSRF,
    )
    assert r.status_code == 502


def test_create_provider_validation(client):
    h = CSRF
    assert (
        client.post(
            "/api/providers", json={"name": "", "xmltv_url": "http://a"}, headers=h
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/providers",
            json={"name": "n", "xmltv_url": "file:///etc/passwd"},
            headers=h,
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/providers",
            json={"name": "n", "xmltv_url": "http://a", "enabled": "yes"},
            headers=h,
        ).status_code
        == 400
    )


def test_delete_provider(client, requests_mock):
    requests_mock.delete(f"{EPG}/api/v1/providers/3", status_code=204)
    r = client.delete("/api/providers/3", headers=CSRF)
    assert r.status_code == 204


def test_import_status_is_tolerant(client, requests_mock):
    requests_mock.get(f"{EPG}/api/v1/import/status", exc=requests.ConnectionError())
    r = client.get("/api/import/status")
    assert r.status_code == 200 and r.json == {}


# ---------------------------------------------------------------- mapping


def test_mapping_providers_and_channels(client, requests_mock):
    requests_mock.get(f"{UB}/api/providers", json={"providers": [{"id": "joyn"}]})
    requests_mock.get(
        f"{UB}/api/providers/joyn/channels", json={"channels": [{"Id": "1"}]}
    )
    assert (
        client.get("/api/mapping/providers").json["providers"]["providers"][0]["id"]
        == "joyn"
    )
    assert (
        client.get("/api/mapping/channels/joyn").json["channels"]["channels"][0]["Id"]
        == "1"
    )


def test_mapping_channels_backend_down_and_bad_ids(client, requests_mock):
    requests_mock.get(
        f"{UB}/api/providers/joyn/channels", exc=requests.ConnectionError()
    )
    r = client.get("/api/mapping/channels/joyn")
    assert r.status_code == 502 and r.json["success"] is False
    assert client.get("/api/mapping/channels/..").status_code == 400
    assert client.get("/api/mapping/channels/a%20b").status_code == 400


def test_create_alias(client, requests_mock):
    m = requests_mock.post(f"{EPG}/api/v1/channels/42/aliases", json={"id": 1})
    r = client.post(
        "/api/mapping/create-alias",
        json={
            "channel_identifier": "42",
            "alias": "joyn:1",
            "alias_type": "ultimate_backend",
        },
        headers=CSRF,
    )
    assert r.status_code == 200 and r.json["success"] is True
    assert m.last_request.json() == {
        "alias": "joyn:1",
        "alias_type": "ultimate_backend",
    }
    r = client.post("/api/mapping/create-alias", json={"alias": "x"}, headers=CSRF)
    assert r.status_code == 400


# ---------------------------------------------------------------- catchup download

MANIFEST = f"{UB}/api/providers/joyn/channels/5/manifest"
TS = "http://ts-proxy.internal:9000/stream/5/{start_time}/{end_time}.ts"
DL = "/api/proxy/catchup/download?provider=joyn&channel=5&start=1000&end=2000"


def test_download_validation(client):
    assert (
        client.get(
            "/api/proxy/catchup/download?provider=a/b&channel=5&start=1&end=2"
        ).status_code
        == 400
    )
    assert (
        client.get(
            "/api/proxy/catchup/download?provider=joyn&channel=..&start=1&end=2"
        ).status_code
        == 400
    )
    assert (
        client.get(
            "/api/proxy/catchup/download?provider=joyn&channel=5&start=2&end=1"
        ).status_code
        == 400
    )
    assert (
        client.get(
            "/api/proxy/catchup/download?provider=joyn&channel=5&start=0&end=999999"
        ).status_code
        == 400
    )


def test_download_not_available_without_ts_template(client, requests_mock):
    requests_mock.get(MANIFEST, json={"catchup_stream_url_template": "x"})
    r = client.get(DL)
    assert r.status_code == 503


def test_download_head_is_a_cheap_preflight(client, requests_mock):
    requests_mock.get(MANIFEST, json={"ts_catchup_stream_url_template": TS})
    stream = requests_mock.get(
        "http://ts-proxy.internal:9000/stream/5/1000/2000.ts", content=b"x"
    )
    r = client.head(DL)
    assert r.status_code == 200
    assert not stream.called  # no bytes streamed for a HEAD


def test_download_streams_with_safe_filename_and_range(client, requests_mock):
    requests_mock.get(MANIFEST, json={"ts_catchup_stream_url_template": TS})
    up = requests_mock.get(
        "http://ts-proxy.internal:9000/stream/5/1000/2000.ts",
        content=b"TSDATA",
        status_code=206,
        headers={"Content-Range": "bytes 0-5/6", "Content-Type": "video/mp2t"},
    )
    r = client.get(
        DL + "&filename=../../Tagesschau 20:00!", headers={"Range": "bytes=0-5"}
    )
    assert r.status_code == 206 and r.data == b"TSDATA"
    assert up.last_request.headers["Range"] == "bytes=0-5"
    disp = r.headers["Content-Disposition"]
    assert disp.startswith('attachment; filename="') and disp.endswith('.ts"')
    assert "/" not in disp and ":" not in disp and " " not in disp.split("=", 1)[1]


def test_download_upstream_errors(client, requests_mock):
    requests_mock.get(MANIFEST, json={"ts_catchup_stream_url_template": TS})
    requests_mock.get(
        "http://ts-proxy.internal:9000/stream/5/1000/2000.ts", status_code=404
    )
    assert client.get(DL).status_code == 404


def test_download_refuses_non_http_template(client, requests_mock):
    requests_mock.get(
        MANIFEST,
        json={
            "ts_catchup_stream_url_template": "file:///etc/passwd?{start_time}{end_time}"
        },
    )
    assert client.get(DL).status_code == 502


def test_download_manifest_backend_down_does_not_leak(client, requests_mock):
    requests_mock.get(
        MANIFEST, exc=requests.ConnectionError("connection refused to 10.1.2.3")
    )
    r = client.get(DL)
    assert r.status_code == 502
    assert "10.1.2.3" not in r.get_data(as_text=True)


# ---------------------------------------------------------------- monitoring


def test_monitoring_renders_when_webepg_is_down(client, requests_mock):
    requests_mock.get(f"{EPG}/api/v1/health", exc=requests.ConnectionError())
    requests_mock.get(f"{EPG}/api/v1/import/status", exc=requests.ConnectionError())
    requests_mock.get(f"{EPG}/api/v1/statistics", exc=requests.ConnectionError())
    requests_mock.get(f"{EPG}/api/v1/channels", exc=requests.ConnectionError())
    r = client.get("/api/monitoring/status")
    assert r.status_code == 200
    assert r.json["webepg_health"] is False
    assert r.json["import_status"]["recent_imports"] == []


def test_connection_tests(client, requests_mock):
    requests_mock.get(f"{EPG}/api/v1/health", status_code=200)
    requests_mock.get(f"{EPG}/api/v1/channels", json=channels(3))
    r = client.get("/api/test/webepg")
    assert r.json["success"] and r.json["channels_count"] == 3

    requests_mock.get(f"{EPG}/api/v1/health", exc=requests.ConnectionError())
    r = client.get("/api/test/webepg")
    assert r.status_code == 503 and r.json["success"] is False

    requests_mock.get(f"{UB}/api/providers", exc=requests.ConnectionError())
    r = client.get("/api/test/ultimate-backend")
    assert r.status_code == 503 and "backend.internal" not in r.get_data(as_text=True)
