"""Constants for the Storage Sorter integration."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Final

MANIFEST_PATH = Path(__file__).parent / "manifest.json"
with open(MANIFEST_PATH, encoding="utf-8") as _f:
    INTEGRATION_VERSION: Final[str] = json.load(_f).get("version", "0.0.0")

DOMAIN: Final[str] = "storage_sorter"
STORAGE_KEY: Final[str] = "storage_sorter_data"
STORAGE_VERSION: Final[int] = 1

URL_BASE: Final[str] = "/storage-sorter"

JSMODULES: Final[list[dict[str, str]]] = [
    {
        "name": "Storage Sorter Card",
        "filename": "storage-sorter-card.js",
        "version": INTEGRATION_VERSION,
    },
]

IMAGE_DIR_NAME: Final[str] = "storage_sorter"
