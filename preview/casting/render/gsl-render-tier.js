// Render tiers for the GSL raymarch viewer.
//
// A viewer draws its shape pass at one of two tiers, chosen by whether
// anything is moving:
//
//   standard  the full shader at full resolution
//   draft     the shape pass into a smaller target (DRAFT_SCALE of the full
//             one) with the ambient-occlusion loop off, half the primary
//             step budget, and glass cut to one sharp refraction in and out
//             (1 sample, cone 0, 2 bounces)
//
// Draft is drawn while the camera or a slider moves. DRAFT_SETTLE_MS after
// the last change the tracker calls back and the viewer draws one standard
// frame. The choice is a uniform write, never a recompile: the draft knobs
// are set just before the shape pass and restored straight after it, so the
// values a user set through window.gslShading are never overwritten.
//
// The composite reads the draft target with nearest sampling, so the shape
// index packed into its alpha is never blended, and steps its outline
// neighbours by one draft texel.

import { glassKnobsU, renderKnobsU, detailKnobsU, detailKnobs2U, setShading } from "./gsl-shading.js";

export const DRAFT_SCALE = 0.5;
export const DRAFT_SETTLE_MS = 150;

const MOVING_TIER_KEY = "gsl.movingTier";
const REST_TIER_KEY = "gsl.restTier";
const REST_DEVICE_KEY = "gsl.restDevice";

// The tier drawn while something moves: "draft" or "standard".
let movingTier = "draft";
try {
  const saved = localStorage.getItem(MOVING_TIER_KEY);
  if (saved === "draft" || saved === "standard") movingTier = saved;
} catch {
  // Storage can be unavailable (private window, blocked site data).
}

// The tier drawn once nothing moves: "standard"; "progressive", which
// draws the standard frame and then accumulates path-traced samples on it
// (gsl-trace.js); "color", the standard frame as if the program authored no
// material; or "simple", the Schematic frame (gsl-simple.js), which is also
// drawn while moving.
const REST_TIERS = ["simple", "color", "standard", "progressive"];
let restTier = "standard";
try {
  const saved = localStorage.getItem(REST_TIER_KEY);
  if (REST_TIERS.includes(saved)) restTier = saved;
} catch {
  // See above.
}

export function getRestTier() {
  return restTier;
}

export function setRestTier(tier) {
  restTier = REST_TIERS.includes(tier) ? tier : "standard";
  try {
    localStorage.setItem(REST_TIER_KEY, restTier);
  } catch {
    // See above.
  }
}

// What draws the tier at rest: "gpu", or "cpu", the same tier redrawn
// on the server by litrender once nothing moves. Progressive is GPU only.
const REST_DEVICES = ["gpu", "cpu"];
let restDevice = "gpu";
try {
  const saved = localStorage.getItem(REST_DEVICE_KEY);
  if (REST_DEVICES.includes(saved)) restDevice = saved;
} catch {
  // See above.
}

export function getRestDevice() {
  return restDevice;
}

export function setRestDevice(device) {
  restDevice = REST_DEVICES.includes(device) ? device : "gpu";
  try {
    localStorage.setItem(REST_DEVICE_KEY, restDevice);
  } catch {
    // See above.
  }
}

export function getMovingTier() {
  return movingTier;
}

export function setMovingTier(tier) {
  movingTier = tier === "standard" ? "standard" : "draft";
  try {
    localStorage.setItem(MOVING_TIER_KEY, movingTier);
  } catch {
    // See above.
  }
}

// withDraftKnobs runs draw with the draft values in the render and glass
// knobs, then restores whatever was there. draw must render synchronously.
// pixelRatio is how many screen pixels a draft pixel spans: the Detail
// ladder's rungs, in pixels, are divided by it, so a part is judged by its
// size on the screen, as at rest, and nothing swaps in or out while moving.
export function withDraftKnobs(draw, pixelRatio = 1) {
  const g = glassKnobsU.value;
  const r = renderKnobsU.value;
  const d = detailKnobsU.value;
  const d2 = detailKnobs2U.value;
  const savedGlass = g.clone();
  const savedRender = r.clone();
  const savedDetail = d.clone();
  const savedDetail2 = d2.clone();
  // Glass steps keep their value: the secondary march's budget is what
  // lets a refracted ray reach the far side at all.
  g.set(1, 0, 2, g.w);
  r.set(0, 0.5, r.z, 0);
  d.divideScalar(pixelRatio);
  d2.divideScalar(pixelRatio);
  try {
    draw();
  } finally {
    g.copy(savedGlass);
    r.copy(savedRender);
    d.copy(savedDetail);
    d2.copy(savedDetail2);
  }
}

