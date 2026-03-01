"""Storage Sorter integration for Home Assistant."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CoreState, EVENT_HOMEASSISTANT_STARTED, HomeAssistant

from .const import DOMAIN
from .frontend import JSModuleRegistration
from .store import StorageSorterStore

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Storage Sorter component (registers frontend + WS API)."""
    hass.data.setdefault(DOMAIN, {})

    # Register all websocket commands
    websocket_api.async_register_command(hass, ws_spaces_list)
    websocket_api.async_register_command(hass, ws_spaces_add)
    websocket_api.async_register_command(hass, ws_spaces_update)
    websocket_api.async_register_command(hass, ws_spaces_remove)
    websocket_api.async_register_command(hass, ws_items_list)
    websocket_api.async_register_command(hass, ws_items_add)
    websocket_api.async_register_command(hass, ws_items_update)
    websocket_api.async_register_command(hass, ws_items_remove)
    websocket_api.async_register_command(hass, ws_items_search)

    async def _register_frontend(_event: Any = None) -> None:
        module_reg = JSModuleRegistration(hass)
        await module_reg.async_register()

    if hass.state == CoreState.running:
        await _register_frontend()
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _register_frontend)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Storage Sorter from a config entry."""
    store = StorageSorterStore(hass)
    await store.async_load()
    hass.data[DOMAIN]["store"] = store
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    hass.data[DOMAIN].pop("store", None)
    return True


def _get_store(hass: HomeAssistant) -> StorageSorterStore:
    store = hass.data.get(DOMAIN, {}).get("store")
    if store is None:
        raise ValueError("Storage Sorter is not set up yet")
    return store


# ── Spaces ──────────────────────────────────────────────────────


@websocket_api.websocket_command({vol.Required("type"): "storage_sorter/spaces/list"})
@websocket_api.async_response
async def ws_spaces_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    try:
        store = _get_store(hass)
        connection.send_result(msg["id"], {"spaces": store.list_spaces()})
    except Exception as exc:
        connection.send_error(msg["id"], "error", str(exc))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "storage_sorter/spaces/add",
        vol.Required("space_id"): str,
        vol.Required("name"): str,
        vol.Optional("description", default=""): str,
    }
)
@websocket_api.async_response
async def ws_spaces_add(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    try:
        store = _get_store(hass)
        space = await store.async_add_space(msg["space_id"], msg["name"], msg["description"])
        connection.send_result(msg["id"], {"space": space})
    except Exception as exc:
        connection.send_error(msg["id"], "error", str(exc))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "storage_sorter/spaces/update",
        vol.Required("space_id"): str,
        vol.Optional("name"): str,
        vol.Optional("description"): str,
    }
)
@websocket_api.async_response
async def ws_spaces_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    try:
        store = _get_store(hass)
        space = await store.async_update_space(
            msg["space_id"],
            name=msg.get("name"),
            description=msg.get("description"),
        )
        connection.send_result(msg["id"], {"space": space})
    except Exception as exc:
        connection.send_error(msg["id"], "error", str(exc))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "storage_sorter/spaces/remove",
        vol.Required("space_id"): str,
    }
)
@websocket_api.async_response
async def ws_spaces_remove(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    try:
        store = _get_store(hass)
        await store.async_remove_space(msg["space_id"])
        connection.send_result(msg["id"], {"success": True})
    except Exception as exc:
        connection.send_error(msg["id"], "error", str(exc))


# ── Items ───────────────────────────────────────────────────────


@websocket_api.websocket_command(
    {
        vol.Required("type"): "storage_sorter/items/list",
        vol.Optional("space_id"): str,
    }
)
@websocket_api.async_response
async def ws_items_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    try:
        store = _get_store(hass)
        items = store.list_items(space_id=msg.get("space_id"))
        connection.send_result(msg["id"], {"items": items})
    except Exception as exc:
        connection.send_error(msg["id"], "error", str(exc))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "storage_sorter/items/add",
        vol.Required("name"): str,
        vol.Required("space_id"): str,
        vol.Optional("image"): str,
    }
)
@websocket_api.async_response
async def ws_items_add(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    try:
        store = _get_store(hass)
        item = await store.async_add_item(
            name=msg["name"],
            space_id=msg["space_id"],
            image_b64=msg.get("image"),
        )
        connection.send_result(msg["id"], {"item": item})
    except Exception as exc:
        connection.send_error(msg["id"], "error", str(exc))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "storage_sorter/items/update",
        vol.Required("item_id"): str,
        vol.Optional("name"): str,
        vol.Optional("space_id"): str,
        vol.Optional("image"): str,
    }
)
@websocket_api.async_response
async def ws_items_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    try:
        store = _get_store(hass)
        item = await store.async_update_item(
            item_id=msg["item_id"],
            name=msg.get("name"),
            space_id=msg.get("space_id"),
            image_b64=msg.get("image"),
        )
        connection.send_result(msg["id"], {"item": item})
    except Exception as exc:
        connection.send_error(msg["id"], "error", str(exc))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "storage_sorter/items/remove",
        vol.Required("item_id"): str,
    }
)
@websocket_api.async_response
async def ws_items_remove(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    try:
        store = _get_store(hass)
        await store.async_remove_item(msg["item_id"])
        connection.send_result(msg["id"], {"success": True})
    except Exception as exc:
        connection.send_error(msg["id"], "error", str(exc))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "storage_sorter/items/search",
        vol.Required("query"): str,
    }
)
@websocket_api.async_response
async def ws_items_search(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    try:
        store = _get_store(hass)
        items = store.search_items(msg["query"])
        connection.send_result(msg["id"], {"items": items})
    except Exception as exc:
        connection.send_error(msg["id"], "error", str(exc))
