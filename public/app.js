// ── Tab routing ───────────────────────────────────────────────────────────────
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

function activateTab(name) {
  tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  tabContents.forEach((s) => s.classList.toggle("active", s.id === `tab-${name}`));
  if (name === "layers" && !layersLoaded) loadLayers();
  if (name === "generation" && !generationLoaded) loadGeneration();
  if (name === "metadata" && !metadataLoaded) loadMetadata();
  if (name === "config" && !configLoaded) loadConfig();
  if (name === "rarity" && !rarityTabLoaded) loadRarityTab();
  if (name === "suggestions" && !suggestionsLoaded) loadSuggestionsTab();
  if (name === "grouping" && !groupingLoaded) loadGroupingTab();
  if (name === "adjust" && !adjustLoaded) loadAdjustTab();
  if (name === "random" && !randomLoaded) loadRandomTab();
  if (name === "test" && !testLoaded) loadTestTab();
  if (name === "comparison" && !comparisonLoaded) loadComparisonTab();
  if (name === "log" && !logLoaded) loadLog();
}

tabBtns.forEach((b) => b.addEventListener("click", () => activateTab(b.dataset.tab)));

// ── Build selector ───────────────────────────────────────────────────────────
let currentBuild = 1;
function buildQ(sep) { return sep + "build=" + currentBuild; }

document.querySelectorAll(".build-select").forEach((sel) => {
  sel.addEventListener("change", (e) => {
    currentBuild = parseInt(e.target.value) || 1;
    document.querySelectorAll(".build-select").forEach((s) => (s.value = currentBuild));
    generationLoaded = false;
    metadataLoaded = false;
    rarityTabLoaded = false;
    suggestionsLoaded = false;
    adjustLoaded = false;
    randomLoaded = false;
    comparisonLoaded = false;
    const activeBtn = document.querySelector(".tab-btn.active");
    if (activeBtn) activateTab(activeBtn.dataset.tab);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** Escape HTML special characters to prevent XSS via innerHTML */
function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function showToast(title, lines, errorLines) {
  const container = document.getElementById("toast-container");
  const toast = el("div", "toast");
  if (title) toast.appendChild(el("div", "toast-title", title));
  (lines || []).forEach(line => toast.appendChild(el("div", "toast-line", line)));
  (errorLines || []).forEach(line => toast.appendChild(el("div", "toast-line toast-fail", line)));
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 450);
  }, 5000);
}

// ── LAYERS TAB ────────────────────────────────────────────────────────────────
let layersLoaded = false;
let cfgW = 0, cfgH = 0;

async function loadLayers() {
  const container = document.getElementById("layers-container");
  const summary = document.getElementById("layers-summary");
  container.innerHTML = `<div class="spinner"></div>`;

  try {
    const [layers, cfgSettings] = await Promise.all([api("/api/layers"), api("/api/config/settings").catch(() => ({}))]);
    cfgW = cfgSettings.width || 0; cfgH = cfgSettings.height || 0;
    const totalTraits = layers.reduce((s, l) => s + l.traits.length, 0);
    summary.textContent = `${layers.length} layers · ${totalTraits} traits`;
    buildLayerManager(layers.map(l => l.folder));
    container.innerHTML = "";

    if (!layers.length) {
      container.innerHTML = `<p class="empty">No layers found in ./layers/</p>`;
      return;
    }

    layers.forEach((layer) => {
      const col = el("div", "layer-col");
      const header = el("div", "layer-col-header");
      header.innerHTML = `<span class="layer-name">${esc(layer.folder)}</span><span class="layer-count">${layer.traits.length} traits</span>`;

      const fileInput = document.createElement("input");
      fileInput.type = "file"; fileInput.accept = "image/png"; fileInput.multiple = true; fileInput.style.display = "none";
      const uploadBtn = el("button", "btn btn-secondary layer-upload-btn", "+");
      uploadBtn.title = "Add images to this layer";
      uploadBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        if (!fileInput.files.length) return;
        const files = await Promise.all(Array.from(fileInput.files).map(f => new Promise(resolve => {
          const r = new FileReader();
          r.onload = e => resolve({ name: f.name, base64: e.target.result });
          r.readAsDataURL(f);
        })));
        // Dimension check: load each as Image to read naturalWidth/Height
        if (cfgW && cfgH) {
          const wrong = await Promise.all(files.map(f => new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve((img.naturalWidth !== cfgW || img.naturalHeight !== cfgH) ? f.name : null);
            img.onerror = () => resolve(null);
            img.src = f.base64;
          })));
          const bad = wrong.filter(Boolean);
          if (bad.length && !confirm(`${bad.length} file(s) don't match the configured ${cfgW}×${cfgH}px:\n\n${bad.join("\n")}\n\nUpload anyway?`)) return;
        }
        uploadBtn.disabled = true;
        fileInput.value = "";
        try {
          await api(`/api/layers/${encodeURIComponent(layer.folder)}/upload`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files }),
          });
          layersLoaded = false; loadLayers();
        } catch (e) { alert(`Upload failed: ${e.message}`); uploadBtn.disabled = false; }
      });
      header.appendChild(fileInput);
      header.appendChild(uploadBtn);
      col.appendChild(header);

      const grid = el("div", "trait-grid");
      layer.traits.forEach((trait) => {
        const card = el("div", "trait-card");
        const imgUrl = `/api/layers/${encodeURIComponent(layer.folder)}/${encodeURIComponent(trait.file)}`;
        const sizeWarn = cfgW && cfgH && trait.w !== null && (trait.w !== cfgW || trait.h !== cfgH);
        card.innerHTML = `
          <div class="trait-img-wrap">
            <img src="${imgUrl}" alt="${esc(trait.name)}" loading="lazy" />
            ${sizeWarn ? `<span class="trait-size-warn" title="${trait.w}×${trait.h}px — expected ${cfgW}×${cfgH}px">\u00D7</span>` : ""}
          </div>
          <div class="trait-info">
            <div class="trait-name" title="${esc(trait.name)}">${esc(trait.name)}</div>
            <div class="trait-weight">
              <span class="badge">${esc(trait.pct)}%</span>
              <span class="weight-label">w:${trait.hasWeight ? esc(trait.weight) : "NA"}</span>
            </div>
          </div>`;
        card.addEventListener("click", () => openTraitModal(layer.folder, trait, imgUrl));
        grid.appendChild(card);
      });

      col.appendChild(grid);
      container.appendChild(col);
    });
    layersLoaded = true;
    // Advanced tab layer-linking list must refresh whenever layers change
    adjustLoaded = false;
  } catch (e) {
    container.innerHTML = `<p class="error">Failed to load layers: ${e.message}</p>`;
  }
}

function buildLayerManager(orderedNames) {
  const mgr = document.getElementById("layer-manager");
  if (!mgr) return;
  mgr.innerHTML = "";

  // Header row
  const hdr = el("div", "lm-header");
  hdr.innerHTML = `<span class="lm-header-title">Layer Order <span class="lm-hint">bottom \u2192 top</span></span>`;
  const autoBtn = el("button", "btn btn-secondary lm-add-btn", "\u{1F50D} Auto Detect");
  autoBtn.title = "Add all folders found in layers/ that aren't already listed";
  autoBtn.addEventListener("click", async () => {
    autoBtn.disabled = true;
    try {
      const result = await api("/api/layers/auto-detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (result.added.length) { layersLoaded = false; loadLayers(); }
      else alert("All folders are already listed.");
    } catch (e) { alert(`Failed: ${e.message}`); }
    autoBtn.disabled = false;
  });
  const addBtn = el("button", "btn btn-secondary lm-add-btn", "+ Add Layer");
  hdr.appendChild(autoBtn);
  hdr.appendChild(addBtn);
  mgr.appendChild(hdr);

  // Inline add-layer form (shown when "+ Add Layer" is clicked)
  const addForm = el("div", "lm-add-form hidden");
  addForm.innerHTML = `<input class="lm-add-input" type="text" placeholder="Layer name..." /><button class="btn btn-primary lm-add-confirm">Add</button><button class="btn btn-ghost lm-add-cancel">Cancel</button>`;
  mgr.appendChild(addForm);

  const cancelAdd = () => {
    addForm.classList.add("hidden");
    addForm.querySelector(".lm-add-input").value = "";
    addBtn.disabled = false;
  };
  const submitAdd = async () => {
    const name = addForm.querySelector(".lm-add-input").value.trim();
    if (!name) { addForm.querySelector(".lm-add-input").focus(); return; }
    const confirmBtn = addForm.querySelector(".lm-add-confirm");
    confirmBtn.disabled = true;
    try {
      const result = await api("/api/layers/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      layersLoaded = false;
      await loadLayers();
      showToast("Layer Added", [
        `"${name}" ${result.folderCreated ? "created" : "already existed — added to config"}.`,
        "Upload PNG files to this layer to add traits.",
      ]);
    } catch (e) {
      alert(`Failed to add layer: ${e.message}`);
      confirmBtn.disabled = false;
    }
  };
  addBtn.addEventListener("click", () => {
    addBtn.disabled = true;
    addForm.classList.remove("hidden");
    addForm.querySelector(".lm-add-input").focus();
  });
  addForm.querySelector(".lm-add-confirm").addEventListener("click", submitAdd);
  addForm.querySelector(".lm-add-cancel").addEventListener("click", cancelAdd);
  addForm.querySelector(".lm-add-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAdd();
    else if (e.key === "Escape") cancelAdd();
  });

  if (!orderedNames.length) {
    mgr.appendChild(el("p", "empty", "No layers configured."));
    return;
  }

  const list = el("div", "lm-list");
  orderedNames.forEach((name, i) => {
    const row = el("div", "lm-row");
    const isFirst = i === 0;
    const isLast  = i === orderedNames.length - 1;
    row.innerHTML = `
      <span class="lm-index">${i + 1}</span>
      <span class="lm-name">${esc(name)}</span>
      <div class="lm-btns">
        <button class="btn lm-btn" data-action="up"     data-name="${esc(name)}" ${isFirst ? "disabled" : ""} title="Move up">\u25B2</button>
        <button class="btn lm-btn" data-action="down"   data-name="${esc(name)}" ${isLast  ? "disabled" : ""} title="Move down">\u25BC</button>
        <button class="btn lm-btn lm-rename" data-action="rename" data-name="${esc(name)}" title="Rename layer">\u270E</button>
        <button class="btn lm-btn lm-remove" data-action="remove" data-name="${esc(name)}" title="Remove from config">\u00D7</button>
      </div>`;
    list.appendChild(row);
  });

  list.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const { action, name } = btn.dataset;

    if (action === "remove") {
      if (!window.confirm(`Remove "${name}" from config?\n\nThe folder and its assets will NOT be deleted.`)) return;
    }

    if (action === "rename") {
      const row = btn.closest(".lm-row");
      const nameSpan = row.querySelector(".lm-name");
      const btnsDiv  = row.querySelector(".lm-btns");

      // Replace the name span with an inline input
      const input = document.createElement("input");
      input.type = "text";
      input.value = name;
      input.className = "lm-rename-input";
      nameSpan.replaceWith(input);
      btnsDiv.style.display = "none";
      input.focus();
      input.select();

      const saveBtn   = el("button", "btn btn-primary lm-btn", "Save");
      const cancelBtn = el("button", "btn btn-ghost lm-btn", "Cancel");
      row.appendChild(saveBtn);
      row.appendChild(cancelBtn);

      const cancelRename = () => {
        saveBtn.remove();
        cancelBtn.remove();
        input.replaceWith(nameSpan);
        btnsDiv.style.display = "";
      };
      const submitRename = async () => {
        const newName = input.value.trim();
        if (!newName || newName === name) { cancelRename(); return; }
        input.disabled = true;
        saveBtn.disabled = true;
        try {
          await api("/api/layers/rename-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldName: name, newName }),
          });
          layersLoaded = false;
          loadLayers();
        } catch (e) {
          alert(`Failed: ${e.message}`);
          input.disabled = false;
          saveBtn.disabled = false;
          cancelRename();
        }
      };
      saveBtn.addEventListener("click", submitRename);
      cancelBtn.addEventListener("click", cancelRename);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitRename();
        else if (e.key === "Escape") cancelRename();
      });
      return;
    }

    btn.disabled = true;
    try {
      const endpoint = action === "remove" ? "/api/layers/remove" : "/api/layers/move";
      const payload  = action === "remove" ? { name } : { name, direction: action };
      await api(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      layersLoaded = false;
      loadLayers();
    } catch (e) {
      alert(`Failed: ${e.message}`);
      btn.disabled = false;
    }
  });

  mgr.appendChild(list);
}

