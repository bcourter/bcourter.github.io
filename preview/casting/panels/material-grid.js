// The Materials panel: pick a surface, and the document of the body selected in
// the Bodies panel gets the lines an author would have written.
//
// The catalog is generated, not listed here. tool/materialswatch reads every
// @material and @finish annotation out of the GSL libraries, renders a sphere
// of each with the same shading the viewer uses, and writes materials/ —
// catalog.json, one sheet of swatches, and the renders the finishes are
// recoloured from (finish-tint.js). A library that annotates a new surface gets
// a swatch by regenerating; nothing in this file knows the name of a single
// material.
//
// initMaterialGrid(root, {...}) takes the #material-panel element and its hooks:
//   getBody()                       the selected body, { index, name } or null
//   bodiesKnown()                   whether a compile has reported any bodies
//   getSource() / setSource(next)   raw GSL in and out of the editor
//   recompile()                     re-run the normal compile path
//   afterAssign()                   optional (e.g. to save the document)
//   setStatus(msg, isError)         optional inline status line
//   getBodyGiven()                  optional, what the document gives the
//                                   selected body (material-assign's surfaceOf)
//   getBodyColor()                  optional, the colour the selected body is
//                                   drawn in, sRGB [r, g, b], or null
//   setSliderValue(name, value)     optional, push a slider's live value to the
//                                   viewer
//   previewColor(name, rgb)         optional, the same for a @color variable
//
// The body list and its selection are body-panel.js's; the source edit itself
// is material-assign.js, which is a pure function and tested there.

import CATALOG from "../materials/catalog.json" with { type: "json" };
import { adjustLayer, adjustedColorOf, assignBase, baseParameters, expandSurface, isAssignableBody, layerHasMoreToAdjust, layerParameters, panelVariables, removeCarried, removeLayer, setLayerParameter, setVariable, stackOf, wrapOpen } from "./material-assign.js";
import { hexToRgb, rgbToHex } from "./body-palette.js";
import { tintFinish } from "./finish-tint.js";
import { MATERIAL_PANEL_MARKUP } from "./material-panel-markup.js";

// The sheet sits beside the manifest that names it, and both are resolved
// against this module rather than the page, so the viewer assets can be mounted
// under any URL path.
const SHEET_URL = new URL(`../materials/${CATALOG.image}`, import.meta.url).href;

// The swatch's drawn size. The sheet has to be scaled to match it in the same
// arithmetic that offsets it, so this module owns the number and publishes it
// to the stylesheet as --material-swatch-px rather than the two agreeing by
// hand.
const SWATCH_PX = 40;

// The panel's layout, which is the panel's own business: the libraries know
// nothing of it. A tab lists what it leaves out by library path, and an entry
// goes on the first tab that keeps it, or on none: the ready-mades of the
// process and coat libraries are a substance and a finish already, which the
// Substance tab picks apart, so no tab lists them. A path ending in a slash means
// every library under it, and one with a dot names a single entry:
// physical.castIron is the database's spectrophotometer reading, nearly black
// drawn as a metal, so the Substance tab offers metal.castIron alone. A tab with finishes chooses in two dimensions, a surface and what is
// done to it: `finishes` are the libraries of the second list, in stack order,
// each one's layers going under the next's.
const TABS = [
    {
        name: "Substance",
        excludes: ["material", "material/bulk/metal", "material/process/", "material/coat/", "material/collection/", "physical.castIron"],
        finishes: ["material/process/", "material/coat/", "material/bulk/ceramic"],
    },
    { name: "Other", excludes: ["material/process/", "material/coat/", "physical.castIron"], finishes: [] },
];

let deps = {};
let filterEl = null;
let readoutEl = null;
let stackEl = null;
let gridEl = null;
let tabEls = [];
let keepColorEl = null;
let activeTab = TABS[0];
let panelEl = null;
let substanceCategoryEl = null;
let finishCategoryEl = null;
let finishesEl = null;
// A slider held down: a compile landing mid-drag must not rebuild it out from
// under the pointer.
let sliding = false;

export function initMaterialGrid(root, options) {
    deps = options || {};
    if (!root) return;
    if (!root.innerHTML.trim()) root.innerHTML = MATERIAL_PANEL_MARKUP;
    root.style.setProperty("--material-swatch-px", `${SWATCH_PX}px`);

    // Opening the panel is also the moment to re-read the document, as the
    // Bodies panel does.
    root.querySelector("#material-panel-header").addEventListener("click", (e) => {
        if (e.target.classList.contains("panel-close")) {
            root.classList.remove("open");
            return;
        }
        root.classList.add("open");
        refreshReadout();
    });

    filterEl = root.querySelector("#material-filter");
    readoutEl = root.querySelector("#material-readout");
    stackEl = root.querySelector("#material-stack");
    gridEl = root.querySelector("#material-grid");
    panelEl = root;
    substanceCategoryEl = root.querySelector("#material-substance-category");
    finishCategoryEl = root.querySelector("#material-finish-category");
    finishesEl = root.querySelector("#material-finishes");
    fillCategories(substanceCategoryEl, "All substances", CATALOG.entries.filter((e) => tabOf(e) === TABS[0]).map(categoryOf));
    fillCategories(finishCategoryEl, "All finishes", finishes().map(([, op]) => finishCategoryOf(op)));
    substanceCategoryEl.addEventListener("change", () => drawGrid(filterEl.value));
    finishCategoryEl.addEventListener("change", drawFinishes);
    tabEls = TABS.map((tab) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "material-tab";
        el.textContent = tab.name;
        el.addEventListener("click", () => showTab(tab));
        root.querySelector("#material-tabs").appendChild(el);
        return el;
    });
    keepColorEl = root.querySelector("#material-keep-color");

    filterEl.addEventListener("input", () => {
        drawGrid(filterEl.value);
        drawFinishes();
    });
    // With the colour kept, a patterned material cannot be applied without its
    // colour, so its swatches are marked held; redrawing re-marks them.
    keepColorEl?.addEventListener("change", () => {
        drawGrid(filterEl.value);
        showReadout(null);
    });
    // Leaving the grid puts the readout back to whatever is selected, so the
    // line is never stale from a swatch the pointer has long left.
    gridEl.addEventListener("pointerleave", () => showReadout(null));
    finishesEl.addEventListener("pointerleave", () => showReadout(null));

    showTab(activeTab);
}

