"""
Configuration management for ultimate-ui.
"""

import copy
import os
from typing import Any, Dict, Optional

import yaml


class Config:
    """Configuration manager with YAML and environment variable support."""

    DEFAULT_CONFIG = {
        "webepg": {"url": "http://localhost:8080", "timeout": 10},
        "ultimate_backend": {"url": "http://localhost:3000", "timeout": 10},
        "ui": {"theme": "dark", "refresh_interval": 300, "timezone": "Europe/Berlin"},
        "player": {"default_size": "medium", "default_bitrate": "auto"},
        "database": {"retention_days": 7},
    }

    def __init__(self, config_path: Optional[str] = None):
        """Initialize configuration."""
        self.config = copy.deepcopy(self.DEFAULT_CONFIG)

        # Store the config path for saving (use provided or default)
        self._config_path = config_path

        # Load from YAML if provided and file exists
        if config_path and os.path.exists(config_path):
            self._load_yaml(config_path)

        # Override with environment variables
        self._load_env_vars()

    def _load_yaml(self, path: str):
        """Load configuration from YAML file."""
        with open(path, "r") as f:
            yaml_config = yaml.safe_load(f)
            if yaml_config:
                self._merge_config(self.config, yaml_config)

    def _merge_config(self, base: Dict, override: Dict):
        """Recursively merge override config into base config."""
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._merge_config(base[key], value)
            else:
                base[key] = value

    def _load_env_vars(self):
        """Load configuration from environment variables."""
        # WebEPG
        if "WEBEPG_URL" in os.environ:
            self.config["webepg"]["url"] = os.environ["WEBEPG_URL"]

        if "WEBEPG_TIMEOUT" in os.environ:
            self.config["webepg"]["timeout"] = int(os.environ["WEBEPG_TIMEOUT"])

        # Ultimate Backend
        if "ULTIMATE_BACKEND_URL" in os.environ:
            self.config["ultimate_backend"]["url"] = os.environ["ULTIMATE_BACKEND_URL"]

        if "ULTIMATE_BACKEND_TIMEOUT" in os.environ:
            self.config["ultimate_backend"]["timeout"] = int(
                os.environ["ULTIMATE_BACKEND_TIMEOUT"]
            )

        # UI
        if "UI_THEME" in os.environ:
            self.config["ui"]["theme"] = os.environ["UI_THEME"]

        if "UI_REFRESH_INTERVAL" in os.environ:
            self.config["ui"]["refresh_interval"] = int(
                os.environ["UI_REFRESH_INTERVAL"]
            )

        if "UI_TIMEZONE" in os.environ:
            self.config["ui"]["timezone"] = os.environ["UI_TIMEZONE"]

    def get(self, key_path: str, default: Any = None) -> Any:
        """Get configuration value by dot-notation path."""
        keys = key_path.split(".")
        value: Any = self.config

        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default

        return value

    def get_section(self, section: str) -> Dict[str, Any]:
        """Get entire configuration section."""
        result = self.config.get(section, {})
        if isinstance(result, dict):
            return copy.deepcopy(result)
        return {}

    def to_dict(self) -> Dict[str, Any]:
        """Get complete configuration as dictionary."""
        return copy.deepcopy(self.config)

    def save(self, config_data: Dict):
        """Save configuration to file."""
        # Use the stored path, or default if none was stored
        save_path = self._config_path or os.getenv(
            "ULTIMATE_UI_CONFIG", "config/config.yaml"
        )

        # Ensure save_path is not None (should never happen with the default)
        if save_path is None:
            save_path = "config/config.yaml"

        os.makedirs(os.path.dirname(save_path), exist_ok=True)

        with open(save_path, "w") as f:
            yaml.dump(config_data, f, default_flow_style=False)

        # Reload configuration from the saved file
        self._load_yaml(save_path)
