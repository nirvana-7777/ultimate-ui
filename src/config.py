"""
Configuration management for ultimate-ui.

Precedence (lowest to highest): built-in defaults < YAML file < environment
variables. Environment variables therefore win over values saved from the UI;
:meth:`Config.overridden_by_env` lets the caller tell the user when that
happens instead of silently ignoring their input.
"""

import copy
import logging
import os
import tempfile
import threading
from typing import Any, Callable, Dict, List, Optional, Tuple

import yaml

logger = logging.getLogger(__name__)


class ConfigError(Exception):
    """The configuration file or an environment variable is unusable."""


def _int_env(name: str, value: str) -> int:
    try:
        return int(value)
    except ValueError as e:
        raise ConfigError(f"Environment variable {name} must be an integer") from e


# env var -> (dotted config path, caster). Empty values are ignored so that
# `FOO=${FOO:-}` style compose files do not blank out the YAML setting.
ENV_VARS: List[Tuple[str, str, Callable[[str, str], Any]]] = [
    ("WEBEPG_URL", "webepg.url", lambda n, v: v),
    ("WEBEPG_TIMEOUT", "webepg.timeout", _int_env),
    ("ULTIMATE_BACKEND_URL", "ultimate_backend.url", lambda n, v: v),
    ("ULTIMATE_BACKEND_PUBLIC_URL", "ultimate_backend.public_url", lambda n, v: v),
    ("ULTIMATE_BACKEND_TIMEOUT", "ultimate_backend.timeout", _int_env),
    ("CATCHUP_MAX_HOURS", "catchup.max_hours", _int_env),
    ("UI_THEME", "ui.theme", lambda n, v: v),
    ("UI_REFRESH_INTERVAL", "ui.refresh_interval", _int_env),
    ("UI_TIMEZONE", "ui.timezone", lambda n, v: v),
]


class Config:
    """Configuration manager with YAML and environment variable support."""

    DEFAULT_CONFIG: Dict[str, Any] = {
        "webepg": {"url": "http://localhost:8080", "timeout": 10},
        "ultimate_backend": {
            "url": "http://localhost:3000",  # internal - used by Flask (download route)
            # OPTIONAL browser-reachable origin for in-browser catchup Replay (needs CORS).
            # Empty = Replay button hidden; catchup download is unaffected.
            "public_url": "",
            "timeout": 10,
        },
        "ui": {"theme": "dark", "refresh_interval": 300, "timezone": "Europe/Berlin"},
        "player": {
            "default_size": "medium",
            "default_bitrate": "auto",
            "autoplay": True,
            "muted": False,
            "default_volume": 50,
        },
        "database": {"retention_days": 7},
        "catchup": {"max_hours": 168},  # upper cap for per-channel catchup windows
    }

    def __init__(self, config_path: Optional[str] = None):
        """Initialize configuration."""
        self._lock = threading.RLock()
        self._config_path = config_path
        self._mtime: Optional[int] = None
        self.config: Dict[str, Any] = {}
        self.reload()

    # ------------------------------------------------------------------
    # Paths / loading
    # ------------------------------------------------------------------
    @property
    def path(self) -> str:
        """File that is loaded and saved."""
        return (
            self._config_path or os.getenv("ULTIMATE_UI_CONFIG") or "config/config.yaml"
        )

    def _read_yaml(self, path: str) -> Dict[str, Any]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise ConfigError(f"{path} is not valid YAML: {e}") from e
        if data is None:
            return {}
        if not isinstance(data, dict):
            raise ConfigError(f"{path} must contain a YAML mapping at the top level")
        return data

    def _merge_config(self, base: Dict, override: Dict):
        """Recursively merge override config into base config."""
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._merge_config(base[key], value)
            else:
                base[key] = value

    def reload(self):
        """Rebuild the effective config: defaults < YAML < environment."""
        with self._lock:
            cfg = copy.deepcopy(self.DEFAULT_CONFIG)
            path = self.path
            mtime: Optional[int] = None
            if os.path.exists(path):
                self._merge_config(cfg, self._read_yaml(path))
                mtime = os.stat(path).st_mtime_ns
            self._apply_env_vars(cfg)
            self.config = cfg  # atomic swap: readers never see a half-built dict
            self._mtime = mtime

    def reload_if_changed(self) -> bool:
        """Reload when the file changed on disk (e.g. saved by another worker).

        Gunicorn runs several workers, each with its own Config instance; a UI
        save only touches one of them, so every worker checks the file's
        mtime (one cheap stat) before handling a request.
        """
        try:
            mtime: Optional[int] = os.stat(self.path).st_mtime_ns
        except FileNotFoundError:
            mtime = None
        if mtime == self._mtime:
            return False
        try:
            self.reload()
        except ConfigError as e:
            # Keep serving the last good config; do not retry until it changes again.
            logger.error(f"Config reload failed, keeping previous values: {e}")
            self._mtime = mtime
            return False
        return True

    # ------------------------------------------------------------------
    # Environment
    # ------------------------------------------------------------------
    def _apply_env_vars(self, cfg: Dict[str, Any]):
        for env_name, dotted, cast in ENV_VARS:
            raw = os.environ.get(env_name, "")
            if raw.strip() == "":
                continue
            section, key = dotted.split(".")
            cfg[section][key] = cast(env_name, raw.strip())

    def overridden_by_env(self) -> Dict[str, str]:
        """Dotted config keys currently forced by an environment variable."""
        return {
            dotted: env_name
            for env_name, dotted, _ in ENV_VARS
            if os.environ.get(env_name, "").strip() != ""
        }

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def save(self, config_data: Dict, merge: bool = True):
        """Persist configuration to the YAML file, then reload.

        With ``merge=True`` (default) ``config_data`` is merged into what is
        already in the file, so keys the UI does not know about survive a UI
        save. The write is atomic (temp file + rename) so a crash or a
        concurrent reader never sees a half-written file.

        Raises OSError if the target is not writable.
        """
        with self._lock:
            path = self.path
            directory = os.path.dirname(os.path.abspath(path))
            os.makedirs(directory, exist_ok=True)

            if merge and os.path.exists(path):
                data = self._read_yaml(path)
                self._merge_config(data, copy.deepcopy(config_data))
            else:
                data = copy.deepcopy(config_data)

            text = yaml.safe_dump(data, default_flow_style=False, allow_unicode=True)

            try:
                mode = os.stat(path).st_mode & 0o777
            except FileNotFoundError:
                mode = 0o644

            fd, tmp_path = tempfile.mkstemp(
                dir=directory, prefix=".config-", suffix=".tmp"
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(text)
                os.chmod(tmp_path, mode)
                os.replace(tmp_path, path)
            except OSError:
                # e.g. the file itself is a single-file bind mount (rename -> EBUSY)
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                with open(path, "w", encoding="utf-8") as f:
                    f.write(text)

            self.reload()

    def reset(self):
        """Overwrite the YAML file with the built-in defaults."""
        self.save(copy.deepcopy(self.DEFAULT_CONFIG), merge=False)