// showTab draws a tab: its surfaces, and the operators it offers.
function showTab(tab) {
    activeTab = tab;
    TABS.forEach((each, i) => tabEls[i].classList.toggle("active", each === tab));
    const two = tab.finishes.length > 0;
    panelEl.classList.toggle("two-lists", two);
    for (const el of [substanceCategoryEl, finishCategoryEl, finishesEl]) el.hidden = !two;
    drawGrid(filterEl.value);
    drawFinishes();
    showReadout(null);
    drawStack();
}

// categoryOf is the heading a surface is chosen under: the section its library
// declares, or the library when it has only the one.
function categoryOf(entry) {
    return !entry.section || entry.section === "Ready-made" ? capitalized(entry.package) : entry.section;
}

// finishCategoryOf is the heading a finish is chosen under: its library.
function finishCategoryOf(op) {
    return capitalized(op.call.slice(0, op.call.indexOf(".")));
}

function capitalized(name) {
    return name[0].toUpperCase() + name.slice(1);
}

// fillCategories lists names in `select`, once each and in order, after an
// option for all of them.
function fillCategories(select, all, names) {
    for (const name of ["", ...[...new Set(names)].sort()]) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name || all;
        select.appendChild(option);
    }
}

// finishes are the operators of the first tab's second list, [key, op], in
// stack order.
function finishes() {
    const operators = Object.entries(catalogOperators());
    return TABS[0].finishes.flatMap((path) => operators.filter(([, op]) => inLibrary(op, path)));
}

// drawFinishes lists the finishes of the chosen category, a thumbnail each, by
// category. The generator draws them, tool/materialswatch's thumbs.go.
function drawFinishes() {
    finishesEl.innerHTML = "";
    const want = filterEl.value.trim().toLowerCase();
    let heading = "";
    let row = null;
    const sorted = [...finishes()].sort(([, a], [, b]) => finishCategoryOf(a).localeCompare(finishCategoryOf(b)));
    for (const [key, op] of sorted) {
        const group = finishCategoryOf(op);
        if (finishCategoryEl.value && group !== finishCategoryEl.value) continue;
        if (want && !key.toLowerCase().includes(want)) continue;
        if (group !== heading) {
            heading = group;
            const label = document.createElement("div");
            label.className = "material-group";
            label.textContent = group;
            finishesEl.appendChild(label);
            row = document.createElement("div");
            row.className = "material-row";
            finishesEl.appendChild(row);
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "material-swatch";
        button.dataset.finish = key;
        button.title = op.call;
        button.style.backgroundImage = `url("${new URL(`../materials/operators/${key}.png`, import.meta.url).href}")`;
        button.style.backgroundSize = `${SWATCH_PX}px ${SWATCH_PX}px`;
        // The tooltip shows it three times the size, as a swatch's does.
        button.dataset.tipImg = new URL(`../materials/operators/${key}.large.png`, import.meta.url).href;
        button.addEventListener("pointerenter", () => showFinishName(op));
        button.addEventListener("focus", () => showFinishName(op));
        button.addEventListener("click", () => pickFinish(op));
        row.appendChild(button);
    }
}

// showFinishName names the finish the pointer is over, as the readout names a
// swatch.
function showFinishName(op) {
    readoutEl.innerHTML = "";
    const name = document.createElement("div");
    name.className = "material-readout-name";
    name.textContent = op.call;
    readoutEl.appendChild(name);
}

// pickFinish puts a finish on the selected body, with the panel's usual word on
// why when it cannot.
function pickFinish(op) {
    const body = deps.getBody?.();
    if (!body) {
        showGridStatus("Select a body first: click its row, or pick it in the view.", true);
        return;
    }
    wrap(body, op);
}

// inLibrary: whether an entry or operator comes from the library at path, or
// from one under it when path ends in a slash; or, when path has a dot, whether
// it is the entry so named.
function inLibrary(item, path) {
    if (path.includes(".")) return `${item.package}.${item.symbol}` === path;
    return path.endsWith("/") ? item.library.startsWith(path) : item.library === path;
}

// tabOf is the tab that shows entry, or null when none does.
function tabOf(entry) {
    return TABS.find((tab) => !tab.excludes.some((path) => inLibrary(entry, path))) || null;
}

// drawGrid lays the catalog out in the libraries' own order — the finishes
// first — under the section headings the libraries themselves declare, so the
// panel's grouping is the one a library author chose rather than a second
// taxonomy invented here.
function drawGrid(filter) {
    const want = (filter || "").trim().toLowerCase();
    gridEl.innerHTML = "";
    let heading = "";
    let row = null;
    let shown = 0;

    const two = activeTab.finishes.length > 0;
    const listed = CATALOG.entries.filter((entry) => tabOf(entry) === activeTab);
    if (two) listed.sort((a, b) => categoryOf(a).localeCompare(categoryOf(b)));
    for (const entry of listed) {
        if (two && substanceCategoryEl.value && categoryOf(entry) !== substanceCategoryEl.value) continue;
        if (want && !matches(entry, want)) continue;
        const group = two ? categoryOf(entry) : `${entry.package}${entry.section ? ` · ${entry.section}` : ""}`;
        if (group !== heading) {
            heading = group;
            const label = document.createElement("div");
            label.className = "material-group";
            label.textContent = group;
            gridEl.appendChild(label);
            row = document.createElement("div");
            row.className = "material-row";
            gridEl.appendChild(row);
        }
        row.appendChild(swatchEl(entry));
        shown++;
    }

    if (shown === 0) {
        const empty = document.createElement("div");
        empty.className = "material-empty";
        empty.textContent = "No surface matches.";
        gridEl.appendChild(empty);
    }
    refreshTint();
}

function matches(entry, want) {
    return `${entry.package}.${entry.symbol} ${entry.section} ${entry.doc}`.toLowerCase().includes(want);
}

function swatchEl(entry) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "material-swatch";
    el.dataset.kind = entry.kind;
    el.dataset.surface = `${entry.package}.${entry.symbol}`;
    el.title = `${entry.package}.${entry.symbol}`;
    if (keepColorEl?.checked && isPatterned(entry)) el.classList.add("held");
    paintSwatch(el, entry, SWATCH_PX);
    // The tooltip shows the material three times the swatch's size
    // (tooltip.js's data-tip-img); a finish's is redrawn in the selected
    // body's colour when the pointer arrives.
    const large = largeURL(entry);
    if (large) el.dataset.tipImg = large;

    el.addEventListener("pointerenter", () => {
        showReadout(entry);
        if (entry.kind === "finish") previewTinted(el, entry);
    });
    el.addEventListener("focus", () => showReadout(entry));
    el.addEventListener("click", () => apply(entry));
    return el;
}

