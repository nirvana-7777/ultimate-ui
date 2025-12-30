"""
ultimate-ui package initialization.
"""

from .config import Config
from .api_client import WebEPGClient, UltimateBackendClient

__version__ = "0.1.0"

__all__ = [
    "Config",
    "WebEPGClient",
    "UltimateBackendClient",
]