function wsCmd(hass, type, payload = {}) {
  return hass.connection.sendMessagePromise({ type, ...payload });
}

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
        resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const STYLES = `
  :host { display: block; }
  ha-card { overflow: hidden; position: relative; }

  .toolbar {
    display: flex;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
  }
  .toolbar button {
    flex: 1; padding: 12px 0; background: none; border: none;
    font-size: 14px; font-weight: 500; cursor: pointer;
    color: var(--primary-text-color, #333);
    border-bottom: 3px solid transparent; transition: border-color .2s;
  }
  .toolbar button.active {
    border-bottom-color: var(--primary-color, #03a9f4);
    color: var(--primary-color, #03a9f4);
  }
  .content { padding: 16px; }

  .search-bar { display: flex; gap: 8px; margin-bottom: 12px; }
  .search-bar input {
    flex: 1; padding: 10px 12px;
    border: 1px solid var(--divider-color, #ccc); border-radius: 8px;
    font-size: 14px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #333);
  }

  .results { display: flex; flex-direction: column; gap: 10px; }
  .item-card {
    display: flex; align-items: center; gap: 12px; padding: 8px;
    border: 1px solid var(--divider-color, #e0e0e0); border-radius: 8px;
  }
  .item-card img {
    width: 60px; height: 60px; object-fit: cover; border-radius: 6px;
  }
  .no-img {
    width: 60px; height: 60px; display: flex; align-items: center;
    justify-content: center; background: var(--divider-color, #eee);
    border-radius: 6px; font-size: 11px; color: var(--secondary-text-color, #888);
  }
  .item-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .space-badge { font-size: 12px; color: var(--secondary-text-color, #666); }

  .add-form { display: flex; flex-direction: column; gap: 14px; }
  .add-form label {
    display: flex; flex-direction: column; gap: 4px;
    font-size: 13px; font-weight: 500; color: var(--primary-text-color, #333);
  }
  .add-form input, .add-form select {
    padding: 10px 12px; border: 1px solid var(--divider-color, #ccc);
    border-radius: 8px; font-size: 14px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #333);
  }
  .preview {
    max-width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px;
  }

  .btn {
    padding: 10px 20px; background: var(--primary-color, #03a9f4); color: #fff;
    border: none; border-radius: 8px; cursor: pointer;
    font-size: 14px; font-weight: 500;
  }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .icon-btn {
    background: none; border: none; font-size: 18px; cursor: pointer;
    padding: 4px 8px; border-radius: 4px; color: var(--error-color, #db4437);
  }

  .inline-form { display: flex; gap: 8px; margin-bottom: 12px; }
  .inline-form input {
    flex: 1; padding: 10px 12px;
    border: 1px solid var(--divider-color, #ccc); border-radius: 8px;
    font-size: 14px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #333);
  }
  .space-list { display: flex; flex-direction: column; gap: 6px; }
  .space-row {
    display: flex; align-items: center; gap: 10px; padding: 8px 10px;
    border: 1px solid var(--divider-color, #e0e0e0); border-radius: 8px;
  }
  .space-id {
    font-weight: 600; min-width: 36px; color: var(--primary-color, #03a9f4);
  }
  .space-name { font-weight: 500; }
  .space-desc {
    flex: 1; font-size: 12px; color: var(--secondary-text-color, #888);
  }

  .empty, .hint {
    color: var(--secondary-text-color, #888); font-size: 14px;
    text-align: center; padding: 20px 0;
  }
  .hint { font-style: italic; }

  .toast {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    background: var(--primary-color, #03a9f4); color: #fff;
    padding: 8px 20px; border-radius: 20px; font-size: 13px;
    white-space: nowrap; animation: fadein .2s;
  }
  .toast.error { background: var(--error-color, #db4437); }
  @keyframes fadein {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
`;

class StorageSorterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._view = "search";
    this._spaces = {};
    this._searchQuery = "";
    this._searchResults = null;
    this._imageB64 = null;
    this._imagePreview = null;
    this._loading = false;
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

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;
    if (firstSet) {
      this._loadSpaces().then(() => this._render());
    }
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._render();
  }

  async _loadSpaces() {
    if (!this._hass) return;
    try {
      const res = await wsCmd(this._hass, "storage_sorter/spaces/list");
      this._spaces = res.spaces || {};
    } catch (_) { }
  }

  _showToast(message, isError = false) {
    if (this._toastTimeout) clearTimeout(this._toastTimeout);
    const toast = this.shadowRoot.querySelector(".toast");
    if (toast) toast.remove();

    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.textContent = message;
    this.shadowRoot.querySelector("ha-card").appendChild(el);

    this._toastTimeout = setTimeout(() => el.remove(), 3000);
  }

  /* ── Main render ────────────────────── */

  _render() {
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="toolbar">
          <button data-view="search">Search</button>
          <button data-view="add">Add Item</button>
          <button data-view="spaces">Spaces</button>
        </div>
        <div class="content"></div>
      </ha-card>
    `;

    root.querySelectorAll(".toolbar button").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._view = btn.dataset.view;
        if (this._view === "spaces" || this._view === "add") {
          this._loadSpaces().then(() => this._renderView());
        } else {
          this._renderView();
        }
      });
    });

    this._renderView();
  }

  _renderView() {
    this.shadowRoot.querySelectorAll(".toolbar button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === this._view);
    });

    const content = this.shadowRoot.querySelector(".content");
    content.innerHTML = "";

    if (this._view === "search") this._renderSearch(content);
    else if (this._view === "add") this._renderAdd(content);
    else this._renderSpaces(content);
  }

  /* ── SEARCH ─────────────────────────── */

  _renderSearch(container) {
    const bar = document.createElement("div");
    bar.className = "search-bar";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search items\u2026";
    input.value = this._searchQuery;
    input.addEventListener("input", (e) => (this._searchQuery = e.target.value));
    input.addEventListener("keyup", (e) => {
      if (e.key === "Enter") doSearch();
    });

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Search";
    btn.addEventListener("click", () => doSearch());

    bar.append(input, btn);
    container.appendChild(bar);

    const resultsDiv = document.createElement("div");
    container.appendChild(resultsDiv);

    const doSearch = async () => {
      const q = this._searchQuery.trim();
      if (!q) return;
      try {
        const res = await wsCmd(this._hass, "storage_sorter/items/search", { query: q });
        this._searchResults = res.items;
        await this._loadSpaces();
        renderResults();
      } catch (_) {
        this._showToast("Search failed", true);
      }
    };

    const renderResults = () => {
      resultsDiv.innerHTML = "";
      if (this._searchResults === null) {
        resultsDiv.innerHTML = `<p class="hint">Enter a name and press Search to find items.</p>`;
        return;
      }
      if (this._searchResults.length === 0) {
        resultsDiv.innerHTML = `<p class="empty">No items found.</p>`;
        return;
      }
      const list = document.createElement("div");
      list.className = "results";
      this._searchResults.forEach((item) => {
        const card = document.createElement("div");
        card.className = "item-card";

        if (item.image_filename) {
          const img = document.createElement("img");
          img.src = `/local/storage_sorter/${item.image_filename}`;
          img.alt = item.name;
          card.appendChild(img);
        } else {
          const noImg = document.createElement("div");
          noImg.className = "no-img";
          noImg.textContent = "No image";
          card.appendChild(noImg);
        }

        const info = document.createElement("div");
        info.className = "item-info";
        const nameEl = document.createElement("strong");
        nameEl.textContent = item.name;
        const badge = document.createElement("span");
        badge.className = "space-badge";
        const spaceName = this._spaces[item.space_id]
          ? ` \u2014 ${this._spaces[item.space_id].name}`
          : "";
        badge.textContent = `#${item.space_id}${spaceName}`;
        info.append(nameEl, badge);

        const del = document.createElement("button");
        del.className = "icon-btn";
        del.title = "Delete item";
        del.textContent = "\u2715";
        del.addEventListener("click", async () => {
          try {
            await wsCmd(this._hass, "storage_sorter/items/remove", { item_id: item.id });
            this._showToast("Item removed");
            await doSearch();
          } catch (_) {
            this._showToast("Failed to remove item", true);
          }
        });

        card.append(info, del);
        list.appendChild(card);
      });
      resultsDiv.appendChild(list);
    };

    renderResults();
  }

  /* ── ADD ITEM ───────────────────────── */

  _renderAdd(container) {
    const spaceKeys = Object.keys(this._spaces);
    const form = document.createElement("form");
    form.className = "add-form";

    // Name
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Item name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "e.g. Christmas lights";
    nameInput.required = true;
    nameLabel.appendChild(nameInput);

    // Space
    const spaceLabel = document.createElement("label");
    spaceLabel.textContent = "Space";
    let spaceSelect = null;
    if (spaceKeys.length > 0) {
      spaceSelect = document.createElement("select");
      spaceSelect.required = true;
      spaceKeys.forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = `#${id} \u2014 ${this._spaces[id].name}`;
        spaceSelect.appendChild(opt);
      });
      spaceLabel.appendChild(spaceSelect);
    } else {
      const p = document.createElement("p");
      p.className = "empty";
      p.innerHTML = 'No spaces yet. Switch to the <b>Spaces</b> tab to create one.';
      spaceLabel.appendChild(p);
    }

    // Photo
    const photoLabel = document.createElement("label");
    photoLabel.textContent = "Photo";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.setAttribute("capture", "environment");
    photoLabel.appendChild(fileInput);

    const preview = document.createElement("img");
    preview.className = "preview";
    preview.style.display = "none";

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        this._imageB64 = await resizeImage(file);
        this._imagePreview = `data:image/jpeg;base64,${this._imageB64}`;
        preview.src = this._imagePreview;
        preview.style.display = "block";
      } catch (_) {
        this._showToast("Could not read image", true);
      }
    });

    // Submit
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "btn";
    submitBtn.textContent = "Add Item";
    if (spaceKeys.length === 0) submitBtn.disabled = true;

    form.append(nameLabel, spaceLabel, photoLabel, preview, submitBtn);
    container.appendChild(form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const spaceId = spaceSelect?.value;
      if (!name || !spaceId) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Saving\u2026";
      try {
        const payload = { name, space_id: spaceId };
        if (this._imageB64) payload.image = this._imageB64;
        await wsCmd(this._hass, "storage_sorter/items/add", payload);
        this._showToast("Item added!");
        form.reset();
        preview.style.display = "none";
        this._imageB64 = null;
        this._imagePreview = null;
      } catch (_) {
        this._showToast("Failed to add item", true);
      } finally {
        submitBtn.disabled = spaceKeys.length === 0;
        submitBtn.textContent = "Add Item";
      }
    });
  }

  /* ── SPACES ─────────────────────────── */

  _renderSpaces(container) {
    const spaceKeys = Object.keys(this._spaces);

    // Add form
    const addDiv = document.createElement("div");
    addDiv.className = "inline-form";
    const idInput = document.createElement("input");
    idInput.type = "text";
    idInput.placeholder = "ID (e.g. 1)";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Name (e.g. Box 1)";
    const addBtn = document.createElement("button");
    addBtn.className = "btn";
    addBtn.textContent = "Add";
    addDiv.append(idInput, nameInput, addBtn);
    container.appendChild(addDiv);

    addBtn.addEventListener("click", async () => {
      const id = idInput.value.trim();
      const name = nameInput.value.trim();
      if (!id || !name) {
        this._showToast("ID and name are required", true);
        return;
      }
      try {
        await wsCmd(this._hass, "storage_sorter/spaces/add", { space_id: id, name });
        this._showToast("Space added!");
        await this._loadSpaces();
        this._renderView();
      } catch (err) {
        this._showToast(String(err.message || err), true);
      }
    });

    // List
    if (spaceKeys.length === 0) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "No storage spaces yet. Add one above.";
      container.appendChild(p);
      return;
    }

    const list = document.createElement("div");
    list.className = "space-list";
    spaceKeys.forEach((id) => {
      const row = document.createElement("div");
      row.className = "space-row";

      const idSpan = document.createElement("span");
      idSpan.className = "space-id";
      idSpan.textContent = `#${id}`;

      const nameSpan = document.createElement("span");
      nameSpan.className = "space-name";
      nameSpan.textContent = this._spaces[id].name;

      const descSpan = document.createElement("span");
      descSpan.className = "space-desc";
      descSpan.textContent = this._spaces[id].description || "";

      const del = document.createElement("button");
      del.className = "icon-btn";
      del.title = "Remove space";
      del.textContent = "\u2715";
      del.addEventListener("click", async () => {
        try {
          await wsCmd(this._hass, "storage_sorter/spaces/remove", { space_id: id });
          this._showToast("Space removed");
          await this._loadSpaces();
          this._renderView();
        } catch (err) {
          this._showToast(String(err.message || err), true);
        }
      });

      row.append(idSpan, nameSpan, descSpan, del);
      list.appendChild(row);
    });
    container.appendChild(list);
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
