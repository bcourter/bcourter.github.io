// Slider panel — the "Parameters" side panel: one row per top-level
// variable assigned a literal with both `.min` and `.max` set, and one per
// `@color` variable, which gets a chip in place of the slider.
//
// Shared across viewer frontends. The editor is
// imported directly; everything that lives in a host's viewer or compile state
// is passed in through initSliderPanel().
//
//   initSliderPanel({ setSliderValue, getAnimTime, audioSystem, onCommit })
//     setSliderValue(name, value)  push a live value into the shader uniform
//     getAnimTime()                current animation clock, for play rows
//     audioSystem                  optional; receives the slider map for the worklet
//     onCommit()                   called when a drag/typed value is written back
//                                  to the source (the app suppresses its
//                                  "Compiling..." toast for that recompile)
//     materialVariables()          optional, the variables the Materials panel
//                                  shows, which get no row here
//   renderSliderPanel(sliders, uiControls)
//                                  rebuild rows from a compile's `sliders[]`,
//                                  and colour rows from its `uiControls[]` of
//                                  kind "color"
//   sliderAnimTick()               rAF callback; the app re-arms it when the
//                                  global clock resumes
//
// A colour row talks to the app the way the scene gizmos do: "gsl-ui/input"
// carries the live uniform values and "gsl-ui/commit" the literal to write,
// so the app's two existing listeners serve it unchanged.
import { readSourceSpan, replaceSourceSpan } from "../editor/editor.js";
import eventManager from "../ui/event-manager.js";
import { rgbToHex, hexToRgb } from "./body-palette.js";

let deps = {
    setSliderValue: () => {},
    getAnimTime: () => 0,
    audioSystem: null,
    onCommit: () => {},
};

export function initSliderPanel(options = {}) {
    deps = { ...deps, ...options };
}

//
// One row per top-level variable assigned a literal with both `.min`
// and `.max` properties set. Dragging a slider rewrites the literal in
// the editor (replaceSourceSpan tags it as a "scrub" userEvent), which
// triggers the normal debounced recompile path. The next compile
// returns updated `sliders[]` whose Span reflects any
// length change in the literal, so the row's cached span stays in
// sync.
const sliderPanel = document.getElementById('slider-panel');
const sliderPanelBody = document.getElementById('slider-panel-body');

// Track per-name dragging state. While a slider is mid-drag we suppress
// re-rendering its row so the user's grip stays steady; new compile
// metadata is still cached on the row's dataset for the next drag.
const sliderDragging = new Set();

// One-shot guard: open the Parameters panel the first time any sliders
// appear in a compile, then stop forcing it open so later compiles
// don't undo a user's deliberate close.
let sliderPanelAutoOpened = false;

