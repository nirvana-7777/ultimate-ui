"""
Configuration management for ultimate-ui.
"""
import os
import yaml
from typing import Dict, Any


class Config:
    """Configuration manager with YAML and environment variable support."""

    DEFAULT_CONFIG = {
        'webepg': {
            'url': 'http://localhost:8080',
            'timeout': 10
        },
        'ultimate_backend': {
            'url': 'http://localhost:3000',
            'timeout': 10
        },
        'ui': {
            'theme': 'dark',
            'refresh_interval': 300,
            'timezone': 'Europe/Berlin'
        },
        'player': {
            'default_size': 'medium',
            'default_bitrate': 'auto'
        },
        'database': {
            'retention_days': 7
        }
    }

    def __init__(self, config_path: str = None):
        """Initialize configuration."""
        self.config = self.DEFAULT_CONFIG.copy()

        # Load from YAML if provided
        if config_path and os.path.exists(config_path):
            self._load_yaml(config_path)

        # Override with environment variables
        self._load_env_vars()

    def _load_yaml(self, path: str):
        """Load configuration from YAML file."""
        with open(path, 'r') as f:
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
        if 'WEBEPG_URL' in os.environ:
            self.config['webepg']['url'] = os.environ['WEBEPG_URL']

        if 'WEBEPG_TIMEOUT' in os.environ:
            self.config['webepg']['timeout'] = int(os.environ['WEBEPG_TIMEOUT'])

        # Ultimate Backend
        if 'ULTIMATE_BACKEND_URL' in os.environ:
            self.config['ultimate_backend']['url'] = os.environ['ULTIMATE_BACKEND_URL']

        if 'ULTIMATE_BACKEND_TIMEOUT' in os.environ:
            self.config['ultimate_backend']['timeout'] = int(os.environ['ULTIMATE_BACKEND_TIMEOUT'])

        # UI
        if 'UI_THEME' in os.environ:
            self.config['ui']['theme'] = os.environ['UI_THEME']

        if 'UI_REFRESH_INTERVAL' in os.environ:
            self.config['ui']['refresh_interval'] = int(os.environ['UI_REFRESH_INTERVAL'])

        if 'UI_TIMEZONE' in os.environ:
            self.config['ui']['timezone'] = os.environ['UI_TIMEZONE']

    def get(self, key_path: str, default: Any = None) -> Any:
        """Get configuration value by dot-notation path."""
        keys = key_path.split('.')
        value = self.config

        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default

        return value

    def get_section(self, section: str) -> Dict:
        """Get entire configuration section."""
        return self.config.get(section, {})

    def save(self, config_data: Dict):
        """Save configuration to file."""
        config_path = os.getenv('ULTIMATE_UI_CONFIG', 'config/config.yaml')
        os.makedirs(os.path.dirname(config_path), exist_ok=True)

        with open(config_path, 'w') as f:
            yaml.dump(config_data, f, default_flow_style=False)

        # Reload configuration
        self._load_yaml(config_path)

    def to_dict(self) -> Dict:
        """Get complete configuration as dictionary."""
        return self.config.copy()