const basePath = process.cwd();
const appDir = process.env.APP_DIR || basePath;
const fs = require("fs");
const sha1 = require("sha1");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { NETWORK } = require(`${appDir}/constants/network.js`);

const {
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
} = require(`${basePath}/src/config.js`);

const _bn = parseInt(process.env.BUILD_NUM) || 1;
const testMode = process.env.TEST_MODE === "1";
const buildDir = testMode ? `${basePath}/test` : `${basePath}/build${_bn > 1 ? `_${_bn}` : ""}`;
const layersDir = `${basePath}/layers`;

const canvas = createCanvas(format.width, format.height);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = format.smoothing;

const DNA_DELIMITER = "-";

// Load trait influence rules (created via the Grouping tab in the UI)
let traitInfluences = [];
try { traitInfluences = JSON.parse(fs.readFileSync(`${basePath}/src/groups.json`, "utf8")); } catch { traitInfluences = []; }

// ---------------------------------------------------------------------------
//  Tracking state
// ---------------------------------------------------------------------------
let metadataList = [];
let dnaList = new Set();

// Per-layer trait occurrence counters — tracks how many times each trait has
// been selected across the entire generation run so we can bias AGAINST
// over-represented traits in real time.
let traitCounters = {};

// ---------------------------------------------------------------------------
//  Build directory setup
// ---------------------------------------------------------------------------
const buildSetup = () => {
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  fs.mkdirSync(buildDir);
  fs.mkdirSync(`${buildDir}/json`);
  fs.mkdirSync(`${buildDir}/images`);
};

// ---------------------------------------------------------------------------
//  Filename parsing helpers
// ---------------------------------------------------------------------------
const parseWeight = (filename) => {
  const nameNoExt = filename.slice(0, -4);
  const weight = Number(nameNoExt.split(rarityDelimiter).pop());
  return isNaN(weight) ? 1 : weight;
};

const parseName = (filename) => {
  const nameNoExt = filename.slice(0, -4);
  return nameNoExt.split(rarityDelimiter).shift();
};

// ---------------------------------------------------------------------------
//  Layer / element loading
// ---------------------------------------------------------------------------
const getElements = (dirPath) => {
  return fs
    .readdirSync(dirPath)
    .filter((f) => !/(^|\/)\.[^/.]/g.test(f))
    .map((filename, index) => {
      if (filename.includes("-")) {
        throw new Error(
          `Layer filenames must not contain dashes: "${filename}"`
        );
      }
      return {
        id: index,
        name: parseName(filename),
        filename,
        path: `${dirPath}${filename}`,
        weight: parseWeight(filename),
      };
    });
};

const setupLayers = (layersOrder) => {
  return layersOrder.map((layerObj, index) => {
    const opts = layerObj.options || {};
    return {
      id: index,
      elements: getElements(`${layersDir}/${layerObj.name}/`),
      folderName: layerObj.name,               // raw folder name — used for linkedTo references
      name: opts.displayName || layerObj.name,
      blend: opts.blend || "source-over",
      opacity: opts.opacity !== undefined ? opts.opacity : 1,
      bypassDNA: !!opts.bypassDNA,
      optional: opts.optional || null, // { weight: N } or null
      linkedTo: opts.linkedTo || null, // folder name of the source layer this layer mirrors
      muted: !!opts.muted,             // if true, layer renders but is excluded from metadata
    };
  });
};

// ---------------------------------------------------------------------------
//  Linked-layer validation
//  Called once before generation starts. Ensures every linkedTo value
//  references a layer that (a) exists and (b) appears earlier in the order.
// ---------------------------------------------------------------------------
const validateLinkedLayers = (layers) => {
  const seenFolderNames = new Set();
  for (const layer of layers) {
    if (layer.linkedTo !== null) {
      if (!seenFolderNames.has(layer.linkedTo)) {
        throw new Error(
          `Layer "${layer.folderName}" has linkedTo: "${layer.linkedTo}" but no layer with that folder name was found before it. ` +
          `The source layer must appear earlier in layersOrder.`
        );
      }
    }
    seenFolderNames.add(layer.folderName);
  }
};