// MotionTracker reports whether the view is moving. note() is called on
// every camera or slider change; onSettle runs once DRAFT_SETTLE_MS pass
// without another.
export class MotionTracker {
  constructor(onSettle, settleMs = DRAFT_SETTLE_MS) {
    this.onSettle = onSettle;
    this.settleMs = settleMs;
    this.moving = false;
    this.timer = null;
  }

  note() {
    this.moving = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.moving = false;
      this.onSettle();
    }, this.settleMs);
  }

  // noteCamera is note() for a controls "change", counted only when the
  // camera actually moved, which it returns. Re-anchoring the orbit pivot
  // on a click also fires "change" but leaves the camera in place (to
  // rounding), and a draft frame there flashes the selection at half
  // resolution.
  noteCamera(camera) {
    const s = this.cameraState;
    const p = camera.position;
    const q = camera.quaternion;
    if (s && s.camera === camera && s.zoom === camera.zoom) {
      const tol = 1e-9 * Math.max(1, p.length());
      if (p.distanceToSquared(s.p) <= tol * tol && 1 - Math.abs(q.dot(s.q)) <= 1e-12) return false;
    }
    this.cameraState = { camera, p: p.clone(), q: q.clone(), zoom: camera.zoom };
    this.note();
    return true;
  }

  // draftNow reports whether the next shape pass should be a draft.
  draftNow() {
    return this.moving && movingTier === "draft";
  }
}

// bindTierButtons wires the Render panel: its header opens and closes it
// like the other viewer panels, its "Moving" and "At rest" button groups
// (data-moving-tier, data-rest-tier) pick the tiers, and its "Draw on" group
// (data-rest-device), GPU or CPU, which Progressive disables.
export function bindTierButtons(onChange) {
  const panel = document.getElementById("render-panel");
  document.getElementById("render-panel-header")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("panel-close")) {
      panel.classList.remove("open");
    } else {
      panel.classList.add("open");
    }
  });

  const moving = document.querySelectorAll("[data-moving-tier]");
  const rest = document.querySelectorAll("[data-rest-tier]");
  const device = document.querySelectorAll("[data-rest-device]");
  const sync = () => {
    moving.forEach((b) => {
      const active = b.dataset.movingTier === movingTier;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
    });
    rest.forEach((b) => {
      const active = b.dataset.restTier === restTier;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
    });
    device.forEach((b) => {
      const active = b.dataset.restDevice === restDevice;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
      b.disabled = b.dataset.restDevice !== "gpu" && restTier === "progressive";
    });
  };
  moving.forEach((b) => {
    b.addEventListener("click", () => {
      setMovingTier(b.dataset.movingTier);
      sync();
      onChange();
    });
  });
  rest.forEach((b) => {
    b.addEventListener("click", () => {
      setRestTier(b.dataset.restTier);
      sync();
      onChange();
    });
  });
  device.forEach((b) => {
    b.addEventListener("click", () => {
      setRestDevice(b.dataset.restDevice);
      sync();
      onChange();
    });
  });
  // A tier saved by a viewer that offers it, in one that does not.
  if (rest.length && ![...rest].some((b) => b.dataset.restTier === restTier)) setRestTier("standard");
  sync();
}

// The Render image size, as a multiple of the view's.
let imageScale = 1;

export function getImageScale() {
  return imageScale;
}

// The Depth of field slider, in [0, 1]; 0 is off. The path tracer focuses on
// the point the Focus tool picked, or on the orbit pivot until one is.
let aperture = 0;

export function getAperture() {
  return aperture;
}