// ── GENERATION TAB ────────────────────────────────────────────────────────────
let generationLoaded = false;
let pollTimer = null;

async function loadGeneration() {
  try { await loadGenSettings(); } catch (e) { console.warn("loadGenSettings failed:", e); }
  await refreshImages();
  generationLoaded = true;
}

async function loadGenSettings() {
  const s = await api("/api/config/settings");
  document.getElementById("cfg-namePrefix").value  = s.namePrefix        ?? "";
  document.getElementById("cfg-description").value = s.description       ?? "";
  document.getElementById("cfg-edition").value     = s.growEditionSizeTo ?? "";
  document.getElementById("cfg-width").value        = s.width            ?? "";
  document.getElementById("cfg-height").value       = s.height           ?? "";
}

loadGenSettings().catch(() => {});

(function attachGenSettingsListeners() {
  const fields = [
    { id: "cfg-namePrefix",  key: "namePrefix" },
    { id: "cfg-description", key: "description" },
    { id: "cfg-edition",     key: "growEditionSizeTo" },
    { id: "cfg-width",       key: "width" },
    { id: "cfg-height",      key: "height" },
  ];
  fields.forEach(({ id, key }) => {
    const input = document.getElementById(id);
    const save = async function () {
      try {
        await api("/api/config/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: input.value }),
        });
      } catch (e) {
        alert(`Failed to save ${key}: ${e.message}`);
      }
    };
    input.addEventListener("change", save);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  });
})();

async function refreshImages() {
  const grid = document.getElementById("gen-grid");
  const countBadge = document.getElementById("gen-count");
  try {
    const files = await api("/api/images" + buildQ("?"));
    countBadge.textContent = `${files.length} images`;
    if (!files.length) {
      grid.innerHTML = `<p class="empty">No images in build/images/ — run Generate.</p>`;
      return;
    }
    grid.innerHTML = "";
    files.forEach((file) => {
      const id = parseInt(file);
      const wrap = el("div", "gen-thumb");
      const img = document.createElement("img");
      img.src = `/api/images/${encodeURIComponent(file)}?t=${Date.now()}${buildQ("&")}`;
      img.alt = `#${id}`;
      img.loading = "lazy";
      img.addEventListener("click", () => openModal(id));
      const label = el("div", "gen-thumb-label", `#${id}`);
      wrap.appendChild(img);
      wrap.appendChild(label);
      grid.appendChild(wrap);
    });
  } catch (e) {
    grid.innerHTML = `<p class="error">Failed to load images: ${e.message}</p>`;
  }
}

document.getElementById("btn-generate").addEventListener("click", async () => {
  const btn = document.getElementById("btn-generate");
  const stopBtn = document.getElementById("btn-stop");
  const logBox = document.getElementById("gen-log-box");
  const logPre = document.getElementById("gen-log");
  const grid = document.getElementById("gen-grid");
  const warn = document.getElementById("gen-stopped-warn");

  btn.disabled = true;
  btn.textContent = "Generating…";
  stopBtn.classList.remove("hidden");
  warn.classList.add("hidden");
  grid.innerHTML = "";
  logBox.classList.remove("hidden");
  logPre.textContent = "Starting generation…\n";

  try {
    await api("/api/generate" + buildQ("?"), { method: "POST" });
    pollGeneration();
  } catch (e) {
    logPre.textContent += `Error: ${e.message}\n`;
    btn.disabled = false;
    btn.textContent = "▶ Generate";
    stopBtn.classList.add("hidden");
  }
});

document.getElementById("btn-stop").addEventListener("click", async () => {
  try { await api("/api/generate/stop", { method: "POST" }); } catch (_) {}
});

document.getElementById("btn-refresh").addEventListener("click", () => refreshImages());

function pollGeneration() {
  if (pollTimer) clearInterval(pollTimer);
  const logPre = document.getElementById("gen-log");
  const btn = document.getElementById("btn-generate");
  let lastLen = 0;

  pollTimer = setInterval(async () => {
    try {
      const status = await api("/api/generate/status" + buildQ("?"));
      const newLines = status.log.slice(lastLen);
      if (newLines.length) {
        logPre.textContent += newLines.join("\n") + "\n";
        logPre.scrollTop = logPre.scrollHeight;
        lastLen = status.log.length;
      }
      if (!status.generating) {
        clearInterval(pollTimer);
        btn.disabled = false;
        btn.textContent = "▶ Generate";
        document.getElementById("btn-stop").classList.add("hidden");
        if (status.stopped) {
          document.getElementById("gen-stopped-warn").classList.remove("hidden");
          logPre.textContent += "\n── Stopped ──\n";
        } else {
          logPre.textContent += "\n── Done ──\n";
        }
        await refreshImages();
        metadataLoaded = false;
        rarityTabLoaded = false; suggestionsLoaded = false; comparisonLoaded = false;
      }
    } catch (e) { console.warn("Poll error:", e); }
  }, 800);
}

document.getElementById("btn-shuffle").addEventListener("click", async () => {
  if (!window.confirm("Shuffle the collection?\n\nThis will reassign edition numbers in a random order. The image and metadata files will be renamed to match.")) return;

  const btn = document.getElementById("btn-shuffle");
  const genBtn = document.getElementById("btn-generate");
  btn.disabled = true;
  genBtn.disabled = true;
  btn.textContent = "Shuffling\u2026";

  try {
    await api("/api/images/shuffle" + buildQ("?"), { method: "POST" });
    metadataLoaded = false;
    rarityTabLoaded = false; suggestionsLoaded = false; comparisonLoaded = false;
    await refreshImages();
  } catch (e) {
    alert(`Shuffle failed: ${e.message}`);
  } finally {
    btn.disabled = false;
    genBtn.disabled = false;
    btn.textContent = "\u21BB Shuffle";
  }
});