function sliderRowId(name) {
    return 'slider-row-' + name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// quantiseToDecimals rounds v to the nearest multiple of 10^-decimals,
// matching the rounding step the author chose in the source literal:
// `radius = 5` → 0 decimals → step 1 (4.73 → 5);
// `radius = 0.5` → 1 decimal → step 0.1 (4.73 → 4.7);
// `radius = 2.00` → 2 decimals → step 0.01 (4.73 → 4.73);
// `radius = 0.025` → 3 decimals → step 0.001.
function quantiseToDecimals(v, decimals) {
    if (!Number.isFinite(v) || typeof decimals !== 'number' || decimals < 0) return v;
    const k = Math.pow(10, decimals);
    return Math.round(v * k) / k;
}

// formatSliderValue returns the canonical text representation at the
// given decimal-place count. toFixed pads with trailing zeros so a
// drag from `2.00` to a clean integer commits as `5.00` rather than
// silently dropping the precision.
function formatSliderValue(v, decimals) {
    if (!Number.isFinite(v)) return '0';
    if (typeof decimals !== 'number' || decimals < 0) {
        const n = parseFloat(v.toFixed(4));
        return Number.isInteger(n) ? n.toFixed(1) : String(n);
    }
    return v.toFixed(Math.min(decimals, 20));
}

function spanFromSliderInfo(s) {
    const ls = s.span || {};
    return {
        startLine: ls.startLine, startColumn: ls.startColumn,
        endLine: ls.endLine, endColumn: ls.endColumn,
    };
}

// sliderStep returns the granularity for a slider's range input.
// We use step='any' so the thumb glides continuously; quantisation
// happens in JS via quantiseToDecimals when committing or displaying
// the value. Keeping the range continuous means dragging never
// "snaps" awkwardly under the pointer.
function sliderStep() {
    return 'any';
}

// Per-row animation state for sliders annotated with `.period`. Keyed
// by variableName. `paused` is per-row (the play/pause button); `last`
// is the most recent quantised value we wrote so the tick can skip the
// uniform write when nothing changed — which keeps the rAF loop cheap
// when the global animation clock is frozen (deps.getAnimTime() returns a
// constant under pause, so the phase doesn't advance).
const sliderAnim = new Map();

function sliderAnimTick() {
    if (sliderAnim.size === 0) return;
    // Drive the sinusoid from the shared animation clock so the global
    // play/pause control freezes animated sliders the same way it
    // freezes everything else. deps.getAnimTime() returns the time-at-pause
    // when paused, so the phase doesn't advance.
    const t = deps.getAnimTime();
    let alive = false;
    for (const [name, st] of sliderAnim) {
        if (st.paused) continue;
        alive = true;
        // No offset by design: every animated slider crosses its
        // midpoint at t=0, so the parameter family stays phase-aligned.
        const phase = (2 * Math.PI * t) / st.period;
        const mid = (st.min + st.max) / 2;
        const halfRange = (st.max - st.min) / 2;
        const raw = mid + halfRange * Math.sin(phase);
        const v = quantiseToDecimals(raw, st.decimals);
        if (v === st.last) continue;
        st.last = v;
        const row = document.getElementById(sliderRowId(name));
        if (row) {
            const range = row.querySelector('input[type=range]');
            const number = row.querySelector('input[type=number]');
            if (range && document.activeElement !== range) range.value = String(v);
            if (number && document.activeElement !== number) number.value = formatSliderValue(v, st.decimals);
        }
        deps.setSliderValue(name, v);
    }
    if (alive) requestAnimationFrame(sliderAnimTick);
}

function renderSliderPanel(allSliders, uiControls = []) {
    if (!sliderPanel) return;
    const allColours = colorControls(uiControls);
    colourControlsByName = new Map(allColours.map((c) => [colorLabel(c), c]));
    // An animated slider is driven from this panel's rows, so it keeps its row.
    const elsewhere = deps.materialVariables?.() || new Set();
    const sliders = allSliders.filter((s) => s.period > 0 || !elsewhere.has(s.variableName));
    const colours = allColours.filter((c) => !elsewhere.has(colorLabel(c)));

    // Seed the audio worklet's slider map with the latest values.
    // The patched-const audio code reads from this map every sample;
    // without seeding, the first drag for a fresh slider name would
    // be the only way the worklet learned about it.
    const audioSliderMap = {};
    for (const s of allSliders) audioSliderMap[s.variableName] = s.initialValue;
    deps.audioSystem?.setSliderMap(audioSliderMap);

    if (!sliders.length && !colours.length) {
        // No qualifying variables — clear the slider rows but leave
        // the panel itself visible: it also hosts the always-relevant
        // animation clock controls below the slider list.
        sliderPanelBody.innerHTML = '';
        sliderDragging.clear();
        sliderAnim.clear();
        return;
    }

    // Auto-open the panel the first time slider rows appear so the
    // user sees the parameter controls without hunting for the
    // collapsed header. Tracked once per page-load — subsequent
    // close/open is up to the user.
    if (!sliderPanelAutoOpened) {
        sliderPanelAutoOpened = true;
        sliderPanel.classList.add('open');
    }

    // Reconcile rows by variableName so the panel doesn't lose drag
    // state when the backend recomputes spans after a scrub.
    const wanted = new Set([...sliders.map(s => s.variableName), ...colours.map(colorRowKey)]);
    for (const child of [...sliderPanelBody.children]) {
        if (!wanted.has(child.dataset.name)) child.remove();
    }
    for (const s of sliders) {
        const id = sliderRowId(s.variableName);
        let row = document.getElementById(id);
        const needsPlayBtn = !!(s.period && s.period > 0);
        const hasPlayBtn = row ? !!row.querySelector('.slider-play-btn') : false;
        if (row && needsPlayBtn !== hasPlayBtn) {
            // The .period property was added or removed since the last
            // compile. Replace the row so the leading control cell
            // matches and listeners stay clean.
            row.remove();
            row = null;
        }
        if (!row) {
            row = makeSliderRow(s);
            sliderPanelBody.appendChild(row);
        } else {
            updateSliderRow(row, s);
        }
    }
    for (const c of colours) {
        const row = document.getElementById(sliderRowId(colorRowKey(c)));
        if (!row) sliderPanelBody.appendChild(makeColorRow(c));
        else updateColorRow(row, c);
    }
    reconcileSliderAnim(sliders);
}

// colourControlsByName are the last compile's colour controls, by variable,
// including the ones another panel shows.
let colourControlsByName = new Map();

// previewColor drives a `@color` variable's uniforms without touching the
// source, as a colour row does while its chip is open.
function previewColor(name, rgb) {
    const c = colourControlsByName.get(name);
    if (!c) return;
    eventManager.dispatchEvent('gsl-ui/input', {
        kind: 'color',
        span: spanFromSliderInfo(c),
        value: rgb,
        params: c.params.map((p, i) => ({ paramName: p.paramName, value: rgb[i] })),
    });
}

// colorControls are the compile's colour controls: a `@color` literal is
// three editable components, like a point's, reported under kind "color".
function colorControls(uiControls) {
    return (uiControls || []).filter((c) => c?.kind === 'color'
        && Array.isArray(c.value) && c.value.length === 3
        && Array.isArray(c.params) && c.params.length === 3);
}

// colorRowKey identifies a colour row across compiles. A control has no
// variable name of its own, so the literal's position stands in; an edit
// that moves the literal makes a new row, which costs nothing.
function colorRowKey(c) {
    return `color:${c.span?.startLine}:${c.span?.startColumn}`;
}

// colorLabel names a colour row after the variable the literal is assigned
// to, read off the editor line in front of it: `@color coat = [` or
// `coat = @color [`. A literal inside a call has no name and is labelled by
// its line.
function colorLabel(c) {
    const span = c.span || {};
    try {
        const before = readSourceSpan({
            startLine: span.startLine, startColumn: 1,
            endLine: span.startLine, endColumn: span.startColumn,
        });
        const m = before.match(/([A-Za-z_]\w*)\s*=\s*(?:@color\s*)?$/);
        if (m) return m[1];
    } catch {
        // No editor line to read: fall through to the position.
    }
    return `color, line ${span.startLine}`;
}

// colorLiteral writes an sRGB colour the way the Bodies panel does
// (material-assign.js's colorLiteralText): three channels to three decimals,
// which every 8-bit value survives, trailing zeros dropped.
function colorLiteral(rgb) {
    const channel = (v) => String(Number(Math.max(0, Math.min(1, v)).toFixed(3)));
    return `[${rgb.map(channel).join(', ')}]`;
}

function chipHex(rgb) {
    return rgbToHex(rgb.map((v) => Math.max(0, Math.min(1, Number(v) || 0))));
}

// makeColorRow is a Parameters row for a `@color` literal: the name, the
// 22px control cell every row reserves, a colour chip where a slider row has
// its range, and the hex where it has its number. The chip's `input` drives
// the three uniforms live; `change` writes the literal back to the source,
// which recompiles as a slider commit does.
function makeColorRow(c) {
    const row = document.createElement('div');
    row.className = 'slider-row color-row';
    row.id = sliderRowId(colorRowKey(c));
    row.dataset.name = colorRowKey(c);
    row.dataset.span = JSON.stringify(spanFromSliderInfo(c));
    row.dataset.params = JSON.stringify(c.params.map((p) => p.paramName));

    const label = document.createElement('span');
    label.className = 'slider-label';
    label.textContent = colorLabel(c);

    const spacer = document.createElement('span');
    spacer.className = 'slider-control-spacer';

    const chip = document.createElement('input');
    chip.type = 'color';
    chip.value = chipHex(c.value);
    chip.title = 'Pick a color: drag to preview, release to write it to the document.';

    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'field-panel-label color-hex';
    hex.value = chip.value;
    hex.spellcheck = false;

    const onLive = (rgb) => {
        const span = JSON.parse(row.dataset.span);
        const params = JSON.parse(row.dataset.params);
        if (document.activeElement !== hex) hex.value = rgbToHex(rgb);
        eventManager.dispatchEvent('gsl-ui/input', {
            kind: 'color',
            span,
            value: rgb,
            params: params.map((paramName, i) => ({ paramName, value: rgb[i] })),
        });
    };
    const commitToSource = (rgb) => {
        const span = JSON.parse(row.dataset.span);
        const text = colorLiteral(rgb);
        deps.onCommit();
        eventManager.dispatchEvent('gsl-ui/commit', { span, text });
        // As a slider row does: assume the text landed where the span was,
        // until the next compile reports the authoritative span.
        row.dataset.span = JSON.stringify({
            startLine: span.startLine, startColumn: span.startColumn,
            endLine: span.startLine, endColumn: span.startColumn + text.length,
        });
    };

    chip.addEventListener('input', () => onLive(hexToRgb(chip.value)));
    chip.addEventListener('change', () => commitToSource(hexToRgb(chip.value)));
    hex.addEventListener('change', () => {
        const text = hex.value.trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(text)) {
            hex.value = chip.value;
            return;
        }
        chip.value = text.toLowerCase();
        const rgb = hexToRgb(chip.value);
        onLive(rgb);
        commitToSource(rgb);
    });

    row.append(label, spacer, chip, hex);
    return row;
}

