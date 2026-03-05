const express = require("express");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const app = express();
const PORT = 3000;
// APP_DIR = where app code lives (inside resources, read-only in packaged build)
// BASE    = where user data lives; priority: USER_DATA_DIR (chosen by user) →
//           PORTABLE_EXECUTABLE_DIR (folder containing .exe) → APP_DIR (dev fallback)
const APP_DIR = path.resolve(__dirname);
const BASE = process.env.USER_DATA_DIR
  ? path.resolve(process.env.USER_DATA_DIR)
  : process.env.PORTABLE_EXECUTABLE_DIR
    ? path.resolve(process.env.PORTABLE_EXECUTABLE_DIR)
    : APP_DIR;
const LAYERS_DIR = path.join(BASE, "layers");
const BUILD_DIR = path.join(BASE, "build");
const IMAGES_DIR = path.join(BUILD_DIR, "images");
const JSON_DIR = path.join(BUILD_DIR, "json");
const CONFIG_PATH = path.join(BASE, "src", "config.js");
const LOG_PATH = path.join(BASE, "activity.log");

function getBuildPaths(n) {
  const suffix = n > 1 ? `_${n}` : "";
  const bd = path.join(BASE, `build${suffix}`);
  return { buildDir: bd, imagesDir: path.join(bd, "images"), jsonDir: path.join(bd, "json") };
}

// ── Bootstrap: ensure required folders and default config exist ──────────────
[LAYERS_DIR, path.join(BASE, "src")].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
for (let b = 1; b <= 3; b++) {
  const { imagesDir, jsonDir } = getBuildPaths(b);
  [imagesDir, jsonDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}
const TEST_STORE = path.join(BASE, "test_store");
[path.join(TEST_STORE, "images"), path.join(TEST_STORE, "json")].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Seed groups.json into user data folder if not present
const GROUPS_INIT_PATH = path.join(BASE, "src", "groups.json");
if (!fs.existsSync(GROUPS_INIT_PATH)) {
  const srcGroups = path.join(APP_DIR, "src", "groups.json");
  if (fs.existsSync(srcGroups)) fs.copyFileSync(srcGroups, GROUPS_INIT_PATH);
  else fs.writeFileSync(GROUPS_INIT_PATH, "[]", "utf8");
}

if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, `const basePath = process.cwd();
const appDir = process.env.APP_DIR || basePath;
const { MODE } = require(\`\${appDir}/constants/blend_mode.js\`);
const { NETWORK } = require(\`\${appDir}/constants/network.js\`);

const network = NETWORK.eth;

const namePrefix = "My Collection";
const description = "";
const baseUri = "ipfs://REPLACE_WITH_CID";

const solanaMetadata = {
  symbol: "",
  seller_fee_basis_points: 500,
  external_url: "",
  creators: [
    {
      address: "REPLACE_WITH_SOLANA_ADDRESS",
      share: 100,
    },
  ],
};

const layerConfigurations = [
  {
    growEditionSizeTo: 10,
    layersOrder: [],
  },
];

const format = {
  width: 512,
  height: 512,
  smoothing: false,
};

const background = {
  generate: false,
  brightness: "100%",
  static: false,
  default: "#000000",
};

const rarityDelimiter = "#";
const maxCollisionRetries = 10000;
const shuffleEditions = false;
const debugLogs = false;
const extraMetadata = {};

module.exports = {
  network,
  namePrefix,
  description,
  baseUri,
  solanaMetadata,
  layerConfigurations,
  format,
  background,
  rarityDelimiter,
  maxCollisionRetries,
  shuffleEditions,
  debugLogs,
  extraMetadata,
};
`, "utf8");
}

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(APP_DIR, "public")));

// ── Config file mutex (serialise read-modify-write operations) ───────────────
let _configLock = Promise.resolve();
function withConfigLock(fn) {
  const prev = _configLock;
  let release;
  _configLock = new Promise(r => { release = r; });
  return prev.then(() => fn()).finally(release);
}