document.getElementById("btn-clear-build").addEventListener("click", async () => {
  if (!window.confirm(`Clear all images and metadata from Build ${currentBuild}?\n\nThis cannot be undone.`)) return;
  const btn = document.getElementById("btn-clear-build");
  btn.disabled = true;
  btn.textContent = "Clearing\u2026";
  try {
    await api("/api/build" + buildQ("?"), { method: "DELETE" });
    generationLoaded = false; metadataLoaded = false; rarityTabLoaded = false;
    suggestionsLoaded = false; comparisonLoaded = false;
    await refreshImages();
  } catch (e) {
    alert(`Clear failed: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "\u00D7 Clear";
  }
});

// ── METADATA TAB ─────────────────────────────────────────────────────────────
let metadataLoaded = false;
let allItems = [];
let rarityData = {};
let metaSelected = new Set(); // keys: "LayerName\0TraitValue"
let metaUserSearched = false; // true once user has typed or clicked a rarity row

async function loadMetadata() {
  metaSelected.clear();
  metaUserSearched = false;
  document.getElementById("meta-search").value = "";
  const rarityPanel = document.getElementById("rarity-panel");
  const metaTotal = document.getElementById("meta-total");
  rarityPanel.innerHTML = `<div class="spinner"></div>`;
  document.getElementById("meta-results").innerHTML = `<div class="spinner"></div>`;

  try {
    const data = await api("/api/metadata" + buildQ("?"));
    allItems = data.items;
    rarityData = data.rarity;
    metaTotal.textContent = `${data.total} editions`;

    // Build rarity sidebar
    rarityPanel.innerHTML = "";
    for (const [layer, traits] of Object.entries(rarityData)) {
      const section = el("div", "rarity-section");
      section.innerHTML = `<div class="rarity-layer-name">${esc(layer)}</div>`;
      traits.forEach((t) => {
        const key = `${layer}\0${t.value}`;
        const row = el("div", "rarity-row");
        const pct = parseFloat(t.pct);
        row.innerHTML = `
          <div class="rarity-label" title="${esc(t.value)}">${esc(t.value)}</div>
          <div class="rarity-bar-wrap">
            <div class="rarity-bar" style="width:${Math.min(pct, 100)}%"></div>
          </div>
          <div class="rarity-pct">${esc(t.pct)}%</div>`;
        row.addEventListener("click", () => {
          if (metaSelected.has(key)) {
            metaSelected.delete(key);
            row.classList.remove("rarity-row-selected");
          } else {
            metaSelected.add(key);
            row.classList.add("rarity-row-selected");
          }
          metaUserSearched = true;
          filterMetadata(document.getElementById("meta-search").value);
        });
        row.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          metaSelected.delete(key);
          row.classList.remove("rarity-row-selected");
          metaUserSearched = metaSelected.size > 0 || document.getElementById("meta-search").value.trim().length > 0;
          filterMetadata(document.getElementById("meta-search").value);
        });
        section.appendChild(row);
      });
      rarityPanel.appendChild(section);
    }

    // Append 0% (unused) traits from layers not present in any generated NFT
    try {
      const layerData = await api("/api/layers");
      const zeroRows = [];
      layerData.forEach(layer => {
        const known = new Set((rarityData[layer.folder] || []).map(t => t.value));
        layer.traits.forEach(t => {
          if (!known.has(t.name)) zeroRows.push({ layer: layer.folder, value: t.name });
        });
      });
      if (zeroRows.length) {
        const zeroSection = el("div", "rarity-section rarity-zero-section");
        zeroSection.appendChild(el("div", "rarity-layer-name rarity-zero-header", "Unused Traits \u2014 0%"));
        zeroRows.forEach(({ layer, value }) => {
          const row = el("div", "rarity-row rarity-zero-row");
          row.innerHTML = `
            <div class="rarity-label rarity-zero-layer-tag" title="${esc(layer)}">${esc(layer)}</div>
            <div class="rarity-label" title="${esc(value)}">${esc(value)}</div>
            <div class="rarity-bar-wrap"><div class="rarity-bar" style="width:0%"></div></div>
            <div class="rarity-pct">0%</div>`;
          zeroSection.appendChild(row);
        });
        rarityPanel.appendChild(zeroSection);
      }
    } catch (e) { console.warn("Unused traits fetch error:", e); }

    if (!metaUserSearched) renderMetaResults(allItems.slice(0, 60));
    metadataLoaded = true;
  } catch (e) {
    rarityPanel.innerHTML = `<p class="error">Failed: ${e.message}</p>`;
  }
}

function filterMetadata(query) {
  const terms = query.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);

  if (metaSelected.size === 0 && terms.length === 0) {
    renderMetaResults(allItems.slice(0, 60));
    return;
  }

  let results = allItems;

  // Sidebar selection: edition must have ALL selected layer+trait combos (AND)
  if (metaSelected.size > 0) {
    results = results.filter(item => {
      for (const key of metaSelected) {
        const [layer, value] = key.split("\0");
        if (!(item.attributes || []).some(a => a.trait_type === layer && a.value === value)) return false;
      }
      return true;
    });
  }

  // Search bar: edition must match ALL comma-separated terms (AND)
  if (terms.length > 0) {
    results = results.filter(item =>
      terms.every(term => {
        if (String(item.edition) === term) return true;
        if (item.name && item.name.toLowerCase().includes(term)) return true;
        return (item.attributes || []).some(a => a.value.toLowerCase().includes(term));
      })
    );
  }

  renderMetaResults(results);
}

function renderMetaResults(items) {
  const container = document.getElementById("meta-results");
  if (!items.length) {
    container.innerHTML = `<p class="empty">No results.</p>`;
    return;
  }
  container.innerHTML = "";
  items.forEach((item) => {
    const card = el("div", "meta-card");
    const attrs = (item.attributes || [])
      .map((a) => `<span class="attr-chip"><b>${esc(a.trait_type)}:</b> ${esc(a.value)}</span>`)
      .join("");
    card.innerHTML = `
      <div class="meta-card-header">
        <span class="meta-edition">#${item.edition}</span>
        <span class="meta-name">${esc(item.name)}</span>
      </div>
      <div class="meta-attrs">${attrs}</div>`;
    card.addEventListener("click", () => openModal(item.edition));
    container.appendChild(card);
  });
}

document.getElementById("btn-meta-refresh").addEventListener("click", () => {
  metadataLoaded = false;
  loadMetadata();
});
document.getElementById("btn-rarity-refresh").addEventListener("click", () => {
  rarityTabLoaded = false;
  loadRarityTab();
});
document.getElementById("btn-suggestions-refresh").addEventListener("click", () => {
  suggestionsLoaded = false;
  loadSuggestionsTab();
});
document.getElementById("btn-adjust-refresh").addEventListener("click", () => {
  adjustLoaded = false;
  loadAdjustTab();
});
document.getElementById("btn-meta-search").addEventListener("click", () => {
  metaUserSearched = true;
  filterMetadata(document.getElementById("meta-search").value);
});
document.getElementById("meta-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { metaUserSearched = true; filterMetadata(e.target.value); }
});
document.getElementById("meta-search").addEventListener("input", (e) => {
  // Mark as user-searched once they start typing so loadMetadata won't overwrite results
  if (e.target.value.trim()) metaUserSearched = true;
});
document.getElementById("btn-meta-clear").addEventListener("click", () => {
  document.getElementById("meta-search").value = "";
  metaSelected.clear();
  metaUserSearched = false;
  document.querySelectorAll(".rarity-row-selected").forEach(r => r.classList.remove("rarity-row-selected"));
  renderMetaResults(allItems.slice(0, 60));
});

// ── CONFIG TAB ────────────────────────────────────────────────────────────────
let configLoaded = false;

async function loadConfig() {
  const editor = document.getElementById("config-editor");
  editor.value = "Loading…";
  try {
    const { raw } = await api("/api/config");
    editor.value = raw;
    configLoaded = true;
  } catch (e) {
    editor.value = `// Error loading config: ${e.message}`;
  }
}

document.getElementById("btn-reload-config").addEventListener("click", () => {
  configLoaded = false;
  loadConfig();
});

document.getElementById("btn-save-config").addEventListener("click", async () => {
  const btn = document.getElementById("btn-save-config");
  const status = document.getElementById("config-status");
  const raw = document.getElementById("config-editor").value;
  btn.disabled = true;
  status.textContent = "Saving…";
  status.className = "config-status";
  try {
    await api("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    status.textContent = "Saved!";
    status.className = "config-status ok";
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
    status.className = "config-status err";
  } finally {
    btn.disabled = false;
    setTimeout(() => (status.textContent = ""), 3000);
  }
});

// ── Trait Preview Modal ───────────────────────────────────────────────────────
const traitModal = document.getElementById("trait-modal");
const traitModalImg = document.getElementById("trait-modal-img");
const traitModalInfo = document.getElementById("trait-modal-info");

function openTraitModal(layerFolder, trait, imgUrl) {
  traitModal.classList.remove("hidden");
  traitModalImg.src = imgUrl;
  traitModalImg.alt = trait.name;
  traitModalImg.style.cursor = "pointer";
  traitModalImg.onclick = () => window.open(imgUrl, "_blank");
  traitModalInfo.innerHTML = `
    <div class="tmi-row"><span class="tmi-label">Layer</span><span class="tmi-val">${esc(layerFolder)}</span></div>
    <div class="tmi-row"><span class="tmi-label">Trait</span><span class="tmi-val tmi-weight-display">${esc(trait.name)}</span></div>
    <div class="tmi-row"><span class="tmi-label">Weight</span><span class="tmi-val">${trait.hasWeight ? esc(trait.weight) : "NA"}</span></div>
    <div class="tmi-row"><span class="tmi-label">Rarity</span><span class="tmi-val">${esc(trait.pct)}%</span></div>
    <div class="tmi-weight-form">
      <label class="tmi-field-label">Name</label>
      <input id="tmi-new-name" type="text" value="${esc(trait.name)}" style="flex:2" />
      <button id="tmi-rand-name" class="btn btn-ghost" title="Random 6-letter name">&#127922; Title</button>
      <label class="tmi-field-label">Weight</label>
      <input id="tmi-new-weight" type="number" min="0.001" step="any" value="${trait.hasWeight ? esc(trait.weight) : 1}" style="flex:1" />
      <button id="tmi-rand-weight" class="btn btn-ghost" title="Random weight 1-20">&#127922; Rarity</button>
      <button id="tmi-apply-btn" class="btn btn-primary">Apply</button>
      <span id="tmi-status"></span>
    </div>
    <div class="tmi-delete-row">
      <button id="tmi-delete-btn" class="btn btn-danger">Move to Trash</button>
      <span id="tmi-delete-status"></span>
    </div>
    ${cfgW && cfgH && trait.w !== null && (trait.w !== cfgW || trait.h !== cfgH)
      ? `<div class="tmi-size-warn">This image is the incorrect size (${trait.w}\u00D7${trait.h}px \u2014 expected ${cfgW}\u00D7${cfgH}px)</div>`
      : ""}`;

  document.getElementById("tmi-apply-btn").addEventListener("click", async () => {
    const btn = document.getElementById("tmi-apply-btn");
    const statusEl = document.getElementById("tmi-status");
    const newWeight = parseFloat(document.getElementById("tmi-new-weight").value);
    const newName = document.getElementById("tmi-new-name").value.trim();
    if (isNaN(newWeight) || newWeight <= 0) { statusEl.textContent = "Invalid weight."; return; }
    if (!newName) { statusEl.textContent = "Name cannot be empty."; return; }

    btn.disabled = true;
    statusEl.textContent = "Saving…";
    try {
      const result = await api("/api/layers/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: layerFolder, file: trait.file, weight: newWeight, name: newName }),
      });
      trait.file = result.file;
      trait.weight = newWeight;
      trait.name = newName;
      traitModalImg.src = `/api/layers/${encodeURIComponent(layerFolder)}/${encodeURIComponent(result.file)}`;
      traitModalInfo.querySelector(".tmi-weight-display").textContent = newName;
      statusEl.textContent = "Saved!";
      // Reload layers so the card reflects the new weight
      layersLoaded = false;
      loadLayers();
    } catch (e) {
      statusEl.textContent = `Error: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("tmi-rand-name").addEventListener("click", () => {
    const vowels = "aeiouy", cons = "bcdfghjklmnpqrstvwxz";
    let w = "";
    for (let i = 0; i < 6; i++) w += (i % 2 === 0 ? cons : vowels)[Math.random() * (i % 2 === 0 ? cons.length : vowels.length) | 0];
    document.getElementById("tmi-new-name").value = w.charAt(0).toUpperCase() + w.slice(1);
  });

  document.getElementById("tmi-rand-weight").addEventListener("click", () => {
    document.getElementById("tmi-new-weight").value = Math.floor(Math.random() * 20) + 1;
  });

  document.getElementById("tmi-delete-btn").addEventListener("click", async () => {
    if (!confirm(`Move "${trait.name}" to trash?\n\nThe file will be moved to the trash/ folder and can be restored manually.`)) return;
    const btn = document.getElementById("tmi-delete-btn");
    const statusEl = document.getElementById("tmi-delete-status");
    btn.disabled = true;
    statusEl.textContent = "Moving…";
    try {
      await api("/api/layers/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: layerFolder, file: trait.file }),
      });
      traitModal.classList.add("hidden");
      layersLoaded = false;
      loadLayers();
    } catch (e) {
      btn.disabled = false;
      statusEl.textContent = `Error: ${e.message}`;
    }
  });
}

traitModal.querySelector(".modal-backdrop").addEventListener("click", () => traitModal.classList.add("hidden"));
traitModal.querySelector(".modal-close").addEventListener("click", () => traitModal.classList.add("hidden"));

// ── Modal ─────────────────────────────────────────────────────────────────────
const modal = document.getElementById("modal");
const modalImg = document.getElementById("modal-img");
const modalMeta = document.getElementById("modal-meta");

async function openModal(edition) {
  modal.classList.remove("hidden");
  modalImg.src = `/api/images/${edition}.png?t=${Date.now()}${buildQ("&")}`;
  modalImg.style.cursor = "pointer";
  modalImg.onclick = () => window.open(modalImg.src, "_blank");
  modalMeta.innerHTML = `<div class="spinner"></div>`;
  try {
    const item = await api(`/api/metadata/${edition}${buildQ("?")}`);
    const attrs = (item.attributes || [])
      .map((a) => `<div class="modal-attr"><span class="modal-attr-type">${esc(a.trait_type)}</span><span class="modal-attr-val">${esc(a.value)}</span></div>`)
      .join("");
    modalMeta.innerHTML = `
      <h3 class="modal-name">${esc(item.name)}</h3>
      <div class="modal-attrs">${attrs}</div>`;
  } catch (e) {
    modalMeta.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

modal.querySelector(".modal-backdrop").addEventListener("click", () => modal.classList.add("hidden"));
modal.querySelector(".modal-close").addEventListener("click", () => modal.classList.add("hidden"));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    modal.classList.add("hidden");
    traitModal.classList.add("hidden");
  }
});

// ── RARITY TAB ────────────────────────────────────────────────────────────────
let rarityTabLoaded = false;
let suggestionsLoaded = false;

async function loadRarityTab() {
  const body = document.getElementById("rarity-tab-body");
  const totalBadge = document.getElementById("rarity-tab-total");
  body.innerHTML = `<div class="spinner"></div>`;

  try {
    const [metaData, scoreData, layerData] = await Promise.all([
      api("/api/metadata" + buildQ("?")),
      api("/api/rarity/scores" + buildQ("?")),
      api("/api/layers"),
    ]);

    totalBadge.textContent = `${scoreData.total} editions`;
    body.innerHTML = "";

    body.appendChild(buildTraitDistSection(metaData.rarity, layerData));
    body.appendChild(buildScoreSection(scoreData.scores));
    body.appendChild(buildSimilarSection());
    rarityTabLoaded = true;
  } catch (e) {
    body.innerHTML = `<p class="error">Failed to load: ${e.message}</p>`;
  }
}

function buildTraitDistSection(rarity, layerData) {
  const section = el("div", "ra-section");
  const title = el("div", "ra-section-title", "Trait Distribution");
  section.appendChild(title);

  const layerTraits = {};
  if (layerData) layerData.forEach(l => { layerTraits[l.folder] = l.traits.map(t => t.name); });

  const content = el("div", "ra-dist-content");
  for (const [layer, traits] of Object.entries(rarity)) {
    const group = el("div", "ra-group");
    group.appendChild(el("div", "ra-group-header", esc(layer)));
    const usedNames = new Set(traits.map(t => t.value));
    traits.forEach((t) => {
      const pct = Math.min(parseFloat(t.pct), 100);
      const row = el("div", "ra-bar-row");
      row.innerHTML = `
        <div class="ra-bar-label" title="${esc(t.value)}">${esc(t.value)}</div>
        <div class="ra-bar-wrap"><div class="ra-bar" style="width:${pct}%"></div></div>
        <div class="ra-bar-stats">
          <span class="ra-pct">${esc(t.pct)}%</span>
          <span class="ra-count">(${t.count})</span>
        </div>`;
      group.appendChild(row);
    });
    (layerTraits[layer] || []).forEach(name => {
      if (usedNames.has(name)) return;
      const row = el("div", "ra-bar-row ra-unused-row");
      row.innerHTML = `
        <div class="ra-bar-label" title="${esc(name)}">${esc(name)}</div>
        <div class="ra-bar-wrap"><div class="ra-bar" style="width:0%"></div></div>
        <div class="ra-bar-stats">
          <span class="ra-pct">0%</span>
          <span class="ra-count">(0)</span>
        </div>`;
      group.appendChild(row);
    });
    content.appendChild(group);
  }
  section.appendChild(content);
  return section;
}

function buildScoreSection(scores) {
  const section = el("div", "ra-section");
  const title = el("div", "ra-section-title");
  title.innerHTML = `NFT Rarity Scores <span class="ra-subtitle">higher = rarer · score = Σ(total ÷ trait_frequency)</span>`;
  section.appendChild(title);

  if (!scores.length) {
    section.appendChild(el("p", "empty", "No metadata found. Run Generate first."));
    return section;
  }

  const maxScore = scores[0].score;
  const layout = el("div", "ra-scores-layout");

  // Left: score distribution histogram
  const histWrap = el("div", "ra-hist-wrap");
  histWrap.appendChild(el("div", "ra-sub-header", "Score Distribution"));
  histWrap.appendChild(buildHistogram(scores));
  layout.appendChild(histWrap);

  // Right: ranked list
  const listWrap = el("div", "ra-score-list-wrap");
  listWrap.appendChild(el("div", "ra-sub-header", "Ranked by Rarity"));
  const list = el("div", "ra-score-list");
  scores.forEach((s, i) => {
    const barPct = maxScore > 0 ? ((s.score / maxScore) * 100).toFixed(1) : 0;
    const rankClass = i === 0 ? "ra-rank-gold" : i === 1 ? "ra-rank-silver" : i === 2 ? "ra-rank-bronze" : "";
    const row = el("div", "ra-score-row");
    row.innerHTML = `
      <span class="ra-rank ${rankClass}">#${i + 1}</span>
      <span class="ra-score-edition">#${s.edition}</span>
      <div class="ra-score-bar-wrap"><div class="ra-score-bar" style="width:${barPct}%"></div></div>
      <span class="ra-score-val">${s.score}</span>`;
    row.querySelector(".ra-score-edition").addEventListener("click", () => openModal(s.edition));
    list.appendChild(row);
  });
  listWrap.appendChild(list);
  layout.appendChild(listWrap);
  section.appendChild(layout);
  return section;
}

function buildHistogram(scores) {
  const BUCKETS = 10;
  const min = scores[scores.length - 1].score;
  const max = scores[0].score;
  const range = max - min || 1;
  const buckets = Array(BUCKETS).fill(0);
  scores.forEach((s) => {
    const idx = Math.min(BUCKETS - 1, Math.floor(((s.score - min) / range) * BUCKETS));
    buckets[idx]++;
  });
  const maxCount = Math.max(...buckets);

  const hist = el("div", "ra-histogram");
  buckets.forEach((count, i) => {
    const heightPct = maxCount > 0 ? ((count / maxCount) * 100).toFixed(1) : 0;
    const label = Math.round(min + (i / BUCKETS) * range);
    const col = el("div", "ra-hist-col");
    col.innerHTML = `
      <div class="ra-hist-count" title="${count} NFTs">${count || ""}</div>
      <div class="ra-hist-bar-wrap">
        <div class="ra-hist-bar" style="height:${heightPct}%"></div>
      </div>
      <div class="ra-hist-label">${label}</div>`;
    hist.appendChild(col);
  });
  return hist;
}

// ── SUGGESTIONS TAB ───────────────────────────────────────────────────────────
async function loadSuggestionsTab() {
  const body = document.getElementById("suggestions-body");
  const badge = document.getElementById("suggestions-summary");
  body.innerHTML = `<div class="spinner"></div>`;

  try {
    const [metaData, scoreData, layerData] = await Promise.all([
      api("/api/metadata" + buildQ("?")),
      api("/api/rarity/scores" + buildQ("?")),
      api("/api/layers"),
    ]);

    body.innerHTML = "";

    const onFix = async (editionsToMove, run, btn, statusEl, omitValues) => {
      btn.disabled = true;
      statusEl.textContent = "Fixing…";
      try {
        const result = await api("/api/collection/fix-consecutive" + buildQ("?"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editionsToMove,
            runEditions: run.editions,
            traitType: run.trait_type,
            traitValue: run.value,
            omitValues: omitValues || [],
          }),
        });
        if (result.swapped > 0 || (result.failed && result.failed.length > 0)) {
          const swapLines = (result.pairs || []).map(p => `#${p.from} has been replaced with #${p.to}`);
          const failLines = (result.failed || []).map(f => `#${f.edition}: ${f.reason}`);
          showToast("Fix Result", swapLines, failLines);
        }
        statusEl.textContent = result.swapped > 0 ? `Fixed ${result.swapped}.` : (result.failed && result.failed.length ? "Failed — see popup." : "Nothing to fix.");
        if (result.swapped > 0) {
          suggestionsLoaded = false; metadataLoaded = false; rarityTabLoaded = false;
          loadSuggestionsTab();
        } else {
          btn.disabled = false;
        }
      } catch (e) {
        statusEl.textContent = `Error: ${e.message}`;
        btn.disabled = false;
      }
    };

    badge.textContent = `${scoreData.total} editions`;
    body.appendChild(buildConsecutiveSection(metaData.items, onFix));
    body.appendChild(buildWeightSuggestSection(scoreData.scores, metaData.rarity, scoreData.total, layerData));
    suggestionsLoaded = true;
  } catch (e) {
    body.innerHTML = `<p class="error">Failed to load: ${e.message}</p>`;
  }
}

function buildConsecutiveSection(items, onFix) {
  const section = el("div", "ra-section");

  const titleRow = el("div", "ra-consec-header");
  titleRow.appendChild(el("div", "ra-section-title", "Consecutive Trait Repeats"));
  const omitWrap = el("div", "ra-consec-omit");
  omitWrap.innerHTML = `<span class="ra-consec-omit-label">Ignore values:</span><input class="ra-consec-omit-input" type="text" placeholder="blank, none, …" title="Comma-separated trait values to ignore when detecting and fixing repeats" />`;
  const omitInput = omitWrap.querySelector("input");
  omitInput.value = localStorage.getItem("nftgen_omit_values") || "";
  titleRow.appendChild(omitWrap);
  section.appendChild(titleRow);

  const sorted = [...items].sort((a, b) => a.edition - b.edition);
  const byType = {};
  sorted.forEach(item => {
    (item.attributes || []).forEach(({ trait_type, value }) => {
      if (!byType[trait_type]) byType[trait_type] = [];
      byType[trait_type].push({ edition: item.edition, value });
    });
  });

  const allRuns = [];
  for (const [trait_type, entries] of Object.entries(byType)) {
    let i = 0;
    while (i < entries.length) {
      let j = i + 1;
      while (j < entries.length && entries[j].value === entries[i].value) j++;
      if (j - i >= 2 && j - i < sorted.length) allRuns.push({ trait_type, value: entries[i].value, editions: entries.slice(i, j).map(e => e.edition) });
      i = j;
    }
  }

  const listContainer = el("div");
  section.appendChild(listContainer);

  const renderList = () => {
    const omitSet = new Set(omitInput.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
    const filtered = allRuns.filter(r => !omitSet.has(r.value.toLowerCase()));
    listContainer.innerHTML = "";
    if (!filtered.length) {
      listContainer.appendChild(el("p", "empty", "No trait appears 2+ times consecutively."));
      return;
    }
    const list = el("div", "ra-consec-list");
    filtered.forEach(run => {
      const row = el("div", "ra-consec-row");
      row.innerHTML = `
        <span class="ra-consec-layer">${esc(run.trait_type)}</span>
        <span class="ra-consec-value">${esc(run.value)}</span>
        <span class="ra-consec-eds">${run.editions.map(e => `#${e}`).join(", ")}</span>
        <span class="ra-consec-count">${run.editions.length}\u00D7</span>`;
      if (onFix) {
        const fixBtn = el("button", "btn ra-consec-fix-btn", "Fix");
        const fixStatus = el("span", "ra-consec-fix-status");
        const editionsToMove = run.editions.slice(1);
        const omitValues = () => omitInput.value.split(",").map(s => s.trim()).filter(Boolean);
        fixBtn.addEventListener("click", () => onFix(editionsToMove, run, fixBtn, fixStatus, omitValues()));
        row.appendChild(fixBtn);
        row.appendChild(fixStatus);
      }
      list.appendChild(row);
    });
    listContainer.appendChild(list);
  };

  renderList();
  omitInput.addEventListener("input", () => {
    localStorage.setItem("nftgen_omit_values", omitInput.value);
    renderList();
  });

  return section;
}

function buildWeightSuggestSection(scores, rarity, total, layerData) {
  const section = el("div", "ra-section");
  section.appendChild(el("div", "ra-section-title", "Weight Suggestions \u2014 flatten top-10 spread"));

  if (scores.length < 2) {
    section.appendChild(el("p", "empty", "Not enough data. Run Generate first."));
    return section;
  }

  const top = scores.slice(0, Math.min(10, scores.length));
  const gap = (top[0].score - top[top.length - 1].score).toFixed(0);

  const suggestions = [];

  // Build a full picture per layer: known traits from rarity + any 0% traits from layerData
  const layerTraitCounts = {}; // layer -> total distinct traits (including 0%)
  if (layerData) {
    layerData.forEach(l => { layerTraitCounts[l.folder] = l.traits.length; });
  }

  for (const [layer, traits] of Object.entries(rarity)) {
    const n = layerTraitCounts[layer] || traits.length;
    const expected = 100 / n;
    traits.forEach(t => {
      const actual = parseFloat(t.pct);
      if (actual < expected * 0.7) {
        suggestions.push({ layer, value: t.value, actual: t.pct, expected: expected.toFixed(1), multiplier: (expected / actual).toFixed(1), zero: false });
      }
    });
  }

  // Add traits that exist in layers but never appeared (0%)
  if (layerData) {
    layerData.forEach(l => {
      const known = new Set((rarity[l.folder] || []).map(t => t.value));
      const n = l.traits.length;
      const expected = (100 / n).toFixed(1);
      l.traits.forEach(t => {
        if (!known.has(t.name)) {
          suggestions.push({ layer: l.folder, value: t.name, actual: "0", expected, multiplier: null, zero: true });
        }
      });
    });
  }

  const summary = el("div", "ra-suggest-summary");
  summary.textContent = `Top-10 spread: ${top[0].score} \u2192 ${top[top.length - 1].score} (gap: ${gap}).  `;
  summary.textContent += suggestions.length
    ? `${suggestions.length} under-represented trait${suggestions.length !== 1 ? "s" : ""} found:`
    : "Distribution looks balanced — no adjustments suggested.";
  section.appendChild(summary);

  if (!suggestions.length) return section;

  const table = el("div", "ra-suggest-table");
  table.innerHTML = `<div class="ra-suggest-head"><span>Layer</span><span>Trait</span><span>Actual</span><span>Expected</span><span>Multiply weight by</span></div>`;
  suggestions.forEach(s => {
    const row = el("div", `ra-suggest-row${s.zero ? " ra-suggest-zero" : ""}`);
    row.innerHTML = `<span>${esc(s.layer)}</span><span>${esc(s.value)}</span><span>${esc(s.actual)}%</span><span>~${esc(s.expected)}%</span><span class="ra-suggest-mult">${s.zero ? "\u26A0 never generated" : "\u00D7" + esc(s.multiplier)}</span>`;
    table.appendChild(row);
  });
  section.appendChild(table);
  return section;
}

function buildSimilarSection() {
  const section = el("div", "ra-section");
  section.innerHTML = `
    <div class="ra-section-title">Similar NFTs</div>
    <div class="ra-similar-controls">
      <label>Flag pairs sharing at least</label>
      <input id="similar-threshold" type="number" min="1" max="100" value="75" class="ra-threshold-input" />
      <label>% of traits</label>
      <button id="btn-scan-similar" class="btn btn-primary">Scan</button>
      <span id="similar-status" class="ra-similar-status"></span>
    </div>
    <div id="similar-results" class="ra-similar-results"></div>`;

  section.querySelector("#btn-scan-similar").addEventListener("click", runSimilarScan);
  return section;
}

async function runSimilarScan() {
  const threshold = parseFloat(document.getElementById("similar-threshold").value) || 75;
  const statusEl = document.getElementById("similar-status");
  const results = document.getElementById("similar-results");
  const btn = document.getElementById("btn-scan-similar");

  btn.disabled = true;
  statusEl.textContent = "Scanning…";
  results.innerHTML = `<div class="spinner"></div>`;

  try {
    const pairs = await api(`/api/similar?threshold=${threshold}${buildQ("&")}`);
    statusEl.textContent = pairs.length
      ? `${pairs.length} pair${pairs.length !== 1 ? "s" : ""} flagged`
      : "No similar pairs found";

    if (!pairs.length) {
      results.innerHTML = `<p class="empty">No NFTs are ${threshold}%+ similar.</p>`;
    } else {
      results.innerHTML = "";
      pairs.forEach((pair) => {
        const card = el("div", "similar-card");
        const sharedChips = pair.sharedList
          .map((s) => `<span class="sim-chip sim-shared" title="${esc(s.trait_type)}: ${esc(s.value)}">${esc(s.value)}</span>`)
          .join("");
        const diffRows = pair.diffList
          .map(
            (d) => `<div class="sim-diff-row">
              <span class="sim-diff-type">${esc(d.trait_type)}</span>
              <span class="sim-diff-val">${esc(d.valueA) || "—"}</span>
              <span class="sim-diff-sep">vs</span>
              <span class="sim-diff-val">${esc(d.valueB) || "—"}</span>
            </div>`
          )
          .join("");

        card.innerHTML = `
          <div class="similar-card-header">
            <span class="sim-edition" data-ed="${pair.a.edition}">#${pair.a.edition}</span>
            <span class="sim-vs">vs</span>
            <span class="sim-edition" data-ed="${pair.b.edition}">#${pair.b.edition}</span>
            <span class="sim-pct-badge">${pair.similarity}% similar</span>
            <span class="sim-detail">${pair.sharedCount} / ${pair.totalTraits} traits match</span>
          </div>
          <div class="similar-card-body">
            <div class="sim-col">
              <div class="sim-section-label">Shared traits</div>
              <div class="sim-chips">${sharedChips}</div>
            </div>
            ${
              pair.diffList.length
                ? `<div class="sim-col sim-diff-col">
                <div class="sim-section-label">Differences</div>
                ${diffRows}
              </div>`
                : ""
            }
          </div>`;

        card.querySelectorAll(".sim-edition").forEach((node) =>
          node.addEventListener("click", () => openModal(parseInt(node.dataset.ed)))
        );
        results.appendChild(card);
      });
    }
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
    results.innerHTML = "";
  } finally {
    btn.disabled = false;
  }
}

// ── ADJUST METADATA TAB ───────────────────────────────────────────────────────
// ── GROUPING TAB ──────────────────────────────────────────────────────────────
let groupingLoaded = false;
let groupingLayers = []; // cached layer list for dropdowns
let groupingGroups  = []; // current groups array

async function loadGroupingTab() {
  const body  = document.getElementById("grouping-body");
  const badge = document.getElementById("grouping-summary");
  body.innerHTML = `<div class="spinner"></div>`;
  try {
    [groupingLayers, groupingGroups] = await Promise.all([api("/api/layers"), api("/api/groups")]);
    badge.textContent = `${groupingGroups.length} group${groupingGroups.length !== 1 ? "s" : ""}`;
    renderGroupingTab(body, badge);
    groupingLoaded = true;
  } catch (e) {
    body.innerHTML = `<p class="error">Failed to load: ${e.message}</p>`;
  }
}

function renderGroupingTab(body, badge) {
  body.innerHTML = "";

  const info = el("div", "grp-info",
    "Groups modify trait probabilities during generation. " +
    "When any \u2018parent asset\u2019 is picked, each \u2018influenced asset\u2019 in that group " +
    "has its weight multiplied by the parent\u2019s multiplier. " +
    "Values \u003e1 boost (e.g. \u00d73 = three times more likely), \u003c1 suppress."
  );
  body.appendChild(info);

  const list = el("div", "grp-list");
  groupingGroups.forEach((group, idx) => list.appendChild(buildGroupCard(group, idx, body, badge)));
  body.appendChild(list);

  const addBtn = el("button", "btn btn-primary grp-new-btn", "+ New Group");
  addBtn.addEventListener("click", async () => {
    groupingGroups.push({ id: Date.now(), name: "New Group", parents: [], influenced: [] });
    await saveGroups();
    badge.textContent = `${groupingGroups.length} group${groupingGroups.length !== 1 ? "s" : ""}`;
    renderGroupingTab(body, badge);
  });
  body.appendChild(addBtn);
}

// Helper: layer <select> populated from groupingLayers
function grpLayerSel(cls) {
  const s = document.createElement("select");
  s.className = cls;
  groupingLayers.forEach(l => {
    const o = document.createElement("option");
    o.value = l.folder; o.textContent = l.folder;
    s.appendChild(o);
  });
  return s;
}

// Helper: trait <select> that repopulates when layerSel changes
function grpTraitSel(cls, layerSel) {
  const s = document.createElement("select");
  s.className = cls;
  const populate = () => {
    const layer = groupingLayers.find(l => l.folder === layerSel.value);
    s.innerHTML = "";
    (layer ? layer.traits : []).forEach(t => {
      const o = document.createElement("option");
      o.value = t.name; o.textContent = t.name;
      s.appendChild(o);
    });
  };
  layerSel.addEventListener("change", populate);
  populate();
  return s;
}

function buildGroupCard(group, idx, body, badge) {
  const card = el("div", "grp-card");

  // Header: editable name + delete button
  const header = el("div", "grp-card-header");
  const nameInput = document.createElement("input");
  nameInput.type = "text"; nameInput.className = "grp-name-input"; nameInput.value = group.name;
  nameInput.addEventListener("change", async () => {
    groupingGroups[idx].name = nameInput.value.trim() || "Group";
    await saveGroups();
  });
  const delBtn = el("button", "btn grp-del-btn", "\u00D7");
  delBtn.title = "Delete group";
  delBtn.addEventListener("click", async () => {
    groupingGroups.splice(idx, 1);
    await saveGroups();
    badge.textContent = `${groupingGroups.length} group${groupingGroups.length !== 1 ? "s" : ""}`;
    renderGroupingTab(body, badge);
  });
  header.appendChild(nameInput);
  header.appendChild(delBtn);
  card.appendChild(header);

  // Two-column body
  const cols = el("div", "grp-card-cols");

  // ── Left column: Parent Assets ──
  const leftCol = el("div", "grp-col");
  leftCol.appendChild(el("div", "grp-col-title", "Parent Assets"));
  const parentList = el("div", "grp-asset-list");
  (group.parents || []).forEach((_, pi) => parentList.appendChild(buildParentRow(group, idx, pi, body, badge)));
  leftCol.appendChild(parentList);

  // Add-parent row
  const addPWrap = el("div", "grp-add-row");
  const pLaySel = grpLayerSel("grp-sel");
  const pTrtSel = grpTraitSel("grp-sel", pLaySel);
  const pMultIn = document.createElement("input");
  pMultIn.type = "number"; pMultIn.value = "2"; pMultIn.min = "0.01"; pMultIn.step = "0.1";
  pMultIn.className = "grp-mult-input"; pMultIn.title = "Multiplier";
  const pAddBtn = el("button", "btn grp-add-asset-btn", "+ Add");
  pAddBtn.addEventListener("click", async () => {
    group.parents.push({ layer: pLaySel.value, trait: pTrtSel.value, multiplier: parseFloat(pMultIn.value) || 2 });
    await saveGroups();
    renderGroupingTab(body, badge);
  });
  [pLaySel, pTrtSel, el("span", "grp-mult-x", "\u00D7"), pMultIn, pAddBtn].forEach(n => addPWrap.appendChild(n));
  leftCol.appendChild(addPWrap);

  // ── Right column: Influenced Assets ──
  const rightCol = el("div", "grp-col");
  rightCol.appendChild(el("div", "grp-col-title", "Influenced Assets"));
  const infList = el("div", "grp-asset-list");
  (group.influenced || []).forEach((_, ii) => infList.appendChild(buildInfluencedRow(group, idx, ii, body, badge)));
  rightCol.appendChild(infList);

  // Add-influenced row
  const addIWrap = el("div", "grp-add-row");
  const iLaySel = grpLayerSel("grp-sel");
  const iTrtSel = grpTraitSel("grp-sel", iLaySel);
  const iAddBtn = el("button", "btn grp-add-asset-btn", "+ Add");
  iAddBtn.addEventListener("click", async () => {
    group.influenced.push({ layer: iLaySel.value, trait: iTrtSel.value });
    await saveGroups();
    renderGroupingTab(body, badge);
  });
  [iLaySel, iTrtSel, iAddBtn].forEach(n => addIWrap.appendChild(n));
  rightCol.appendChild(addIWrap);

  cols.appendChild(leftCol);
  cols.appendChild(rightCol);
  card.appendChild(cols);
  return card;
}

function buildParentRow(group, groupIdx, parentIdx, body, badge) {
  const p = group.parents[parentIdx];
  const row = el("div", "grp-asset-row");
  const laySpan = el("span", "grp-layer-tag", p.layer);
  const trtSpan = el("span", "grp-trait-tag", p.trait);
  const xSpan   = el("span", "grp-mult-x", "\u00D7");
  const multIn  = document.createElement("input");
  multIn.type = "number"; multIn.value = p.multiplier; multIn.min = "0.01"; multIn.step = "0.1";
  multIn.className = "grp-mult-input grp-mult-inline"; multIn.title = "Multiplier";
  multIn.addEventListener("change", async () => {
    groupingGroups[groupIdx].parents[parentIdx].multiplier = parseFloat(multIn.value) || 1;
    await saveGroups();
  });
  const delBtn = el("button", "btn grp-row-del", "\u00D7");
  delBtn.addEventListener("click", async () => {
    group.parents.splice(parentIdx, 1);
    await saveGroups();
    renderGroupingTab(body, badge);
  });
  [laySpan, trtSpan, xSpan, multIn, delBtn].forEach(n => row.appendChild(n));
  return row;
}

function buildInfluencedRow(group, groupIdx, infIdx, body, badge) {
  const inf = group.influenced[infIdx];
  const row = el("div", "grp-asset-row");
  const laySpan = el("span", "grp-layer-tag", inf.layer);
  const trtSpan = el("span", "grp-trait-tag", inf.trait);
  const delBtn  = el("button", "btn grp-row-del", "\u00D7");
  delBtn.addEventListener("click", async () => {
    group.influenced.splice(infIdx, 1);
    await saveGroups();
    renderGroupingTab(body, badge);
  });
  [laySpan, trtSpan, delBtn].forEach(n => row.appendChild(n));
  return row;
}

async function saveGroups() {
  await api("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(groupingGroups),
  });
}

let adjustLoaded = false;
let adjTemplateMeta = null; // cached first item for JSON templates

async function loadAdjustTab() {
  const body = document.getElementById("adjust-body");
  const badge = document.getElementById("adjust-summary");
  body.innerHTML = `<div class="spinner"></div>`;
  try {
    const [metaData, emptySlots, layers, layerOpts] = await Promise.all([
      api("/api/metadata" + buildQ("?")),
      api("/api/edition/empty" + buildQ("?")),
      api("/api/layers"),
      api("/api/layers/options"),
    ]);
    adjTemplateMeta = metaData.items[0] || null;
    badge.textContent = `${metaData.total} editions`;
    body.innerHTML = "";
    body.appendChild(adjBuildLayerOptionsSection(layers, layerOpts));
    body.appendChild(adjBuildDelReplaceSection(emptySlots));
    body.appendChild(adjBuildBulkEditSection(adjTemplateMeta));
    body.appendChild(adjBuildHiddenLayerSection(Object.keys(metaData.rarity), metaData.rarity));
    adjustLoaded = true;
  } catch (e) {
    body.innerHTML = `<p class="error">Failed to load: ${e.message}</p>`;
  }
}

function adjBuildLayerOptionsSection(layers, layerOpts) {
  const section = el("div", "ra-section");
  section.appendChild(el("div", "ra-section-title", "Layer Settings \u2014 Linking & Metadata Visibility"));

  const hint = el("div", "adj-lo-hint",
    "Link To: a linked layer mirrors the source layer\u2019s trait selection by filename (e.g. a shadow layer always matches its projection). " +
    "Muted layers still render in the image but are hidden from the generated metadata."
  );
  section.appendChild(hint);

  const table = el("div", "adj-lo-table");
  const head = el("div", "adj-lo-head");
  head.innerHTML = `<span>Layer</span><span>Link To (source layer)</span><span>Mute from metadata</span>`;
  table.appendChild(head);

  layers.forEach((layer, idx) => {
    const name = layer.folder;
    const opts = layerOpts[name] || {};
    const row = el("div", "adj-lo-row");

    // Linked indicator badge
    const linkedBadge = opts.linkedTo
      ? `<span class="adj-lo-linked-badge">\uD83D\uDD17 \u2192 ${esc(opts.linkedTo)}</span>`
      : "";

    // Name cell
    const nameCell = el("div", "adj-lo-name");
    nameCell.innerHTML = `<span>${esc(name)}</span>${linkedBadge}`;

    // Link dropdown — only layers before this one are valid sources
    const linkCell = el("div", "adj-lo-link");
    const select = document.createElement("select");
    select.className = "adj-lo-select";
    const noneOpt = document.createElement("option");
    noneOpt.value = ""; noneOpt.textContent = "— none —";
    select.appendChild(noneOpt);
    layers.slice(0, idx).forEach(prev => {
      const o = document.createElement("option");
      o.value = prev.folder; o.textContent = prev.folder;
      if (opts.linkedTo === prev.folder) o.selected = true;
      select.appendChild(o);
    });
    linkCell.appendChild(select);

    // Mute checkbox
    const muteCell = el("div", "adj-lo-mute");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.className = "adj-lo-cb";
    cb.checked = !!opts.muted;
    const cbLabel = el("label", "adj-lo-cb-label", "Hide from metadata");
    muteCell.appendChild(cb); muteCell.appendChild(cbLabel);

    // Save on change
    const save = async () => {
      const newOpts = {};
      if (select.value) newOpts.linkedTo = select.value;
      if (cb.checked) newOpts.muted = true;
      try {
        await api("/api/layers/set-options", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, options: newOpts }),
        });
        // Refresh linked badge
        const badge = nameCell.querySelector(".adj-lo-linked-badge");
        if (select.value) {
          if (badge) badge.textContent = `\uD83D\uDD17 \u2192 ${select.value}`;
          else nameCell.insertAdjacentHTML("beforeend", `<span class="adj-lo-linked-badge">\uD83D\uDD17 \u2192 ${esc(select.value)}</span>`);
        } else if (badge) badge.remove();
        row.classList.toggle("adj-lo-row-linked", !!select.value);
        row.classList.toggle("adj-lo-row-muted", cb.checked);
      } catch (e) { alert(`Failed: ${e.message}`); }
    };
    select.addEventListener("change", save);
    cb.addEventListener("change", save);

    row.classList.toggle("adj-lo-row-linked", !!opts.linkedTo);
    row.classList.toggle("adj-lo-row-muted", !!opts.muted);
    row.appendChild(nameCell); row.appendChild(linkCell); row.appendChild(muteCell);
    table.appendChild(row);
  });

  section.appendChild(table);
  return section;
}

// ── Section 1: Delete / Replace ───────────────────────────────────────────────
function adjBuildDelReplaceSection(emptySlots) {
  const section = el("div", "ra-section");
  section.innerHTML = `<div class="ra-section-title">Delete / Replace Edition</div>`;

  const layout = el("div", "adj-del-layout");

  // Left: picker + preview
  const picker = el("div", "adj-picker");
  picker.innerHTML = `
    <div class="adj-picker-row">
      <label class="adj-picker-label">Edition #</label>
      <input id="adj-ed-input" type="number" min="1" step="1" class="adj-num-input" placeholder="1" />
      <button id="adj-ed-load" class="btn btn-secondary">Preview</button>
    </div>
    <div id="adj-ed-preview" class="adj-ed-preview"><p class="empty">Enter an edition number to preview.</p></div>`;

  picker.querySelector("#adj-ed-load").addEventListener("click", () => {
    const n = parseInt(picker.querySelector("#adj-ed-input").value);
    if (!isNaN(n)) adjPreviewEdition(n);
  });
  picker.querySelector("#adj-ed-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const n = parseInt(e.target.value); if (!isNaN(n)) adjPreviewEdition(n); }
  });

  // Right: empty slots
  const slotsPanel = el("div", "adj-slots-panel");
  slotsPanel.id = "adj-slots-panel";
  adjRenderEmptySlots(slotsPanel, emptySlots);

  layout.appendChild(picker);
  layout.appendChild(slotsPanel);
  section.appendChild(layout);
  return section;
}

async function adjPreviewEdition(n) {
  const preview = document.getElementById("adj-ed-preview");
  preview.innerHTML = `<div class="spinner"></div>`;
  try {
    const item = await api(`/api/metadata/${n}${buildQ("?")}`);
    const attrs = (item.attributes || [])
      .map(a => `<div class="adj-attr-row"><span class="adj-attr-type">${esc(a.trait_type)}</span><span class="adj-attr-val">${esc(a.value)}</span></div>`)
      .join("");
    preview.innerHTML = `
      <div class="adj-preview-inner">
        <img src="/api/images/${n}.png${buildQ("?")}" class="adj-preview-img" alt="#${n}" />
        <div class="adj-preview-meta">
          <div class="adj-preview-name">${esc(item.name)}</div>
          <div class="adj-preview-attrs">${attrs}</div>
          <button class="btn adj-delete-btn" data-ed="${n}">Delete Edition #${n}</button>
        </div>
      </div>`;
    preview.querySelector(".adj-delete-btn").addEventListener("click", () => adjDeleteEdition(n));
  } catch (e) {
    preview.innerHTML = `<p class="error">Edition #${n} not found.</p>`;
  }
}

async function adjDeleteEdition(n) {
  if (!window.confirm(`Delete edition #${n}?\n\nThe image and JSON files will be permanently removed. The slot remains empty as a placeholder until you upload a replacement.`)) return;
  try {
    await api(`/api/edition/${n}${buildQ("?")}`, { method: "DELETE" });
    document.getElementById("adj-ed-preview").innerHTML =
      `<p class="adj-deleted-msg">Edition #${n} deleted. The slot is now empty.</p>`;
    metadataLoaded = false;
    rarityTabLoaded = false; suggestionsLoaded = false;
    adjustLoaded = false;
    // Refresh the empty slots panel
    const emptySlots = await api("/api/edition/empty" + buildQ("?"));
    try { const md = await api("/api/metadata" + buildQ("?")); adjTemplateMeta = md.items[0] || null; } catch (_) {}
    adjRenderEmptySlots(document.getElementById("adj-slots-panel"), emptySlots);
  } catch (e) {
    alert(`Delete failed: ${e.message}`);
  }
}

function adjRenderEmptySlots(panel, emptySlots) {
  panel.innerHTML = "";
  const header = el("div", "adj-slots-header");
  header.innerHTML = `<span>Empty Slots</span><span class="adj-slots-count">${emptySlots.length}</span>`;
  panel.appendChild(header);
  if (!emptySlots.length) {
    panel.appendChild(el("p", "empty", "No empty slots."));
    return;
  }
  emptySlots.forEach((slot) => panel.appendChild(adjBuildReplaceCard(slot)));
}

function adjBuildReplaceCard(slot) {
  const meta = adjTemplateMeta;
  const namePrefix = meta ? meta.name.replace(/#\d+$/, "") : "";
  const description = meta ? meta.description : "";
  const imageBase = meta ? meta.image.replace(/\/\d+\.png$/, "") : "ipfs://REPLACE_WITH_CID";
  const templateJson = JSON.stringify({
    name: `${namePrefix}#${slot.edition}`,
    description,
    image: `${imageBase}/${slot.edition}.png`,
    edition: slot.edition,
    date: Date.now(),
    attributes: [],
  }, null, 2);

  const card = el("div", "adj-replace-card");
  const missing = [!slot.hasImage && "no image", !slot.hasJson && "no json"].filter(Boolean).join(", ");
  card.innerHTML = `
    <div class="adj-replace-header">
      Replace Edition #${slot.edition}
      <span class="adj-slot-missing">${missing}</span>
    </div>
    <div class="adj-replace-body">
      <div class="adj-replace-img-col">
        <label class="btn btn-secondary adj-file-label">
          Choose Image&hellip;
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="adj-file-input" />
        </label>
        <div class="adj-img-preview-wrap">
          <img class="adj-img-preview hidden" alt="preview" />
          <span class="adj-img-placeholder">No image selected</span>
        </div>
      </div>
      <div class="adj-replace-json-col">
        <div class="adj-replace-json-label">Metadata JSON</div>
        <textarea class="adj-json-editor" spellcheck="false">${templateJson}</textarea>
      </div>
    </div>
    <div class="adj-replace-footer">
      <button class="btn btn-primary adj-upload-btn">Upload to #${slot.edition}</button>
      <span class="adj-upload-status"></span>
    </div>`;

  const fileInput = card.querySelector(".adj-file-input");
  const imgPreview = card.querySelector(".adj-img-preview");
  const imgPlaceholder = card.querySelector(".adj-img-placeholder");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      imgPreview.src = e.target.result;
      imgPreview.classList.remove("hidden");
      imgPlaceholder.classList.add("hidden");
      card.dataset.imageBase64 = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  card.querySelector(".adj-upload-btn").addEventListener("click", () =>
    adjSubmitReplace(card, slot.edition)
  );
  return card;
}

async function adjSubmitReplace(card, edition) {
  const btn = card.querySelector(".adj-upload-btn");
  const status = card.querySelector(".adj-upload-status");
  const jsonText = card.querySelector(".adj-json-editor").value;
  const imageBase64 = card.dataset.imageBase64 || null;

  let jsonData;
  try { jsonData = JSON.parse(jsonText); } catch (_) {
    status.textContent = "Invalid JSON."; status.className = "adj-upload-status err"; return;
  }
  jsonData.date = Date.now(); // update timestamp on upload

  btn.disabled = true;
  status.textContent = "Uploading\u2026";
  status.className = "adj-upload-status";

  try {
    const tasks = [];
    if (imageBase64) {
      tasks.push(api(`/api/edition/${edition}/image${buildQ("?")}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: imageBase64 }),
      }));
    }
    tasks.push(api(`/api/edition/${edition}/json${buildQ("?")}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: jsonData }),
    }));
    await Promise.all(tasks);
    status.textContent = "Uploaded!"; status.className = "adj-upload-status ok";
    metadataLoaded = false; rarityTabLoaded = false; suggestionsLoaded = false;
    generationLoaded = false;
    // Refresh generation grid and slots after short delay
    setTimeout(async () => {
      refreshImages();
      const emptySlots = await api("/api/edition/empty" + buildQ("?"));
      try { const md = await api("/api/metadata" + buildQ("?")); adjTemplateMeta = md.items[0] || null; } catch (_) {}
      adjRenderEmptySlots(document.getElementById("adj-slots-panel"), emptySlots);
    }, 600);
  } catch (e) {
    status.textContent = `Error: ${e.message}`; status.className = "adj-upload-status err";
  } finally {
    btn.disabled = false;
  }
}

// ── Section 2: Bulk Edit Fields ────────────────────────────────────────────────
function adjBuildBulkEditSection(firstMeta) {
  const namePrefix = firstMeta ? firstMeta.name.replace(/#\d+$/, "") : "";
  const description = firstMeta ? firstMeta.description : "";
  const imageBase = firstMeta ? firstMeta.image.replace(/\/\d+\.png$/, "") : "ipfs://REPLACE_WITH_CID";

  const section = el("div", "ra-section");
  section.innerHTML = `<div class="ra-section-title">Bulk Edit Metadata Fields <span class="ra-subtitle">changes applied to every edition JSON</span></div>`;

  const form = el("div", "adj-bulk-form");
  form.innerHTML = `
    <div class="adj-field-row">
      <label class="adj-field-label">Name prefix</label>
      <input id="adj-name-prefix" type="text" class="adj-text-input" value="${esc(namePrefix)}" />
      <span class="adj-field-hint">Text before #N &mdash; e.g. "My Collection #"</span>
    </div>
    <div class="adj-field-row">
      <label class="adj-field-label">Description</label>
      <input id="adj-description" type="text" class="adj-text-input" value="${esc(description)}" />
    </div>
    <div class="adj-field-row">
      <label class="adj-field-label">Image base URL</label>
      <input id="adj-image-base" type="text" class="adj-text-input" value="${esc(imageBase)}" />
      <span class="adj-field-hint">Prefix before /N.png &mdash; e.g. IPFS CID</span>
    </div>
    <div class="adj-custom-wrap">
      <div class="adj-custom-header">
        Custom fields
        <span class="adj-field-hint">add, overwrite, or remove (blank value = delete)</span>
        <button id="adj-add-field" class="btn btn-ghost adj-small-btn">+ Add field</button>
      </div>
      <div id="adj-custom-list"></div>
    </div>
    <div class="adj-bulk-actions">
      <button id="adj-apply-bulk" class="btn btn-primary">Apply to all editions</button>
      <span id="adj-bulk-status" class="adj-status"></span>
    </div>`;

  form.querySelector("#adj-add-field").addEventListener("click", () => {
    const list = form.querySelector("#adj-custom-list");
    const row = el("div", "adj-cf-row");
    row.innerHTML = `
      <input type="text" class="adj-cf-key adj-text-short" placeholder="field name" />
      <input type="text" class="adj-cf-val adj-text-input" placeholder="value (blank = remove field)" />
      <button class="btn btn-ghost adj-small-btn">&#215;</button>`;
    row.querySelector("button").addEventListener("click", () => row.remove());
    list.appendChild(row);
  });

  form.querySelector("#adj-apply-bulk").addEventListener("click", () => adjApplyBulk(form));
  section.appendChild(form);
  return section;
}

async function adjApplyBulk(form) {
  const namePrefix = form.querySelector("#adj-name-prefix").value;
  const description = form.querySelector("#adj-description").value;
  const imageBase = form.querySelector("#adj-image-base").value;
  const btn = form.querySelector("#adj-apply-bulk");
  const status = form.querySelector("#adj-bulk-status");

  const customFields = {};
  form.querySelectorAll(".adj-cf-row").forEach((row) => {
    const key = row.querySelector(".adj-cf-key").value.trim();
    const val = row.querySelector(".adj-cf-val").value;
    if (key) customFields[key] = val || null;
  });

  if (!window.confirm("Apply these field changes to all edition JSON files?")) return;

  btn.disabled = true;
  status.textContent = "Applying\u2026"; status.className = "adj-status";
  try {
    const result = await api("/api/metadata/bulk-fields" + buildQ("?"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namePrefix, description, imageBase, customFields }),
    });
    status.textContent = `Updated ${result.updated} files.`; status.className = "adj-status ok";
    metadataLoaded = false; rarityTabLoaded = false; suggestionsLoaded = false;
  } catch (e) {
    status.textContent = `Error: ${e.message}`; status.className = "adj-status err";
  } finally {
    btn.disabled = false;
    setTimeout(() => { status.textContent = ""; status.className = "adj-status"; }, 4000);
  }
}

// ── Section 3: Hidden Layers ──────────────────────────────────────────────────
function adjBuildHiddenLayerSection(traitTypes, rarity) {
  const section = el("div", "ra-section");
  section.innerHTML = `<div class="ra-section-title">Add Hidden Layer <span class="ra-subtitle">metadata-only trait with no corresponding image file</span></div>`;

  const form = el("div", "adj-hidden-form");
  form.innerHTML = `
    <div class="adj-field-row">
      <label class="adj-field-label">Trait type name</label>
      <input id="adj-hl-type" type="text" class="adj-text-short" placeholder="e.g. Rarity Tier" />
    </div>
    <div class="adj-field-row">
      <label class="adj-field-label">Assignment mode</label>
      <select id="adj-hl-mode" class="adj-select">
        <option value="simple">Same value for all NFTs</option>
        <option value="conditional">Conditional &mdash; if layer = value &rarr; assign</option>
      </select>
    </div>
    <div id="adj-hl-simple-wrap" class="adj-field-row">
      <label class="adj-field-label">Value</label>
      <input id="adj-hl-simple-val" type="text" class="adj-text-short" placeholder="e.g. Common" />
    </div>
    <div id="adj-hl-cond-wrap" class="hidden">
      <div class="adj-rules-header">
        Rules <span class="adj-field-hint">first matching rule wins</span>
        <button id="adj-hl-add-rule" class="btn btn-ghost adj-small-btn">+ Add rule</button>
      </div>
      <div id="adj-hl-rules"></div>
      <div class="adj-field-row" style="margin-top:4px">
        <label class="adj-field-label">Default value</label>
        <input id="adj-hl-default" type="text" class="adj-text-short" placeholder="value if no rule matches" />
        <span class="adj-field-hint">(blank = skip NFTs with no match)</span>
      </div>
    </div>
    <div class="adj-bulk-actions">
      <button id="adj-hl-apply" class="btn btn-primary">Apply to all editions</button>
      <span id="adj-hl-status" class="adj-status"></span>
    </div>`;

  const modeSelect = form.querySelector("#adj-hl-mode");
  const simpleWrap = form.querySelector("#adj-hl-simple-wrap");
  const condWrap = form.querySelector("#adj-hl-cond-wrap");
  modeSelect.addEventListener("change", () => {
    const cond = modeSelect.value === "conditional";
    simpleWrap.classList.toggle("hidden", cond);
    condWrap.classList.toggle("hidden", !cond);
  });

  form.querySelector("#adj-hl-add-rule").addEventListener("click", () =>
    adjAddRule(form.querySelector("#adj-hl-rules"), traitTypes, rarity)
  );
  form.querySelector("#adj-hl-apply").addEventListener("click", () => adjApplyHiddenLayer(form));
  section.appendChild(form);
  return section;
}

function adjAddRule(list, traitTypes, rarity) {
  const row = el("div", "adj-rule-row");
  const typeOpts = traitTypes.map(t => `<option value="${t}">${t}</option>`).join("");
  row.innerHTML = `
    <span class="adj-rule-lbl">If</span>
    <select class="adj-rule-type adj-select-sm">${typeOpts}</select>
    <span class="adj-rule-lbl">is</span>
    <select class="adj-rule-val adj-select-sm"><option value="">—</option></select>
    <span class="adj-rule-lbl">&rarr; assign</span>
    <input type="text" class="adj-rule-assign adj-text-short" placeholder="value" />
    <button class="btn btn-ghost adj-small-btn">&#215;</button>`;

  const typeSelect = row.querySelector(".adj-rule-type");
  const valSelect = row.querySelector(".adj-rule-val");
  function refreshValues() {
    const traits = rarity[typeSelect.value] || [];
    valSelect.innerHTML = traits.map(t => `<option value="${t.value}">${t.value}</option>`).join("");
  }
  typeSelect.addEventListener("change", refreshValues);
  refreshValues();
  row.querySelector("button").addEventListener("click", () => row.remove());
  list.appendChild(row);
}

async function adjApplyHiddenLayer(form) {
  const traitType = form.querySelector("#adj-hl-type").value.trim();
  if (!traitType) { alert("Enter a trait type name."); return; }

  const mode = form.querySelector("#adj-hl-mode").value;
  const btn = form.querySelector("#adj-hl-apply");
  const status = form.querySelector("#adj-hl-status");
  let rules = [];
  let defaultValue = null;

  if (mode === "simple") {
    const val = form.querySelector("#adj-hl-simple-val").value.trim();
    if (!val) { alert("Enter a value."); return; }
    rules = [{ matchTraitType: null, matchValue: null, assignValue: val }];
  } else {
    form.querySelectorAll(".adj-rule-row").forEach((row) => {
      const matchTraitType = row.querySelector(".adj-rule-type").value;
      const matchValue = row.querySelector(".adj-rule-val").value;
      const assignValue = row.querySelector(".adj-rule-assign").value.trim();
      if (matchTraitType && matchValue && assignValue) rules.push({ matchTraitType, matchValue, assignValue });
    });
    defaultValue = form.querySelector("#adj-hl-default").value.trim() || null;
    if (!rules.length && !defaultValue) { alert("Add at least one rule or a default value."); return; }
  }

  if (!window.confirm(`Add trait "${traitType}" to all edition JSON files?`)) return;

  btn.disabled = true; status.textContent = "Applying\u2026"; status.className = "adj-status";
  try {
    const result = await api("/api/metadata/hidden-layer" + buildQ("?"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traitType, rules, defaultValue }),
    });
    status.textContent = `Updated ${result.updated} files.`; status.className = "adj-status ok";
    metadataLoaded = false; rarityTabLoaded = false; suggestionsLoaded = false;
  } catch (e) {
    status.textContent = `Error: ${e.message}`; status.className = "adj-status err";
  } finally {
    btn.disabled = false;
    setTimeout(() => { status.textContent = ""; status.className = "adj-status"; }, 4000);
  }
}

