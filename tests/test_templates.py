"""Tests for the HTML shell that Flask serves for the React SPA (templates/spa.html).

Replaces the tests of the old Jinja pages (base.html, epg_display.html, config.html ...),
which no longer exist. The pages themselves are rendered in the browser by React, so the
server-side contract is: a valid shell, the right assets, and a whitelisted bootstrap config.
Only needs the `client` fixture.
"""

import json
import re

import pytest
from bs4 import BeautifulSoup

SPA_ROUTES = ["/", "/config", "/providers", "/monitoring", "/mapping"]
ALLOWED_CONFIG_SECTIONS = {
    "webepg",
    "ultimate_backend",
    "ui",
    "player",
    "database",
    "catchup",
}


def soup_for(client, path):
    response = client.get(path)
    assert response.status_code == 200
    return response, BeautifulSoup(response.data, "html.parser")


@pytest.mark.parametrize("path", SPA_ROUTES)
class TestSpaShell:
    def test_content_type_and_encoding(self, client, path):
        response, soup = soup_for(client, path)
        assert response.content_type.startswith("text/html")
        assert "utf-8" in response.content_type.lower()
        assert soup.find("meta", charset=True)["charset"].lower() == "utf-8"

    def test_document_structure(self, client, path):
        _, soup = soup_for(client, path)
        assert soup.html["lang"] == "de"
        assert soup.html["data-theme"] in ("light", "dark")
        assert soup.find("meta", attrs={"name": "viewport"}) is not None
        assert soup.title is not None and soup.title.string.strip()
        assert soup.find("div", id="root") is not None  # React mounts here

    def test_stylesheet_is_the_built_bundle(self, client, path):
        _, soup = soup_for(client, path)
        hrefs = [link["href"] for link in soup.find_all("link", rel="stylesheet")]
        assert len(hrefs) == 1
        assert re.search(r"/static/dist/assets/index\.css\?v=\w+$", hrefs[0])

    def test_script_is_the_built_bundle(self, client, path):
        _, soup = soup_for(client, path)
        modules = soup.find_all("script", attrs={"type": "module"})
        assert len(modules) == 1
        assert re.search(r"/static/dist/assets/index\.js\?v=\w+$", modules[0]["src"])
        # the player is lazy-loaded by the bundle, never a CDN <script> in the shell
        assert not [
            s for s in soup.find_all("script", src=True) if s["src"].startswith("http")
        ]

    def test_bootstrap_config_is_a_whitelisted_json_object(self, client, path):
        _, soup = soup_for(client, path)
        inline = [s.string for s in soup.find_all("script") if s.string]
        assert len(inline) == 1
        match = re.search(
            r"window\.__ULTIMATE_CONFIG__\s*=\s*(\{.*\});", inline[0], re.S
        )
        assert match, "bootstrap config missing"
        config = json.loads(match.group(1))
        assert set(config) <= ALLOWED_CONFIG_SECTIONS
        assert {"webepg", "ultimate_backend", "ui"} <= set(config)


def test_legacy_epg_route_redirects_to_root(client):
    response = client.get("/epg")
    assert response.status_code == 301
    assert response.headers["Location"].endswith("/")


def test_unknown_browser_path_serves_shell_with_404(client):
    response = client.get("/definitely-not-a-page")
    assert response.status_code == 404
    assert b"__ULTIMATE_CONFIG__" in response.data  # the SPA router takes over


def test_unknown_api_path_is_json_404(client):
    response = client.get("/api/definitely-not-an-endpoint")
    assert response.status_code == 404
    assert response.is_json