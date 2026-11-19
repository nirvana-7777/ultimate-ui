"""
ultimate-ui package initialization.
"""

from .api_client import (
    UltimateBackendClient,
    UpstreamError,
    VodCrawlerClient,
    WebEPGClient,
)
from .config import Config, ConfigError

__version__ = "2.4.0"

__all__ = [
    "Config",
    "ConfigError",
    "WebEPGClient",
    "UltimateBackendClient",
    "VodCrawlerClient",
    "UpstreamError",
]
