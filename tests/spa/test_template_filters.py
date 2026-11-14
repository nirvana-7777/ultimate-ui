from datetime import datetime, timezone


def test_format_time_converts_to_configured_timezone(appmod):
    # config.yaml in conftest uses Europe/Berlin (UTC+1 in January)
    assert appmod.format_time("2026-01-15T10:30:00Z") == "11:30"
    assert appmod.format_time("2026-01-15T10:30:00+00:00") == "11:30"
    assert appmod.format_time("2026-01-15T10:30:00") == "11:30"  # naive = UTC
    assert (
        appmod.format_time(datetime(2026, 1, 15, 10, 30, tzinfo=timezone.utc))
        == "11:30"
    )


def test_format_time_fallbacks(appmod):
    assert appmod.format_time("") == ""
    assert appmod.format_time(None) == ""
    assert appmod.format_time("garbage") == "garbage"
    assert appmod.format_time("xxTyy:zz-broken") == "yy:zz"


def test_format_datetime(appmod):
    assert appmod.format_datetime("2026-07-15T10:30:00Z") == "15.07.2026 12:30"  # CEST
    assert appmod.format_datetime("nonsense") == "nonsense"
    assert appmod.format_datetime("") == ""


def test_truncate_filter(appmod):
    assert appmod.truncate_filter("") == ""
    assert appmod.truncate_filter("short", 10) == "short"
    assert appmod.truncate_filter("x" * 120) == "x" * 100 + "..."


def test_time_diff_filter(appmod):
    f = appmod.time_diff_filter
    assert f("2026-01-01T10:00:00Z", "2026-01-01T11:02:03Z") == "1h 2m 3s"
    assert f("2026-01-01T10:00:00Z", "2026-01-01T10:05:09Z") == "5m 9s"
    assert f("2026-01-01T10:00:00Z", "2026-01-01T10:00:07Z") == "7s"
    assert f(None, "2026-01-01T10:00:00Z") == "-"
    assert f("bad", "worse") == "-"


def test_filters_are_registered_with_jinja(appmod):
    for name in ("format_time", "format_datetime", "truncate", "time_diff"):
        assert name in appmod.app.jinja_env.filters


def test_inject_config_keeps_original_keys_and_adds_spa_data(appmod):
    with appmod.app.test_request_context("/"):
        ctx = appmod.inject_config()
    assert {"config", "current_year", "current_time", "config_path"} <= set(ctx)
    assert ctx["config_path"] == appmod.config_path
    assert ctx["config"]["webepg"]["url"] == "http://epg.internal:8080"
    # the browser only ever gets the whitelist
    assert "secret_section" not in ctx["spa_config"]
    assert set(ctx["asset_v"]) == {"js", "css"}
