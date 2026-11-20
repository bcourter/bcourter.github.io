// Environment lighting for the GSL raymarch viewer.
//
// The light a surface sees from the world around it: a sky and up to four
// soft panels that turn about the vertical with the camera, as the three rig
// lights do (see the end of this comment), so as the view orbits, the object
// turns under them and highlights slide across a polished surface. One
// radiance function L(w) defines it, and every tier derives from it:
//
//   L(w) = base(w) + sum_i a_i exp(lambda_i (mu_i . w - 1))
//
//   base    a step sky: the sky colour above the horizon, the ground colour
//           below
//   panels  up to four spherical Gaussians (SGs): soft round light sources,
//           an axis mu, a sharpness lambda (the lobe's angular radius is
//           about 1/sqrt(lambda) radians) and an RGB amplitude
//
// Standard (gsl_shadeLinear, gsl-shading.js) integrates it in closed form:
//
//   - the step sky's diffuse, mix(ground, sky, 0.5 + 0.5 n.z), is exact;
//   - its specular under the split-sum GGX lobe is the fraction of the lobe
//     above the horizon, fitted as 0.5 + 0.5 x / (|x| + r^2 (1 - |x|)) with
//     x = R.z and r the roughness (within 0.04 of Monte Carlo from r = 0.05
//     to 1, and exactly today's linear ramp at r = 1);
//   - a panel's diffuse is its fitted SG irradiance (Hill, as given by
//     Pettineo, "SG Series" part 3), divided by pi;
//   - a panel's specular is the GGX lobe written as an SG and warped to the
//     reflection direction (Wang et al. 2009), convolved with the panel, times
//     Fresnel, visibility and the cosine at the warped axis.
//
// The path tracer (gsl-trace.js) sees L(w) itself on a miss.
//
// Presets choose L and how strongly the rig lights still shine. "Viewer" is
// the look the viewers always had: the rig at full strength and the viewer's
// own sky/ground hemisphere, shaded with the same expressions as before, so
// it renders exactly what it did. It is mode 0; any other preset is mode 1.
//
// The environment rides in three mat4x4 uniforms (columns, as WGSL indexes
// them), which the fragments copy into private variables that the shading
// reads:
//
//   envA  [0]  (mode, rigScale, intensity, panelCount)
//         [1]  sky rgb     [2]  ground rgb     [3]  unused
//   envB  [i]  panel i's world axis xyz, sharpness lambda
//   envC  [i]  panel i's amplitude rgb
//
// The environment turns with the camera about the vertical, the way the rig
// lights ride with it, so orbiting keeps the light steady while the object
// turns under it; the sky stays up, so the horizon stays level as the camera
// tilts. The presets are laid out for the viewer's starting view, from the
// (+x, +y) side (camera azimuth 45 degrees), and the Turn slider adds to the
// camera's turn. The step sky does not change with either.

import * as THREE from "three";
import { uniform } from "three/tsl";
import PRESETS from "./environment/presets.json" with { type: "json" };

// The presets live in environment/presets.json, which litrender reads too
// (internal/fidget/internal/environment embeds it for Go), so both renderers
// light a scene from the same numbers. Each has a description; a mode (0 is the
// viewer's own
// lighting, 1 analytic); rig, the rig lights' strength (1 = as before); sky and
// ground (linear radiance); and panels, each an axis (Z up, need not be unit),
// a sharpness and a linear RGB amplitude, placed as seen from the viewer's
// starting view (from the (+x, +y, +z) side looking in).
export const ENV_PRESETS = Object.freeze(PRESETS);

export const ENV_DEFAULT = "Viewer";

export const envAU = uniform(new THREE.Matrix4());
export const envBU = uniform(new THREE.Matrix4());
export const envCU = uniform(new THREE.Matrix4());

const PRESET_KEY = "gsl.envPreset";
const AZIMUTH_KEY = "gsl.envAzimuth";
const INTENSITY_KEY = "gsl.envIntensity";

let current = { preset: ENV_DEFAULT, azimuth: 0, intensity: 1 };
try {
  const p = localStorage.getItem(PRESET_KEY);
  if (p && p in ENV_PRESETS) current.preset = p;
  const a = Number(localStorage.getItem(AZIMUTH_KEY));
  if (Number.isFinite(a)) current.azimuth = a;
  const i = Number(localStorage.getItem(INTENSITY_KEY) ?? 1);
  if (Number.isFinite(i) && i > 0) current.intensity = i;
} catch {
  // Storage can be unavailable (private window, blocked site data).
}

