// The Bodies side panel: every body the document returns, with its
// visibility, its colour and its surface. The one selected here is the one the
// Materials panel (material-grid.js) changes; this file sets that panel up.
//
// It replaces two panels that each kept a list of the same bodies — Shapes,
// which coloured them in the viewer only, where the document's own .color
// silently beat it, and Materials, which wrote to the document. Both edits now
// go to the document, so a colour picked here is saved, shows on a body that
// already has a material, and is what a render elsewhere sees. The palette
// stays a viewer default, for the bodies the document gives no colour.
//
// initBodyPanel({...}) takes the app's hooks:
//   getSource() / setSource(next)   raw GSL in and out of the editor
//   recompile()                     re-run the normal compile path
//   afterAssign()                   optional (e.g. to save the document)
//   setStatus(msg, isError)         optional inline status line
//   setShapeColor(i, r, g, b)       the viewer's default colour for shader slot i
//   setShapeVisible(i, visible)     the viewer's visibility for body i, when
//                                   each shader slot is a body
//   setSlotVisible(slot, visible)   the viewer's visibility for one shader slot,
//   setMeshShapeVisible(i, visible) and for return i's mesh() placements, when
//                                   the program returns meshes (see setBodies)
//   setSliderValue(name, value)     push a slider's live value to the viewer
//   previewColor(name, rgb)         the same for a @color variable
//   selectShape(i)                  optional, outline shader slot i in the viewer
//   popupParent                     where the palette popup is attached
//   readOnly                        optional; true when the document cannot be
//                                   written (an exported page): the rows show
//                                   each body and take no color or material
//
// The app drives the list with setBodies() from the viewer's shapes/detected
// and pickBody() from shape/picked, so clicking a body in the 3D view selects
// it here. getVisibleBodies() is what the exports mesh.

import { initBodyPalette, paletteColor, rgbToHex, hexToRgb } from "./body-palette.js";
import { initMaterialGrid, showGridStatus, paintSwatch, paintTinted, paintTintedCoat, refreshTint, refreshReadout, catalogEntry, catalogColors, catalogOperators, coatOf } from "./material-grid.js";
import { assignAdjustedColor, assignColor, isAssignableBody, stackColorOf, stackColorSource, stackOf, surfaceOf } from "./material-assign.js";
import { BODY_PANEL_MARKUP } from "./body-panel-markup.js";

let deps = {};
let panelEl = null;
let materialPanelEl = null;
let rowsEl = null;
// [{ index, name, slots, mesh }], the document's returns: the 1-based return
// index, its name, the shader slots it draws and whether it places meshes.
let bodies = [];
let byReturn = false;     // bodies came from the server's returns (setBodies)
let selectedBody = 0;     // 1-based shape index, 0 for none

// The bodies hidden by hand, by name. A compile rebuilds the list — and every
// colour or surface picked here is a compile — so visibility is kept by name
// across it rather than coming back on each time.
const hidden = new Set();

// The row's thumbnail of the body's surface, in pixels: the swatch grid's own
// cell, scaled to sit in a row beside the colour chip.
const THUMB_PX = 22;

// The material a body has when its document sets none (material.gsl's
// @finish standard, the viewer's default record).
const DEFAULT_SURFACE = "material.standard";

export { materialVariables } from "./material-grid.js";

export function initBodyPanel(options) {
    deps = options || {};
    panelEl = document.getElementById("body-panel");
    if (!panelEl) return;
    if (!panelEl.innerHTML.trim()) panelEl.innerHTML = BODY_PANEL_MARKUP;
    rowsEl = panelEl.querySelector("#body-rows");

    // Opening the panel is also the moment to re-read the document, which may
    // have been edited by hand since the last compile reported its shapes.
    panelEl.querySelector("#body-panel-header").addEventListener("click", (e) => {
        if (e.target.classList.contains("panel-close")) {
            panelEl.classList.remove("open");
            return;
        }
        panelEl.classList.add("open");
        drawRows();
    });

    initBodyPalette({
        stripEl: panelEl.querySelector("#palette-strip"),
        popupParent: deps.popupParent,
        changed: () => {
            applyPalette();
            drawRows();
        },
    });

    materialPanelEl = document.getElementById("material-panel");
    initMaterialGrid(materialPanelEl, {
        getBody: () => bodies.find((b) => b.index === selectedBody) || null,
        bodiesKnown: () => bodies.length > 0,
        getSource: deps.getSource,
        setSource: deps.setSource,
        recompile: deps.recompile,
        afterAssign: deps.afterAssign,
        setStatus: deps.setStatus,
        getBodyGiven: () => {
            const body = bodies.find((b) => b.index === selectedBody);
            const source = deps.getSource?.() || "";
            return body && isAssignableBody(source, body.name) ? surfaceOf(source, body.name) : null;
        },
        getBodyColor: selectedColor,
        setSliderValue: deps.setSliderValue,
        previewColor: deps.previewColor,
        readOnly: deps.readOnly,
    });
}

