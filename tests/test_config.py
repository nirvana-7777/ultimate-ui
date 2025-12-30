import pytest
import os
import tempfile
import yaml
from unittest.mock import patch
from config import Config


class TestConfig:
    """Test Config class."""

    def test_default_config(self):
        """Test default configuration."""
        config = Config()

        assert config.get("webepg.url") == "http://localhost:8080"
        assert config.get("webepg.timeout") == 10
        assert config.get("ultimate_backend.url") == "http://localhost:3000"
        assert config.get("ui.theme") == "dark"
        assert config.get("player.default_size") == "medium"

    def test_load_yaml(self):
        """Test loading configuration from YAML file."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            yaml_data = {
                "webepg": {"url": "http://custom-webepg:9090", "timeout": 30},
                "ui": {"theme": "light", "refresh_interval": 600},
            }
            yaml.dump(yaml_data, f)
            config_path = f.name

        try:
            config = Config(config_path)

            assert config.get("webepg.url") == "http://custom-webepg:9090"
            assert config.get("webepg.timeout") == 30
            assert config.get("ui.theme") == "light"
            assert config.get("ui.refresh_interval") == 600

            # Should keep defaults for other values
            assert config.get("ultimate_backend.url") == "http://localhost:3000"
            assert config.get("player.default_size") == "medium"
        finally:
            os.unlink(config_path)

    def test_load_env_vars(self):
        """Test loading configuration from environment variables."""
        env_vars = {
            "WEBEPG_URL": "http://env-webepg:8080",
            "WEBEPG_TIMEOUT": "25",
            "ULTIMATE_BACKEND_URL": "http://env-ultimate:3030",
            "UI_THEME": "light",
            "UI_REFRESH_INTERVAL": "900",
        }

        with patch.dict(os.environ, env_vars):
            config = Config()

            assert config.get("webepg.url") == "http://env-webepg:8080"
            assert config.get("webepg.timeout") == 25
            assert config.get("ultimate_backend.url") == "http://env-ultimate:3030"
            assert config.get("ui.theme") == "light"
            assert config.get("ui.refresh_interval") == 900

    def test_get_value(self):
        """Test getting configuration values."""
        config = Config()

        # Test existing values
        assert config.get("webepg.url") == "http://localhost:8080"
        assert config.get("webepg.timeout") == 10

        # Test non-existent value with default
        assert config.get("nonexistent.key") is None
        assert config.get("nonexistent.key", "default") == "default"

        # Test partial path
        assert isinstance(config.get("webepg"), dict)

    def test_get_section(self):
        """Test getting configuration section."""
        config = Config()

        webepg_section = config.get_section("webepg")
        assert isinstance(webepg_section, dict)
        assert "url" in webepg_section
        assert "timeout" in webepg_section

        # Test non-existent section
        nonexistent_section = config.get_section("nonexistent")
        assert nonexistent_section == {}

    def test_save_config(self):
        """Test saving configuration to file."""
        config = Config()

        # Create a temporary directory for config
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = os.path.join(tmpdir, "config.yaml")

            # Save new configuration
            new_config = {
                "webepg": {"url": "http://saved-webepg:8080", "timeout": 20},
                "ui": {"theme": "light", "refresh_interval": 500},
            }

            config.save(new_config)

            # Check that file was created
            assert os.path.exists(config_path)

            # Load and verify
            with open(config_path, "r") as f:
                saved_config = yaml.safe_load(f)

            assert saved_config["webepg"]["url"] == "http://saved-webepg:8080"
            assert saved_config["ui"]["theme"] == "light"

    def test_to_dict(self):
        """Test converting configuration to dictionary."""
        config = Config()
        config_dict = config.to_dict()

        assert isinstance(config_dict, dict)
        assert "webepg" in config_dict
        assert "ultimate_backend" in config_dict
        assert "ui" in config_dict
        assert "player" in config_dict

        # Verify it's a copy
        config_dict["webepg"]["url"] = "modified"
        assert config.get("webepg.url") == "http://localhost:8080"  # Original unchanged

    def test_merge_config_deep(self):
        """Test deep merging of configuration."""
        config = Config()

        # Test deep merge
        base = {
            "webepg": {
                "url": "http://default:8080",
                "timeout": 10,
                "advanced": {"retry": 3, "delay": 5},
            }
        }

        override = {
            "webepg": {"url": "http://override:9090", "advanced": {"retry": 5}},
            "new_section": {"key": "value"},
        }

        config._merge_config(base, override)

        assert base["webepg"]["url"] == "http://override:9090"
        assert base["webepg"]["timeout"] == 10  # Should be preserved
        assert base["webepg"]["advanced"]["retry"] == 5
        assert base["webepg"]["advanced"]["delay"] == 5  # Should be preserved
        assert base["new_section"]["key"] == "value"