const listeners = [];

// onEnvironmentChange registers a callback (a viewer's scheduleRender) to
// run after setEnvironment changes the uniforms.
export function onEnvironmentChange(fn) {
  listeners.push(fn);
}

export function getEnvironment() {
  return { ...current };
}

// envMatrices returns the three uniform matrices' column-major elements for
// a preset turned by azimuth degrees about Z and scaled by intensity.
export function envMatrices(presetName, azimuth = 0, intensity = 1) {
  const p = ENV_PRESETS[presetName] ?? ENV_PRESETS[ENV_DEFAULT];
  const a = new Float32Array(16);
  const b = new Float32Array(16);
  const c = new Float32Array(16);
  const n = Math.min(p.panels.length, 4);
  a.set([p.mode, p.rig, intensity, n], 0);
  a.set([...p.sky, 0], 4);
  a.set([...p.ground, 0], 8);
  const th = (azimuth * Math.PI) / 180;
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  for (let i = 0; i < n; i++) {
    const { axis, sharpness, color } = p.panels[i];
    const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const x = axis[0] / len;
    const y = axis[1] / len;
    b.set([cs * x - sn * y, sn * x + cs * y, axis[2] / len, sharpness], 4 * i);
    c.set([...color, 0], 4 * i);
  }
  return { a, b, c };
}

// The camera's turn about the vertical, in degrees, less the starting view's
// (see followCamera).
let cameraTurn = 0;

function apply() {
  const { a, b, c } = envMatrices(current.preset, current.azimuth + cameraTurn, current.intensity);
  envAU.value.fromArray(a);
  envBU.value.fromArray(b);
  envCU.value.fromArray(c);
}
apply();

// followCamera turns the environment with the camera: the viewers call it
// with the camera's right vector (world Z-up) whenever they update the camera
// uniforms. The right vector's heading is the camera's azimuth plus 90
// degrees, and stays defined looking straight down.
export function followCamera(rightX, rightY) {
  if (Math.hypot(rightX, rightY) < 1e-6) return;
  const turn = (Math.atan2(rightY, rightX) * 180) / Math.PI - 90 - 45;
  if (Math.abs(turn - cameraTurn) < 1e-4) return;
  cameraTurn = turn;
  apply();
}

// setEnvironment updates any of { preset, azimuth, intensity }, e.g.
// window.gslEnvironment.set({ preset: "Softbox", azimuth: 90 }), remembers
// the choice, and returns the result. Pass nothing to reset to the defaults.
export function setEnvironment(patch) {
  const next = patch ? { ...current, ...patch } : { preset: ENV_DEFAULT, azimuth: 0, intensity: 1 };
  if (!(next.preset in ENV_PRESETS)) next.preset = ENV_DEFAULT;
  current = next;
  try {
    localStorage.setItem(PRESET_KEY, current.preset);
    localStorage.setItem(AZIMUTH_KEY, String(current.azimuth));
    localStorage.setItem(INTENSITY_KEY, String(current.intensity));
  } catch {
    // See above.
  }
  apply();
  syncControls();
  for (const fn of listeners) fn();
  return getEnvironment();
}

// bindEnvironmentControls wires the Render panel's Environment row: a button
// per preset (data-env-preset) and the Turn slider (env-azimuth).
export function bindEnvironmentControls() {
  document.querySelectorAll("[data-env-preset]").forEach((btn) => {
    btn.addEventListener("click", () => setEnvironment({ preset: btn.dataset.envPreset }));
  });
  const slider = document.getElementById("env-azimuth");
  slider?.addEventListener("input", () => setEnvironment({ azimuth: Number(slider.value) }));
  syncControls();
}

function syncControls() {
  document.querySelectorAll("[data-env-preset]").forEach((btn) => {
    const on = btn.dataset.envPreset === current.preset;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on);
  });
  const slider = document.getElementById("env-azimuth");
  if (slider) slider.value = String(current.azimuth);
  const label = document.getElementById("env-azimuth-label");
  if (label) label.textContent = `${Math.round(current.azimuth)}°`;
}

if (typeof window !== "undefined") {
  window.gslEnvironment = { get: getEnvironment, set: setEnvironment, presets: ENV_PRESETS };
}

