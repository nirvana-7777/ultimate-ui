"""
ultimate-ui package initialization.
"""

from .api_client import UltimateBackendClient, UpstreamError, WebEPGClient
from .config import Config, ConfigError

__version__ = "2.2.0"

__all__ = [
    "Config",
    "ConfigError",
    "WebEPGClient",
    "UltimateBackendClient",
    "UpstreamError",
]