// ---------------------------------------------------------------------------
//  ADAPTIVE WEIGHTED SELECTION
//
//  Features:
//    A) ADAPTIVE DAMPENING — after a trait is picked, its effective weight is
//       reduced proportionally to how over-selected it is vs its target share.
//       This pulls the actual distribution much closer to intended percentages.
//    B) OPTIONAL LAYERS — configure with { optional: { weight: N } } to inject
//       a virtual "None" element so some NFTs can skip that layer entirely.
//    C) Same simple file-naming convention (trait#weight.png).
// ---------------------------------------------------------------------------

/**
 * Compute effective weights for all elements in a layer, adjusting for
 * how over/under-represented each trait currently is.
 *
 * @param {Array}  elements       - The layer's elements array
 * @param {string} layerName      - Used as key into traitCounters
 * @param {number} editionsSoFar  - How many editions have been generated
 * @param {number|null} optionalWeight - If set, weight for "None" option
 * @returns {{ items: Array<{element: object|null, effectiveWeight: number}>, totalWeight: number }}
 */
const computeEffectiveWeights = (elements, layerName, editionsSoFar, optionalWeight) => {
  // Initialise counters for this layer if needed
  if (!traitCounters[layerName]) {
    traitCounters[layerName] = {};
    elements.forEach((el) => {
      traitCounters[layerName][el.id] = 0;
    });
    if (optionalWeight !== null) {
      traitCounters[layerName]["__none__"] = 0;
    }
  }

  // Build list of candidates (real elements + optional None)
  const candidates = elements.map((el) => ({ element: el, baseWeight: el.weight }));
  if (optionalWeight !== null) {
    candidates.push({ element: null, baseWeight: optionalWeight });
  }

  const baseTotalWeight = candidates.reduce((s, c) => s + c.baseWeight, 0);

  // When fewer than 5 editions generated, just use base weights (not enough
  // data to meaningfully dampen).
  if (editionsSoFar < 5) {
    const items = candidates.map((c) => ({
      element: c.element,
      effectiveWeight: c.baseWeight,
    }));
    return { items, totalWeight: baseTotalWeight };
  }

  // Compute adaptive weights
  const items = candidates.map((c) => {
    const key = c.element ? c.element.id : "__none__";
    const timesSelected = traitCounters[layerName][key] || 0;

    // Target share: what fraction of editions SHOULD have this trait
    const targetShare = c.baseWeight / baseTotalWeight;

    // Actual share so far
    const actualShare = timesSelected / editionsSoFar;

    // Ratio > 1 means over-represented, < 1 means under-represented
    const ratio = actualShare / (targetShare || 0.0001);

    // Dampening factor: shrink weight when over-represented, boost when under.
    // Clamped so weights never go negative or explode.
    // Using 1/ratio would be exact inverse; we use a softer curve:
    //   factor = 1 / (ratio ^ 0.6)
    // This avoids wild swings while still providing meaningful correction.
    const dampFactor = Math.min(3, Math.max(0.15, 1 / Math.pow(ratio || 1, 0.6)));
    const effectiveWeight = c.baseWeight * dampFactor;

    return { element: c.element, effectiveWeight };
  });

  const totalWeight = items.reduce((s, i) => s + i.effectiveWeight, 0);
  return { items, totalWeight };
};

/**
 * Select one element from a layer using the improved weighted algorithm.
 */
