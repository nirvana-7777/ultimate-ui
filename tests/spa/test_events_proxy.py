BE = "http://backend.internal:7777"


def test_events_page_is_served_by_the_spa(client):
    r = client.get("/events")
    assert r.status_code == 200
    assert b"root" in r.data


def test_list_events_is_per_provider(client, requests_mock):
    m = requests_mock.get(
        f"{BE}/api/providers/magenta2/events",
        json={"provider": "magenta2", "events": [{"Name": "Finale"}], "count": 1},
    )
    r = client.get("/api/events/magenta2")
    assert r.status_code == 200 and r.json["events"][0]["Name"] == "Finale"
    assert m.called
    assert m.last_request.qs == {}


def test_list_events_forwards_time_range(client, requests_mock):
    m = requests_mock.get(f"{BE}/api/providers/magenta2/events", json={"events": []})
    r = client.get(
        "/api/events/magenta2"
        "?start_time=2026-03-01T00:00:00&end_time=2026-03-01T23:59:59"
    )
    assert r.status_code == 200
    assert m.last_request.qs == {
        "start_time": ["2026-03-01t00:00:00"],
        "end_time": ["2026-03-01t23:59:59"],
    }


def test_list_events_rejects_bad_input(client):
    assert client.get("/api/events/..").status_code == 400
    assert client.get("/api/events/a%20b").status_code == 400
    assert client.get("/api/events/joyn?start_time=tomorrow").status_code == 400
    assert client.get("/api/events/joyn?end_time=" + "1" * 80).status_code == 400


def test_list_events_passes_upstream_404(client, requests_mock):
    requests_mock.get(
        f"{BE}/api/providers/nope/events",
        status_code=404,
        json={"error": "Provider not found", "message": "Provider 'nope' not found"},
    )
    r = client.get("/api/events/nope")
    assert r.status_code == 404