// setBodies gives the panel the document's returns, newest compile wins. Names
// come from program.OperandName (the wgsl agent's). A program that returns
// meshes also has the server's returns ([{ name, slots, mesh }], the canvas's
// previewBodies): mesh() returns are numbered apart from the shader's slots,
// so a body is a return with the slots it draws, and a mesh-only one has none.
// Without them each shader slot is a body.
export function setBodies(names, returns = null) {
    byReturn = Array.isArray(returns) && returns.length > 0;
    bodies = byReturn
        ? returns.map((r, i) => ({ index: i + 1, name: r.name || `Shape ${i + 1}`, slots: r.slots || [], mesh: !!r.mesh }))
        : (names || []).map((name, i) => ({ index: i + 1, name: name || `Shape ${i + 1}`, slots: [i + 1], mesh: false }));
    if (!panelEl) return;
    if (bodies.length === 0) {
        panelEl.classList.remove("visible", "open");
        materialPanelEl?.classList.remove("visible", "open");
        selectedBody = 0;
        return;
    }
    panelEl.classList.add("visible");
    materialPanelEl?.classList.add("visible");

    // A new compile's shader starts from its defaults, so the palette and the
    // bodies hidden by hand are put back on it.
    applyPalette();
    for (const body of bodies) showBody(body, !hidden.has(body.name));

    // Keep the selection when it survives the compile. Nothing is selected
    // otherwise: a pick in the grid changes only a body the user chose.
    if (!bodies.some((b) => b.index === selectedBody)) selectedBody = 0;
    drawRows();
}

// pickBody follows a pick in the 3D view: it selects the body here, whether
// or not the panel is open, and a pick of empty space clears the selection,
// as it clears the viewer's outline — so the grid then changes nothing. Only
// the header opens the panel; a pick never brings it up.
//
// A pick names a shader slot, so it selects the body that draws it.
export function pickBody(shapeIndex) {
    if (!panelEl) return;
    const body = shapeIndex > 0 ? bodies.find((b) => b.slots.includes(shapeIndex)) : null;
    if (body) {
        selectedBody = body.index;
    } else {
        selectedBody = 0;
    }
    markSelected();
}

// getVisibleBodies is the bodies shown, for the exports: each one's 1-based
// return index, name and shader slots, whether it places meshes, and the
// color its chip shows ("#rrggbb"), for a 3MF.
export function getVisibleBodies() {
    return bodies.filter((b) => !hidden.has(b.name)).map((b) => ({
        ...b,
        slots: [...b.slots],
        color: rowsEl?.querySelector(`.body-row[data-shape-index="${b.index}"] input[type="color"]`)?.value
            || rgbToHex(paletteColor(b.slots[0] || b.index)),
    }));
}

// showBody shows or hides a body in the viewer: its slots and its meshes when
// the bodies are the server's returns, otherwise the slot that is the body.
function showBody(body, visible) {
    if (!byReturn) {
        deps.setShapeVisible?.(body.index, visible);
        return;
    }
    for (const slot of body.slots) deps.setSlotVisible?.(slot, visible);
    if (body.mesh) deps.setMeshShapeVisible?.(body.index, visible);
}

// getBodyStates is what the panel shows, for the agent debug API.
export function getBodyStates() {
    if (!rowsEl) return [];
    return Array.from(rowsEl.querySelectorAll(".body-row")).map((row) => ({
        index: Number(row.dataset.shapeIndex),
        name: row.querySelector(".body-name").textContent,
        color: row.querySelector('input[type="color"]').value,
        visible: row.querySelector('input[type="checkbox"]').checked,
        surface: row.querySelector(".body-surface").textContent,
        selected: row.classList.contains("selected"),
    }));
}

// The palette colours shader slots; each belongs to one body.
function applyPalette() {
    for (const body of bodies) {
        for (const slot of body.slots) deps.setShapeColor?.(slot, ...paletteColor(slot));
    }
}

// drawRows rebuilds the rows against the source as it is NOW, since whether a
// body can be written to, and what it is given, are the document's.
function drawRows() {
    if (!rowsEl) return;
    const source = deps.getSource?.() || "";
    rowsEl.innerHTML = "";
    for (const body of bodies) rowsEl.appendChild(rowEl(source, body));
    markSelected();
}

