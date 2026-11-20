// The Detail slider: the detail ladder (gsl-shading.js) as one track with a
// handle for each rung. The track is a part's size on screen, the shortest
// edge of its box in pixels, on a log scale from half a pixel to 512 with
// "any size" at the left end and "all sizes" at the right. A handle is the
// size below which a part gives that thing up: displacement, its full model
// for its stand-in (name.simple), its textures, or the part itself.
// Each handle moves on its own and may pass the others, so any rung can be
// kept at every size (the left end) or given up at every size (the right).
//
// Dragging writes detailKnobsU, a uniform, so the shaders
// never recompile; onChange then asks for a frame. Over the track, a
// histogram shows how many parts are at each size on screen now
// (showPartSizes), and under it a checkbox shows their boxes (onShowBoxes). Styles are
// detail-slider.css.

import { DETAIL, detailKnobsU } from "../render/gsl-shading.js";

// The rungs from the smallest parts to the largest, with the component of
// detailKnobsU each one drives.
const RUNGS = [
  { key: "vanishPx", knob: "w", label: "Gone", cls: "vanish",
    title: "Below this a part shrinks away and is not computed at all" },
  { key: "texturesPx", knob: "y", label: "Textures", cls: "textures",
    title: "Below this a part's textures fade their fine detail, and its textured colours and materials draw as their flat stand-ins (name.simple), together, and are not computed" },
  { key: "simplifiedPx", knob: "z", label: "Simple", cls: "simplified",
    title: "Below this a part with a stand-in (name.simple) draws the stand-in, keeping its colour and material unless the stand-in has its own" },
  { key: "displacementPx", knob: "x", label: "Relief", cls: "displacement",
    title: "Below this a part loses its displacement" },
];

// The track's scale: each doubling is an equal step, from half a pixel just
// right of the left end to MAX_PX, one step short of the right end, where
// 2 MAX_PX would be. The left
// end itself is "any size", the rung kept at every size, and the right end is
// "all sizes", the rung given up at every size, which ALL_PX stands for:
// larger than any part on any screen. Between MAX_PX and the end is MAX_PX.
const MAX_PX = 512;
const STEPS = Math.log2(MAX_PX) + 2;
const ALL_PX = 1e6;

function pxAt(t) {
  if (t <= 0) return 0;
  if (t >= 1) return ALL_PX;
  return Math.min(MAX_PX, Math.round(Math.pow(2, t * STEPS - 1) * 10) / 10);
}

function tAt(px) {
  if (px >= ALL_PX) return 1;
  return px <= 0 ? 0 : Math.min(1, Math.max(0, (Math.log2(px) + 1) / STEPS));
}

function describe(rung, px) {
  if (px <= 0) return `${rung.label}: kept at any size`;
  if (px >= ALL_PX) return `${rung.label}: given up at every size`;
  return `${rung.label}: below ${px < 10 ? px.toFixed(1) : Math.round(px)} px`;
}

// The histogram's bins: two to an octave, across the track.
const BINS = 2 * STEPS;

// drawSizes draws the histogram of sizes, in pixels, on the canvas: a bar per
// bin, as tall as its share of the fullest, with parts past "all" in the
// last. It is empty with no parts.
let drawSizes = null;

// showPartSizes shows the parts' sizes on screen, in pixels, on the bound
// slider's histogram. A viewer calls it every frame.
export function showPartSizes(sizes) {
  drawSizes?.(sizes);
}