function updateColorRow(row, c) {
    row.dataset.span = JSON.stringify(spanFromSliderInfo(c));
    row.dataset.params = JSON.stringify(c.params.map((p) => p.paramName));
    const label = row.querySelector('.slider-label');
    if (label) label.textContent = colorLabel(c);
    const chip = row.querySelector('input[type=color]');
    const hex = row.querySelector('.color-hex');
    if (chip && document.activeElement !== chip) chip.value = chipHex(c.value);
    if (hex && document.activeElement !== hex) hex.value = chipHex(c.value);
}

// Reconcile per-row animation state against the latest sliders[]. Adds
// entries for sliders that just gained a positive period, drops entries
// for sliders that lost it (or disappeared), and updates the parameters
// of the rest without resetting their paused flag.
function reconcileSliderAnim(sliders) {
    const wanted = new Set();
    for (const s of sliders) {
        if (!s.period || s.period <= 0) continue;
        wanted.add(s.variableName);
        const decimals = decimalsForSlider(s);
        const existing = sliderAnim.get(s.variableName);
        if (existing) {
            existing.min = s.min;
            existing.max = s.max;
            existing.period = s.period;
            existing.decimals = decimals;
        } else {
            sliderAnim.set(s.variableName, {
                min: s.min,
                max: s.max,
                period: s.period,
                decimals,
                paused: false,
                last: NaN,
            });
        }
    }
    for (const name of [...sliderAnim.keys()]) {
        if (!wanted.has(name)) sliderAnim.delete(name);
    }
    // Kick the loop if any animation is running and the rAF chain is
    // not already pumping. sliderAnimTick is self-rescheduling while at
    // least one non-paused entry exists.
    if ([...sliderAnim.values()].some(st => !st.paused)) {
        requestAnimationFrame(sliderAnimTick);
    }
}

