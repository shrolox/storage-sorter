# Storage Sorter — Home Assistant Integration

Track items across numbered storage spaces in your basement (or anywhere else). Snap a photo, give it a name, assign it to a space, and find it later with a quick search.

## Installation

### Via HACS (recommended)

[HACS](https://hacs.xyz/) lets you install and update custom integrations directly from the Home Assistant UI.

1. Open Home Assistant and go to **HACS → Integrations**.
2. Click the **three-dot menu** (top right) → **Custom repositories**.
3. Paste the GitHub URL of this repository, select **Integration** as the category, and click **Add**.
4. The integration will appear in the HACS store — click **Download**.
5. Restart Home Assistant.
6. Go to **Settings → Devices & Services → Add Integration** and search for **Storage Sorter**.
7. Confirm the setup — no configuration is needed.

### Manual

1. Copy the `custom_components/storage_sorter` folder into your Home Assistant `config/custom_components/` directory.
2. Restart Home Assistant.
3. Go to **Settings → Devices & Services → Add Integration** and search for **Storage Sorter**.
4. Confirm the setup — no configuration is needed.

The Lovelace card is registered automatically. If you use Lovelace in YAML mode, add the resource manually:

```yaml
resources:
  - url: /storage-sorter/storage-sorter-card.js
    type: module
```

## Adding the card to a dashboard

In any Lovelace dashboard, add a **Manual card** and paste:

```yaml
type: custom:storage-sorter-card
```

## Usage

The card has three tabs:

| Tab | Description |
|-----|-------------|
| **Search** | Type an item name and press Search. Results show the item photo and which space it's in. |
| **Add Item** | Enter a name, pick a space from the dropdown, optionally snap a photo, and hit Add Item. |
| **Spaces** | Create and delete storage spaces (each with a unique ID number and a name). |

### Tips

- Space IDs can be any short identifier you like (e.g. `1`, `42`, `A3`). Label your physical boxes/shelves with the same IDs.
- On mobile, the photo picker opens the camera directly so you can snap a picture on the spot.
- Images are automatically resized to 800 px on the longest side before upload to save disk space.

## Data storage

- Item and space data are stored via Home Assistant's built-in `Store` helper at `.storage/storage_sorter_data`.
- Photos are saved to `config/www/storage_sorter/` and served at `/local/storage_sorter/<filename>`.

## Uninstalling

1. Remove the integration from **Settings → Devices & Services**.
2. Delete `custom_components/storage_sorter/`.
3. Optionally delete `config/www/storage_sorter/` (item photos) and `.storage/storage_sorter_data`.
4. Restart Home Assistant.