// bindDetailSlider builds the slider inside the element with the given id
// and returns it, or null when the element is missing. onChange runs after
// every move, and onShowBoxes with the "Show boxes" checkbox's state when it
// changes.
export function bindDetailSlider(id, onChange, onShowBoxes) {
  const root = document.getElementById(id);
  if (!root) return null;
  root.classList.add("detail-slider");
  root.replaceChildren();

  const track = document.createElement("div");
  track.className = "detail-track";
  root.appendChild(track);

  const ticks = document.createElement("div");
  ticks.className = "detail-ticks";
  for (const px of [1, 4, 16, 64, 256]) {
    const tick = document.createElement("span");
    tick.style.left = `${tAt(px) * 100}%`;
    tick.textContent = String(px);
    ticks.appendChild(tick);
  }
  const anyTick = document.createElement("span");
  anyTick.style.left = "0%";
  anyTick.textContent = "any";
  anyTick.className = "detail-tick-any";
  ticks.appendChild(anyTick);
  const allTick = document.createElement("span");
  allTick.style.left = "100%";
  allTick.textContent = "all";
  allTick.className = "detail-tick-all";
  ticks.appendChild(allTick);
  root.appendChild(ticks);

  // The histogram sits over the slider, on the track's scale, and the
  // checkbox under it.
  root.parentElement?.querySelectorAll(":scope > .detail-hist, :scope > .detail-boxes").forEach((e) => e.remove());
  const hist = document.createElement("canvas");
  hist.className = "detail-hist";
  hist.title = "Parts at each size on screen";
  let lastKey = "";
  drawSizes = (sizes) => {
    const counts = new Array(BINS).fill(0);
    for (const px of sizes) {
      counts[Math.min(BINS - 1, Math.floor(tAt(px) * BINS))]++;
    }
    const key = counts.join(",");
    const w = Math.max(1, Math.round(hist.clientWidth * devicePixelRatio));
    const h = Math.max(1, Math.round(hist.clientHeight * devicePixelRatio));
    if (key === lastKey && hist.width === w && hist.height === h) return;
    lastKey = key;
    hist.width = w;
    hist.height = h;
    const ctx = hist.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const most = Math.max(1, ...counts);
    ctx.fillStyle = getComputedStyle(hist).color;
    counts.forEach((n, i) => {
      if (n === 0) return;
      const bar = Math.max(1, Math.round((n / most) * h));
      const x0 = Math.round((i / BINS) * w);
      const x1 = Math.round(((i + 1) / BINS) * w);
      ctx.fillRect(x0, h - bar, Math.max(1, x1 - x0 - 1), bar);
    });
  };

  const boxes = document.createElement("label");
  boxes.className = "detail-boxes";
  const boxesCheck = document.createElement("input");
  boxesCheck.type = "checkbox";
  boxesCheck.addEventListener("change", () => onShowBoxes?.(boxesCheck.checked));
  boxes.append(boxesCheck, " Show boxes");
  root.before(hist);
  root.after(boxes);

  const values = RUNGS.map((r) => tAt(DETAIL[r.key]));

  const handles = RUNGS.map((rung, i) => {
    const h = document.createElement("div");
    h.className = `detail-handle detail-${rung.cls}${rung.inert ? " detail-inert" : ""}`;
    h.tabIndex = 0;
    h.setAttribute("role", "slider");
    h.setAttribute("aria-label", rung.label);
    h.setAttribute("aria-valuemin", "0");
    h.setAttribute("aria-valuemax", String(MAX_PX));
    const tag = document.createElement("span");
    tag.className = "detail-tag";
    tag.textContent = rung.label;
    h.appendChild(tag);
    track.appendChild(h);
    return h;
  });

  const publish = () => {
    RUNGS.forEach((r, i) => {
      detailKnobsU.value[r.knob] = pxAt(values[i]);
    });
    onChange?.();
  };

  const layout = () => {
    handles.forEach((h, i) => {
      const px = pxAt(values[i]);
      h.style.left = `${values[i] * 100}%`;
      h.setAttribute("aria-valuenow", String(px));
      h.setAttribute("aria-valuetext", describe(RUNGS[i], px));
      h.title = `${describe(RUNGS[i], px)}. ${RUNGS[i].title}`;
    });
  };

  // A handle moves anywhere on the track, past the others: each rung is its
  // own threshold, so no order among them is needed.
  const moveTo = (i, t) => {
    values[i] = Math.min(1, Math.max(0, t));
    layout();
    publish();
  };

  const tFromEvent = (e) => {
    const r = track.getBoundingClientRect();
    return (e.clientX - r.left) / Math.max(1, r.width);
  };

  handles.forEach((h, i) => {
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      h.classList.add("dragging");
      h.focus();
    });
    h.addEventListener("pointermove", (e) => {
      if (h.hasPointerCapture(e.pointerId)) moveTo(i, tFromEvent(e));
    });
    const release = (e) => {
      if (h.hasPointerCapture(e.pointerId)) h.releasePointerCapture(e.pointerId);
      h.classList.remove("dragging");
    };
    h.addEventListener("pointerup", release);
    h.addEventListener("pointercancel", release);
    h.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 1 / STEPS : 1 / (4 * STEPS);
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") moveTo(i, values[i] - step);
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") moveTo(i, values[i] + step);
      else if (e.key === "Home") moveTo(i, 0);
      else if (e.key === "End") moveTo(i, 1);
      else return;
      e.preventDefault();
    });
  });

  // A click on the track moves the nearest handle there.
  track.addEventListener("pointerdown", (e) => {
    if (e.target !== track) return;
    const t = tFromEvent(e);
    let best = 0;
    values.forEach((v, i) => {
      if (Math.abs(v - t) < Math.abs(values[best] - t)) best = i;
    });
    moveTo(best, t);
  });

  layout();
  publish();
  return root;
}
