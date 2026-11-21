CSRF = {"X-Requested-With": "ultimate-ui"}
BE = "http://backend.internal:7777"


def test_recordings_page_is_served_by_the_spa(client):
    r = client.get("/recordings")
    assert r.status_code == 200
    assert b"root" in r.data


def test_list_recordings_is_per_provider(client, requests_mock):
    m = requests_mock.get(
        f"{BE}/api/providers/joyn/recordings", json={"recordings": [{"Name": "x"}]}
    )
    r = client.get("/api/recordings/joyn")
    assert r.status_code == 200 and r.json["recordings"][0]["Name"] == "x"
    assert m.called


def test_bad_provider_is_rejected(client):
    assert client.get("/api/recordings/..").status_code == 400
    assert client.get("/api/timers/a%20b").status_code == 400


def test_delete_recording_needs_csrf_and_encodes_id(client, requests_mock):
    assert client.delete("/api/recordings/joyn/a1").status_code == 403
    m = requests_mock.delete(
        f"{BE}/api/providers/joyn/recordings/a%3Fb", status_code=200, json={}
    )
    r = client.delete("/api/recordings/joyn/a%3Fb", headers=CSRF)
    assert r.status_code == 204 and m.called


def test_delete_recording_passes_upstream_4xx(client, requests_mock):
    requests_mock.delete(
        f"{BE}/api/providers/joyn/recordings/r1",
        status_code=404,
        json={"error": "Recording not found", "message": "no such recording"},
    )
    r = client.delete("/api/recordings/joyn/r1", headers=CSRF)
    assert r.status_code == 404
    assert "no such recording" in r.json["error"]


def test_timer_types_and_list(client, requests_mock):
    requests_mock.get(f"{BE}/api/providers/joyn/timer-types", json={"timer_types": []})
    assert client.get("/api/timers/joyn/types").status_code == 200
    m = requests_mock.get(f"{BE}/api/providers/joyn/timers", json={"timers": []})
    client.get("/api/timers/joyn?include_inactive=true")
    assert m.last_request.qs == {"include_inactive": ["true"]}
    assert client.get("/api/timers/joyn?include_inactive=maybe").status_code == 400


def test_create_timer_forwards_only_known_fields(client, requests_mock):
    m = requests_mock.post(
        f"{BE}/api/providers/joyn/timers", status_code=201, json={"ClientIndex": 7}
    )
    r = client.post(
        "/api/timers/joyn",
        json={"title": "Tatort", "timer_type_id": 2, "epg_event_id": "42", "evil": 1},
        headers=CSRF,
    )
    assert r.status_code == 201 and r.json["ClientIndex"] == 7
    assert m.last_request.json() == {
        "title": "Tatort",
        "timer_type_id": 2,
        "epg_event_id": "42",
    }


def test_create_timer_rejects_bad_body(client):
    assert client.post("/api/timers/joyn", json=[], headers=CSRF).status_code == 400
    r = client.post("/api/timers/joyn", json={"title": 5}, headers=CSRF)
    assert r.status_code == 400


def test_timer_conflict_shows_reason(client, requests_mock):
    requests_mock.post(
        f"{BE}/api/providers/joyn/timers",
        status_code=409,
        json={"error": "Timer rejected by provider", "message": "quota exceeded"},
    )
    r = client.post("/api/timers/joyn", json={"title": "x"}, headers=CSRF)
    assert r.status_code == 409 and "quota exceeded" in r.json["error"]


def test_delete_timer_force(client, requests_mock):
    m = requests_mock.delete(f"{BE}/api/providers/joyn/timers/3", status_code=204)
    r = client.delete("/api/timers/joyn/3?force=true", headers=CSRF)
    assert r.status_code == 204
    assert m.last_request.qs == {"force": ["true"]}


def test_delete_timer_forwards_epg_event_id(client, requests_mock):
    m = requests_mock.delete(f"{BE}/api/providers/magenta2/timers/3", status_code=204)
    r = client.delete(
        "/api/timers/magenta2/3?epg_event_id=pro7_sd_0334511e", headers=CSRF
    )
    assert r.status_code == 204
    assert m.last_request.qs == {"epg_event_id": ["pro7_sd_0334511e"]}
    r = client.delete("/api/timers/magenta2/3?epg_event_id=" + "x" * 256, headers=CSRF)
    assert r.status_code == 400


def test_local_recordings_are_a_stub(client):
    assert client.get("/api/local-recordings").status_code == 501
    r = client.delete("/api/local-recordings/timers/1", headers=CSRF)
    assert r.status_code == 501


def test_update_timer_forwards_epg_event_id(client, requests_mock):
    m = requests_mock.put(
        f"{BE}/api/providers/magenta2/timers/5", json={"ClientIndex": 5}
    )
    r = client.put(
        "/api/timers/magenta2/5",
        json={"epg_event_id": "pro7_sd_0334511e", "epg_uid": 3371781444, "evil": 1},
        headers=CSRF,
    )
    assert r.status_code == 200
    assert m.last_request.json() == {
        "epg_event_id": "pro7_sd_0334511e",
        "epg_uid": 3371781444,
    }