function rowEl(source, body) {
    const assignable = isAssignableBody(source, body.name);
    const given = assignable ? surfaceOf(source, body.name) : { surface: null, color: null, rgb: null, colorIsSurface: false, colorSource: null };
    // A body the document gives no material has one all the same: the default,
    // material.standard, which is what the viewer draws it with. It is shown as
    // that, set apart, rather than as nothing. A body wearing operators shows
    // the surface under them, with the operators named after it; the stack
    // itself is the grid's, under the readout.
    const implicit = !given.surface;
    const stack = assignable ? stackOf(source, body.name, catalogOperators()) : { baseSurface: null, layers: [] };
    const layered = stack.layers.length > 0;
    // A color picked for a body with layers sits in the layers, not on .color.
    const stackRgb = layered ? stackColorOf(source, body.name, catalogOperators()) : null;
    const surfaceName = layered ? stack.baseSurface : (given.surface || DEFAULT_SURFACE);
    const entry = catalogEntry(surfaceName);
    // A colour that is the colour half of a catalog material's pair paints the
    // colours the catalog recorded, so the chip shows them rather than a
    // stand-in — whichever pair it is, including one a finish was put over,
    // whose color comes up through the layers.
    const colorSource = (layered && stackColorSource(source, body.name, catalogOperators())) || given.colorSource;
    const painted = colorSource ? catalogColors(colorSource) : null;
    // A body adjusted from a single-colour preset wears the coat colour its
    // document declares: the chip shows it, picking one rewrites it, and the
    // thumbnail is the preset drawn in it.
    const coat = !entry && assignable ? coatOf(source, body.name, given) : null;

    const row = document.createElement("div");
    row.className = "body-row";
    row.dataset.shapeIndex = String(body.index);
    if (!assignable) row.classList.add("unassignable");

    const vis = document.createElement("input");
    vis.type = "checkbox";
    vis.checked = !hidden.has(body.name);
    vis.title = "Show or hide this body in the viewer";
    vis.addEventListener("change", () => {
        if (vis.checked) hidden.delete(body.name);
        else hidden.add(body.name);
        showBody(body, vis.checked);
    });

    // The chip shows the colour the body is drawn in when that is known here:
    // a literal in the document, a catalog material's own colours, or the
    // palette's when the document sets none. A colour the document computes
    // some other way — a library constant, a hand-written pair, a field — is
    // marked rather than guessed at.
    const chip = document.createElement("input");
    chip.type = "color";
    chip.value = rgbToHex(given.rgb || stackRgb || painted?.[0] || coat?.rgb || paletteColor(body.slots[0] || body.index));
    if (coat) {
        chip.style.setProperty("--chip-paint", rgbToHex(coat.rgb));
        row.classList.add("surface-color");
        chip.title = `${coat.entry.package}.${coat.entry.symbol}'s coat color, ${coat.name}. Picking a color changes it.`;
    } else if (painted) {
        // A material that paints more than one colour shows them all, darkest
        // to lightest; the picker opens on the first.
        const hexes = painted.map(rgbToHex);
        chip.style.setProperty("--chip-paint", hexes.length > 1 ? `linear-gradient(90deg, ${hexes.join(", ")})` : hexes[0]);
        row.classList.add("surface-color");
        chip.title = `${colorSource}'s color${hexes.length > 1 ? "s" : ""}: ${hexes.join(", ")}. Picking a color replaces it.`;
    } else if (given.color && !given.rgb && !stackRgb) {
        row.classList.add("code-color");
        chip.title = `The document colors this body: ${given.color}. Picking a color replaces it.`;
    } else if (!assignable) {
        chip.title = "Viewer only: this body is not a name the document binds, so its color cannot be saved. Give the shape a name and return that.";
    } else {
        chip.title = given.color ? `${body.name}.color = ${given.color}` : "The palette's color. Picking one writes it to the document.";
    }
    // A color applied to the body hides its schematic color, the palette's,
    // which section view still draws it in. The chip's border keeps it in sight.
    if (given.color || stackRgb || painted || coat) {
        const schematic = rgbToHex(paletteColor(body.slots[0] || body.index));
        chip.style.setProperty("--chip-schematic", schematic);
        row.classList.add("applied");
        chip.title += ` The border is the schematic color, ${schematic}.`;
    }
    // A read-only host has no document to write a pick to, so the chip only
    // shows the colour; the palette strip still recolours the viewer.
    if (deps.readOnly) {
        chip.disabled = true;
        chip.title = "The color this body is drawn in.";
    }
    // While the picker is open the viewer previews the colour, as the Shapes
    // panel always did; it shows wherever the document sets no colour of its
    // own. Closing the picker commits it to the document.
    chip.addEventListener("input", () => {
        for (const slot of body.slots) deps.setShapeColor?.(slot, ...hexToRgb(chip.value));
        if (body.index === selectedBody) refreshTint();
    });
    chip.addEventListener("change", () => {
        if (coat) writeCoatColor(body, coat.name, hexToRgb(chip.value), chip.value);
        else if (assignable) writeColor(body, hexToRgb(chip.value), chip.value);
    });

    const name = document.createElement("span");
    name.className = "body-name";
    name.textContent = body.name;

    // The surface's own swatch when the catalog holds it; an empty slot keeps
    // the names aligned when it does not.
    const thumb = document.createElement("span");
    thumb.className = "body-thumb";
    if (entry) {
        paintSwatch(thumb, entry, THUMB_PX);
        thumb.dataset.kind = entry.kind;
        thumb.dataset.surface = surfaceName;
        thumb.title = surfaceName;
        // A finish carries no colour, so its thumbnail is drawn in the body's.
        if (entry.kind === "finish") paintTinted(thumb, entry, hexToRgb(chip.value), THUMB_PX);
    } else if (coat) {
        // The preset the body was adjusted from, drawn in its coat colour.
        const preset = `${coat.entry.package}.${coat.entry.symbol}`;
        paintSwatch(thumb, coat.entry, THUMB_PX);
        thumb.dataset.kind = coat.entry.kind;
        thumb.dataset.surface = preset;
        thumb.title = `${surfaceName}, adjusted from ${preset}`;
        paintTintedCoat(thumb, coat.entry, coat.rgb, THUMB_PX);
    }

    const surface = document.createElement("span");
    surface.className = "body-surface";
    surface.textContent = layered
        ? `${surfaceName} › ${stack.layers.map((l) => l.op.slice(l.op.indexOf(".") + 1)).join(" › ")}`
        : surfaceName;
    if (implicit) surface.classList.add("implicit");
    surface.title = implicit
        ? `${body.name} sets no material, so it has the default, ${DEFAULT_SURFACE}.`
        : layered
            ? `${body.name}.material = ${given.surface}: ${surfaceName} under ${stack.layers.map((l) => l.op).join(", ")}`
            : `${body.name}.material = ${given.surface}`;

    row.append(vis, chip, thumb, name, surface);
    row.addEventListener("click", (e) => {
        if (e.target === vis || e.target === chip) return;
        selectedBody = body.index;
        markSelected();
        if (body.slots.length > 0) deps.selectShape?.(body.slots[0]);
    });
    return row;
}