// paintSwatch draws entry's cell of the sheet as el's background, at px across.
//
// One sheet, scaled so a cell covers the swatch, then offset to the cell. The
// cells are not flush: the sheet is composed with a gap between them, which
// the generator measures off the finished image rather than assuming (see
// sheetGeometry). So the offsets step by cell PLUS gap, and a percentage
// position — a fraction of the leftover space — would be wrong. Everything
// here is in scaled pixels.
export function paintSwatch(el, entry, px) {
    const scale = px / CATALOG.cellWidth;
    const col = entry.index % CATALOG.cols;
    const row = Math.floor(entry.index / CATALOG.cols);
    el.style.backgroundImage = `url("${SHEET_URL}")`;
    el.style.backgroundSize = `${CATALOG.sheetWidth * scale}px ${CATALOG.sheetHeight * scale}px`;
    el.style.backgroundPosition =
        `${-col * (CATALOG.cellWidth + CATALOG.gap) * scale}px ` +
        `${-row * (CATALOG.cellHeight + CATALOG.gap) * scale}px`;
}

// catalogEntry finds a surface by the name the document writes it with,
// `metal.brass` or `material.matte`, or returns null for anything the catalog
// does not hold — a hand-written material.withRoughness(…), say.
export function catalogEntry(name) {
    return CATALOG.entries.find((e) => `${e.package}.${e.symbol}` === name) || null;
}

// catalogColors are the sRGB colours a catalog material paints, one when it is
// uniform and a few spanning it when it is not (tool/materialswatch's
// colors.go); null for a finish, which paints none, or an unknown name.
export function catalogColors(name) {
    return CATALOG.colors?.[name] || null;
}

// materialVariables are the variables this panel shows, for the Parameters
// panel to leave out.
export function materialVariables() {
    return panelVariables(deps.getSource?.() || "", catalogOperators(), CATALOG.adjust);
}

// catalogOperators are the @surface presets the panel wraps a surface with,
// keyed `machined.turned` (tool/materialswatch's operators.go).
export function catalogOperators() {
    return CATALOG.operators || {};
}

// ── Finishes in the body's colour ──
//
// A finish's swatch is drawn in the selected body's colour, so the grid shows
// what picking it will look like and that the colour stays. The recolouring is
// finish-tint.js's, from the two renders the generator stores per finish; the
// sheet supplies the ground around the sphere, which the colour does not reach.

const basisPromises = new Map();   // basis file -> Promise<{ halves, sheet } | null>
const tintCache = new Map();       // "file|surface|#rrggbb" -> data URL

// loadBasis fetches a basis file — the finishes' (finishBasis) or the coats'
// (coatBasis, the presets with one colour parameter, drawn in an adjusted
// body's coat colour) — with the sheet for the ground around each sphere.
//
// A read-only host (a page `gsl export` wrote) does not carry the basis files,
// which are for picking materials, so there every swatch stays as rendered.
function loadBasis(desc) {
    if (!desc || deps.readOnly) return Promise.resolve(null);
    if (!basisPromises.has(desc.file)) {
        basisPromises.set(desc.file, Promise.all([
            fetch(new URL(`../materials/${desc.file}`, import.meta.url)).then((r) => r.arrayBuffer()),
            new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = SHEET_URL;
            }),
        ]).then(([buffer, sheet]) => {
            const canvas = document.createElement("canvas");
            canvas.width = CATALOG.sheetWidth;
            canvas.height = CATALOG.sheetHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(sheet, 0, 0);
            return { halves: new Uint16Array(buffer), sheet: ctx };
        }).catch((err) => {
            console.warn(`[materials] ${desc.file} did not load; its swatches stay as rendered`, err);
            return null;
        }));
    }
    return basisPromises.get(desc.file);
}

