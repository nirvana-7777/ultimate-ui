"""
ultimate-ui package initialization.
"""

from .api_client import UltimateBackendClient, WebEPGClient
from .config import Config

__version__ = "0.1.0"

__all__ = [
    "Config",
    "WebEPGClient",
    "UltimateBackendClient",
]
