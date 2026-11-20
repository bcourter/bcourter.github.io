// The viewer's palette: the colour a body is drawn in when the document gives
// it none. It is a display default, never written to the document — the code's
// own .color wins over it — so it is a choice about the view, like the
// environment, not about the part.
//
// The colours come from a cosine palette (a + b cos 2π(c t + d)), sampled at a
// golden-ish step per body so neighbours differ. The strip in the Bodies panel
// header shows the current palette; clicking it opens the presets and the four
// coefficients.

import { srgbEncode } from "../render/gsl-shading.js";

const PALETTE_PRESETS = [
    { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.00, 0.33, 0.67] },
    { a: [0.5, 0.5, 0.5], b: [0.55, 0.55, 0.55], c: [1, 1, 1], d: [0.30, 0.50, 0.50] },
    { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.00, 0.10, 0.20] },
    { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.30, 0.20, 0.20] },
    { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 0.5], d: [0.80, 0.90, 0.30] },
    { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 0.7, 0.4], d: [0.00, 0.15, 0.20] },
];

let currentPalette = PALETTE_PRESETS[0];
let onChange = () => {};
let strip = null;
let popup = null;

// The palette's colours are sRGB-encoded once so they display as they did
// before the shading moved to linear light (see srgbEncode). The strip, the
// preset previews, the pickers and the shapes all come through here, so they
// stay the same colour as each other.
function cosineRGB(t, { a, b, c, d }) {
    return a.map((ai, i) => Math.max(0, Math.min(1, ai + b[i] * Math.cos(2 * Math.PI * (c[i] * t + d[i]))))).map(srgbEncode);
}

export function rgbToHex([r, g, b]) {
    const h = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

function shapeT(i) { return (1 / 3 + (i - 1) * (5 / 12)) % 1; }

// paletteColor is body i's default colour (1-based), sRGB in [0, 1].
export function paletteColor(i) {
    return cosineRGB(shapeT(i), currentPalette);
}

// initBodyPalette mounts the strip and its popup. changed() is called after
// the palette changes, so the panel can recolour the bodies it lists.
export function initBodyPalette({ stripEl, popupParent, changed }) {
    strip = stripEl;
    onChange = changed || (() => {});
    if (!strip) return;

    popup = document.createElement('div');
    popup.id = 'palette-popup';

    const popupParams = document.createElement('div');
    popupParams.id = 'palette-popup-params';
    ['a', 'b', 'c', 'd'].forEach(key => {
        const col = document.createElement('div');
        col.className = 'palette-param-col';
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'palette-param-swatch';
        input.dataset.param = key;
        input.addEventListener('input', (e) => {
            currentPalette = { ...currentPalette, [key]: hexToRgb(e.target.value) };
            if (selectedPresetEl) { selectedPresetEl.classList.remove('selected'); selectedPresetEl = null; }
            applyPalette(currentPalette);
        });
        const lbl = document.createElement('div');
        lbl.className = 'palette-param-label';
        lbl.textContent = key;
        col.appendChild(input);
        col.appendChild(lbl);
        popupParams.appendChild(col);
    });
    popup.appendChild(popupParams);

    const popupPresets = document.createElement('div');
    popupPresets.id = 'palette-popup-presets';
    let selectedPresetEl = null;

    PALETTE_PRESETS.forEach((preset, idx) => {
        const row = document.createElement('div');
        row.className = 'palette-preset' + (idx === 0 ? ' selected' : '');
        if (idx === 0) selectedPresetEl = row;
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 16;
        row.appendChild(canvas);
        popupPresets.appendChild(row);
        // Draw after appending (canvas needs to be in DOM for reliable sizing)
        requestAnimationFrame(() => drawPresetCanvas(canvas, preset));

        row.addEventListener('click', () => {
            if (selectedPresetEl) selectedPresetEl.classList.remove('selected');
            row.classList.add('selected');
            selectedPresetEl = row;
            applyPalette(preset);
        });
    });
    popup.appendChild(popupPresets);
    (popupParent || document.body).appendChild(popup);

    renderPaletteStrip(currentPalette);
    updatePopupHeader();

    strip.style.cursor = 'pointer';
    strip.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = strip.getBoundingClientRect();
        popup.style.right = `${window.innerWidth - rect.right}px`;
        popup.style.top = `${rect.bottom + 6}px`;
        popup.classList.toggle('visible');
    });

    document.addEventListener('click', (e) => {
        if (!popup.contains(e.target)) popup.classList.remove('visible');
    });
}

function renderPaletteStrip(palette) {
    strip.innerHTML = '';
    for (let k = 0; k < 12; k++) {
        const [r, g, b] = cosineRGB(k / 12, palette);
        const el = document.createElement('div');
        el.className = 'palette-swatch';
        el.style.background = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        strip.appendChild(el);
    }
}

function applyPalette(palette) {
    currentPalette = palette;
    renderPaletteStrip(palette);
    onChange();
    updatePopupHeader();
}

function drawPresetCanvas(canvas, palette) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    for (let x = 0; x < w; x++) {
        const [r, g, b] = cosineRGB(x / w, palette);
        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        ctx.fillRect(x, 0, 1, h);
    }
}

function updatePopupHeader() {
    const p = currentPalette;
    ['a', 'b', 'c', 'd'].forEach(key => {
        const input = popup?.querySelector(`.palette-param-swatch[data-param="${key}"]`);
        if (input) input.value = rgbToHex(p[key]);
    });
}
