const LitElement =
  Object.getPrototypeOf(customElements.get("ha-panel-lovelace")) ||
  Object.getPrototypeOf(customElements.get("hui-view"));

const { html, css } = LitElement.prototype;

/* ──────────────────────────────────────────────
   Helper: send a websocket command and return
   the result as a Promise.
   ────────────────────────────────────────────── */
function wsCmd(hass, type, payload = {}) {
  return hass.connection.sendMessagePromise({ type, ...payload });
}

/* ──────────────────────────────────────────────
   Helper: resize an image file to a max
   dimension, return a base64 JPEG string.
   ────────────────────────────────────────────── */
function resizeImage(file, maxDim = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ══════════════════════════════════════════════
   STORAGE SORTER CARD
   ══════════════════════════════════════════════ */
class StorageSorterCard extends LitElement {
  static get properties() {
    return {
      hass: { attribute: false },
      config: { attribute: false },
      _view: { state: true },
      _spaces: { state: true },
      _searchQuery: { state: true },
      _searchResults: { state: true },
      _imagePreview: { state: true },
      _imageB64: { state: true },
      _loading: { state: true },
      _toast: { state: true },
    };
  }

  constructor() {
    super();
    this._view = "search";
    this._spaces = {};
    this._searchQuery = "";
    this._searchResults = null;
    this._imagePreview = null;
    this._imageB64 = null;
    this._loading = false;
    this._toast = null;
    this._toastTimeout = null;
  }

  setConfig(config) {
    this.config = config;
  }

  getCardSize() {
    return 5;
  }

  static getStubConfig() {
    return {};
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadSpaces();
  }

  async _loadSpaces() {
    if (!this.hass) return;
    try {
      const res = await wsCmd(this.hass, "storage_sorter/spaces/list");
      this._spaces = res.spaces || {};
    } catch {
      /* ignore if integration not ready yet */
    }
  }

  _showToast(message, isError = false) {
    if (this._toastTimeout) clearTimeout(this._toastTimeout);
    this._toast = { message, isError };
    this._toastTimeout = setTimeout(() => {
      this._toast = null;
    }, 3000);
  }

  /* ── Rendering ─────────────────────────── */

  render() {
    return html`
      <ha-card>
        <div class="toolbar">
          <button
            class=${this._view === "search" ? "active" : ""}
            @click=${() => this._switchView("search")}
          >
            Search
          </button>
          <button
            class=${this._view === "add" ? "active" : ""}
            @click=${() => this._switchView("add")}
          >
            Add Item
          </button>
          <button
            class=${this._view === "spaces" ? "active" : ""}
            @click=${() => this._switchView("spaces")}
          >
            Spaces
          </button>
        </div>
        <div class="content">
          ${this._view === "search"
            ? this._renderSearch()
            : this._view === "add"
              ? this._renderAdd()
              : this._renderSpaces()}
        </div>
        ${this._toast
          ? html`<div class="toast ${this._toast.isError ? "error" : ""}">
              ${this._toast.message}
            </div>`
          : ""}
      </ha-card>
    `;
  }

  _switchView(view) {
    this._view = view;
    if (view === "spaces" || view === "add") this._loadSpaces();
  }

  /* ── SEARCH VIEW ───────────────────────── */

  _renderSearch() {
    const spaceKeys = Object.keys(this._spaces);
    return html`
      <div class="search-bar">
        <input
          type="text"
          placeholder="Search items…"
          .value=${this._searchQuery}
          @input=${(e) => (this._searchQuery = e.target.value)}
          @keyup=${(e) => e.key === "Enter" && this._doSearch()}
        />
        <button class="primary" @click=${this._doSearch}>Search</button>
      </div>
      ${this._searchResults !== null
        ? this._searchResults.length === 0
          ? html`<p class="empty">No items found.</p>`
          : html`
              <div class="results">
                ${this._searchResults.map(
                  (item) => html`
                    <div class="item-card">
                      ${item.image_filename
                        ? html`<img
                            src="/local/storage_sorter/${item.image_filename}"
                            alt=${item.name}
                          />`
                        : html`<div class="no-img">No image</div>`}
                      <div class="item-info">
                        <strong>${item.name}</strong>
                        <span class="space-badge">
                          #${item.space_id}
                          ${this._spaces[item.space_id]
                            ? `— ${this._spaces[item.space_id].name}`
                            : ""}
                        </span>
                      </div>
                      <button
                        class="icon-btn danger"
                        title="Delete item"
                        @click=${() => this._removeItem(item.id)}
                      >
                        ✕
                      </button>
                    </div>
                  `
                )}
              </div>
            `
        : html`<p class="hint">
            Enter a name and press Search to find items.
          </p>`}
    `;
  }

  async _doSearch() {
    if (!this._searchQuery.trim()) return;
    try {
      const res = await wsCmd(this.hass, "storage_sorter/items/search", {
        query: this._searchQuery.trim(),
      });
      this._searchResults = res.items;
      await this._loadSpaces();
    } catch (err) {
      this._showToast("Search failed", true);
    }
  }

  async _removeItem(itemId) {
    try {
      await wsCmd(this.hass, "storage_sorter/items/remove", { item_id: itemId });
      this._showToast("Item removed");
      if (this._searchQuery.trim()) this._doSearch();
    } catch (err) {
      this._showToast("Failed to remove item", true);
    }
  }

  /* ── ADD ITEM VIEW ─────────────────────── */

  _renderAdd() {
    const spaceKeys = Object.keys(this._spaces);
    return html`
      <form @submit=${this._handleAddItem} class="add-form">
        <label>
          Item name
          <input type="text" id="itemName" required placeholder="e.g. Christmas lights" />
        </label>
        <label>
          Space
          ${spaceKeys.length > 0
            ? html`<select id="spaceId" required>
                ${spaceKeys.map(
                  (id) =>
                    html`<option value=${id}>
                      #${id} — ${this._spaces[id].name}
                    </option>`
                )}
              </select>`
            : html`<p class="empty">
                No spaces yet.
                <a href="#" @click=${(e) => { e.preventDefault(); this._switchView("spaces"); }}>
                  Create one first.
                </a>
              </p>`}
        </label>
        <label>
          Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            @change=${this._handleImageSelect}
          />
        </label>
        ${this._imagePreview
          ? html`<img class="preview" src=${this._imagePreview} alt="preview" />`
          : ""}
        <button
          class="primary"
          type="submit"
          ?disabled=${this._loading || spaceKeys.length === 0}
        >
          ${this._loading ? "Saving…" : "Add Item"}
        </button>
      </form>
    `;
  }

  async _handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      this._imageB64 = await resizeImage(file);
      this._imagePreview = `data:image/jpeg;base64,${this._imageB64}`;
    } catch {
      this._showToast("Could not read image", true);
    }
  }

  async _handleAddItem(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.querySelector("#itemName").value.trim();
    const spaceId = form.querySelector("#spaceId")?.value;
    if (!name || !spaceId) return;

    this._loading = true;
    try {
      const payload = { name, space_id: spaceId };
      if (this._imageB64) payload.image = this._imageB64;
      await wsCmd(this.hass, "storage_sorter/items/add", payload);
      this._showToast("Item added!");
      form.reset();
      this._imagePreview = null;
      this._imageB64 = null;
    } catch (err) {
      this._showToast("Failed to add item", true);
    } finally {
      this._loading = false;
    }
  }

  /* ── SPACES VIEW ───────────────────────── */

  _renderSpaces() {
    const spaceKeys = Object.keys(this._spaces);
    return html`
      <div class="spaces-form">
        <div class="inline-form">
          <input type="text" id="newSpaceId" placeholder="ID (e.g. 1)" />
          <input type="text" id="newSpaceName" placeholder="Name (e.g. Box 1)" />
          <button class="primary" @click=${this._addSpace}>Add</button>
        </div>
      </div>
      ${spaceKeys.length === 0
        ? html`<p class="empty">No storage spaces yet. Add one above.</p>`
        : html`
            <div class="space-list">
              ${spaceKeys.map(
                (id) => html`
                  <div class="space-row">
                    <span class="space-id">#${id}</span>
                    <span class="space-name">${this._spaces[id].name}</span>
                    <span class="space-desc">${this._spaces[id].description}</span>
                    <button
                      class="icon-btn danger"
                      title="Remove space"
                      @click=${() => this._removeSpace(id)}
                    >
                      ✕
                    </button>
                  </div>
                `
              )}
            </div>
          `}
    `;
  }

  async _addSpace() {
    const idEl = this.shadowRoot.querySelector("#newSpaceId");
    const nameEl = this.shadowRoot.querySelector("#newSpaceName");
    const id = idEl.value.trim();
    const name = nameEl.value.trim();
    if (!id || !name) {
      this._showToast("ID and name are required", true);
      return;
    }
    try {
      await wsCmd(this.hass, "storage_sorter/spaces/add", {
        space_id: id,
        name,
      });
      idEl.value = "";
      nameEl.value = "";
      await this._loadSpaces();
      this._showToast("Space added!");
    } catch (err) {
      this._showToast(String(err.message || err), true);
    }
  }

  async _removeSpace(id) {
    try {
      await wsCmd(this.hass, "storage_sorter/spaces/remove", { space_id: id });
      await this._loadSpaces();
      this._showToast("Space removed");
    } catch (err) {
      this._showToast(String(err.message || err), true);
    }
  }

  /* ── Styles ────────────────────────────── */

  static get styles() {
    return css`
      :host {
        --primary: var(--primary-color, #03a9f4);
        --danger: var(--error-color, #db4437);
        --radius: 8px;
      }
      ha-card {
        overflow: hidden;
        position: relative;
      }
      /* toolbar */
      .toolbar {
        display: flex;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }
      .toolbar button {
        flex: 1;
        padding: 12px 0;
        background: none;
        border: none;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        color: var(--primary-text-color, #333);
        border-bottom: 3px solid transparent;
        transition: border-color 0.2s;
      }
      .toolbar button.active {
        border-bottom-color: var(--primary);
        color: var(--primary);
      }
      .content {
        padding: 16px;
      }

      /* search */
      .search-bar {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      .search-bar input {
        flex: 1;
        padding: 10px 12px;
        border: 1px solid var(--divider-color, #ccc);
        border-radius: var(--radius);
        font-size: 14px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #333);
      }

      /* results */
      .results {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .item-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: var(--radius);
      }
      .item-card img {
        width: 60px;
        height: 60px;
        object-fit: cover;
        border-radius: 6px;
      }
      .no-img {
        width: 60px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--divider-color, #eee);
        border-radius: 6px;
        font-size: 11px;
        color: var(--secondary-text-color, #888);
      }
      .item-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .space-badge {
        font-size: 12px;
        color: var(--secondary-text-color, #666);
      }

      /* form */
      .add-form {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 13px;
        font-weight: 500;
        color: var(--primary-text-color, #333);
      }
      label input,
      label select {
        padding: 10px 12px;
        border: 1px solid var(--divider-color, #ccc);
        border-radius: var(--radius);
        font-size: 14px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #333);
      }
      .preview {
        max-width: 100%;
        max-height: 200px;
        object-fit: contain;
        border-radius: var(--radius);
      }

      /* buttons */
      .primary {
        padding: 10px 20px;
        background: var(--primary);
        color: #fff;
        border: none;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      }
      .primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .icon-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        color: var(--primary-text-color, #333);
      }
      .icon-btn.danger {
        color: var(--danger);
      }

      /* spaces */
      .inline-form {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      .inline-form input {
        flex: 1;
        padding: 10px 12px;
        border: 1px solid var(--divider-color, #ccc);
        border-radius: var(--radius);
        font-size: 14px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #333);
      }
      .space-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .space-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: var(--radius);
      }
      .space-id {
        font-weight: 600;
        min-width: 36px;
        color: var(--primary);
      }
      .space-name {
        font-weight: 500;
      }
      .space-desc {
        flex: 1;
        font-size: 12px;
        color: var(--secondary-text-color, #888);
      }

      /* misc */
      .empty,
      .hint {
        color: var(--secondary-text-color, #888);
        font-size: 14px;
        text-align: center;
        padding: 20px 0;
      }
      .hint {
        font-style: italic;
      }

      /* toast */
      .toast {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--primary);
        color: #fff;
        padding: 8px 20px;
        border-radius: 20px;
        font-size: 13px;
        animation: fadein 0.2s;
        white-space: nowrap;
      }
      .toast.error {
        background: var(--danger);
      }
      @keyframes fadein {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
    `;
  }
}

customElements.define("storage-sorter-card", StorageSorterCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "storage-sorter-card",
  name: "Storage Sorter",
  preview: false,
  description: "Track items across your storage spaces.",
});