const LOG_MAX = 500;
function writeLog(msg) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), msg }) + "\n";
    fs.appendFileSync(LOG_PATH, line, "utf8");
    const lines = fs.readFileSync(LOG_PATH, "utf8").split("\n").filter(Boolean);
    if (lines.length > LOG_MAX) fs.writeFileSync(LOG_PATH, lines.slice(-LOG_MAX).join("\n") + "\n", "utf8");
  } catch (e) { /* non-fatal */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a path and assert it stays within the expected base directory.
 * Prevents path traversal attacks (e.g. folder = "../../etc").
 * Returns the resolved path, or throws if traversal detected.
 */
function safePath(base, ...segments) {
  const resolved = path.resolve(base, ...segments);
  if (!resolved.startsWith(path.resolve(base) + path.sep) && resolved !== path.resolve(base)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

// Read PNG width/height from the IHDR chunk (first 24 bytes) — no extra deps
function getPngDimensions(filePath) {
  try {
    const buf = Buffer.allocUnsafe(24);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    if (buf.toString("hex", 0, 4) !== "89504e47") return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch { return null; }
}

// Parse layersOrder from config.js text — avoids require() complications.
// Returns ordered array of folder name strings, or null if unparseable.
function getConfigLayerOrder() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const order = [];
    const seen = new Set();
    // Match each layersOrder: [ ... ] block (flat array, no nested brackets)
    const blockRe = /layersOrder\s*:\s*\[([\s\S]*?)\]/g;
    let block;
    while ((block = blockRe.exec(raw)) !== null) {
      // Extract every  name: "..."  or  name: '...'  inside the block
      const nameRe = /\bname\s*:\s*["'`]([^"'`]+)["'`]/g;
      let m;
      while ((m = nameRe.exec(block[1])) !== null) {
        if (!seen.has(m[1])) { seen.add(m[1]); order.push(m[1]); }
      }
    }
    return order.length ? order : null;
  } catch (_) {
    return null;
  }
}

// Rewrite the layersOrder block in config.js with a new ordered name list.
// Preserves each entry's original text (optional properties etc.) where possible.
function rewriteLayerOrder(newNames) {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const m = raw.match(/(layersOrder\s*:\s*\[)([\s\S]*?)(\])/);
  if (!m) throw new Error("layersOrder block not found in config");

  const innerLines = m[2].split('\n');

  // Map existing name → its original line (to preserve optional: {...} etc.)
  const origLines = {};
  innerLines.forEach(l => {
    const nm = l.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
    if (nm) origLines[nm[1]] = l;
  });

  // Detect indentation from the first existing entry line
  const sample = Object.values(origLines)[0] || '';
  const indent = sample.match(/^(\s*)/)?.[1] || '      ';

  // Build new entry lines
  const newEntryLines = newNames.map(name => {
    if (origLines[name]) return origLines[name].trimEnd().replace(/,?\s*$/, ',');
    return `${indent}{ name: "${name}" },`;
  });

  // Splice new entries in place of the old ones, preserving surrounding blank lines
  const firstIdx = innerLines.findIndex(l => /\bname\s*:/.test(l));
  const lastIdx  = innerLines.reduce((acc, l, i) => /\bname\s*:/.test(l) ? i : acc, -1);

  const newInner = firstIdx === -1
    ? '\n' + newEntryLines.join('\n') + '\n'
    : [...innerLines.slice(0, firstIdx), ...newEntryLines, ...innerLines.slice(lastIdx + 1)].join('\n');

  const newRaw = raw.slice(0, m.index) + m[1] + newInner + m[3] + raw.slice(m.index + m[0].length);
  fs.writeFileSync(CONFIG_PATH, newRaw, 'utf8');
}

// ── Activity Log ─────────────────────────────────────────────────────────────

app.get("/api/log", (req, res) => {
  try {
    const lines = fs.existsSync(LOG_PATH)
      ? fs.readFileSync(LOG_PATH, "utf8").split("\n").filter(Boolean)
      : [];
    const entries = lines.slice(-LOG_MAX)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .reverse();
    res.json(entries);
  } catch (e) { res.json([]); }
});

// ── Layers ──────────────────────────────────────────────────────────────────

// List all layer folders and their trait files with parsed weights
app.get("/api/layers", (req, res) => {
  if (!fs.existsSync(LAYERS_DIR)) return res.json([]);
  const folders = fs.readdirSync(LAYERS_DIR).filter((f) => {
    return fs.statSync(path.join(LAYERS_DIR, f)).isDirectory();
  });

  const layers = folders.map((folder) => {
    const folderPath = path.join(LAYERS_DIR, folder);
    const files = fs.readdirSync(folderPath).filter((f) => f.toLowerCase().endsWith(".png"));
    const traits = files.map((file) => {
      const base = file.slice(0, file.lastIndexOf("."));
      const parts = base.split("#");
      const name = parts[0].trim();
      const hasWeight = parts.length > 1;
      const weight = hasWeight ? parseFloat(parts[1]) : 1;
      const dims = getPngDimensions(path.join(folderPath, file));
      return { file, name, weight, hasWeight, w: dims ? dims.w : null, h: dims ? dims.h : null };
    });
    const totalWeight = traits.reduce((s, t) => s + t.weight, 0);
    traits.forEach((t) => {
      t.pct = totalWeight > 0 ? ((t.weight / totalWeight) * 100).toFixed(1) : "0.0";
    });
    return { folder, traits };
  });

  // Only show layers that are in the config; sort by config layersOrder
  const order = getConfigLayerOrder();
  const filtered = order ? layers.filter(l => order.includes(l.folder)) : layers;
  filtered.sort((a, b) => {
    const ai = order ? order.indexOf(a.folder) : 0;
    const bi = order ? order.indexOf(b.folder) : 0;
    return ai - bi;
  });

  res.json(filtered);
});

// Rename a trait file to update its weight
app.post("/api/layers/rename", (req, res) => {
  const { folder, file, weight, name } = req.body;
  if (!folder || !file || weight === undefined) return res.status(400).json({ error: "Missing params" });
  const w = parseFloat(weight);
  if (isNaN(w) || w <= 0) return res.status(400).json({ error: "Invalid weight" });

  try {
    const folderPath = safePath(LAYERS_DIR, folder);
    const oldPath = safePath(folderPath, file);
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: "File not found" });

    const namePart = (name && name.trim()) ? name.trim() : path.basename(file, ".png").split("#")[0].trim();
    const newFile = `${namePart}#${w}.png`;
    const newPath = safePath(folderPath, newFile);

    if (oldPath !== newPath) fs.renameSync(oldPath, newPath);
    writeLog(`Trait renamed in "${folder}": "${file}" → "${newFile}"`);
    res.json({ ok: true, file: newFile });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});

// Add a layer: create folder if absent, append to config layersOrder
// Read per-layer options (linkedTo, muted) from config
app.get("/api/layers/options", (req, res) => {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const m = raw.match(/layersOrder\s*:\s*\[([\s\S]*?)\]/);
  if (!m) return res.json({});
  const result = {};
  m[1].split("\n").forEach(line => {
    const nm = line.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
    if (!nm) return;
    const optsM = line.match(/\boptions\s*:\s*(\{[^}]*\})/);
    if (optsM) {
      try { result[nm[1]] = JSON.parse(optsM[1].replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"')); }
      catch (e) { console.error("Options parse error for", nm[1], e.message); result[nm[1]] = {}; }
    } else { result[nm[1]] = {}; }
  });
  res.json(result);
});

// Set per-layer options (linkedTo, muted) in config
app.post("/api/layers/set-options", (req, res) => {
  const { name, options } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  withConfigLock(() => {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const m = raw.match(/(layersOrder\s*:\s*\[)([\s\S]*?)(\])/);
    if (!m) throw new Error("layersOrder not found");
    const newInner = m[2].split("\n").map(line => {
      const nm = line.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
      if (!nm || nm[1] !== name) return line;
      const indent = line.match(/^(\s*)/)[1];
      const parts = [];
      if (options && options.linkedTo) parts.push(`linkedTo: "${options.linkedTo}"`);
      if (options && options.muted)    parts.push(`muted: true`);
      return parts.length
        ? `${indent}{ name: "${name}", options: { ${parts.join(", ")} } },`
        : `${indent}{ name: "${name}" },`;
    }).join("\n");
    fs.writeFileSync(CONFIG_PATH, raw.slice(0, m.index) + m[1] + newInner + m[3] + raw.slice(m.index + m[0].length), "utf8");
  }).then(() => { writeLog(`Layer options updated: "${name}" → ${JSON.stringify(options || {})}`); res.json({ ok: true }); }).catch(e => res.status(500).json({ error: e.message }));
});

// Auto-detect: add every subfolder in layers/ not already in layersOrder
app.post("/api/layers/auto-detect", (req, res) => {
  withConfigLock(() => {
    const current = getConfigLayerOrder() || [];
    const onDisk = fs.existsSync(LAYERS_DIR)
      ? fs.readdirSync(LAYERS_DIR).filter(f => fs.statSync(path.join(LAYERS_DIR, f)).isDirectory())
      : [];
    const toAdd = onDisk.filter(f => !current.includes(f));
    if (toAdd.length) rewriteLayerOrder([...current, ...toAdd]);
    return toAdd;
  }).then(toAdd => { if (toAdd.length) writeLog(`Layers auto-detected: ${toAdd.length} added (${toAdd.join(", ")})`); res.json({ ok: true, added: toAdd }); }).catch(e => res.status(500).json({ error: e.message }));
});

app.post("/api/layers/add", (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name required" });

  const folderPath = path.join(LAYERS_DIR, name);
  const folderCreated = !fs.existsSync(folderPath);
  if (folderCreated) fs.mkdirSync(folderPath, { recursive: true });

  withConfigLock(() => {
    const current = getConfigLayerOrder() || [];
    if (!current.includes(name)) rewriteLayerOrder([...current, name]);
  }).then(() => { writeLog(`Layer added: "${name}"${folderCreated ? " (new folder)" : " (existing folder)"}`); res.json({ ok: true, folderCreated }); }).catch(e => res.status(500).json({ error: e.message }));
});

// Remove a layer from config only (folder + assets untouched)
app.post("/api/layers/remove", (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name required" });

  withConfigLock(() => {
    const current = getConfigLayerOrder() || [];
    rewriteLayerOrder(current.filter(n => n !== name));
  }).then(() => { writeLog(`Layer removed from config: "${name}"`); res.json({ ok: true }); }).catch(e => res.status(500).json({ error: e.message }));
});

// Rename a layer folder on disk and update its name in layersOrder
app.post("/api/layers/rename-folder", (req, res) => {
  const oldName = (req.body.oldName || "").trim();
  const newName = (req.body.newName || "").trim();
  if (!oldName || !newName) return res.status(400).json({ error: "oldName and newName required" });
  if (oldName === newName) return res.json({ ok: true });

  let oldPath, newPath;
  try { oldPath = safePath(LAYERS_DIR, oldName); newPath = safePath(LAYERS_DIR, newName); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: "Folder not found" });
  if (fs.existsSync(newPath)) return res.status(400).json({ error: "A folder with that name already exists" });

  fs.renameSync(oldPath, newPath);

  // Replace the name only within the layersOrder block to avoid touching other config fields
  withConfigLock(() => {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const m = raw.match(/(layersOrder\s*:\s*\[)([\s\S]*?)(\])/);
    if (m) {
      const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const newInner = m[2].replace(
        new RegExp(`(\\bname\\s*:\\s*["'\`])${escaped}(["'\`])`, "g"),
        `$1${newName}$2`
      );
      const newRaw = raw.slice(0, m.index) + m[1] + newInner + m[3] + raw.slice(m.index + m[0].length);
      fs.writeFileSync(CONFIG_PATH, newRaw, "utf8");
    }
  }).then(() => { writeLog(`Layer renamed: "${oldName}" → "${newName}"`); res.json({ ok: true }); }).catch(e => res.status(500).json({ error: e.message }));
});

// Move a layer up or down in layersOrder
app.post("/api/layers/move", (req, res) => {
  const name = (req.body.name || "").trim();
  const direction = req.body.direction;
  if (!name || !direction) return res.status(400).json({ error: "Name and direction required" });

  withConfigLock(() => {
    const current = getConfigLayerOrder() || [];
    const idx = current.indexOf(name);
    if (idx === -1) throw new Error("Layer not in config");

    const next = [...current];
    if (direction === "up"   && idx > 0)                [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
    if (direction === "down" && idx < next.length - 1)  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    rewriteLayerOrder(next);
  }).then(() => { writeLog(`Layer moved ${direction}: "${name}"`); res.json({ ok: true }); }).catch(e => res.status(e.message === "Layer not in config" ? 404 : 500).json({ error: e.message }));
});

// Move a trait file to the trash folder (organised by layer)
app.post("/api/layers/trash", (req, res) => {
  const { folder, file } = req.body;
  if (!folder || !file) return res.status(400).json({ error: "Missing params" });
  try {
    const src = safePath(LAYERS_DIR, folder, file);
    if (!fs.existsSync(src)) return res.status(404).json({ error: "File not found" });
    const trashBase = path.join(BASE, "trash");
    const trashDir = safePath(trashBase, folder);
    if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
    // Avoid overwriting if a file with the same name already exists in trash
    let dest = path.join(trashDir, file);
    if (fs.existsSync(dest)) {
      const base = path.basename(file, ".png");
      dest = path.join(trashDir, `${base}_${Date.now()}.png`);
    }
    fs.renameSync(src, dest);
    writeLog(`Trait trashed: "${folder}/${file}"`);
    res.json({ ok: true });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});

// Upload images into a layer folder
app.post("/api/layers/:folder/upload", (req, res) => {
  let folderPath;
  try { folderPath = safePath(LAYERS_DIR, req.params.folder); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!fs.existsSync(folderPath)) return res.status(404).json({ error: "Layer folder not found" });
  const files = req.body.files;
  if (!Array.isArray(files) || !files.length) return res.status(400).json({ error: "No files provided" });
  const saved = [];
  for (const { name, base64 } of files) {
    if (!name || !base64) continue;
    const basePart = path.basename(name, path.extname(name)).replace(/[^a-zA-Z0-9 #._]/g, "_");
    const safeName = basePart + ".png";
    fs.writeFileSync(path.join(folderPath, safeName), Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64"));
    saved.push(safeName);
  }
  if (saved.length) writeLog(`Traits uploaded to "${req.params.folder}": ${saved.length} file(s)`);
  res.json({ ok: true, saved });
});

// Serve individual layer trait images
app.get("/api/layers/:folder/:file", (req, res) => {
  try {
    const filePath = safePath(LAYERS_DIR, req.params.folder, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.sendFile(filePath);
  } catch (e) { return res.status(400).json({ error: e.message }); }
});

// ── Build Images ─────────────────────────────────────────────────────────────

app.get("/api/images", (req, res) => {
  const { imagesDir } = getBuildPaths(parseInt(req.query.build) || 1);
  if (!fs.existsSync(imagesDir)) return res.json([]);
  const files = fs.readdirSync(imagesDir)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => parseInt(a) - parseInt(b));
  res.json(files);
});

app.get("/api/images/:file", (req, res) => {
  const { imagesDir } = getBuildPaths(parseInt(req.query.build) || 1);
  const filePath = path.join(imagesDir, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

app.post("/api/images/shuffle", (req, res) => {
  const { imagesDir, jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  if (!fs.existsSync(imagesDir) || !fs.existsSync(jsonDir)) {
    return res.status(400).json({ error: "No images to shuffle" });
  }

  const editions = fs.readdirSync(imagesDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => parseInt(f))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  if (editions.length < 2) {
    return res.status(400).json({ error: "Need at least 2 images to shuffle" });
  }

  // Fisher-Yates shuffle to produce a new ordering
  const shuffled = [...editions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  try {
    // Phase 1: move everything to temp names to avoid collisions
    for (const ed of editions) {
      const imgSrc = path.join(imagesDir, `${ed}.png`);
      if (fs.existsSync(imgSrc)) fs.renameSync(imgSrc, path.join(imagesDir, `__tmp_${ed}.png`));
      const jsonSrc = path.join(jsonDir, `${ed}.json`);
      if (fs.existsSync(jsonSrc)) fs.renameSync(jsonSrc, path.join(jsonDir, `__tmp_${ed}.json`));
    }

    // Phase 2: rename from temp to final, updating JSON fields
    // shuffled[i] = old edition that now becomes editions[i]
    shuffled.forEach((oldEd, i) => {
      const newEd = editions[i];

      const imgTmp = path.join(imagesDir, `__tmp_${oldEd}.png`);
      if (fs.existsSync(imgTmp)) fs.renameSync(imgTmp, path.join(imagesDir, `${newEd}.png`));

      const jsonTmp = path.join(jsonDir, `__tmp_${oldEd}.json`);
      if (fs.existsSync(jsonTmp)) {
        const data = JSON.parse(fs.readFileSync(jsonTmp, "utf8"));
        data.edition = newEd;
        if (typeof data.name === "string") data.name = data.name.replace(/#\d+$/, `#${newEd}`);
        if (typeof data.image === "string") {
          data.image = data.image.replace(new RegExp(`/${oldEd}\\.png$`), `/${newEd}.png`);
        }
        fs.writeFileSync(jsonTmp, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(jsonTmp, path.join(jsonDir, `${newEd}.json`));
      }
    });

    // Remove stale _metadata.json if present
    const metaAll = path.join(jsonDir, "_metadata.json");
    if (fs.existsSync(metaAll)) fs.unlinkSync(metaAll);

    writeLog(`Collection shuffled (Build ${parseInt(req.query.build) || 1}, ${editions.length} items)`);
    res.json({ ok: true, count: editions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/build", (req, res) => {
  const buildNum = parseInt(req.query.build) || 1;
  const { imagesDir, jsonDir } = getBuildPaths(buildNum);
  let deleted = 0;
  [imagesDir, jsonDir].forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(f => f.endsWith(".png") || f.endsWith(".json")).forEach(f => {
      fs.unlinkSync(path.join(dir, f));
      deleted++;
    });
  });
  writeLog(`Build ${buildNum} cleared (${deleted} file${deleted !== 1 ? "s" : ""} deleted)`);
  res.json({ ok: true, deleted });
});

// ── Adjust Metadata ───────────────────────────────────────────────────────────

// List edition numbers in [min..max] that are missing an image or JSON file
app.get("/api/edition/empty", (req, res) => {
  const { imagesDir, jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  const imgSet = fs.existsSync(imagesDir)
    ? new Set(fs.readdirSync(imagesDir).filter(f => /^\d+\.png$/.test(f)).map(f => parseInt(f)))
    : new Set();
  const jsonSet = fs.existsSync(jsonDir)
    ? new Set(fs.readdirSync(jsonDir).filter(f => /^\d+\.json$/.test(f)).map(f => parseInt(f)))
    : new Set();
  const all = new Set([...imgSet, ...jsonSet]);
  if (!all.size) return res.json([]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const empty = [];
  for (let i = min; i <= max; i++) {
    if (!imgSet.has(i) || !jsonSet.has(i)) {
      empty.push({ edition: i, hasImage: imgSet.has(i), hasJson: jsonSet.has(i) });
    }
  }
  res.json(empty);
});

// Delete an edition's image and JSON
app.delete("/api/edition/:id", (req, res) => {
  const { imagesDir, jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const imgPath = path.join(imagesDir, `${id}.png`);
  const jsonPath = path.join(jsonDir, `${id}.json`);
  if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  writeLog(`Edition deleted: #${id} (Build ${parseInt(req.query.build) || 1})`);
  res.json({ ok: true });
});

// Upload replacement image (base64-encoded)
app.post("/api/edition/:id/image", (req, res) => {
  const { imagesDir } = getBuildPaths(parseInt(req.query.build) || 1);
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { base64 } = req.body;
  if (!base64) return res.status(400).json({ error: "No image data" });
  fs.mkdirSync(imagesDir, { recursive: true });
  const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  fs.writeFileSync(path.join(imagesDir, `${id}.png`), buf);
  writeLog(`Edition image replaced: #${id} (Build ${parseInt(req.query.build) || 1})`);
  res.json({ ok: true });
});

// Upload replacement JSON
app.post("/api/edition/:id/json", (req, res) => {
  const { jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { data } = req.body;
  if (!data || typeof data !== "object") return res.status(400).json({ error: "Invalid JSON data" });
  fs.mkdirSync(jsonDir, { recursive: true });
  fs.writeFileSync(path.join(jsonDir, `${id}.json`), JSON.stringify(data, null, 2), "utf8");
  writeLog(`Edition metadata replaced: #${id} (Build ${parseInt(req.query.build) || 1})`);
  res.json({ ok: true });
});

// Bulk-edit text fields across all JSON files
app.post("/api/metadata/bulk-fields", (req, res) => {
  const { jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  if (!fs.existsSync(jsonDir)) return res.status(400).json({ error: "No metadata" });
  const { namePrefix, description, imageBase, customFields } = req.body;
  const files = fs.readdirSync(jsonDir).filter(f => /^\d+\.json$/.test(f));
  let updated = 0;
  for (const file of files) {
    try {
      const fp = path.join(jsonDir, file);
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (namePrefix !== undefined && namePrefix !== null) {
        const m = (data.name || "").match(/#(\d+)$/);
        data.name = m ? `${namePrefix}#${m[1]}` : `${namePrefix}${data.name || ""}`;
      }
      if (description !== undefined && description !== null) data.description = description;
      if (imageBase !== undefined && imageBase !== null) {
        data.image = `${imageBase}/${data.edition}.png`;
      }
      if (customFields && typeof customFields === "object") {
        for (const [k, v] of Object.entries(customFields)) {
          if (v === null || v === "") delete data[k]; else data[k] = v;
        }
      }
      fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
      updated++;
    } catch (e) { console.error("Skipped file:", e.message); }
  }
  writeLog(`Metadata fields bulk-updated (Build ${parseInt(req.query.build) || 1}, ${updated} item(s))`);
  res.json({ ok: true, updated });
});

// Add / replace a hidden (metadata-only) trait across all JSON files
// rules: [{ matchTraitType, matchValue, assignValue }] — first match wins
app.post("/api/metadata/hidden-layer", (req, res) => {
  const { jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  if (!fs.existsSync(jsonDir)) return res.status(400).json({ error: "No metadata" });
  const { traitType, rules, defaultValue } = req.body;
  if (!traitType) return res.status(400).json({ error: "traitType required" });
  const files = fs.readdirSync(jsonDir).filter(f => /^\d+\.json$/.test(f));
  let updated = 0;
  for (const file of files) {
    try {
      const fp = path.join(jsonDir, file);
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      let value = defaultValue || null;
      if (rules && rules.length) {
        for (const rule of rules) {
          if (!rule.matchTraitType) { value = rule.assignValue; break; }
          const hit = (data.attributes || []).find(
            a => a.trait_type === rule.matchTraitType && a.value === rule.matchValue
          );
          if (hit) { value = rule.assignValue; break; }
        }
      }
      if (value !== null) {
        data.attributes = (data.attributes || []).filter(a => a.trait_type !== traitType);
        data.attributes.push({ trait_type: traitType, value });
        fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
        updated++;
      }
    } catch (e) { console.error("Skipped file:", e.message); }
  }
  writeLog(`Hidden layer trait "${traitType}" applied (Build ${parseInt(req.query.build) || 1}, ${updated} updated)`);
  res.json({ ok: true, updated });
});

// ── Metadata ─────────────────────────────────────────────────────────────────

// Returns all metadata + computed rarity stats
app.get("/api/metadata", (req, res) => {
  const { jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  if (!fs.existsSync(jsonDir)) return res.json({ items: [], rarity: {} });

  const files = fs.readdirSync(jsonDir)
    .filter((f) => f.endsWith(".json") && f !== "_metadata.json")
    .sort((a, b) => parseInt(a) - parseInt(b));

  const items = [];
  const traitCounts = {}; // { "Layer:Value": count }
  const layerTotals = {};  // { "Layer": total count (editions that have a value) }

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(jsonDir, file), "utf8"));
      items.push(data);
      (data.attributes || []).forEach(({ trait_type, value }) => {
        const key = `${trait_type}::${value}`;
        traitCounts[key] = (traitCounts[key] || 0) + 1;
        layerTotals[trait_type] = (layerTotals[trait_type] || 0) + 1;
      });
    } catch (e) { console.error("Skipped file:", e.message); }
  }

  // Build rarity map grouped by trait_type
  const rarity = {};
  for (const [key, count] of Object.entries(traitCounts)) {
    const sep = key.indexOf("::");
    const trait_type = key.slice(0, sep);
    const value = key.slice(sep + 2);
    if (!rarity[trait_type]) rarity[trait_type] = [];
    rarity[trait_type].push({ value, count, pct: ((count / items.length) * 100).toFixed(2) });
  }
  // Sort each layer's traits by count desc
  for (const layer of Object.keys(rarity)) {
    rarity[layer].sort((a, b) => b.count - a.count);
  }

  res.json({ items, rarity, total: items.length });
});

// Single metadata item
app.get("/api/metadata/:id", (req, res) => {
  const { jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  const filePath = path.join(jsonDir, `${req.params.id}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  res.json(JSON.parse(fs.readFileSync(filePath, "utf8")));
});

// ── Rarity Scores ─────────────────────────────────────────────────────────

app.get("/api/rarity/scores", (req, res) => {
  const { jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  if (!fs.existsSync(jsonDir)) return res.json({ scores: [], total: 0 });

  const files = fs.readdirSync(jsonDir)
    .filter(f => f.endsWith(".json") && f !== "_metadata.json")
    .sort((a, b) => parseInt(a) - parseInt(b));

  const items = [];
  const traitCounts = {};

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(jsonDir, file), "utf8"));
      items.push(data);
      (data.attributes || []).forEach(({ trait_type, value }) => {
        const key = `${trait_type}::${value}`;
        traitCounts[key] = (traitCounts[key] || 0) + 1;
      });
    } catch (e) { console.error("Skipped file:", e.message); }
  }

  const total = items.length;
  if (!total) return res.json({ scores: [], total: 0 });

  const scores = items.map(item => {
    let score = 0;
    (item.attributes || []).forEach(({ trait_type, value }) => {
      const key = `${trait_type}::${value}`;
      const count = traitCounts[key] || 1;
      score += total / count;
    });
    return { edition: item.edition, name: item.name, score: parseFloat(score.toFixed(2)) };
  });

  scores.sort((a, b) => b.score - a.score);
  res.json({ scores, total });
});

// ── Similar NFTs ──────────────────────────────────────────────────────────

app.get("/api/similar", (req, res) => {
  const { jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  if (!fs.existsSync(jsonDir)) return res.json([]);

  const threshold = Math.min(100, Math.max(0, parseFloat(req.query.threshold) || 75)) / 100;

  const files = fs.readdirSync(jsonDir)
    .filter(f => f.endsWith(".json") && f !== "_metadata.json")
    .sort((a, b) => parseInt(a) - parseInt(b));

  const items = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(jsonDir, file), "utf8"));
      items.push(data);
    } catch (e) { console.error("Skipped file:", e.message); }
  }

  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const mapA = new Map((a.attributes || []).map(x => [x.trait_type, x.value]));
      const mapB = new Map((b.attributes || []).map(x => [x.trait_type, x.value]));
      const allTraits = new Set([...mapA.keys(), ...mapB.keys()]);
      let shared = 0;
      const sharedList = [];
      const diffList = [];
      for (const trait of allTraits) {
        if (mapA.get(trait) === mapB.get(trait)) {
          shared++;
          sharedList.push({ trait_type: trait, value: mapA.get(trait) });
        } else {
          diffList.push({ trait_type: trait, valueA: mapA.get(trait), valueB: mapB.get(trait) });
        }
      }
      const similarity = allTraits.size > 0 ? shared / allTraits.size : 0;
      if (similarity >= threshold) {
        pairs.push({
          a: { edition: a.edition, name: a.name },
          b: { edition: b.edition, name: b.name },
          similarity: parseFloat((similarity * 100).toFixed(1)),
          sharedCount: shared,
          totalTraits: allTraits.size,
          sharedList,
          diffList,
        });
      }
    }
  }

  pairs.sort((a, b) => b.similarity - a.similarity);
  res.json(pairs);
});

// ── Grouping (trait influence rules) ─────────────────────────────────────────

const GROUPS_PATH = path.join(BASE, "src", "groups.json");

app.get("/api/groups", (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"))); }
  catch (e) { if (e.code !== "ENOENT") console.error("Groups read error:", e.message); res.json([]); }
});

app.post("/api/groups", (req, res) => {
  const rules = req.body;
  if (!Array.isArray(rules)) return res.status(400).json({ error: "Expected array" });
  fs.writeFileSync(GROUPS_PATH, JSON.stringify(rules, null, 2), "utf8");
  writeLog(`Trait groups saved (${rules.length} rule${rules.length !== 1 ? "s" : ""})`);
  res.json({ ok: true });
});

// ── Config ───────────────────────────────────────────────────────────────────

app.get("/api/config", (req, res) => {
  if (!fs.existsSync(CONFIG_PATH)) return res.status(404).json({ error: "Config not found" });
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  res.json({ raw });
});

app.post("/api/config", (req, res) => {
  const { raw } = req.body;
  if (typeof raw !== "string") return res.status(400).json({ error: "Missing raw" });
  if (!raw.includes("module.exports")) {
    return res.status(400).json({ error: "Config must contain module.exports" });
  }
  withConfigLock(() => {
    fs.writeFileSync(CONFIG_PATH, raw, "utf8");
  }).then(() => { writeLog("Config saved manually"); res.json({ ok: true }); }).catch(e => res.status(500).json({ error: e.message }));
});

// Read/write individual config fields used by the Generate tab
app.get("/api/config/settings", (req, res) => {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const str = (pat) => { const m = raw.match(pat); return m ? m[1] : ""; };
  const num = (pat) => { const m = raw.match(pat); return m ? parseInt(m[1]) : 0; };
  res.json({
    namePrefix:        str(/const namePrefix\s*=\s*["'`]([^"'`]*)["'`]/),
    description:       str(/const description\s*=\s*["'`]([^"'`]*)["'`]/),
    growEditionSizeTo: num(/growEditionSizeTo\s*:\s*(\d+)/),
    width:             num(/\bwidth\s*:\s*(\d+)/),
    height:            num(/\bheight\s*:\s*(\d+)/),
    network:           str(/const network\s*=\s*NETWORK\.(\w+)/),
    symbol:            str(/\bsymbol\s*:\s*["'`]([^"'`]*)["'`]/),
    sellerFee:         num(/seller_fee_basis_points\s*:\s*(\d+)/),
    externalUrl:       str(/external_url\s*:\s*["'`]([^"'`]*)["'`]/),
    creatorAddress:    str(/address\s*:\s*["'`]([^"'`]*)["'`]/),
    creatorShare:      num(/\bshare\s*:\s*(\d+)/),
  });
});

app.post("/api/config/settings", (req, res) => {
  withConfigLock(() => {
    let raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const { namePrefix, description, growEditionSizeTo, width, height, network, symbol, sellerFee, externalUrl, creatorAddress, creatorShare } = req.body;
    if (namePrefix        !== undefined) raw = raw.replace(/(const namePrefix\s*=\s*["'`])[^"'`]*(["'`])/, `$1${namePrefix}$2`);
    if (description       !== undefined) raw = raw.replace(/(const description\s*=\s*["'`])[^"'`]*(["'`])/, `$1${description}$2`);
    if (growEditionSizeTo !== undefined) raw = raw.replace(/(growEditionSizeTo\s*:\s*)\d+/, `$1${parseInt(growEditionSizeTo)}`);
    if (width             !== undefined) raw = raw.replace(/(\bwidth\s*:\s*)\d+/, `$1${parseInt(width)}`);
    if (height            !== undefined) raw = raw.replace(/(\bheight\s*:\s*)\d+/, `$1${parseInt(height)}`);
    if (network           !== undefined) raw = raw.replace(/(const network\s*=\s*NETWORK\.)\w+/, `$1${network}`);
    if (symbol            !== undefined) raw = raw.replace(/(\bsymbol\s*:\s*["'`])[^"'`]*(["'`])/, `$1${symbol}$2`);
    if (sellerFee         !== undefined) raw = raw.replace(/(seller_fee_basis_points\s*:\s*)\d+/, `$1${parseInt(sellerFee)}`);
    if (externalUrl       !== undefined) raw = raw.replace(/(external_url\s*:\s*["'`])[^"'`]*(["'`])/, `$1${externalUrl}$2`);
    if (creatorAddress    !== undefined) raw = raw.replace(/(address\s*:\s*["'`])[^"'`]*(["'`])/, `$1${creatorAddress}$2`);
    if (creatorShare      !== undefined) raw = raw.replace(/(\bshare\s*:\s*)\d+/, `$1${parseInt(creatorShare)}`);
    fs.writeFileSync(CONFIG_PATH, raw, "utf8");
  }).then(() => { writeLog("Collection settings updated"); res.json({ ok: true }); }).catch(e => res.status(500).json({ error: e.message }));
});

// ── Generation ───────────────────────────────────────────────────────────────

let generating = false;
let generateLog = [];
let generateProc = null;
let wasStopped = false;

// Fix consecutive trait runs by swapping "inner" editions with far-away non-run editions
app.post("/api/collection/fix-consecutive", (req, res) => {
  const { imagesDir, jsonDir } = getBuildPaths(parseInt(req.query.build) || 1);
  if (!fs.existsSync(jsonDir)) return res.status(404).json({ error: "No metadata found. Run Generate first." });
  const jsonFiles = fs.readdirSync(jsonDir).filter(f => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  if (!jsonFiles.length) return res.status(404).json({ error: "No metadata found. Run Generate first." });
  const items = jsonFiles.map(f => { try { return JSON.parse(fs.readFileSync(path.join(jsonDir, f), "utf8")); } catch (e) { return null; } }).filter(Boolean);
  const sorted = [...items].sort((a, b) => a.edition - b.edition);
  const allEditions = sorted.map(e => e.edition);

  const { editionsToMove = [], runEditions = [], traitType, traitValue, omitValues = [] } = req.body;
  if (!editionsToMove.length) return res.json({ swapped: 0, pairs: [], failed: [] });
  const omitSet = new Set(omitValues.map(v => String(v).toLowerCase()));

  // Build trait map: edition number -> value for the relevant traitType
  const traitMap = {};
  for (const item of sorted) {
    for (const attr of (item.attributes || [])) {
      if (attr.trait_type === traitType) { traitMap[item.edition] = attr.value; break; }
    }
  }

  // Build edition index for fast neighbour lookup
  const editionIndex = {};
  allEditions.forEach((e, i) => { editionIndex[e] = i; });

  // available excludes the entire run (anchor + inner) to prevent no-op swaps
  const runSet = new Set(runEditions.length ? runEditions : editionsToMove);
  const available = allEditions.filter(e => !runSet.has(e));

  const swaps = [];
  const failed = [];
  const usedTargets = new Set();

  for (const problem of editionsToMove) {
    let best = null, validCount = 0;
    for (const t of available) {
      if (usedTargets.has(t)) continue;
      // Target must have a different trait value (otherwise swap is a no-op)
      if (traitMap[t] === traitValue) continue;
      // Placing traitValue at target's position must not create a new consecutive run.
      const idx = editionIndex[t];
      const prevVal = idx > 0 ? traitMap[allEditions[idx - 1]] : null;
      const nextVal = idx < allEditions.length - 1 ? traitMap[allEditions[idx + 1]] : null;
      if (prevVal === traitValue || nextVal === traitValue) continue;
      // Reservoir sampling: pick uniformly at random from all valid targets
      // so the same edition (e.g. the last) isn't always chosen.
      validCount++;
      if (Math.random() < 1 / validCount) best = t;
    }

    if (best !== null) {
      swaps.push([problem, best]);
      usedTargets.add(best);
      // Update traitMap so subsequent iterations reflect this swap
      const tmp = traitMap[problem];
      traitMap[problem] = traitMap[best];
      traitMap[best] = tmp;
    } else {
      const remaining = available.filter(t => !usedTargets.has(t));
      let reason;
      if (!remaining.length) {
        reason = "No available editions to swap with.";
      } else if (remaining.every(t => traitMap[t] === traitValue)) {
        reason = `All other editions also have "${traitValue}" — cannot avoid consecutive repeats.`;
      } else {
        reason = "No suitable position found that wouldn't create a new consecutive repeat.";
      }
      failed.push({ edition: problem, reason });
    }
  }

  // Perform file swaps
  for (const [a, b] of swaps) {
    const imgA = path.join(imagesDir, `${a}.png`);
    const imgB = path.join(imagesDir, `${b}.png`);
    if (fs.existsSync(imgA) && fs.existsSync(imgB)) {
      const tmp = path.join(imagesDir, `__swap_tmp.png`);
      fs.renameSync(imgA, tmp);
      fs.renameSync(imgB, imgA);
      fs.renameSync(tmp, imgB);
    }

    const jsonA = path.join(jsonDir, `${a}.json`);
    const jsonB = path.join(jsonDir, `${b}.json`);
    if (fs.existsSync(jsonA) && fs.existsSync(jsonB)) {
      const dataA = JSON.parse(fs.readFileSync(jsonA, "utf8"));
      const dataB = JSON.parse(fs.readFileSync(jsonB, "utf8"));

      dataA.edition = b;
      if (dataA.name) dataA.name = dataA.name.replace(/#\d+$/, `#${b}`);
      if (dataA.image) dataA.image = dataA.image.replace(/\/\d+\.png$/, `/${b}.png`);

      dataB.edition = a;
      if (dataB.name) dataB.name = dataB.name.replace(/#\d+$/, `#${a}`);
      if (dataB.image) dataB.image = dataB.image.replace(/\/\d+\.png$/, `/${a}.png`);

      fs.writeFileSync(jsonA, JSON.stringify(dataB, null, 2));
      fs.writeFileSync(jsonB, JSON.stringify(dataA, null, 2));
    }
  }

  // Rewrite _metadata.json from updated individual files (only if it already existed)
  const metaPath = path.join(jsonDir, "_metadata.json");
  if (fs.existsSync(metaPath)) {
    const rebuilt = allEditions
      .map(n => { const f = path.join(jsonDir, `${n}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; })
      .filter(Boolean);
    fs.writeFileSync(metaPath, JSON.stringify(rebuilt, null, 2));
  }

  if (swaps.length) writeLog(`Fixed consecutive traits (Build ${parseInt(req.query.build) || 1}): ${swaps.length} swap(s) for trait "${traitType}"`);
  res.json({ swapped: swaps.length, pairs: swaps.map(([from, to]) => ({ from, to })), failed });
});

app.get("/api/generate/status", (req, res) => {
  res.json({ generating, log: generateLog, stopped: wasStopped });
});

app.post("/api/generate/stop", (req, res) => {
  if (generateProc) { generateProc.kill(); wasStopped = true; writeLog("Generation stopped by user"); }
  res.json({ ok: true });
});

app.post("/api/generate", (req, res) => {
  if (generating || testGenerating) return res.status(409).json({ error: "Already generating" });

  // Pre-flight: make sure at least one layer is configured
  const configuredLayers = getConfigLayerOrder();
  if (!configuredLayers || configuredLayers.length === 0) {
    return res.status(400).json({
      error: "No layers configured. Go to the Layers tab, add your layer folders, then generate."
    });
  }

  const buildNum = parseInt(req.query.build) || 1;
  generating = true;
  wasStopped = false;
  generateLog = [];
  writeLog(`Collection generation started (Build ${buildNum})`);
  res.json({ ok: true, message: "Generation started" });

  generateProc = execFile(process.execPath, [path.join(APP_DIR, "index.js")], { cwd: BASE, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", APP_DIR, BUILD_NUM: String(buildNum) } }, (err) => {
    generating = false;
    generateProc = null;
    if (err && !wasStopped) generateLog.push(`ERROR: ${err.message}`);
  });

  generateProc.stdout.on("data", (d) => {
    generateLog.push(...d.toString().split("\n").filter(Boolean));
  });
  generateProc.stderr.on("data", (d) => {
    generateLog.push(...d.toString().split("\n").filter(Boolean).map((l) => `ERR: ${l}`));
  });
});

// ── Test Generation ──────────────────────────────────────────────────────────

let testGenerating = false;
let testSlot = 0; // 0-4, rotating FIFO

app.post("/api/generate/test", (req, res) => {
  if (generating || testGenerating) return res.status(409).json({ error: "Already generating" });

  // Pre-flight: make sure at least one layer is configured
  const configuredLayersTest = getConfigLayerOrder();
  if (!configuredLayersTest || configuredLayersTest.length === 0) {
    return res.status(400).json({
      error: "No layers configured. Go to the Layers tab, add your layer folders, then test."
    });
  }

  testGenerating = true;

  execFile(process.execPath, [path.join(APP_DIR, "index.js")], { cwd: BASE, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", APP_DIR, TEST_MODE: "1" }, timeout: 60000 }, (err) => {
    testGenerating = false;
    if (err) return res.status(500).json({ error: err.killed ? "Generation timed out (60s)" : err.message });

    // Copy engine output from test/ to test_store/ with rotating slot
    // Edition index is 0 for Solana, 1 for Ethereum — scan instead of hardcoding
    testSlot = (testSlot % 5) + 1; // 1-5
    const testImgDir  = path.join(BASE, "test", "images");
    const testJsonDir = path.join(BASE, "test", "json");
    const imgFiles  = fs.existsSync(testImgDir)  ? fs.readdirSync(testImgDir).filter(f  => /^\d+\.png$/.test(f))  : [];
    const jsonFiles = fs.existsSync(testJsonDir) ? fs.readdirSync(testJsonDir).filter(f => /^\d+\.json$/.test(f)) : [];
    const srcImg  = imgFiles.length  ? path.join(testImgDir,  imgFiles[0])  : null;
    const srcJson = jsonFiles.length ? path.join(testJsonDir, jsonFiles[0]) : null;
    const dstImg = path.join(TEST_STORE, "images", `${testSlot}.png`);
    const dstJson = path.join(TEST_STORE, "json", `${testSlot}.json`);

    try {
      if (srcImg  && fs.existsSync(srcImg))  fs.copyFileSync(srcImg,  dstImg);
      if (srcJson && fs.existsSync(srcJson)) fs.copyFileSync(srcJson, dstJson);
    } catch (e) { console.error("Skipped file:", e.message); }

    writeLog("Test NFT generated");
    res.json({ ok: true, slot: testSlot });
  });
});

app.get("/api/test/status", (req, res) => {
  res.json({ generating: testGenerating });
});

app.get("/api/test/images", (req, res) => {
  const dir = path.join(TEST_STORE, "images");
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort();
    let latestSlot = null, latestTime = 0;
    files.forEach(f => {
      const mt = fs.statSync(path.join(dir, f)).mtimeMs;
      if (mt > latestTime) { latestTime = mt; latestSlot = parseInt(f); }
    });
    res.json({ files, latestSlot });
  } catch (e) { if (e.code !== "ENOENT") console.error("Test images read error:", e.message); res.json({ files: [], latestSlot: null }); }
});

app.get("/api/test/images/:file", (req, res) => {
  const fp = path.join(TEST_STORE, "images", path.basename(req.params.file));
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });
  res.sendFile(fp);
});

app.get("/api/test/metadata/:id", (req, res) => {
  let fp;
  try { fp = safePath(path.join(TEST_STORE, "json"), `${req.params.id}.json`); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });
  try { res.json(JSON.parse(fs.readFileSync(fp, "utf8"))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Settings (project folder) ─────────────────────────────────────────────────

let _changeFolderCallback = null;
let _openFolderCallback   = null;

/** Called by main.js to register the Electron folder-picker dialog handler. */
function onChangeFolderRequest(cb) { _changeFolderCallback = cb; }

/** Called by main.js to register the shell.openPath (Explorer/Finder) handler. */
function onOpenFolderRequest(cb)  { _openFolderCallback = cb; }

/** Return current project folder path. */
app.get("/api/settings", (req, res) => {
  res.json({ projectFolder: BASE });
});

/** Ask main.js to show a folder-picker dialog, then relaunch into the new folder. */
app.post("/api/settings/change-folder", async (req, res) => {
  if (!_changeFolderCallback) {
    return res.status(503).json({ error: "Folder picker not available in this mode" });
  }
  try {
    const ok = await _changeFolderCallback();
    res.json({ ok: !!ok });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Ask main.js to open the project folder in Explorer / Finder. */
app.post("/api/settings/open-folder", async (req, res) => {
  if (!_openFolderCallback) {
    return res.status(503).json({ error: "Open folder not available in this mode" });
  }
  try {
    await _openFolderCallback();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Tojiba NFT Compositor 2 UI running at http://localhost:${PORT}`);
  });
}

module.exports = { app, PORT, onChangeFolderRequest, onOpenFolderRequest };