function markSelected() {
    rowsEl?.querySelectorAll(".body-row").forEach((row) => {
        row.classList.toggle("selected", Number(row.dataset.shapeIndex) === selectedBody);
    });
    // The grid draws its finishes in the selected body's colour, and offers
    // to adjust the selected body's preset when it has parameters.
    refreshTint();
    refreshReadout();
}

// selectedColor is the colour the selected body's chip shows, sRGB, which the
// grid draws its finishes in.
function selectedColor() {
    const chip = rowsEl?.querySelector(".body-row.selected input[type=\"color\"]");
    return chip ? hexToRgb(chip.value) : null;
}

function writeColor(body, rgb, hex) {
    writeColorWith(body, hex, (source) => assignColor(source, body.name, rgb, catalogOperators()));
}

// writeCoatColor rewrites the literal of an adjusted body's colour variable,
// so the coat keeps its coupling to the constructor rather than being replaced
// by a flat colour.
function writeCoatColor(body, name, rgb, hex) {
    writeColorWith(body, hex, (source) => assignAdjustedColor(source, name, rgb));
}

function writeColorWith(body, hex, edit) {
    const source = deps.getSource?.();
    if (typeof source !== "string") {
        showGridStatus("The editor's source is not readable.", true);
        return;
    }
    let next;
    try {
        next = edit(source);
    } catch (err) {
        showGridStatus(`Could not set the color: ${err instanceof Error ? err.message : String(err)}`, true);
        return;
    }
    deps.setSource?.(next);
    if (deps.getSource?.() !== next) {
        showGridStatus("The editor did not take the change.", true);
        return;
    }
    deps.recompile?.();
    deps.afterAssign?.();
    showGridStatus(`${body.name}.color = ${hex}`);
}