// decimalsForSlider returns the decimal-place count for a slider row.
// Prefers the editor's actual literal text over the wire value — the
// editor is what we'll write back to, and any race between source
// edits and the backend's view (the backend may see a stale source,
// or its span may not cover trailing zeros) gets resolved in favor
// of what the user can see right now. The wire value is a fallback
// for when readSourceSpan can't recover a usable literal.
function decimalsForSlider(s) {
    const text = readSourceSpan(spanFromSliderInfo(s));
    const fromText = countDecimals(text);
    if (text.length > 0) return fromText;
    if (typeof s.decimals === 'number' && s.decimals >= 0) return s.decimals;
    return 0;
}

function makeSliderRow(s) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.id = sliderRowId(s.variableName);
    row.dataset.name = s.variableName;
    row.dataset.span = JSON.stringify(spanFromSliderInfo(s));
    row.dataset.decimals = String(decimalsForSlider(s));

    const label = document.createElement('span');
    label.className = 'slider-label';
    label.textContent = s.variableName;

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(s.min);
    range.max = String(s.max);
    range.step = sliderStep();
    range.value = String(s.initialValue);

    const number = document.createElement('input');
    number.type = 'number';
    number.step = 'any';
    number.className = 'field-panel-label';
    number.value = formatSliderValue(s.initialValue, decimalsForSlider(s));

    // onLive updates the GPU uniform for this slider — no recompile,
    // no editor edit, no debounced source change. The editor stays at
    // the pre-drag value the whole time so save / AI / undo see a
    // stable snapshot.
    const onLive = (v) => {
        // Use Number.isFinite, not `|| 0`, because 0 (integer step) is a
        // valid count — `|| 1` would silently bump integers to tenths.
        const parsed = parseInt(row.dataset.decimals, 10);
        const sf = Number.isFinite(parsed) ? parsed : 0;
        const q = quantiseToDecimals(v, sf);
        if (document.activeElement !== range) range.value = String(q);
        if (document.activeElement !== number) number.value = formatSliderValue(q, sf);
        deps.setSliderValue(s.variableName, q);
    };

    // commitToSource writes the final value back to the editor at the
    // end of a drag (or on number-input blur). The replaceSourceSpan
    // edit fires onChange, which debounce-triggers a recompile; the
    // resulting response carries an updated initialValue for this
    // slider and a fresh span, which updateSliderRow installs before
    // the next drag.
    const commitToSource = () => {
        const v = parseFloat(range.value);
        if (!Number.isFinite(v)) return;
        let span = JSON.parse(row.dataset.span);

        // Snap the span and sig-fig count to the *current* literal in
        // the editor, not the values cached from the last compile. This
        // matters when the user edits the source (e.g. typing `.00`
        // after `2`) and then drags the slider before the 500ms
        // debounced recompile lands — without this fix the commit
        // would write the OLD precision over the user's freshly-typed
        // extra digits. resolveLiteralAt walks the editor line to find
        // the literal's actual boundary.
        const resolved = resolveLiteralAt(span);
        let sf;
        if (resolved) {
            span = resolved.span;
            sf = resolved.decimals;
        } else {
            // Number.isFinite, not `|| 0`, because 0 (integer step) is
            // a legitimate count — falsy fallback would treat ints as
            // having 1 decimal.
            const parsed = parseInt(row.dataset.decimals, 10);
            sf = Number.isFinite(parsed) ? parsed : 0;
        }

        const text = formatSliderValue(quantiseToDecimals(v, sf), sf);

        // Defensive: if our text starts with `-` and the cached span
        // begins right after an existing `-` in the editor, extend
        // the span back one column to overwrite that sign. Otherwise
        // we'd write "-3" immediately after the existing minus and
        // produce "--3". Covers stale spans and positive→negative
        // commit races that resolveLiteralAt didn't already extend.
        if (text.length > 0 && text[0] === '-' && span.startColumn > 1) {
            const probe = readSourceSpan({
                startLine: span.startLine,
                startColumn: span.startColumn - 1,
                endLine: span.startLine,
                endColumn: span.startColumn,
            });
            if (probe === '-') {
                span = { ...span, startColumn: span.startColumn - 1 };
            }
        }

        // Mark the upcoming compile as slider-driven so the
        // "Compiling..." toast is suppressed. Cleared when the compile
        // resolves via markCompileResolved.
        deps.onCommit();
        replaceSourceSpan(span, text);
        // Optimistically update the cached span to match the text we
        // just wrote. The next compile will overwrite with the
        // authoritative span — but if the user starts a new drag
        // before that lands, this keeps us pointing at the right range.
        row.dataset.span = JSON.stringify({
            startLine: span.startLine,
            startColumn: span.startColumn,
            endLine: span.startLine,
            endColumn: span.startColumn + text.length,
        });
    };

    range.addEventListener('pointerdown', () => sliderDragging.add(s.variableName));
    // pointerup just clears the drag flag; the matching `change` event
    // below handles the actual commit. That keeps a single commit path
    // for both pointer release and keyboard-arrow value changes
    // (both fire `change`).
    range.addEventListener('pointerup', () => sliderDragging.delete(s.variableName));
    range.addEventListener('pointercancel', () => sliderDragging.delete(s.variableName));
    range.addEventListener('input', () => onLive(parseFloat(range.value)));
    range.addEventListener('change', () => commitToSource());

    number.addEventListener('input', () => {
        const text = number.value;
        const v = parseFloat(text);
        if (!Number.isFinite(v)) return;
        // Adopt the typed precision as the row's new sig-fig count.
        // Counting digits in the typed text mirrors the backend's
        // literal-sig-fig logic, so a typed "0.50" reads as 2 sf,
        // "1.250" as 4 sf, "5" as 1 sf, "100" as 3 sf — the next drag
        // quantises to the precision the user just declared.
        const typed = countDecimals(text);
        if (typed !== (parseInt(row.dataset.decimals, 10) || 0)) {
            row.dataset.decimals = String(typed);
            // Animated rows pull their decimals from sliderAnim; keep
            // it in sync so the auto-driver quantises to the new
            // precision on the next tick.
            const st = sliderAnim.get(s.variableName);
            if (st) st.decimals = typed;
        }
        onLive(v);
    });
    // Typed number commits on Enter or blur — the user isn't dragging
    // a thumb so there's no pointerup to hook.
    number.addEventListener('change', commitToSource);

    row.appendChild(label);
    // Control cell — animated rows host the play/pause toggle here,
    // static rows leave it as an empty spacer. Either way it reserves
    // a fixed 22px column between the parameter name and the range
    // slider, so the slider/number columns stay aligned across all
    // rows (the cell eats into the name column, not the slider).
    if (s.period && s.period > 0) {
        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'slider-play-btn';
        playBtn.textContent = '⏸'; // ⏸ — animation starts running
        playBtn.title = 'Pause animation';
        playBtn.addEventListener('click', () => {
            const st = sliderAnim.get(s.variableName);
            if (!st) return;
            st.paused = !st.paused;
            playBtn.textContent = st.paused ? '▶' : '⏸'; // ▶ / ⏸
            playBtn.title = st.paused ? 'Resume animation' : 'Pause animation';
            if (!st.paused) requestAnimationFrame(sliderAnimTick);
        });
        row.appendChild(playBtn);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'slider-control-spacer';
        row.appendChild(spacer);
    }
    row.appendChild(range);
    row.appendChild(number);
    return row;
}