// tintedFinishURL is a data URL of a finish's swatch in an sRGB colour, or
// null when the basis is not available.
export function tintedFinishURL(entry, rgb) {
    return tintedURL(CATALOG.finishBasis, entry, rgb);
}

// tintedCoatURL is a data URL of a single-colour preset's swatch in an sRGB
// coat colour, with its other parameters as the preset has them, or null.
export function tintedCoatURL(entry, rgb) {
    return tintedURL(CATALOG.coatBasis, entry, rgb);
}

async function tintedURL(desc, entry, rgb) {
    const name = `${entry.package}.${entry.symbol}`;
    const at = desc?.order.indexOf(name) ?? -1;
    if (at < 0 || !rgb) return null;
    const key = `${desc.file}|${name}|${rgbToHex(rgb)}`;
    if (tintCache.has(key)) return tintCache.get(key);
    const basis = await loadBasis(desc);
    if (!basis) return null;
    const fb = desc;

    const px = fb.width * fb.height;
    const size = 3 * px;
    const r0 = basis.halves.subarray(2 * at * size, (2 * at + 1) * size);
    const r1 = basis.halves.subarray((2 * at + 1) * size, (2 * at + 2) * size);
    const col = entry.index % CATALOG.cols;
    const row = Math.floor(entry.index / CATALOG.cols);
    const cell = basis.sheet.getImageData(col * (CATALOG.cellWidth + CATALOG.gap), row * (CATALOG.cellHeight + CATALOG.gap), fb.width, fb.height);

    const canvas = document.createElement("canvas");
    canvas.width = fb.width;
    canvas.height = fb.height;
    canvas.getContext("2d").putImageData(new ImageData(tintFinish(r0, r1, cell.data, rgb), fb.width, fb.height), 0, 0);
    const url = canvas.toDataURL();
    tintCache.set(key, url);
    return url;
}

// tintGeneration counts refreshTint's passes, so a tint still being computed
// when the selection or its colour changes is dropped rather than painted over
// the newer one.
let tintGeneration = 0;

// paintTinted draws a finish's swatch in rgb as el's background at px across,
// leaving the sheet's grey one in place until (and unless) it is ready. gen,
// when given, is the refreshTint pass it belongs to.
export async function paintTinted(el, entry, rgb, px, gen) {
    const url = await tintedFinishURL(entry, rgb);
    if (gen !== undefined && gen !== tintGeneration) return;
    if (!url || el.dataset.surface !== `${entry.package}.${entry.symbol}`) return;
    el.style.backgroundImage = `url("${url}")`;
    el.style.backgroundSize = `${px}px ${px}px`;
    el.style.backgroundPosition = "0 0";
}

// paintTintedCoat draws a single-colour preset's swatch in a coat colour as
// el's background at px across: an adjusted body's thumbnail, following the
// colour its document declares.
export async function paintTintedCoat(el, entry, rgb, px) {
    const url = await tintedCoatURL(entry, rgb);
    if (!url || el.dataset.surface !== `${entry.package}.${entry.symbol}`) return;
    el.style.backgroundImage = `url("${url}")`;
    el.style.backgroundSize = `${px}px ${px}px`;
    el.style.backgroundPosition = "0 0";
}

// coatOf is the preset an adjusted body came from, with the colour variable
// its document declares for the preset's one colour parameter, when the
// catalog has a coat basis for it: { entry, adjust, name, rgb }. Null for a
// body on a preset itself, a hand-written surface, or a preset with several
// colours or none.
export function coatOf(source, body, given) {
    if (!given?.surface || catalogEntry(given.surface)) return null;
    for (const name of CATALOG.coatBasis?.order || []) {
        const adjust = CATALOG.adjust?.[name];
        const entry = catalogEntry(name);
        if (!adjust || !entry) continue;
        const found = adjustedColorOf(source, body, adjust);
        if (found) return { entry, adjust, ...found };
    }
    return null;
}

// refreshTint redraws the finishes in the selected body's colour; the Bodies
// panel calls it when the selection or the colour changes. With no body
// selected they go back to the stand-in grey they were rendered in.
export function refreshTint() {
    if (!gridEl) return;
    const rgb = deps.getBodyColor?.();
    const gen = ++tintGeneration;
    for (const el of gridEl.querySelectorAll('.material-swatch[data-kind="finish"]')) {
        const entry = catalogEntry(el.dataset.surface);
        if (!entry) continue;
        if (rgb) paintTinted(el, entry, rgb, SWATCH_PX, gen);
        else paintSwatch(el, entry, SWATCH_PX);
    }
}

// ── The large preview ──

// largeURL is entry's large image, rendered by the generator at three times
// the swatch, or null when the catalog has none.
function largeURL(entry) {
    const large = CATALOG.large;
    return large ? new URL(`../materials/${large.dir}/${entry.package}.${entry.symbol}.png`, import.meta.url).href : null;
}

