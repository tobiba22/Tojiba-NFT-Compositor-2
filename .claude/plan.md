# Hardening Plan — Bug Fixes & Error Reduction

No new functionality. Every change targets an existing bug or fragile pattern.

---

## 1. HTML escape helper (XSS prevention)
**app.js** — Add a single `esc(str)` function that escapes `& < > " '`. Then replace every raw interpolation of user-controlled strings inside `innerHTML` assignments with `esc(...)`. Affected locations (~40+):
- `openTraitModal()` — `layerFolder`, `trait.name`, `trait.pct`, `trait.weight`
- `openModal()` — `item.name`, attribute `trait_type` and `value`
- `renderMetaResults()` — `item.name`, attribute chips
- `loadLayers()` — `layer.folder`, `trait.name`, `trait.pct`, `trait.weight`
- `buildLayerManager()` — layer names in data-attributes and display
- `showRandomNFT()` / `renderTestNFT()` — `item.name`, attributes
- `buildTraitDistSection()` — trait values
- `buildScoreSection()` — edition numbers, scores
- `buildConsecutiveSection()` — trait types/values/editions
- `buildWeightSuggestSection()` — layer/trait values
- `runSimilarScan()` — all similarity card content
- `adjBuildBulkEditSection()` — namePrefix, description, imageBase
- `adjBuildReplaceCard()` — template JSON content in textarea
- `adjPreviewEdition()` — item name, attributes
- `cmpBuildTraitPresence()` — trait values
- `cmpBuildSummaryStats()` — metric labels

## 2. Fix Random tab event listener leak
**app.js** `loadRandomTab()` — Move `btn.addEventListener("click", showRandomNFT)` out of the function body (it currently adds a duplicate listener on every reload). Use a one-time attach pattern outside the function, or use `btn.onclick =`.

## 3. Fix loaded-flag-before-async pattern
**app.js** — For all 11 tab-loading functions, move `xxxLoaded = true` into the success path (after awaits complete). On catch, leave flag `false` so the tab retries on next visit. Functions:
`loadLayers`, `loadGeneration`, `loadMetadata`, `loadConfig`, `loadRarityTab`, `loadSuggestionsTab`, `loadGroupingTab`, `loadAdjustTab`, `loadRandomTab`, `loadTestTab`, `loadComparisonTab`

## 4. Fix metadata `::` key separator
**server.js** — In `/api/metadata` and `/api/rarity/scores`, change the `split("::")` approach to use `split("::", 2)` so only the first `::` is consumed as separator (the remainder stays in `value`). Specifically:
- Line 643: `const [trait_type, value] = key.split("::");` → split with limit 2
  Actually `split("::", 2)` still splits into at most 2 parts which is correct. But if trait_type itself contains `::` it breaks. Better approach: use `indexOf` to split at first occurrence only.

## 5. Path sanitization on server
**server.js** — Add a `safePath(base, ...segments)` helper that resolves the path and asserts it starts with `base`. Apply to all routes that take user-provided folder/file params:
- `/api/layers/:folder/:file`
- `/api/layers/:folder/upload`
- `/api/layers/rename`
- `/api/layers/trash`
- `/api/layers/rename-folder`
- `/api/test/images/:file` (already uses `path.basename` — still add check)
- `/api/test/metadata/:id`

## 6. Add execFile timeout to test generation
**server.js** — Add `timeout: 60000` to the `execFile` options for test generation. On timeout, reset `testGenerating = false` and return error.

## 7. Replace silent `catch` blocks with `console.error`
**server.js** — Replace all `catch (_) {}` and `catch {}` with `catch (e) { console.error(e); }` (or at minimum log the error). Locations:
- `getPngDimensions` line 117
- `getConfigLayerOrder` line 139
- `/api/layers/options` line 254
- `/api/metadata/bulk-fields` line 574
- `/api/metadata/hidden-layer` line 608
- `/api/metadata` GET line 637
- `/api/rarity/scores` line 685
- `/api/similar` line 723
- test generation file copy line 993

**app.js** — Replace `catch (_) {}` in poll generation (line 416) and unused-traits fetch (line 522).

## 8. Config write mutex
**server.js** — Add a simple promise-based mutex (`let configLock = Promise.resolve()`) to serialize all config read-modify-write operations. Wrap `rewriteLayerOrder`, `/api/config POST`, `/api/config/settings POST`, `/api/layers/set-options POST`, `/api/layers/rename-folder POST` in the lock.

---

### Files modified:
- `public/app.js` — items 1, 2, 3, 7 (app-side catches)
- `server.js` — items 4, 5, 6, 7 (server-side catches), 8