function updateSliderRow(row, s) {
    // During a drag burst, trust the synchronously-updated span over
    // any backend response that may have been computed against a
    // pre-scrub source.
    if (sliderDragging.has(s.variableName)) return;

    row.dataset.span = JSON.stringify(spanFromSliderInfo(s));
    row.dataset.decimals = String(decimalsForSlider(s));

    const range = row.querySelector('input[type=range]');
    const number = row.querySelector('input[type=number]');
    if (range && document.activeElement !== range) {
        range.min = String(s.min);
        range.max = String(s.max);
        range.step = sliderStep();
        range.value = String(s.initialValue);
    }
    // Skip the number input when it's focused — the user might be
    // mid-typing and clobbering it would erase their value.
    if (number && document.activeElement !== number) {
        number.value = formatSliderValue(s.initialValue, decimalsForSlider(s));
    }
}

// resolveLiteralAt finds the actual numeric literal at the given
// 1-based (startLine, startColumn) in the editor, extending forward
// until it hits a non-literal char. Returns the matched span (1-based,
// end-exclusive) and the sig-fig count from the literal text — used
// at commit time so a slider rewrite uses the editor's *current*
// literal precision rather than the (possibly stale) cached values
// from the last compile. Tolerates the cached startColumn being one
// past a leading `-` and recovers it.
//
// Returns null if no well-formed numeric literal sits at the position
// (e.g. the user just typed something that isn't a number — let the
// caller fall back to cached state in that case).
function resolveLiteralAt(span) {
    const line = readSourceSpan({
        startLine: span.startLine,
        startColumn: 1,
        endLine: span.startLine,
        endColumn: 1 << 30, // readSourceSpan clamps to doc length
    });
    if (!line) return null;
    // 0-based index in the line where the cached span starts.
    let i = Math.max(0, (span.startColumn || 1) - 1);
    // If the char before is `-`, the cached span starts at the digit;
    // step back to include the sign.
    if (i > 0 && line[i - 1] === '-') i -= 1;
    const start = i;
    // Optional leading minus.
    if (line[i] === '-') i++;
    let sawDigit = false;
    let sawDot = false;
    while (i < line.length) {
        const c = line[i];
        if (c >= '0' && c <= '9') { sawDigit = true; i++; }
        else if (c === '.' && !sawDot) { sawDot = true; i++; }
        else break;
    }
    if (!sawDigit) return null;
    const literal = line.slice(start, i);
    return {
        span: {
            startLine: span.startLine,
            startColumn: start + 1,
            endLine: span.startLine,
            endColumn: i + 1,
        },
        text: literal,
        decimals: countDecimals(literal),
    };
}

// countDecimals reads a numeric string and returns the number of
// digits after the decimal point. Mirrors the backend's
// literalDecimals so a typed value in the number input adopts the
// same precision policy as a source-literal value.
function countDecimals(text) {
    if (typeof text !== 'string') return 0;
    const dot = text.indexOf('.');
    if (dot < 0) return 0;
    let count = 0;
    for (let i = dot + 1; i < text.length; i++) {
        const c = text[i];
        if (c < '0' || c > '9') break;
        count++;
    }
    return count;
}

const sliderPanelHeader = document.getElementById('slider-panel-header');
if (sliderPanelHeader) {
    sliderPanelHeader.addEventListener('click', (e) => {
        if (e.target.classList.contains('panel-close')) {
            sliderPanel.classList.remove('open');
        } else if (!sliderPanel.classList.contains('open')) {
            sliderPanel.classList.add('open');
        }
    });
}

export { renderSliderPanel, sliderAnimTick, previewColor };