// ── RANDOM TAB ────────────────────────────────────────────────────────────────
let randomLoaded = false;
let randomEditions = [];
let currentRandomEdition = null;
let randomCfgW = 0, randomCfgH = 0;

async function loadRandomTab() {
  const display = document.getElementById("random-display");
  const status = document.getElementById("random-status");
  const btn = document.getElementById("btn-random");

  display.innerHTML = `<div class="spinner"></div>`;
  try {
    const [files, cfgSettings] = await Promise.all([
      api("/api/images" + buildQ("?")),
      api("/api/config/settings").catch(() => ({})),
    ]);
    randomCfgW = cfgSettings.width || 0;
    randomCfgH = cfgSettings.height || 0;
    randomEditions = files
      .filter(f => f.endsWith(".png"))
      .map(f => parseInt(f))
      .filter(n => !isNaN(n));

    if (!randomEditions.length) {
      display.innerHTML = `<p class="empty">No collection generated yet.</p>`;
      status.textContent = "";
      return;
    }

    status.textContent = `${randomEditions.length} editions`;
    await showRandomNFT();
    randomLoaded = true;
  } catch (e) {
    display.innerHTML = `<p class="error">Failed to load: ${e.message}</p>`;
  }
}

async function showRandomNFT() {
  if (!randomEditions.length) return;
  const display = document.getElementById("random-display");

  let edition;
  if (randomEditions.length === 1) {
    edition = randomEditions[0];
  } else {
    do {
      edition = randomEditions[Math.floor(Math.random() * randomEditions.length)];
    } while (edition === currentRandomEdition);
  }
  currentRandomEdition = edition;

  display.innerHTML = `<div class="spinner"></div>`;
  try {
    const item = await api(`/api/metadata/${edition}${buildQ("?")}`);
    const attrs = (item.attributes || [])
      .map(a => `<div class="modal-attr"><span class="modal-attr-type">${esc(a.trait_type)}</span><span class="modal-attr-val">${esc(a.value)}</span></div>`)
      .join("");

    display.innerHTML = "";
    const inner = el("div", "random-inner");

    const imgEl = document.createElement("img");
    imgEl.src = `/api/images/${edition}.png${buildQ("?")}`;
    imgEl.alt = item.name || `#${edition}`;
    imgEl.title = "Click to open full size";
    imgEl.style.cursor = "pointer";
    if (randomCfgW) imgEl.style.maxWidth  = randomCfgW + "px";
    if (randomCfgH) imgEl.style.maxHeight = randomCfgH + "px";
    imgEl.addEventListener("click", () => window.open(imgEl.src, "_blank"));

    const metaEl = el("div", "random-meta");
    metaEl.innerHTML = `<h3 class="modal-name">${esc(item.name) || `#${edition}`}</h3><div class="modal-attrs">${attrs}</div>`;

    inner.appendChild(imgEl);
    inner.appendChild(metaEl);
    display.appendChild(inner);
  } catch (e) {
    display.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

document.getElementById("btn-random").addEventListener("click", showRandomNFT);

// ── TEST TAB ──────────────────────────────────────────────────────────────────
let testLoaded = false;
let testCfgW = 0, testCfgH = 0;
let currentTestSlot = null;

async function loadTestTab(activeSlot) {
  const display = document.getElementById("test-display");
  const history = document.getElementById("test-history");
  const status = document.getElementById("test-status");

  try {
    const [data, cfgSettings] = await Promise.all([
      api("/api/test/images"),
      api("/api/config/settings").catch(() => ({})),
    ]);
    testCfgW = cfgSettings.width || 0;
    testCfgH = cfgSettings.height || 0;

    const slots = (data.files || [])
      .filter(f => f.endsWith(".png"))
      .map(f => parseInt(f))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    status.textContent = slots.length ? `${slots.length} test NFT${slots.length !== 1 ? "s" : ""} stored` : "";

    // Determine which slot to display — prefer explicit param, then server mtime, then first
    const showSlot = activeSlot || data.latestSlot || slots[0];

    // Render thumbnail history strip
    history.innerHTML = "";
    if (slots.length) {
      slots.forEach(slot => {
        const thumb = el("div", "test-thumb");
        thumb.innerHTML = `<img src="/api/test/images/${slot}.png?t=${Date.now()}" alt="Test #${slot}" /><span>#${slot}</span>`;
        thumb.addEventListener("click", () => renderTestNFT(slot));
        history.appendChild(thumb);
      });
      await renderTestNFT(showSlot);
    } else {
      display.innerHTML = `<p class="empty">Click "Generate Test NFT" to create a quick preview.</p>`;
    }
    testLoaded = true;
  } catch (e) {
    display.innerHTML = `<p class="error">Failed to load: ${e.message}</p>`;
  }
}

async function renderTestNFT(slot) {
  const display = document.getElementById("test-display");
  const history = document.getElementById("test-history");
  currentTestSlot = slot;

  // Highlight active thumbnail
  history.querySelectorAll(".test-thumb").forEach(t => t.classList.remove("active"));
  const thumbs = history.querySelectorAll(".test-thumb");
  thumbs.forEach(t => {
    if (t.querySelector("span").textContent === `#${slot}`) t.classList.add("active");
  });

  display.innerHTML = `<div class="spinner"></div>`;
  try {
    const item = await api(`/api/test/metadata/${slot}`);
    const attrs = (item.attributes || [])
      .map(a => `<div class="modal-attr"><span class="modal-attr-type">${esc(a.trait_type)}</span><span class="modal-attr-val">${esc(a.value)}</span></div>`)
      .join("");

    display.innerHTML = "";
    const inner = el("div", "random-inner");

    const imgEl = document.createElement("img");
    imgEl.src = `/api/test/images/${slot}.png?t=${Date.now()}`;
    imgEl.alt = item.name || `Test #${slot}`;
    imgEl.title = "Click to open full size";
    imgEl.style.cursor = "pointer";
    if (testCfgW) imgEl.style.maxWidth = testCfgW + "px";
    if (testCfgH) imgEl.style.maxHeight = testCfgH + "px";
    imgEl.addEventListener("click", () => window.open(imgEl.src, "_blank"));

    const metaEl = el("div", "random-meta");
    metaEl.innerHTML = `<h3 class="modal-name">${esc(item.name) || `Test #${slot}`}</h3><div class="modal-attrs">${attrs}</div>`;

    inner.appendChild(imgEl);
    inner.appendChild(metaEl);
    display.appendChild(inner);
  } catch (e) {
    display.innerHTML = `<p class="error">${e.message}</p>`;
  }
}

document.getElementById("btn-test-generate").addEventListener("click", async () => {
  const btn = document.getElementById("btn-test-generate");
  const status = document.getElementById("test-status");
  const display = document.getElementById("test-display");

  btn.disabled = true;
  btn.textContent = "Generating\u2026";
  display.innerHTML = `<div class="spinner"></div>`;

  try {
    const result = await api("/api/generate/test", { method: "POST" });
    status.textContent = `Latest: slot #${result.slot}`;
    // Reload the full tab to refresh history + display the newly generated slot
    testLoaded = false;
    await loadTestTab(result.slot);
  } catch (e) {
    display.innerHTML = `<p class="error">${e.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate Test NFT";
  }
});

// ── COMPARISON TAB ────────────────────────────────────────────────────────────
let comparisonLoaded = false;
const CMP_COLORS = ["#316ac5", "#b04000", "#007000"];
const CMP_LABELS = ["Build 1", "Build 2", "Build 3"];

async function loadComparisonTab() {
  const body = document.getElementById("comparison-body");
  const badge = document.getElementById("comparison-status");
  body.innerHTML = `<div class="spinner"></div>`;

  try {
    // Fetch metadata + scores from all 3 builds in parallel
    const results = await Promise.all([1, 2, 3].map(async (b) => {
      try {
        const [meta, scores] = await Promise.all([
          api("/api/metadata?build=" + b),
          api("/api/rarity/scores?build=" + b),
        ]);
        return { build: b, meta, scores, has: meta.total > 0 };
      } catch (_) {
        return { build: b, meta: { items: [], rarity: {}, total: 0 }, scores: { scores: [], total: 0 }, has: false };
      }
    }));

    const active = results.filter(r => r.has);
    if (active.length < 2) {
      body.innerHTML = `<p class="empty">Need at least 2 builds with generated collections to compare. Currently ${active.length} build${active.length !== 1 ? "s" : ""} found.</p>`;
      badge.textContent = "";
      return;
    }

    badge.textContent = `Comparing ${active.length} builds`;
    body.innerHTML = "";

    // Section 1: Score Distribution Line Chart
    body.appendChild(cmpBuildScoreChart(active));

    // Section 2: Trait Presence Comparison
    body.appendChild(cmpBuildTraitPresence(active));

    // Section 3: Summary Stats Table
    body.appendChild(cmpBuildSummaryStats(active));
    comparisonLoaded = true;
  } catch (e) {
    body.innerHTML = `<p class="error">Failed to load: ${e.message}</p>`;
  }
}

document.getElementById("btn-comparison-refresh").addEventListener("click", () => {
  comparisonLoaded = false;
  loadComparisonTab();
});

function cmpBuildScoreChart(active) {
  const section = el("div", "ra-section");
  section.appendChild(el("div", "ra-section-title", "Rarity Score Distribution"));

  const chartWrap = el("div", "cmp-chart-wrap");

  // Build histogram buckets for each active build
  const BUCKETS = 20;
  let globalMin = Infinity, globalMax = -Infinity;
  active.forEach(r => {
    if (r.scores.scores.length) {
      const sArr = r.scores.scores;
      globalMin = Math.min(globalMin, sArr[sArr.length - 1].score);
      globalMax = Math.max(globalMax, sArr[0].score);
    }
  });
  if (globalMin === Infinity) { globalMin = 0; globalMax = 100; }
  const range = globalMax - globalMin || 1;

  const buildBuckets = active.map(r => {
    const buckets = Array(BUCKETS).fill(0);
    r.scores.scores.forEach(s => {
      const idx = Math.min(BUCKETS - 1, Math.floor(((s.score - globalMin) / range) * BUCKETS));
      buckets[idx]++;
    });
    // Normalize to percentages
    const total = r.scores.total || 1;
    return buckets.map(c => (c / total) * 100);
  });

  let maxPct = 0;
  buildBuckets.forEach(b => b.forEach(v => { if (v > maxPct) maxPct = v; }));
  if (maxPct === 0) maxPct = 1;

  // SVG dimensions
  const W = 600, H = 240, PAD_L = 40, PAD_R = 16, PAD_T = 16, PAD_B = 30;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="cmp-svg">`;

  // Grid lines
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = PAD_T + (plotH / yTicks) * i;
    const val = (maxPct * (1 - i / yTicks)).toFixed(1);
    svg += `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#d0d0d0" stroke-width="0.5"/>`;
    svg += `<text x="${PAD_L - 4}" y="${y + 3}" text-anchor="end" class="cmp-axis-label">${val}%</text>`;
  }

  // X axis labels
  const xStep = plotW / BUCKETS;
  for (let i = 0; i < BUCKETS; i += 4) {
    const x = PAD_L + i * xStep + xStep / 2;
    const label = Math.round(globalMin + (i / BUCKETS) * range);
    svg += `<text x="${x}" y="${H - 6}" text-anchor="middle" class="cmp-axis-label">${label}</text>`;
  }

  // Draw lines for each build
  buildBuckets.forEach((buckets, bi) => {
    const color = CMP_COLORS[active[bi].build - 1];
    let points = "";
    for (let i = 0; i < BUCKETS; i++) {
      const x = PAD_L + i * xStep + xStep / 2;
      const y = PAD_T + plotH - (buckets[i] / maxPct) * plotH;
      points += `${x},${y} `;
    }
    svg += `<polyline points="${points.trim()}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    // Dots at each point
    for (let i = 0; i < BUCKETS; i++) {
      const x = PAD_L + i * xStep + xStep / 2;
      const y = PAD_T + plotH - (buckets[i] / maxPct) * plotH;
      svg += `<circle cx="${x}" cy="${y}" r="2.5" fill="${color}"/>`;
    }
  });

  svg += `</svg>`;

  // Legend
  let legend = `<div class="cmp-legend">`;
  active.forEach(r => {
    const c = CMP_COLORS[r.build - 1];
    legend += `<span class="cmp-legend-item"><span class="cmp-legend-dot" style="background:${c}"></span>${CMP_LABELS[r.build - 1]} (${r.scores.total})</span>`;
  });
  legend += `</div>`;

  chartWrap.innerHTML = svg + legend;
  section.appendChild(chartWrap);
  return section;
}

function cmpBuildTraitPresence(active) {
  const section = el("div", "ra-section");
  section.appendChild(el("div", "ra-section-title", "Trait Distribution Comparison"));

  // Collect all layers across all builds
  const allLayers = new Set();
  active.forEach(r => Object.keys(r.meta.rarity).forEach(l => allLayers.add(l)));

  const content = el("div", "cmp-trait-content");

  allLayers.forEach(layer => {
    const group = el("div", "cmp-trait-group");
    group.appendChild(el("div", "ra-group-header", layer));

    // Collect all trait values across builds for this layer
    const allTraits = new Set();
    active.forEach(r => {
      (r.meta.rarity[layer] || []).forEach(t => allTraits.add(t.value));
    });

    allTraits.forEach(traitVal => {
      const row = el("div", "cmp-trait-row");
      const label = el("div", "cmp-trait-label");
      label.textContent = traitVal; // textContent is already safe
      label.title = traitVal;
      row.appendChild(label);

      const bars = el("div", "cmp-trait-bars");
      active.forEach(r => {
        const color = CMP_COLORS[r.build - 1];
        const traits = r.meta.rarity[layer] || [];
        const match = traits.find(t => t.value === traitVal);
        const pct = match ? parseFloat(match.pct) : 0;
        const bar = el("div", "cmp-bar-row");
        bar.innerHTML = `<span class="cmp-bar-build" style="color:${color}">${CMP_LABELS[r.build - 1][6] || r.build}</span><div class="cmp-bar-wrap"><div class="cmp-bar" style="width:${Math.min(pct, 100)}%;background:${color}"></div></div><span class="cmp-bar-pct">${pct.toFixed(1)}%</span>`;
        bars.appendChild(bar);
      });

      row.appendChild(bars);
      group.appendChild(row);
    });

    content.appendChild(group);
  });

  section.appendChild(content);
  return section;
}

function cmpBuildSummaryStats(active) {
  const section = el("div", "ra-section");
  section.appendChild(el("div", "ra-section-title", "Summary Statistics"));

  const table = el("div", "cmp-stats-table");
  // Header
  let headHtml = `<div class="cmp-stats-cell cmp-stats-label">Metric</div>`;
  active.forEach(r => {
    const c = CMP_COLORS[r.build - 1];
    headHtml += `<div class="cmp-stats-cell cmp-stats-head" style="color:${c}">${CMP_LABELS[r.build - 1]}</div>`;
  });
  const headRow = el("div", "cmp-stats-row cmp-stats-header");
  headRow.innerHTML = headHtml;
  table.appendChild(headRow);

  // Rows
  const metrics = [
    { label: "Total Editions", fn: r => r.meta.total },
    { label: "Unique Layers", fn: r => Object.keys(r.meta.rarity).length },
    { label: "Total Traits Used", fn: r => Object.values(r.meta.rarity).reduce((s, arr) => s + arr.length, 0) },
    { label: "Highest Score", fn: r => r.scores.scores.length ? r.scores.scores[0].score : "—" },
    { label: "Lowest Score", fn: r => r.scores.scores.length ? r.scores.scores[r.scores.scores.length - 1].score : "—" },
    { label: "Score Spread", fn: r => r.scores.scores.length >= 2 ? (r.scores.scores[0].score - r.scores.scores[r.scores.scores.length - 1].score).toFixed(0) : "—" },
  ];

  metrics.forEach(m => {
    const row = el("div", "cmp-stats-row");
    let html = `<div class="cmp-stats-cell cmp-stats-label">${m.label}</div>`;
    active.forEach(r => {
      html += `<div class="cmp-stats-cell">${m.fn(r)}</div>`;
    });
    row.innerHTML = html;
    table.appendChild(row);
  });

  section.appendChild(table);
  return section;
}

// ── Log Tab ───────────────────────────────────────────────────────────────────
let logLoaded = false;

async function loadLog() {
  const body = document.getElementById("log-body");
  body.innerHTML = `<p class="empty">Loading…</p>`;
  try {
    const entries = await api("/api/log");
    logLoaded = true;
    if (!entries.length) { body.innerHTML = `<p class="empty">No activity recorded yet.</p>`; return; }
    body.innerHTML = "";
    for (const { ts, msg } of entries) {
      const row = el("div", "log-entry");
      const d = new Date(ts);
      const tsStr = d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      row.innerHTML = `<span class="log-ts">${tsStr}</span><span class="log-msg">${esc(msg)}</span>`;
      body.appendChild(row);
    }
  } catch (e) {
    body.innerHTML = `<p class="error">Failed to load log: ${e.message}</p>`;
  }
}

document.getElementById("btn-log-refresh").addEventListener("click", () => {
  logLoaded = false;
  loadLog();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadGeneration();