// bindRenderControls wires the Render panel's Depth of field slider, its
// Focus tool, its Render image button and the image size beside it, the
// Shadows, Displacement and Back faces switches:
//   onAperture()     the slider moved
//   onFocusTool(on)  the Focus tool was switched on or off
//   onRenderImage()  the button was pressed
//   onShadows(on)    Shadows was switched on or off
//   onBackFaces(dim) Back faces was set to Dim (true) or Full (false)
// Displacement, Fine relief and Pixel filter need no callback: they set the
// surface knobs through setShading, whose listeners re-render every viewer.
// The tool button is returned so the viewer can switch it off after a pick.
export function bindRenderControls({ onAperture, onFocusTool, onRenderImage, onShadows, onBackFaces }) {
  const slider = document.getElementById("render-aperture");
  const label = document.getElementById("render-aperture-label");
  slider?.addEventListener("input", () => {
    aperture = Number(slider.value);
    if (label) label.textContent = aperture.toFixed(2);
    onAperture();
  });
  const focusBtn = document.getElementById("btn-render-focus");
  focusBtn?.addEventListener("click", () => {
    const on = !focusBtn.classList.contains("active");
    focusBtn.classList.toggle("active", on);
    onFocusTool(on);
  });
  document.getElementById("btn-render-image")?.addEventListener("click", onRenderImage);
  const shadows = document.querySelectorAll("[data-trace-shadows]");
  shadows.forEach((b) => {
    b.addEventListener("click", () => {
      shadows.forEach((o) => {
        o.classList.toggle("active", o === b);
        o.setAttribute("aria-pressed", o === b);
      });
      onShadows?.(b.dataset.traceShadows === "on");
    });
  });
  const displacement = document.querySelectorAll("[data-displacement]");
  displacement.forEach((b) => {
    b.addEventListener("click", () => {
      displacement.forEach((o) => {
        o.classList.toggle("active", o === b);
        o.setAttribute("aria-pressed", o === b);
      });
      setShading({ displacementScale: b.dataset.displacement === "on" ? 1 : 0 });
    });
  });
  const pixelFilter = document.getElementById("render-pixel-filter");
  const pixelFilterLabel = document.getElementById("render-pixel-filter-label");
  pixelFilter?.addEventListener("input", () => {
    const scale = Number(pixelFilter.value);
    if (pixelFilterLabel) pixelFilterLabel.textContent = scale.toFixed(2);
    setShading({ pixelFilter: scale });
  });
  const marchFade = document.querySelectorAll("[data-march-fade]");
  marchFade.forEach((b) => {
    b.addEventListener("click", () => {
      marchFade.forEach((o) => {
        o.classList.toggle("active", o === b);
        o.setAttribute("aria-pressed", o === b);
      });
      setShading({ marchFade: b.dataset.marchFade === "march" ? 1 : 0 });
    });
  });
  const backFaces = document.querySelectorAll("[data-back-faces]");
  backFaces.forEach((b) => {
    b.addEventListener("click", () => {
      backFaces.forEach((o) => {
        o.classList.toggle("active", o === b);
        o.setAttribute("aria-pressed", o === b);
      });
      onBackFaces?.(b.dataset.backFaces === "dim");
    });
  });
  const scales = document.querySelectorAll("[data-image-scale]");
  scales.forEach((b) => {
    b.addEventListener("click", () => {
      imageScale = Number(b.dataset.imageScale);
      scales.forEach((o) => {
        o.classList.toggle("active", o === b);
        o.setAttribute("aria-pressed", o === b);
      });
    });
  });
  return focusBtn;
}

// showRenderProgress puts a running Render image's progress, a fraction, on
// its button, which cancels the job while it runs; null puts the label back.
export function showRenderProgress(fraction) {
  const b = document.getElementById("btn-render-image");
  if (!b) return;
  b.textContent = fraction == null ? "Render image" : `Cancel (${Math.floor(fraction * 100)}%)`;
  b.classList.toggle("active", fraction != null);
}

// FrameRateMeter reports how fast the viewer draws, in the Render panel's
// Frame rate row: the frames of the last second while frames are being drawn
// (moving, animating, accumulating). Drawing is on demand, so at rest nothing
// draws; a second after the last frame the row says so and keeps the last
// rate. frame() is called once per frame drawn. progress() returns the
// share of the progressive sum that is done, in [0, 1], or null when that
// tier is not drawing; the row shows it at its right.
export class FrameRateMeter {
  constructor(progress = () => null) {
    this.progress = progress;
    this.label = document.getElementById("render-fps");
    this.progressLabel = document.getElementById("render-progress");
    this.times = [];
    this.last = 0;
    this.timer = null;
  }

  frame() {
    this.times.push(performance.now());
    if (!this.timer) this.update();
  }

  update() {
    this.timer = null;
    const now = performance.now();
    while (this.times.length && now - this.times[0] > 1000) this.times.shift();
    const n = this.times.length;
    if (n >= 2) {
      this.last = Math.round((1000 * (n - 1)) / (this.times[n - 1] - this.times[0]));
      if (this.label) this.label.textContent = `${this.last} fps`;
    } else if (n === 0 && this.label) {
      this.label.textContent = this.last ? `Idle (last ${this.last} fps)` : "Idle";
    }
    const done = this.progress();
    if (this.progressLabel) this.progressLabel.textContent = done == null ? "" : `${Math.floor(100 * done)}%`;
    if (n > 0) this.timer = setTimeout(() => this.update(), 250);
  }
}