const largeBasis = new Map();   // surface -> Promise<{ halves, background } | null>

// loadLargeBasis fetches a finish's two large renders, gzipped, and its large
// image for the ground around the sphere.
function loadLargeBasis(entry) {
    const name = `${entry.package}.${entry.symbol}`;
    if (!largeBasis.has(name)) {
        const large = CATALOG.large;
        const url = new URL(`../materials/${large.dir}/${name}.basis.gz`, import.meta.url);
        largeBasis.set(name, Promise.all([
            fetch(url).then((r) => new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()),
            new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = largeURL(entry);
            }),
        ]).then(([buffer, img]) => {
            const canvas = document.createElement("canvas");
            canvas.width = large.width;
            canvas.height = large.height;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            return { halves: new Uint16Array(buffer), background: ctx.getImageData(0, 0, large.width, large.height).data };
        }).catch((err) => {
            console.warn("[materials] large finish basis did not load", name, err);
            return null;
        }));
    }
    return largeBasis.get(name);
}

// tintedLargeURL is a finish's large preview in an sRGB colour, or null.
async function tintedLargeURL(entry, rgb) {
    const large = CATALOG.large;
    if (!large || !rgb) return null;
    const key = `large|${entry.package}.${entry.symbol}|${rgbToHex(rgb)}`;
    if (tintCache.has(key)) return tintCache.get(key);
    const basis = await loadLargeBasis(entry);
    if (!basis) return null;
    const size = 3 * large.width * large.height;
    const rgba = tintFinish(basis.halves.subarray(0, size), basis.halves.subarray(size, 2 * size), basis.background, rgb);
    const canvas = document.createElement("canvas");
    canvas.width = large.width;
    canvas.height = large.height;
    canvas.getContext("2d").putImageData(new ImageData(rgba, large.width, large.height), 0, 0);
    const url = canvas.toDataURL();
    tintCache.set(key, url);
    return url;
}

// previewTinted points a finish swatch's tooltip at its large preview in the
// selected body's colour, or back at the grey one with nothing selected.
async function previewTinted(el, entry) {
    const rgb = deps.getBodyColor?.();
    const url = rgb ? await tintedLargeURL(entry, rgb) : null;
    el.dataset.tipImg = url || largeURL(entry);
}

// ── What a pick keeps ──

// isPatterned: the material's colour varies over its surface, so the colour is
// its look — granite's grains, a checker's squares — and applying it without
// that colour would leave a bare stone finish, not granite.
function isPatterned(entry) {
    return (catalogColors(`${entry.package}.${entry.symbol}`)?.length || 0) > 1;
}

// keepsColor: whether picking entry now leaves the body's colour alone, which a
// surface with no colour of its own always does.
function keepsColor(entry) {
    return !catalogColors(`${entry.package}.${entry.symbol}`) || (!!keepColorEl?.checked && !isPatterned(entry));
}

// bodyColorNumbers is the selected body's colour as numbers, when the panel
// knows it: a literal, or a uniform catalog material's own colour. The keep-
// colour edit pins a colour it is about to lose with it (assignMaterialOnly).
function bodyColorNumbers() {
    const given = deps.getBodyGiven?.();
    if (!given) return null;
    if (given.rgb) return given.rgb;
    const own = given.colorSource ? catalogColors(given.colorSource) : null;
    return own && own.length === 1 ? own[0] : null;
}

// selectedStack is the selected body's stack, empty when it has none to read.
function selectedStack() {
    const body = deps.getBody?.();
    const source = deps.getSource?.();
    if (!body || typeof source !== "string" || !isAssignableBody(source, body.name)) return { layers: [], carried: [] };
    return stackOf(source, body.name, catalogOperators());
}

// keepsLayers: whether picking entry changes what the selected body's layers
// wrap, rather than replacing the surface and the layers with it. A tab with
// finishes builds layers over its surfaces, so its surfaces go under them.
function keepsLayers(entry) {
    return (tabOf(entry)?.finishes.length || 0) > 0 && selectedStack().layers.length > 0;
}

// keptNote is what picking entry leaves on the body besides the colour, for the
// readout and the status line.
function keptNote(entry) {
    return [...(keepsLayers(entry) ? ["its layers"] : []), ...(selectedStack().carried.length ? ["its relief"] : [])];
}

// colourEffect is the readout's middle line: what picking entry does to the
// selected body's colour, and what else it keeps, said before the click.
function colourEffect(entry) {
    const line = document.createElement("div");
    line.className = "material-readout-effect";
    const others = keptNote(entry);
    if (keepsColor(entry)) {
        line.textContent = `Keeps ${["color", ...others].join(", ")}`;
        return line;
    }
    const hexes = (catalogColors(`${entry.package}.${entry.symbol}`) || []).map(rgbToHex);
    const chip = document.createElement("span");
    chip.className = "material-readout-chip";
    chip.style.background = hexes.length > 1 ? `linear-gradient(90deg, ${hexes.join(", ")})` : (hexes[0] || "transparent");
    const given = deps.getBodyGiven?.();
    let text = hexes.length > 1 ? "Sets color (patterned)" : "Sets color";
    // "Yours" is a colour set in the document by hand or by the colour chip,
    // not one an earlier material brought.
    if (given?.color && !given.colorSource) text += ", replacing yours";
    if (others.length) text += `; keeps ${others.join(", ")}`;
    line.append(chip, document.createTextNode(` ${text}`));
    return line;
}

