"""Persistent data store for Storage Sorter."""

from __future__ import annotations

import base64
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, TypedDict

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN, IMAGE_DIR_NAME, STORAGE_KEY, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)


class SpaceDict(TypedDict):
    name: str
    description: str


class ItemDict(TypedDict):
    id: str
    name: str
    space_id: str
    image_filename: str | None
    added_at: str


class StoreData(TypedDict):
    spaces: dict[str, SpaceDict]
    items: list[ItemDict]


class StorageSorterStore:
    """Manages persistent storage for spaces and items."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[StoreData] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: StoreData = {"spaces": {}, "items": []}
        self._image_dir = hass.config.path("www", IMAGE_DIR_NAME)

    async def async_load(self) -> None:
        """Load data from disk."""
        stored = await self._store.async_load()
        if stored:
            self._data = stored
        os.makedirs(self._image_dir, exist_ok=True)

    async def _async_save(self) -> None:
        """Persist current data to disk."""
        await self._store.async_save(self._data)

    # ── Spaces ──────────────────────────────────────────────

    def list_spaces(self) -> dict[str, SpaceDict]:
        return self._data["spaces"]

    async def async_add_space(
        self, space_id: str, name: str, description: str = ""
    ) -> SpaceDict:
        if space_id in self._data["spaces"]:
            raise ValueError(f"Space '{space_id}' already exists")
        space: SpaceDict = {"name": name, "description": description}
        self._data["spaces"][space_id] = space
        await self._async_save()
        return space

    async def async_update_space(
        self, space_id: str, name: str | None = None, description: str | None = None
    ) -> SpaceDict:
        if space_id not in self._data["spaces"]:
            raise KeyError(f"Space '{space_id}' not found")
        space = self._data["spaces"][space_id]
        if name is not None:
            space["name"] = name
        if description is not None:
            space["description"] = description
        await self._async_save()
        return space

    async def async_remove_space(self, space_id: str) -> None:
        if space_id not in self._data["spaces"]:
            raise KeyError(f"Space '{space_id}' not found")
        items_in_space = [i for i in self._data["items"] if i["space_id"] == space_id]
        if items_in_space:
            raise ValueError(
                f"Cannot remove space '{space_id}': it still contains "
                f"{len(items_in_space)} item(s)"
            )
        del self._data["spaces"][space_id]
        await self._async_save()

    # ── Items ───────────────────────────────────────────────

    def list_items(self, space_id: str | None = None) -> list[ItemDict]:
        if space_id is not None:
            return [i for i in self._data["items"] if i["space_id"] == space_id]
        return list(self._data["items"])

    def search_items(self, query: str) -> list[ItemDict]:
        q = query.lower().strip()
        if not q:
            return list(self._data["items"])

        exact: list[ItemDict] = []
        starts: list[ItemDict] = []
        contains: list[ItemDict] = []

        for item in self._data["items"]:
            name_lower = item["name"].lower()
            if name_lower == q:
                exact.append(item)
            elif name_lower.startswith(q):
                starts.append(item)
            elif q in name_lower:
                contains.append(item)

        return exact + starts + contains

    async def async_add_item(
        self,
        name: str,
        space_id: str,
        image_b64: str | None = None,
    ) -> ItemDict:
        if space_id not in self._data["spaces"]:
            raise KeyError(f"Space '{space_id}' not found")

        image_filename: str | None = None
        if image_b64:
            image_filename = await self._async_save_image(image_b64)

        item: ItemDict = {
            "id": str(uuid.uuid4()),
            "name": name,
            "space_id": space_id,
            "image_filename": image_filename,
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
        self._data["items"].append(item)
        await self._async_save()
        return item

    async def async_update_item(
        self,
        item_id: str,
        name: str | None = None,
        space_id: str | None = None,
        image_b64: str | None = None,
    ) -> ItemDict:
        item = self._get_item(item_id)

        if space_id is not None and space_id not in self._data["spaces"]:
            raise KeyError(f"Space '{space_id}' not found")

        if name is not None:
            item["name"] = name
        if space_id is not None:
            item["space_id"] = space_id
        if image_b64 is not None:
            if item["image_filename"]:
                self._delete_image(item["image_filename"])
            item["image_filename"] = await self._async_save_image(image_b64)

        await self._async_save()
        return item

    async def async_remove_item(self, item_id: str) -> None:
        item = self._get_item(item_id)
        if item["image_filename"]:
            self._delete_image(item["image_filename"])
        self._data["items"] = [i for i in self._data["items"] if i["id"] != item_id]
        await self._async_save()

    # ── Helpers ─────────────────────────────────────────────

    def _get_item(self, item_id: str) -> ItemDict:
        for item in self._data["items"]:
            if item["id"] == item_id:
                return item
        raise KeyError(f"Item '{item_id}' not found")

    async def _async_save_image(self, b64_data: str) -> str:
        """Decode a base64 image and write it to the www directory."""
        filename = f"{uuid.uuid4().hex}.jpg"
        path = os.path.join(self._image_dir, filename)
        data = base64.b64decode(b64_data)
        await self.hass.async_add_executor_job(self._write_file, path, data)
        return filename

    @staticmethod
    def _write_file(path: str, data: bytes) -> None:
        with open(path, "wb") as fh:
            fh.write(data)

    def _delete_image(self, filename: str) -> None:
        path = os.path.join(self._image_dir, filename)
        try:
            os.remove(path)
        except FileNotFoundError:
            _LOGGER.warning("Image file not found for deletion: %s", path)