const selectTrait = (layer, editionsSoFar, influenceMap = {}) => {
  const { items } = computeEffectiveWeights(
    layer.elements,
    layer.name,
    editionsSoFar,
    layer.optional ? layer.optional.weight : null
  );

  // Apply influence multipliers on top of adaptive weights
  let totalWeight = 0;
  const adjusted = items.map((item) => {
    const mult = (item.element && influenceMap[item.element.name]) ? influenceMap[item.element.name] : 1;
    const ew = Math.max(0, item.effectiveWeight * mult);
    totalWeight += ew;
    return { element: item.element, effectiveWeight: ew };
  });

  // Layer has no elements (folder is empty or no PNGs found) — skip it.
  if (adjusted.length === 0) return null;

  let random = Math.random() * totalWeight;
  for (const item of adjusted) {
    random -= item.effectiveWeight;
    if (random <= 0) {
      const key = item.element ? item.element.id : "__none__";
      if (!traitCounters[layer.name]) traitCounters[layer.name] = {};
      traitCounters[layer.name][key] = (traitCounters[layer.name][key] || 0) + 1;
      return item.element;
    }
  }

  // Floating-point fallback: pick the last candidate.
  const last = adjusted[adjusted.length - 1];
  if (!last) return null;
  const key = last.element ? last.element.id : "__none__";
  if (!traitCounters[layer.name]) traitCounters[layer.name] = {};
  traitCounters[layer.name][key] = (traitCounters[layer.name][key] || 0) + 1;
  return last.element;
};

// ---------------------------------------------------------------------------
//  DNA creation & uniqueness
// ---------------------------------------------------------------------------
const createDna = (layers, editionsSoFar) => {
  const parts = [];

  // Maps folderName → selected trait base-name (null if layer was skipped).
  // Used so linked layers can look up what their source layer chose.
  const selectedTraitName = {};

  layers.forEach((layer) => {
    if (layer.linkedTo !== null) {
      // --- Linked layer: selection is determined by the source layer ---
      const sourceName = selectedTraitName[layer.linkedTo]; // base name, or null

      if (sourceName === null || sourceName === undefined) {
        // Source layer was skipped or produced no match — skip this layer too
        parts.push(`none:none${layer.bypassDNA ? "?bypass=true" : ""}`);
        selectedTraitName[layer.folderName] = null;
      } else {
        // Find a file in this layer whose base name matches the source trait
        const match = layer.elements.find((el) => el.name === sourceName);
        if (match) {
          // Record selection for rarity tracking
          if (!traitCounters[layer.name]) traitCounters[layer.name] = {};
          traitCounters[layer.name][match.id] =
            (traitCounters[layer.name][match.id] || 0) + 1;

          parts.push(
            `${match.id}:${match.filename}${layer.bypassDNA ? "?bypass=true" : ""}`
          );
          selectedTraitName[layer.folderName] = match.name;
        } else {
          // No matching file — silently skip this layer
          parts.push(`none:none${layer.bypassDNA ? "?bypass=true" : ""}`);
          selectedTraitName[layer.folderName] = null;
        }
      }
    } else {
      // --- Normal layer: standard weighted random selection ---
      // Build influence map from named groups: for each group whose parent asset
      // matches a prior selection, apply its multiplier to the influenced traits.
      const influenceMap = {};
      for (const group of traitInfluences) {
        for (const parent of (group.parents || [])) {
          if (selectedTraitName[parent.layer] === parent.trait) {
            for (const inf of (group.influenced || [])) {
              if (inf.layer === layer.folderName) {
                influenceMap[inf.trait] = (influenceMap[inf.trait] || 1) * (parent.multiplier || 1);
              }
            }
          }
        }
      }
      const selected = selectTrait(layer, editionsSoFar, influenceMap);
      if (selected === null) {
        parts.push(`none:none${layer.bypassDNA ? "?bypass=true" : ""}`);
        selectedTraitName[layer.folderName] = null;
      } else {
        parts.push(
          `${selected.id}:${selected.filename}${layer.bypassDNA ? "?bypass=true" : ""}`
        );
        selectedTraitName[layer.folderName] = selected.name;
      }
    }
  });

  return parts.join(DNA_DELIMITER);
};

