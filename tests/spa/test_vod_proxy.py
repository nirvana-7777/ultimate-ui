import requests

CSRF = {"X-Requested-With": "ultimate-ui"}
VOD = "http://vod.internal:7888"


def test_vod_page_is_served_by_the_spa(client):
    r = client.get("/vod")
    assert r.status_code == 200
    assert b"root" in r.data


def test_movies_forwards_only_validated_params(client, requests_mock):
    m = requests_mock.get(
        f"{VOD}/api/library/movies", json={"items": [], "total": 0, "limit": 60}
    )
    r = client.get(
        "/api/vod/movies?provider=joyn&include_priced=true&limit=30&offset=60&q=tatort"
    )
    assert r.status_code == 200 and r.json["total"] == 0
    assert m.last_request.qs == {
        "provider": ["joyn"],
        "include_priced": ["true"],
        "limit": ["30"],
        "offset": ["60"],
        "q": ["tatort"],
    }


def test_movies_defaults_hide_priced_content(client, requests_mock):
    m = requests_mock.get(f"{VOD}/api/library/movies", json={"items": []})
    client.get("/api/vod/movies")
    assert m.last_request.qs["include_priced"] == ["false"]
    assert m.last_request.qs["limit"] == ["60"]


def test_movies_bad_params(client):
    assert client.get("/api/vod/movies?limit=0").status_code == 400
    assert client.get("/api/vod/movies?limit=201").status_code == 400
    assert client.get("/api/vod/movies?offset=-1").status_code == 400
    assert client.get("/api/vod/movies?include_priced=maybe").status_code == 400
    assert client.get("/api/vod/movies?provider=a/b").status_code == 400
    assert client.get("/api/vod/movies?q=" + "x" * 101).status_code == 400


def test_crawler_down_is_an_error_without_topology_leak(client, requests_mock):
    requests_mock.get(f"{VOD}/api/library/movies", exc=requests.ConnectionError("x"))
    r = client.get("/api/vod/movies")
    assert r.status_code == 502 and r.json["success"] is False
    assert "vod.internal" not in r.get_data(as_text=True)


def test_shows_provider_filter(client, requests_mock):
    m = requests_mock.get(f"{VOD}/api/library/shows", json=[{"id": "s1"}])
    assert client.get("/api/vod/shows?provider=zdf").json == [{"id": "s1"}]
    assert m.last_request.qs == {"provider": ["zdf"]}


def test_episodes_encode_show_id(client, requests_mock):
    m = requests_mock.get(
        f"{VOD}/api/library/shows/a%3Fb/episodes", json={"items": [], "total": 0}
    )
    r = client.get("/api/vod/shows/a%3Fb/episodes?limit=1000")
    assert r.status_code == 200
    assert m.last_request.qs == {"include_priced": ["false"], "limit": ["1000"], "offset": ["0"]}


def test_sync_requires_csrf_header(client):
    assert client.post("/api/vod/sync", json={}).status_code == 403


def test_sync_forwards_provider_and_passes_409(client, requests_mock):
    m = requests_mock.post(f"{VOD}/api/sync", json={"success": True})
    r = client.post("/api/vod/sync", json={"provider": "joyn"}, headers=CSRF)
    assert r.status_code == 200 and m.last_request.json() == {"provider": "joyn"}

    requests_mock.post(
        f"{VOD}/api/sync", status_code=409, json={"detail": "Sync already in progress"}
    )
    r = client.post("/api/vod/sync", json={}, headers=CSRF)
    assert r.status_code == 409 and "already in progress" in r.json["error"]


def test_sync_rejects_bad_provider(client):
    r = client.post("/api/vod/sync", json={"provider": "../x"}, headers=CSRF)
    assert r.status_code == 400


def test_connection_test_reports_degraded_as_online(client, requests_mock):
    requests_mock.get(f"{VOD}/health", json={"status": "degraded", "last_crawl": None})
    r = client.get("/api/test/vod-crawler")
    assert r.status_code == 200 and r.json["health"] == "degraded"

    requests_mock.get(f"{VOD}/health", status_code=503, json={"status": "unhealthy"})
    assert client.get("/api/test/vod-crawler").status_code == 503


def test_vod_settings_are_validated_and_exposed(client, csrf):
    r = client.post("/config", json={"vod_crawler_url": "ftp://x"}, headers=csrf)
    assert r.status_code == 400
    r = client.post(
        "/config",
        json={"vod_crawler_url": "http://vod:7888", "vod_crawler_timeout": 15},
        headers=csrf,
    )
    assert r.status_code == 200
    page = client.get("/vod").get_data(as_text=True)
    assert "http://vod:7888" in page
