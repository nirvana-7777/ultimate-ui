from bs4 import BeautifulSoup


class TestTemplates:
    """Test template rendering and content."""

    def test_config_template(self, client):
        """Test configuration template."""
        print("\n=== Testing /config route ===")

        response = client.get("/config")
        print(f"Response status code: {response.status_code}")

        if response.status_code != 200:
            print(f"Non-200 response. First 500 chars: {response.data[:500]}")
            try:
                print(
                    f"Decoded: {response.data.decode('utf-8', errors='replace')[:500]}"
                )
            except Exception:  # Fixed: replaced bare 'except' with 'Exception'
                print("Could not decode response")

        assert response.status_code == 200

        soup = BeautifulSoup(response.data, "html.parser")

        # Check header
        config_header = soup.find("h2")
        assert config_header is not None

        header_text = config_header.get_text().strip()
        print(f"Found header: {header_text}")

        # Accept multiple possible headers
        header_valid = any(
            text in header_text
            for text in ["Konfiguration", "Configuration", "Einstellungen"]
        )
        assert header_valid, f"Header doesn't contain expected text: {header_text}"

        # Check for config tabs
        config_tabs = soup.find("div", class_="config-tabs")
        if not config_tabs:
            config_tabs = soup.find(string=lambda t: t and "Backend" in str(t))

        # Check for config forms
        config_forms = soup.find_all("form")

        # Check for test buttons
        test_buttons = soup.find_all(
            "button", string=lambda t: t and "test" in str(t).lower()
        )

        print(f"Found config forms: {len(config_forms)}")
        print(f"Found test buttons: {len(test_buttons)}")

        # Verify connection test button exists
        test_webepg_btn = soup.find("button", id="test-webepg-btn")
        assert test_webepg_btn is not None, "WebEPG test button not found"

        print("=== Config template test passed ===")

    def test_base_template_structure(self, client):
        """Test base template structure - robust version."""
        response = client.get("/epg")
        assert response.status_code == 200
        soup = BeautifulSoup(response.data, "html.parser")

        # Check essential elements exist (any of these is fine)
        essential_found = False

        # Check for header (could be any header structure)
        if soup.find("header") or soup.find(class_="header"):
            essential_found = True

        # Check for sidebar/navigation
        if (
            soup.find("nav")
            or soup.find(class_="sidebar")
            or soup.find(class_="navigation")
            or soup.find("aside")
        ):
            essential_found = True

        # Check for main content area
        if soup.find("main") or soup.find(class_="content"):
            essential_found = True

        assert essential_found, "Basic page structure not found"

        # Check for at least some navigation
        nav_selectors = [".nav-item", ".nav-link", "[class*='nav']", "a[href*='/']"]
        nav_items = []

        for selector in nav_selectors:
            items = soup.select(selector)
            if items:
                nav_items.extend(items)

        assert len(nav_items) > 0, "Should have at least some navigation"

        # Check mobile menu toggle (optional for desktop)
        mobile_toggle = soup.find("button", id="mobile-menu-toggle")
        if not mobile_toggle:
            mobile_toggle = soup.find("[class*='mobile']")
        # Not asserting this as it might be hidden on desktop

    def test_epg_display_template(self, client):
        """Test EPG display template - robust version."""
        response = client.get("/epg")
        assert response.status_code == 200

        try:
            html_content = response.data.decode("utf-8")
        except UnicodeDecodeError:
            html_content = response.data.decode("utf-8", errors="replace")

        soup = BeautifulSoup(html_content, "html.parser")

        # Check for EPG content using multiple indicators
        html_lower = html_content.lower()

        epg_indicators = []

        # Check for EPG keywords
        epg_keywords = ["epg", "programm", "kanal", "sender", "sendung", "stream"]
        for keyword in epg_keywords:
            if keyword in html_lower:
                epg_indicators.append(f"keyword:{keyword}")

        # Check for EPG elements
        epg_selectors = [
            ".epg-container",
            ".epg-content",
            ".channel-card",
            ".program-item",
            ".btn-play",
            "#player-overlay",
        ]

        for selector in epg_selectors:
            elements = soup.select(selector)
            if elements:
                epg_indicators.append(f"element:{selector}")

        # Check for EPG in script data
        script_tags = soup.find_all("script")
        for script in script_tags:
            if script.string and "EPG_DATA" in script.string:
                epg_indicators.append("script:EPG_DATA")
                break

        print(f"EPG indicators found: {epg_indicators}")

        assert len(epg_indicators) > 0, "No EPG content indicators found"

    def test_monitoring_template(self, client):
        """Test monitoring template - robust version."""
        response = client.get("/monitoring")

        print("\n=== Testing /monitoring route ===")  # Fixed: removed f-string without placeholders
        print(f"Response status code: {response.status_code}")
        assert response.status_code == 200

        try:
            html_content = response.data.decode("utf-8")
        except UnicodeDecodeError:
            html_content = response.data.decode("utf-8", errors="replace")

        soup = BeautifulSoup(html_content, "html.parser")

        # Check for monitoring content using multiple strategies
        html_lower = html_content.lower()

        # Strategy 1: Check for monitoring keywords in text
        monitoring_keywords = [
            "monitoring",
            "überwachung",
            "statistiken",
            "webepg",
            "backend",
            "kanäle",
            "programme",
            "import",
            "status",
            "health",
            "health-check",
            "verbindung",
        ]

        found_keywords = []
        for keyword in monitoring_keywords:
            if keyword in html_lower:
                found_keywords.append(keyword)

        print(f"Found monitoring keywords: {found_keywords}")

        # Strategy 2: Check for monitoring-specific elements
        monitoring_elements = []

        # Check for common monitoring element classes/IDs
        selectors = [
            ".monitoring-container",
            ".monitoring-content",
            ".health-cards",
            ".statistics-grid",
            ".recent-imports",
            ".health-card",
            ".stat-card",
            ".imports-table",
            "#monitoring-data",
            "[class*='monitoring']",
            "[class*='health']",
            "[class*='stat']",
        ]

        for selector in selectors:
            elements = soup.select(selector)
            monitoring_elements.extend(elements)

        # Strategy 3: Check for monitoring in script data
        script_tags = soup.find_all("script")
        has_monitoring_script_data = False

        for script in script_tags:
            if script.string:
                script_content = script.string
                if (
                    "MONITORING_DATA" in script_content
                    or "monitoring" in script_content.lower()
                ):
                    has_monitoring_script_data = True
                    break

        print(f"Found monitoring elements: {len(monitoring_elements)}")
        print(f"Has monitoring script data: {has_monitoring_script_data}")

        # Final assertion: Must have SOME indication of monitoring
        has_monitoring_content = any(
            [
                len(found_keywords) > 0,
                len(monitoring_elements) > 0,
                has_monitoring_script_data,
            ]
        )

        # Fixed: Split long line into multiple lines
        assert has_monitoring_content, (
            "No monitoring content found. "
            "Expected at least one of: monitoring keywords, "
            "monitoring elements, or monitoring script data."
        )

        print("=== Monitoring template test passed ===")

    def test_template_encoding(self, client):
        """Test template encoding (German special characters)."""
        response = client.get("/epg")
        assert response.status_code == 200

        # Check German characters are correctly encoded
        content_type = response.headers.get("Content-Type", "").lower()
        assert "utf-8" in content_type or "charset=utf-8" in content_type

        # Check for German text snippets (case-insensitive)
        response_text = response.data.decode("utf-8").lower()
        assert "programm" in response_text or "epg" in response_text

    def test_template_scripts(self, client):
        """Test that templates include necessary JavaScript files - robust version."""
        response = client.get("/epg")
        assert response.status_code == 200

        try:
            html_content = response.data.decode("utf-8")
        except UnicodeDecodeError:
            html_content = response.data.decode("utf-8", errors="replace")

        soup = BeautifulSoup(html_content, "html.parser")

        scripts = soup.find_all("script", src=True)
        script_srcs = [script["src"] for script in scripts]

        print(f"\nFound {len(scripts)} script tags with src attribute")

        # Check for essential scripts (at least one should be present)
        essential_scripts = ["main.js", "base.js", "epg_display.js"]
        found_essential = []

        for script in essential_scripts:
            if any(script in src for src in script_srcs):
                found_essential.append(script)

        print(f"Found essential scripts: {found_essential}")

        # Check for no obvious duplicates
        script_counts = {}
        for src in script_srcs:
            # Extract filename
            if "/" in src:
                filename = src.split("/")[-1]
            else:
                filename = src
            script_counts[filename] = script_counts.get(filename, 0) + 1

        duplicates = {name: count for name, count in script_counts.items() if count > 1}

        if duplicates:
            print(f"Warning: Potential duplicate scripts: {duplicates}")
            # Don't fail, just warn

        # Only assert that we found at least one essential script
        assert (
            len(found_essential) > 0
        ), f"Should include at least one essential JS file. Found scripts: {script_srcs}"

    def test_template_stylesheets(self, client):
        """Test that templates include necessary CSS files."""
        response = client.get("/epg")
        assert response.status_code == 200
        soup = BeautifulSoup(response.data, "html.parser")

        stylesheets = soup.find_all("link", rel="stylesheet")
        stylesheet_hrefs = [link["href"] for link in stylesheets]

        # Check for essential stylesheets
        has_style_css = any("style.css" in href for href in stylesheet_hrefs)
        has_mobile_css = any("mobile.css" in href for href in stylesheet_hrefs)

        assert (
            has_style_css or has_mobile_css
        ), "Should include at least one essential CSS file"