const filterDNAForUniqueness = (dna) => {
  return dna
    .split(DNA_DELIMITER)
    .filter((part) => {
      const qIdx = part.indexOf("?");
      if (qIdx === -1) return true;
      const qs = part.slice(qIdx + 1);
      return !qs.includes("bypass=true");
    })
    .join(DNA_DELIMITER);
};

const isDnaUnique = (dna) => {
  return !dnaList.has(filterDNAForUniqueness(dna));
};

// ---------------------------------------------------------------------------
//  Image rendering
// ---------------------------------------------------------------------------
const loadLayerImage = async (layerData) => {
  const image = await loadImage(layerData.selectedElement.path);
  return { layer: layerData, loadedImage: image };
};

const drawBackground = () => {
  if (background.static) {
    ctx.fillStyle = background.default;
  } else {
    const hue = Math.floor(Math.random() * 360);
    ctx.fillStyle = `hsl(${hue}, 100%, ${background.brightness})`;
  }
  ctx.fillRect(0, 0, format.width, format.height);
};

const drawElement = (renderObj) => {
  ctx.globalAlpha = renderObj.layer.opacity;
  ctx.globalCompositeOperation = renderObj.layer.blend;
  ctx.drawImage(renderObj.loadedImage, 0, 0, format.width, format.height);
};

const saveImage = (edition) => {
  fs.writeFileSync(
    `${buildDir}/images/${edition}.png`,
    canvas.toBuffer("image/png")
  );
};

// ---------------------------------------------------------------------------
//  Metadata — clean, no engine branding
// ---------------------------------------------------------------------------
const buildMetadata = (dna, edition, attributes) => {
  let metadata = {
    name: `${namePrefix} #${edition}`,
    description,
    image: `${baseUri}/${edition}.png`,
    edition,
    date: Date.now(),
    attributes,
    ...extraMetadata,
  };

  if (network === NETWORK.sol) {
    metadata = {
      name: metadata.name,
      symbol: solanaMetadata.symbol,
      description: metadata.description,
      seller_fee_basis_points: solanaMetadata.seller_fee_basis_points,
      image: `${edition}.png`,
      external_url: solanaMetadata.external_url,
      edition,
      attributes: metadata.attributes,
      properties: {
        files: [{ uri: `${edition}.png`, type: "image/png" }],
        category: "image",
        creators: solanaMetadata.creators,
      },
      ...extraMetadata,
    };
  }

  return metadata;
};

const saveMetadata = (metadata, edition) => {
  fs.writeFileSync(
    `${buildDir}/json/${edition}.json`,
    JSON.stringify(metadata, null, 2)
  );
};

// ---------------------------------------------------------------------------
//  DNA → layer mapping
// ---------------------------------------------------------------------------
const dnaToParts = (dna) => {
  return dna.split(DNA_DELIMITER).map((part) => {
    const clean = part.replace(/\?.*$/, "");
    const [idStr, filename] = clean.split(":");
    return { id: idStr, filename };
  });
};

const mapDnaToLayers = (dna, layers) => {
  const parts = dnaToParts(dna);
  return layers.map((layer, index) => {
    const part = parts[index];
    if (part.id === "none") {
      return null; // layer was skipped (optional)
    }
    const selectedElement = layer.elements.find((e) => e.id === Number(part.id));
    return {
      name: layer.name,
      blend: layer.blend,
      opacity: layer.opacity,
      selectedElement,
    };
  });
};