// showReadout names what the pointer is over, since a swatch is too small to
// caption and 159 captions would bury the swatches anyway: the call, what it
// does to the colour, and the library's own line about it.
function showReadout(entry) {
    if (!readoutEl) return;
    if (!entry) {
        readoutEl.innerHTML = "";
        const hint = document.createElement("span");
        hint.className = "material-readout-hint";
        hint.textContent = "Hover to name, click to apply to the selected body.";
        readoutEl.appendChild(hint);
        const open = adjustableSelection();
        if (open) readoutEl.appendChild(adjustButton(open));
        return;
    }
    const call = entry.kind === "finish"
        ? `${entry.package}.${entry.symbol}`
        : `${entry.package}.${entry.symbol}()`;
    readoutEl.innerHTML = "";
    const name = document.createElement("div");
    name.className = "material-readout-name";
    name.textContent = call;
    const doc = document.createElement("div");
    doc.className = "material-readout-doc";
    doc.textContent = entry.doc;
    readoutEl.append(name, colourEffect(entry), doc);
}

// refreshReadout puts the idle readout back for the current selection; the
// Bodies panel calls it when the selection changes, since whether there is
// anything to adjust, and what stack there is, depends on which body is
// selected.
export function refreshReadout() {
    showReadout(null);
    drawStack();
}

// ── Operators: Wrap, and the stack ──
//
// An operator takes a surface and returns it modified, so it is applied as a
// wrapping edit (material-assign's wrapSurface), not the replacing edit a
// swatch makes, and it needs no swatch: the viewer shows it on the part the
// moment the source changes. The stack lists the selected body's base and its
// layers, innermost first, each with Remove (removeLayer) and a control under it
// for each range and color parameter. A pick writes those parameters out
// (wrapOpen), so they have uniforms from the first drag, and they are this
// panel's alone: the Parameters panel leaves them out (materialVariables).
// Adjust (adjustLayer) writes out the directions and points the viewer's gizmos
// drive.

function drawStack() {
    if (!stackEl || sliding) return;
    stackEl.innerHTML = "";
    const body = deps.getBody?.();
    const source = deps.getSource?.();
    const operators = catalogOperators();
    if (!body || typeof source !== "string" || !isAssignableBody(source, body.name) || !Object.keys(operators).length) return;

    if (!activeTab.finishes.length) {
        const listed = TABS.flatMap((tab) => tab.finishes);
        stackEl.appendChild(operatorMenu(`Wrap ${body.name}'s surface with…`, (op) => !listed.some((path) => inLibrary(op, path)), body));
    }

    const stack = stackOf(source, body.name, operators);
    const baseControls = baseParameters(source, body.name, stack, CATALOG.adjust);
    if (!stack.layers.length && !stack.carried.length && !baseControls.length) return;
    const rows = document.createElement("div");
    rows.className = "material-stack-rows";
    const base = document.createElement("div");
    base.className = "material-layer material-layer-base";
    base.textContent = stack.baseSurface || "(no surface)";
    base.title = `What the layers wrap: ${stack.base}`;
    rows.appendChild(base);
    for (const parameter of baseControls) {
        rows.appendChild(parameterRow(parameter, `${parameter.variable}`, (src, value) => setVariable(src, parameter.variable, value)));
    }
    stack.carried.forEach((item, index) => rows.appendChild(carriedRow(body, item, index)));
    for (const layer of stack.layers) {
        const op = operators[layer.op];
        const row = document.createElement("div");
        row.className = "material-layer";
        const name = document.createElement("span");
        name.className = "material-layer-name";
        name.textContent = layer.op;
        name.title = `${layer.names.join(", ")} = ${layer.call};`;
        row.appendChild(name);
        if (layerHasMoreToAdjust(layer, op)) {
            const left = op.adjust.parameters.filter((p) => p.kind === "direction" || p.kind === "point").map((p) => p.name).join(", ");
            row.appendChild(layerButton("Adjust", `Write out ${left} of ${layer.op}, for the viewer's gizmos.`,
                () => editSource("adjust", (src) => adjustLayer(src, body.name, layer.name, op), `${layer.name}: ${left}`)));
        }
        row.appendChild(layerButton("Remove", `Take ${layer.op} off ${body.name}; what it wrapped shows again.`,
            () => editSource("remove the layer", (src) => removeLayer(src, body.name, layer.name, op), `${body.name} without ${layer.op}`)));
        rows.appendChild(row);
        for (const parameter of layerParameters(source, layer, op)) {
            rows.appendChild(parameterRow(parameter, `${layer.name}: ${parameter.name}`,
                (src, value) => setLayerParameter(src, body.name, layer.name, op, parameter.name, value)));
        }
    }
    stackEl.appendChild(rows);
}

// parameterRow is a parameter's control, indented under what it belongs to:
// `write` puts a value in the source and `label` names it in the status line.
function parameterRow(parameter, label, write) {
    const row = document.createElement("div");
    row.className = "slider-row material-layer-parameter";
    const name = document.createElement("span");
    name.className = "slider-label";
    name.textContent = parameter.name;
    name.title = label;
    const commit = (value, text) => editSource("set the parameter", (src) => write(src, value), `${label} = ${text}`);
    row.append(name, ...(parameter.kind === "color" ? colorControls(row, parameter, commit) : rangeControls(parameter, commit)));
    return row;
}

