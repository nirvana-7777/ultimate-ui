import pytest
from bs4 import BeautifulSoup


class TestTemplates:
    """Test template rendering and content."""

    def test_base_template_structure(self, client):
        """Test base template structure."""
        response = client.get("/epg")
        soup = BeautifulSoup(response.data, "html.parser")

        # Check essential elements
        assert soup.find("header") is not None
        assert soup.find("nav", class_="sidebar") is not None
        assert soup.find("main", class_="content") is not None

        # Check navigation items
        nav_items = soup.select(".nav-item")
        assert len(nav_items) >= 4  # Should have at least 4 navigation items

        # Check mobile menu toggle
        assert soup.find("button", id="mobile-menu-toggle") is not None

    def test_epg_display_template(
        self, client, mock_webepg_client, sample_channels, sample_programs
    ):
        """Test EPG display template."""
        mock_webepg_client.get_channels.return_value = sample_channels
        mock_webepg_client.get_channel_programs.return_value = sample_programs

        response = client.get("/epg")
        soup = BeautifulSoup(response.data, "html.parser")

        # Check EPG header
        assert soup.find("h2", string="EPG Programmübersicht") is not None

        # Check controls
        assert soup.find("div", class_="epg-controls") is not None
        assert soup.find("button", id="filter-btn") is not None

        # Check channel cards
        channel_cards = soup.select(".channel-card")
        assert len(channel_cards) == 2

        # Check program items
        program_items = soup.select(".program-item")
        assert len(program_items) == 4  # 2 channels × 2 programs

        # Check player overlay
        assert soup.find("div", id="player-overlay") is not None

    def test_config_template(self, client):
        """Test configuration template."""
        response = client.get("/config")
        soup = BeautifulSoup(response.data, "html.parser")

        # Check header
        assert soup.find("h2", string="Konfiguration") is not None

        # Check tabs
        tabs = soup.select(".config-tab")
        assert len(tabs) >= 4  # Should have backend, ui, player, advanced tabs

        # Check forms
        assert soup.find("form", id="backend-form") is not None
        assert soup.find("form", id="ui-form") is not None

        # Check action buttons
        assert soup.find("button", id="save-all-config-btn") is not None
        assert soup.find("button", id="reset-config-btn") is not None

    def test_monitoring_template(self, client, mock_webepg_client):
        """Test monitoring template."""
        mock_webepg_client.get_import_status.return_value = {
            "recent_imports": [],
            "next_scheduled_import": "2024-01-01T12:00:00Z",
        }
        mock_webepg_client.get_statistics.return_value = {
            "total_channels": 10,
            "total_programs": 1000,
        }
        mock_webepg_client.get_health.return_value = True

        response = client.get("/monitoring")
        soup = BeautifulSoup(response.data, "html.parser")

        # Check header
        assert soup.find("h2", string="Monitoring & Statistiken") is not None

        # Check health cards
        health_cards = soup.select(".health-card")
        assert len(health_cards) == 3  # WebEPG, Ultimate Backend, Ultimate UI

        # Check statistics grid
        assert soup.find("div", class_="statistics-grid") is not None

        # Check imports table
        assert soup.find("table", class_="imports-table") is not None

        # Check charts section
        assert soup.find("div", class_="charts-section") is not None

    def test_template_encoding(self, client):
        """Test template encoding (German special characters)."""
        response = client.get("/epg")

        # Check German characters are correctly encoded
        assert "UTF-8" in response.headers.get("Content-Type", "")

        # Check for German text snippets
        assert b"Programm" in response.data
        assert b"Anzeige" in response.data
        assert b"Konfiguration" in response.data or b"Monitoring" in response.data

    def test_template_scripts(self, client):
        """Test that templates include necessary JavaScript files."""
        response = client.get("/epg")
        soup = BeautifulSoup(response.data, "html.parser")

        scripts = soup.find_all("script", src=True)
        script_srcs = [script["src"] for script in scripts]

        # Check for essential scripts
        assert any("main.js" in src for src in script_srcs)
        assert any("epg_display.js" in src for src in script_srcs)
        assert any("base.js" in src for src in script_srcs)

        # Check for Shaka Player
        assert any("shaka-player" in src for src in script_srcs)

    def test_template_stylesheets(self, client):
        """Test that templates include necessary CSS files."""
        response = client.get("/epg")
        soup = BeautifulSoup(response.data, "html.parser")

        stylesheets = soup.find_all("link", rel="stylesheet")
        stylesheet_hrefs = [link["href"] for link in stylesheets]

        # Check for essential stylesheets
        assert any("style.css" in href for href in stylesheet_hrefs)
        assert any("mobile.css" in href for href in stylesheet_hrefs)