// ---------------------------------------------------------------------------
//  Shuffle helper
// ---------------------------------------------------------------------------
const shuffle = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// ---------------------------------------------------------------------------
//  Main generation loop
// ---------------------------------------------------------------------------
const startCreating = async () => {
  let layerConfigIdx = 0;
  let editionCount = 1;
  let failedCount = 0;
  let totalGenerated = 0;

  // Test mode: generate exactly 1 edition
  if (testMode) layerConfigurations.forEach(c => { c.growEditionSizeTo = 1; });

  // Build edition index list
  let editions = [];
  const startIdx = network === NETWORK.sol ? 0 : 1;
  const endIdx = layerConfigurations[layerConfigurations.length - 1].growEditionSizeTo;
  for (let i = startIdx; i <= endIdx; i++) {
    editions.push(i);
  }
  if (shuffleEditions) {
    editions = shuffle(editions);
  }

  while (layerConfigIdx < layerConfigurations.length) {
    const config = layerConfigurations[layerConfigIdx];
    const layers = setupLayers(config.layersOrder);
    validateLinkedLayers(layers);

    // Reset trait counters for each layer configuration block
    traitCounters = {};

    while (editionCount <= config.growEditionSizeTo) {
      const newDna = createDna(layers, totalGenerated);

      if (isDnaUnique(newDna)) {
        const layerResults = mapDnaToLayers(newDna, layers);
        const loadPromises = [];

        for (const layerData of layerResults) {
          if (layerData !== null) {
            loadPromises.push(loadLayerImage(layerData));
          }
        }

        const renderObjects = await Promise.all(loadPromises);

        // Clear canvas
        ctx.clearRect(0, 0, format.width, format.height);

        // Background
        if (background.generate) {
          drawBackground();
        }

        // Draw layers
        renderObjects.forEach((obj) => drawElement(obj));

        // Build attributes list (skip None layers and muted layers)
        const attributes = layerResults
          .filter((lr) => lr !== null && !lr.muted)
          .map((lr) => ({
            trait_type: lr.name,
            value: lr.selectedElement.name,
          }));

        // Save outputs
        const editionId = editions[0];
        saveImage(editionId);

        const metadata = buildMetadata(newDna, editionId, attributes);
        metadataList.push(metadata);
        saveMetadata(metadata, editionId);

        if (debugLogs) {
          console.log(
            `  DNA: ${sha1(newDna)} | Traits: ${attributes.map((a) => a.value).join(", ")}`
          );
        }

        console.log(`Created edition: ${editionId}`);

        dnaList.add(filterDNAForUniqueness(newDna));
        editionCount++;
        totalGenerated++;
        editions.shift();
        failedCount = 0;
      } else {
        failedCount++;
        if (debugLogs) {
          console.log(`  DNA collision #${failedCount}`);
        }
        if (failedCount >= maxCollisionRetries) {
          console.error(
            `\nReached ${maxCollisionRetries} DNA collisions. ` +
            `You need more layer elements or fewer editions (target: ${config.growEditionSizeTo}).\n`
          );
          process.exit(1);
        }
      }
    }
    layerConfigIdx++;
  }

  // Write combined metadata
  fs.writeFileSync(
    `${buildDir}/json/_metadata.json`,
    JSON.stringify(metadataList, null, 2)
  );

  // Print rarity summary
  printRaritySummary(metadataList);
};

// ---------------------------------------------------------------------------
//  Rarity summary printed after generation
// ---------------------------------------------------------------------------
const printRaritySummary = (metadata) => {
  const total = metadata.length;
  const traitMap = {};

  metadata.forEach((item) => {
    item.attributes.forEach((attr) => {
      if (!traitMap[attr.trait_type]) traitMap[attr.trait_type] = {};
      traitMap[attr.trait_type][attr.value] =
        (traitMap[attr.trait_type][attr.value] || 0) + 1;
    });
  });

  console.log("\n========== Rarity Summary ==========");
  for (const [layer, traits] of Object.entries(traitMap)) {
    console.log(`\n  ${layer}:`);
    const sorted = Object.entries(traits).sort((a, b) => b[1] - a[1]);
    for (const [trait, count] of sorted) {
      const pct = ((count / total) * 100).toFixed(1);
      console.log(`    ${trait}: ${count} (${pct}%)`);
    }
  }
  console.log("\n====================================\n");
};

module.exports = { startCreating, buildSetup, getElements };