// rangeControls are a slider and its number. The viewer follows the drag through
// the variable's uniform, and letting go writes the value to the document. A
// preset read from a document has no variable yet, so its first move lands then.
function rangeControls(parameter, commit) {
    const range = document.createElement("input");
    range.type = "range";
    range.min = String(parameter.min);
    range.max = String(parameter.max);
    range.step = "any";
    range.value = String(parameter.value);

    const number = document.createElement("input");
    number.type = "number";
    number.step = "any";
    number.className = "field-panel-label";
    number.value = String(parameter.value);

    const decimals = Math.max(0, Math.ceil(3 - Math.log10(parameter.max - parameter.min)));
    const rounded = (text) => Number(Number(text).toFixed(decimals));

    // The pointer can be let go anywhere, not only over the slider.
    range.addEventListener("pointerdown", () => {
        sliding = true;
        const release = () => { sliding = false; };
        window.addEventListener("pointerup", release, { once: true });
        window.addEventListener("pointercancel", release, { once: true });
    });
    range.addEventListener("input", () => {
        const value = rounded(range.value);
        number.value = String(value);
        if (parameter.variable) deps.setSliderValue?.(parameter.variable, value);
    });
    range.addEventListener("change", () => {
        const value = rounded(range.value);
        commit(value, String(value));
    });
    number.addEventListener("change", () => {
        if (Number.isFinite(parseFloat(number.value))) commit(Number(number.value), number.value);
    });
    return [range, number];
}

// colorControls are a chip and its hex, as a Parameters color row has them.
function colorControls(row, parameter, commit) {
    row.classList.add("color-row");
    const chip = document.createElement("input");
    chip.type = "color";
    chip.value = rgbToHex(parameter.value);
    const hex = document.createElement("input");
    hex.type = "text";
    hex.className = "field-panel-label color-hex";
    hex.value = chip.value;
    hex.spellcheck = false;

    chip.addEventListener("input", () => {
        hex.value = chip.value;
        if (parameter.variable) deps.previewColor?.(parameter.variable, hexToRgb(chip.value));
    });
    chip.addEventListener("change", () => commit(hexToRgb(chip.value), chip.value));
    hex.addEventListener("change", () => {
        const text = hex.value.trim().toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(text)) {
            hex.value = chip.value;
            return;
        }
        chip.value = text;
        commit(hexToRgb(text), text);
    });
    return [chip, hex];
}

// carriedRow is a layer written by hand round the surface: a thread's relief, say.
// It is named from its own text and has nothing to adjust.
function carriedRow(body, item, index) {
    const label = carriedLabel(item);
    const row = document.createElement("div");
    row.className = "material-layer";
    const name = document.createElement("span");
    name.className = "material-layer-name";
    name.textContent = label;
    name.title = `${item.call}(…, ${item.rest.join(", ")})`;
    row.appendChild(name);
    row.appendChild(layerButton("Remove", `Take ${label} off ${body.name}.`,
        () => editSource("remove the layer", (src) => removeCarried(src, body.name, index, catalogOperators()), `${body.name} without ${label}`)));
    return row;
}