// The environment's WGSL, appended to GSL_SHADING_WGSL (which three emits
// verbatim after its first function), so everything that includes the
// shading also declares the private variables. A fragment that never assigns
// them leaves them zero, which is mode 0: the viewer's hemisphere, the rig at
// full strength.
export const GSL_ENVIRONMENT_WGSL = `
var<private> gsl_envA: mat4x4<f32>;
var<private> gsl_envB: mat4x4<f32>;
var<private> gsl_envC: mat4x4<f32>;

// True when a preset other than Viewer is lighting the scene.
fn gsl_envAnalytic() -> bool {
    return gsl_envA[0].x > 0.5;
}

// How strongly the rig lights shine: 1 in Viewer mode.
fn gsl_envRigScale() -> f32 {
    return select(1.0, gsl_envA[0].y, gsl_envAnalytic());
}

// The radiance arriving from direction d (world Z-up): the step sky plus
// the panels.
fn gsl_envRadiance(d: vec3<f32>) -> vec3<f32> {
    return gsl_envSkyRadiance(d) + gsl_envPanelRadiance(d);
}

// The step sky's radiance from direction d.
fn gsl_envSkyRadiance(d: vec3<f32>) -> vec3<f32> {
    return select(gsl_envA[2].rgb, gsl_envA[1].rgb, d.z > 0.0) * gsl_envA[0].z;
}

// The panels' radiance from direction d.
fn gsl_envPanelRadiance(d: vec3<f32>) -> vec3<f32> {
    var L = vec3<f32>(0.0);
    let n = u32(gsl_envA[0].w);
    for (var i = 0u; i < 4u; i = i + 1u) {
        if (i >= n) { break; }
        let lobe = gsl_envB[i];
        L = L + gsl_envC[i].rgb * exp(lobe.w * (dot(lobe.xyz, d) - 1.0));
    }
    return L * gsl_envA[0].z;
}

// How many panels light the scene (0 in Viewer mode).
fn gsl_envPanelCount() -> u32 {
    return select(0u, u32(gsl_envA[0].w), gsl_envAnalytic());
}

// Panel i's share of the light, for choosing which one to sample: its
// luminance times its SG's integral over the sphere.
fn gsl_envPanelPower(i: u32) -> f32 {
    let l = max(gsl_envB[i].w, 0.1);
    let lum = dot(gsl_envC[i].rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    return lum * 6.28318530718 * (1.0 - exp(-2.0 * l)) / l;
}

// A direction toward the panels for the path tracer's next-event estimation:
// one panel chosen in proportion to its power (u), then a direction drawn from
// its spherical Gaussian (xi). The pdf is gsl_envPanelPdf.
fn gsl_envSamplePanel(u: f32, xi: vec2<f32>) -> vec3<f32> {
    let n = gsl_envPanelCount();
    var total = 0.0;
    for (var i = 0u; i < 4u; i = i + 1u) {
        if (i >= n) { break; }
        total = total + gsl_envPanelPower(i);
    }
    var pick = n - 1u;
    var acc = 0.0;
    for (var i = 0u; i < 4u; i = i + 1u) {
        if (i >= n) { break; }
        acc = acc + gsl_envPanelPower(i);
        if (u * total < acc) { pick = i; break; }
    }
    let lobe = gsl_envB[pick];
    let l = max(lobe.w, 0.1);
    let cosTheta = clamp(1.0 + log(1.0 - xi.x * (1.0 - exp(-2.0 * l))) / l, -1.0, 1.0);
    let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    let phi = 6.28318530718 * xi.y;
    let mu = lobe.xyz;
    let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(mu.z) < 0.999);
    let tx = normalize(cross(up, mu));
    let ty = cross(mu, tx);
    return normalize(tx * (sinTheta * cos(phi)) + ty * (sinTheta * sin(phi)) + mu * cosTheta);
}

// The density gsl_envSamplePanel draws direction d with (per steradian).
fn gsl_envPanelPdf(d: vec3<f32>) -> f32 {
    let n = gsl_envPanelCount();
    var total = 0.0;
    var pdf = 0.0;
    for (var i = 0u; i < 4u; i = i + 1u) {
        if (i >= n) { break; }
        let lobe = gsl_envB[i];
        let l = max(lobe.w, 0.1);
        let power = gsl_envPanelPower(i);
        total = total + power;
        pdf = pdf + power * l * exp(l * (dot(lobe.xyz, d) - 1.0)) / (6.28318530718 * (1.0 - exp(-2.0 * l)));
    }
    return select(0.0, pdf / total, total > 0.0);
}

// The light a Lambertian surface with normal n reflects per unit albedo:
// irradiance over pi, from the sky and the panels.
fn gsl_envDiffuse(n: vec3<f32>) -> vec3<f32> {
    var E = mix(gsl_envA[2].rgb, gsl_envA[1].rgb, n.z * 0.5 + 0.5);
    let count = u32(gsl_envA[0].w);
    for (var i = 0u; i < 4u; i = i + 1u) {
        if (i >= count) { break; }
        let lobe = gsl_envB[i];
        E = E + gsl_envC[i].rgb * (gsl_sgIrradiance(dot(lobe.xyz, n), lobe.w) / 3.14159265);
    }
    return E * gsl_envA[0].z;
}

// The step sky seen along R through a GGX lobe of the given roughness,
// before the environment BRDF: the fraction of the lobe above the horizon.
fn gsl_envSkySpecular(R: vec3<f32>, roughness: f32) -> vec3<f32> {
    let x = clamp(R.z, -1.0, 1.0);
    let c = roughness * roughness;
    let t = 0.5 + 0.5 * x / max(abs(x) + c * (1.0 - abs(x)), 1e-6);
    return mix(gsl_envA[2].rgb, gsl_envA[1].rgb, t) * gsl_envA[0].z;
}

// The panels' specular reflection: for each, the GGX lobe (alpha =
// roughness squared) as an SG around N, warped to the reflection direction,
// convolved with the panel, then shaded at the warped axis. Complete: Fresnel,
// visibility and the cosine are inside.
fn gsl_envPanelSpecular(N: vec3<f32>, V: vec3<f32>, F0: vec3<f32>, roughness: f32) -> vec3<f32> {
    let a = roughness * roughness;
    let a2 = max(a * a, 1e-7);
    let NoV = max(dot(N, V), 1e-4);
    let R = reflect(-V, N);
    let lambdaW = (2.0 / a2) / (4.0 * max(NoV, 0.1));
    let ampW = 1.0 / (3.14159265 * a2);
    let NoL = max(dot(N, R), 0.0);
    let H = normalize(R + V);
    let F = gsl_fresnelSchlick(max(dot(R, H), 0.0), F0);
    let shade = F * (gsl_visibilitySmithGGX(NoV, NoL, a2) * NoL);
    var S = vec3<f32>(0.0);
    let count = u32(gsl_envA[0].w);
    for (var i = 0u; i < 4u; i = i + 1u) {
        if (i >= count) { break; }
        let lobe = gsl_envB[i];
        S = S + gsl_envC[i].rgb * gsl_sgInner(R, lambdaW, lobe.xyz, lobe.w);
    }
    return S * ampW * shade * gsl_envA[0].z;
}

// The integral over the sphere of the product of two unit-amplitude SGs.
fn gsl_sgInner(axis1: vec3<f32>, lambda1: f32, axis2: vec3<f32>, lambda2: f32) -> f32 {
    let um = length(lambda1 * axis1 + lambda2 * axis2);
    let expo = exp(um - lambda1 - lambda2);
    return 6.28318530718 * expo * (1.0 - exp(-2.0 * um)) / max(um, 1e-6);
}

// The irradiance a unit-amplitude SG of sharpness lambda delivers to a
// surface whose normal makes cosine muDotN with its axis (Hill's fit).
fn gsl_sgIrradiance(muDotN: f32, lambda: f32) -> f32 {
    let l = max(lambda, 0.1);
    const c0: f32 = 0.36;
    const c1: f32 = 1.0 / (4.0 * 0.36);
    let eml = exp(-l);
    let em2l = eml * eml;
    let rl = 1.0 / l;
    let scale = 1.0 + 2.0 * em2l - rl;
    let bias = (eml - em2l) * rl - em2l;
    let x = sqrt(max(1.0 - scale, 1e-8));
    let x0 = c0 * muDotN;
    let x1 = c1 * x;
    let n = x0 + x1;
    let y = select(clamp(muDotN, 0.0, 1.0), n * n / x, abs(x0) <= x1);
    let integral = 6.28318530718 * (1.0 - em2l) * rl;
    return (scale * y + bias) * integral;
}
`;