// carriedLabel is the first call a carried item names, past any remap that only
// moves it; the wrapping call when it names none.
function carriedLabel(item) {
    const called = (item.height || "").replace(/^remap\(/, "").match(/^[A-Za-z_][\w.]*(?=\()/);
    return called ? called[0] : item.call;
}

// operatorMenu is a menu of the operators `wanted` accepts, grouped by library;
// the keys come sorted from the generator, so each library's are together.
function operatorMenu(label, wanted, body) {
    const operators = catalogOperators();
    const select = document.createElement("select");
    select.className = "material-wrap";
    select.title = `Wrap ${body.name}'s surface with an operator. The layer reads the surface beneath it, and the viewer is the preview.`;
    const head = document.createElement("option");
    head.value = "";
    head.textContent = label;
    head.disabled = true;
    head.selected = true;
    select.appendChild(head);
    const groups = new Map();
    for (const [key, op] of Object.entries(operators)) {
        if (!wanted(op)) continue;
        const pkg = key.slice(0, key.indexOf("."));
        if (!groups.has(pkg)) {
            const group = document.createElement("optgroup");
            group.label = pkg;
            groups.set(pkg, group);
            select.appendChild(group);
        }
        const option = document.createElement("option");
        option.value = key;
        option.textContent = key.slice(key.indexOf(".") + 1);
        option.title = `${op.call}: ${op.arity === 1 ? "the material alone" : "material and colour"}${op.slots.frame >= 0 ? ", on the body's own frame" : ""}`;
        groups.get(pkg).appendChild(option);
    }
    select.addEventListener("change", () => {
        const op = operators[select.value];
        select.value = "";
        if (op) wrap(body, op);
    });
    return select;
}

function layerButton(label, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "material-layer-button";
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", onClick);
    return button;
}

// operatorsOver are the operators whose layers op goes under: those of the
// first tab's later finish libraries.
function operatorsOver(op) {
    const order = TABS[0].finishes;
    const at = order.findIndex((path) => inLibrary(op, path));
    const later = order.slice(at + 1);
    return at < 0 ? [] : finishes().filter(([, each]) => later.some((path) => inLibrary(each, path))).map(([key]) => key);
}

function wrap(body, op) {
    const options = { colorLiteral: bodyColorNumbers() || deps.getBodyColor?.() };
    editSource("wrap", (src) => wrapOpen(src, body.name, op, catalogOperators(), operatorsOver(op), options),
        `${body.name} = ${op.call}(${body.name}'s surface)`);
}

// editSource runs one source edit the way apply and expand do: into the
// editor, checked to have landed, recompiled, saved, and reported.
function editSource(verb, edit, status) {
    const source = deps.getSource?.();
    if (typeof source !== "string") {
        showGridStatus("The editor's source is not readable.", true);
        return;
    }
    let next;
    try {
        next = edit(source);
    } catch (err) {
        showGridStatus(`Could not ${verb}: ${err instanceof Error ? err.message : String(err)}`, true);
        return;
    }
    deps.setSource?.(next);
    if (deps.getSource?.() !== next) {
        showGridStatus("The editor did not take the change.", true);
        return;
    }
    deps.recompile?.();
    deps.afterAssign?.();
    showGridStatus(status);
}

// ── Adjust ──
//
// A preset is one line in the document, and stays one until someone wants its
// knobs. Adjust rewrites it as the constructor call with one top-level
// variable per annotated parameter (material-assign's expandSurface), after
// which the Parameters panel and the viewer's gizmos take over.

// adjustableSelection is the selected body with the preset on it and that
// preset's adjust record, when the catalog has one; null otherwise — no body
// selected, a hand-written surface, a preset with nothing to adjust, or a
// surface already opened up.
function adjustableSelection() {
    const body = deps.getBody?.();
    const given = deps.getBodyGiven?.();
    if (!body || !given?.surface) return null;
    const entry = catalogEntry(given.surface);
    const adjust = entry ? CATALOG.adjust?.[given.surface] : null;
    return entry && adjust ? { body, entry, adjust } : null;
}

function adjustButton(open) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "material-readout-adjust";
    const n = open.adjust.parameters.length;
    button.textContent = `Adjust ${open.entry.package}.${open.entry.symbol}`;
    button.title = `Rewrite ${open.body.name}'s ${open.entry.package}.${open.entry.symbol} as ${open.adjust.calls.join(", ")} with ${n} parameter${n === 1 ? "" : "s"} you can change: ${open.adjust.parameters.map((p) => p.name).join(", ")}.`;
    button.addEventListener("click", () => expand(open));
    return button;
}

function expand({ body, entry, adjust }) {
    const source = deps.getSource?.();
    if (typeof source !== "string") {
        showGridStatus("The editor's source is not readable.", true);
        return;
    }
    let next;
    try {
        next = expandSurface(source, body.name, entry, adjust);
    } catch (err) {
        showGridStatus(`Could not adjust: ${err instanceof Error ? err.message : String(err)}`, true);
        return;
    }
    deps.setSource?.(next);
    if (deps.getSource?.() !== next) {
        showGridStatus("The editor did not take the change.", true);
        return;
    }
    deps.recompile?.();
    deps.afterAssign?.();
    showGridStatus(`${body.name} = ${adjust.calls.join(", ")} (${adjust.parameters.map((p) => p.name).join(", ")})`);
}

// showGridStatus reports into the readout, which is where the user is already
// looking: the line that named the swatch says what happened to it. The Bodies
// panel reports its colour edits here too.
export function showGridStatus(msg, isError = false) {
    deps.setStatus?.(msg, isError);
    if (isError) {
        // The readout is two small lines in a side panel, which is not where
        // someone looks when a click appears to do nothing at all.
        console.warn("[materials]", msg, {
            body: deps.getBody?.()?.name,
            sourceChars: (deps.getSource?.() || "").length,
        });
    }
    if (!readoutEl) return;
    readoutEl.innerHTML = "";
    const line = document.createElement("div");
    line.className = isError ? "material-readout-error" : "material-readout-name";
    line.textContent = msg;
    readoutEl.appendChild(line);
}

function apply(entry) {
    const source = deps.getSource?.();
    if (typeof source !== "string") {
        showGridStatus("The editor's source is not readable.", true);
        return;
    }

    // Nothing is changed without a body chosen for it: no selection means no
    // edit, never the body that happened to be selected last.
    const body = deps.getBody?.();
    if (!body) {
        showGridStatus(deps.bodiesKnown?.()
            ? "Select a body first: click its row, or pick it in the view."
            : "No bodies yet — compile a document first.", true);
        return;
    }
    if (!isAssignableBody(source, body.name)) {
        // Say what to do about it: naming the return is the whole fix.
        showGridStatus(
            `“${body.name}” is not a name this document binds — give the shape a name and return that.`,
            true);
        return;
    }

    const keepColor = keepsColor(entry);
    const kept = [...(keepColor ? ["color"] : []), ...keptNote(entry)];
    let next;
    try {
        next = assignBase(source, body.name, entry, catalogOperators(), {
            keepColor,
            colorLiteral: keepColor ? bodyColorNumbers() : null,
            replaceLayers: !keepsLayers(entry),
        });
    } catch (err) {
        showGridStatus(`Could not assign: ${err instanceof Error ? err.message : String(err)}`, true);
        return;
    }

    deps.setSource?.(next);
    // An edit that does not reach the editor is the one failure that otherwise
    // looks like nothing happening at all, so it is checked rather than assumed.
    if (deps.getSource?.() !== next) {
        showGridStatus("The editor did not take the change.", true);
        return;
    }
    deps.recompile?.();
    deps.afterAssign?.();
    showGridStatus(`${body.name} = ${entry.package}.${entry.symbol}${kept.length ? ` (keeps ${kept.join(", ")})` : ""}`);
}
