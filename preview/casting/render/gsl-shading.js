// Shared surface shading for the GSL raymarch viewer.
//
// The three viewers embed the same raymarch fragment shader as a WGSL string
// and used to carry identical copies of the lighting rig. The shading now
// lives here, once, as a WGSL function the viewers splice in with wgslFn and
// call from both the front-face and back-face hit paths. The caller still
// owns everything that needs the compiled program (the march, the normal, the
// SDF ambient-occlusion loop, the field overlay) and hands the results in.
//
// Three's wgslFn requires the string to begin with the `fn` it wraps; helper
// functions go after the main one (WGSL does not care about declaration
// order).

import * as THREE from "three";
import { uniform } from "three/tsl";
import { GSL_ENVIRONMENT_WGSL } from "./gsl-environment.js";

// The shading knobs, live: the viewers pass this uniform into gsl_shadeSurface
// as `knobs`, so the calibration can be tuned in the running app and the
// settled values baked back into SHADING_DEFAULTS.
//
//   x  lightScale       key-light radiance (the Lambert lobe divides by pi)
//   y  ambientScale     hemisphere fill, diffuse and specular; neutral fill
//                       keeps colours from reading too deep, too much
//                       flattens form
//   z  exposure         applied before emission and tone mapping
//   w  warmLightHeight  view-space height of the warm waist light (negative
//                       = below eye); low enough to balance a sphere's underside
//
// The glass knobs ride in a second uniform (see gsl-glass.js for the path
// they bound):
//
//   x  glassSamples     jittered refracted rays per pixel on a rough interface
//                       (a smooth one always takes 1)
//   y  glassCone        scales the roughness that jitters the microfacet
//                       normal (0 = no blur, 1 = the GGX lobe)
//   z  glassBounces     interfaces a refracted ray may cross before it is
//                       treated as escaped; each crossing is one march, so
//                       one glass part costs 2 (its exit, then the surface
//                       behind it) and glass seen through glass costs 4
//   w  glassSteps       march steps per secondary ray
//
// The surface knobs (see gsl-displace.js) are a third uniform:
//
//   x  displacementScale  multiplies the height the surface is moved by;
//                         1 is the authored amount, 0 marches the
//                         undisplaced field
//   y  marchFade          1 sets the pixel footprint (pixelSize()) at every
//                         step of Standard's primary march, so detail too
//                         fine to see fades while the ray looks for the
//                         surface as well as when it is shaded; 0, the
//                         default, sets it only at the hit, so the march
//                         meets the full relief and the shading the faded
//                         one
//   z  pixelFilter        multiplies the pixel footprint pixelSize() reads:
//                         1, the default, is one pixel; 0 filters nothing,
//                         so detail finer than a pixel aliases; above 1
//                         fades detail and widens sub-pixel lines sooner
export const SHADING_DEFAULTS = Object.freeze({
  lightScale: 2.0,
  ambientScale: 1.25,
  exposure: 1.75,
  warmLightHeight: -2.0,
  glassSamples: 4,
  glassCone: 1.0,
  glassBounces: 4,
  glassSteps: 128,
  displacementScale: 1.0,
  marchFade: 0,
  pixelFilter: 1,
});

export const shadingKnobsU = uniform(
  new THREE.Vector4(
    SHADING_DEFAULTS.lightScale,
    SHADING_DEFAULTS.ambientScale,
    SHADING_DEFAULTS.exposure,
    SHADING_DEFAULTS.warmLightHeight,
  ),
);

export const glassKnobsU = uniform(
  new THREE.Vector4(
    SHADING_DEFAULTS.glassSamples,
    SHADING_DEFAULTS.glassCone,
    SHADING_DEFAULTS.glassBounces,
    SHADING_DEFAULTS.glassSteps,
  ),
);

export const surfaceKnobsU = uniform(
  new THREE.Vector4(SHADING_DEFAULTS.displacementScale, SHADING_DEFAULTS.marchFade, SHADING_DEFAULTS.pixelFilter, 0),
);

// BACK_FACE_DIM is how bright every tier draws a surface seen from behind,
// the inside of a part cut open or the reverse of an open surface, with the
// Render panel's Back faces at Dim, its default.
export const BACK_FACE_DIM = 0.25;

// The render knobs are what a render tier switches (see gsl-render-tier.js),
// not a look setting, so setShading leaves them alone:
//
//   x  aoOn        1 runs the SDF ambient-occlusion loop, 0 skips it
//                  (aoFactor 1); the Render panel's Shadows switch sets it,
//                  and the draft tier turns it off while the view moves
//   y  stepScale   multiplies the primary march's step budget
//   z  backDim     how bright a surface seen from behind is drawn:
//                  BACK_FACE_DIM with the Render panel's Back faces at Dim,
//                  1 at Full
export const renderKnobsU = uniform(new THREE.Vector4(1, 1, BACK_FACE_DIM, 0));

// THE DETAIL LADDER. As a part gets smaller on screen it gives things up in
// turn: its displacement, then, for a part with a stand-in (name.simple), its
// full geometry for the stand-in's, keeping its colour and material unless the
// stand-in has its own, then its textures, their fine detail and their colours'
// and materials' flat stand-ins together, and last the part itself. A part's size is its box's shortest edge in pixels;
// each rung is the size below which that part goes without, set by the Render
// panel's Detail slider (detail-slider.js), and 0 keeps it at every size.
// That order is the defaults'; each rung is its own threshold, set anywhere. A
// thing fades out over the octave below its rung, and a part shrinks away
// across the two below its own.
//
// The codegen guards each part and notes the one nearest each point sdShape is
// asked about (backend/wgsl/internal/codegen/vanish.go); partDetailSetupWGSL
// hands the guards the camera and the rungs, and GSL_PART_DETAIL_WGSL reads
// the nearest part back for displacement (gsl-displace.js) and textures
// (pixelSize(), through gsl_pw).
export const DETAIL = Object.freeze({ displacementPx: 128, simplifiedPx: 32, texturesPx: 16, vanishPx: 4 });

// The detail knobs are the ladder's rungs in pixels, x to w: displacement,
// textures, simplified and vanish.
export const detailKnobsU = uniform(
  new THREE.Vector4(DETAIL.displacementPx, DETAIL.texturesPx, DETAIL.simplifiedPx, DETAIL.vanishPx),
);

// The rungs that did not fit, in pixels: x to w are free.
export const detailKnobs2U = uniform(new THREE.Vector4(0, 0, 0, 0));

// hasParts reports whether a program has parts the codegen guards (its WGSL
// declares the camera they read).
export function hasParts(wgslCode) {
  return /\bvar<private> gsl_vanishEye\b/.test(wgslCode);
}

// partDetailSetupWGSL sets the camera and the rungs at the top of a fragment
// that has camPosZUp, pixelScale, camOrtho, detailKnobs and detailKnobs2 in scope, for a
// program with parts; otherwise it is empty. A shader that never sets them,
// the mesher's or a probe's, keeps every part whole. gsl_vanishView.w starts
// at 0, every part evaluated wherever it is asked about; a frame raises it
// while it marches, when a part far from the ray may read as its box.
// A program whose parts have stand-ins (name.simple) also gets the Simple
// rung, which switches them (backend/wgsl/internal/codegen/simple.go).
export function partDetailSetupWGSL(wgslCode) {
  if (!hasParts(wgslCode)) return "";
  return "gsl_vanishEye = vec4<f32>(camPosZUp, pixelScale); " +
    "gsl_vanishView = vec4<f32>(camOrtho, detailKnobs.w, 4.0 * detailKnobs.w, 0.0); " +
    "gsl_detail = detailKnobs; gsl_detail2 = detailKnobs2;" +
    (hasStandIns(wgslCode) ? " gsl_simpleRung = detailKnobs.z;" : "");
}

// hasStandIns reports whether a program's parts have stand-ins (its WGSL
// declares the rung they switch by).
export function hasStandIns(wgslCode) {
  return /\bvar<private> gsl_simpleRung\b/.test(wgslCode);
}

// GSL_PART_DETAIL_WGSL reads the ladder at the part nearest the point sdShape
// was last asked about (gsl_partNear, from the codegen). gsl_partDetail is 1
// unless the surface at hand, surf away give or take tol, is that part and it
// is smaller on screen than the rung, fading to 0 an octave below it.
// gsl_texturePw is the pixel footprint textures fade their detail by
// (pixelSize()): the screen's, or, for a part past the textures rung, up to
// the part's own thickness, so detail finer than the part flattens. That is a
// material's; a colour keeps the screen's, gsl_screenPw, which gsl_texturePw
// records, so its patterns go flat only by its stand-in, at the same rung.
export const GSL_PART_DETAIL_WGSL = partDetailWGSL(false);

// partDetailWGSL is GSL_PART_DETAIL_WGSL, and for a program with colours or
// materials that have stand-ins (hasSimpleValues) gsl_texturePw also sets
// their weight, gsl_simpleDetail, by the Textures rung, with the textures'
// fine detail: a colour and a material go flat together. A value past the
// rung draws its stand-in and is not evaluated
// (backend/wgsl/internal/codegen/simple.go).
export function partDetailWGSL(simpleValues) {
  const setWeight = simpleValues
    ? "\n    gsl_simpleDetail = gsl_partDetail(gsl_detail.y, 0.0, 4.0 * pw);"
    : "";
  return `
var<private> gsl_detail: vec4<f32>;
var<private> gsl_detail2: vec4<f32>;
var<private> gsl_screenPw: f32;

fn gsl_partDetail(rung: f32, surf: f32, tol: f32) -> f32 {
    if (gsl_partNear.x > abs(surf) + tol) { return 1.0; }
    return smoothstep(0.5 * rung, max(rung, 1e-3), gsl_partNear.y);
}

fn gsl_texturePw(pw: f32) -> f32 {${setWeight}
    gsl_screenPw = pw;
    return max(pw, (1.0 - gsl_partDetail(gsl_detail.y, 0.0, 4.0 * pw)) * gsl_partNear.z);
}
`;
}

// hasSimpleValues reports whether a program's colours or materials have
// stand-ins (its WGSL declares their weight).
export function hasSimpleValues(wgslCode) {
  return /\bvar<private> gsl_simpleDetail\b/.test(wgslCode);
}

const shadingListeners = [];

// onShadingChange registers a callback (a viewer's scheduleRender) to run
// after setShading changes the knobs.
export function onShadingChange(fn) {
  shadingListeners.push(fn);
}

// getShading returns the current knob values.
export function getShading() {
  const v = shadingKnobsU.value;
  const g = glassKnobsU.value;
  const s = surfaceKnobsU.value;
  return {
    lightScale: v.x, ambientScale: v.y, exposure: v.z, warmLightHeight: v.w,
    glassSamples: g.x, glassCone: g.y, glassBounces: g.z, glassSteps: g.w,
    displacementScale: s.x, marchFade: s.y, pixelFilter: s.z,
  };
}

// setShading updates any subset of the knobs, e.g.
// window.gslShading.set({ lightScale: 3, glassSamples: 8 }), and returns the
// result. Pass nothing to reset to the defaults.
export function setShading(patch) {
  const next = { ...(patch ? getShading() : SHADING_DEFAULTS), ...(patch || {}) };
  shadingKnobsU.value.set(next.lightScale, next.ambientScale, next.exposure, next.warmLightHeight);
  glassKnobsU.value.set(next.glassSamples, next.glassCone, next.glassBounces, next.glassSteps);
  surfaceKnobsU.value.set(next.displacementScale, next.marchFade, next.pixelFilter, 0);
  for (const fn of shadingListeners) fn();
  return getShading();
}

if (typeof window !== "undefined") {
  window.gslShading = { set: setShading, get: getShading, defaults: SHADING_DEFAULTS };
}

// srgbEncode is the sRGB opto-electronic transfer function for one channel in
// [0, 1], the inverse of the gsl_srgbToLinear decode the shader applies to
// every authored colour.
//
// The viewers' default shape palette goes through it once. Before the shading
// was physically based, a palette value went into the shader as if it were
// linear and the canvas sRGB-encoded it on the way out, so what showed on
// screen was the encoded value: lighter and less saturated than the palette's
// numbers. The shader now decodes first, which makes that a round trip and
// showed the raw palette at full saturation. Encoding the palette here cancels
// the new decode, so the defaults display exactly as they did.
export function srgbEncode(v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// The material record the compiler's gsl_materialField returns, one row per
// vec4 of the GSL `name.material` list (see stdlib/material).
// Declared by the host like gsl_shape: the generated module only references
// it. Rows are appended, never reordered.
export const GSL_MATERIAL_STRUCT_WGSL = `
struct gsl_material {
    surface: vec4<f32>,   // roughness, metallic, ior, reserved
    emissive: vec4<f32>,  // sRGB r, g, b, strength
    volume: vec4<f32>,    // transmission, absorptionDistance, displacement, reserved
    lay: vec4<f32>,       // lay x, y, z, anisotropy
    present: f32,         // 1 = authored field, 0 = default record
}
`;

// The record a shape has when the program authors no material (present = 0):
// roughness 0.5, not metallic, ior 1.5, no emission, opaque, undisplaced, no
// lay. Must
// match property.materialDefault in the compiler and material.standard in the
// library. An expression, for splicing into a shader body.
export const GSL_MATERIAL_DEFAULT_WGSL =
  "gsl_material(vec4<f32>(0.5, 0.0, 1.5, 0.0), vec4<f32>(0.0, 0.0, 0.0, 0.0), vec4<f32>(0.0, 0.0, 0.0, 0.0), vec4<f32>(0.0, 0.0, 0.0, 0.0), 0.0)";

// Physically based surface shading, in linear light.
//
// Authored colours are sRGB (what the color library and the palette produce)
// and are decoded to linear here; the render targets are linear and Three
// encodes the composite back to sRGB at the canvas. The BRDF is the
// metallic-roughness model: a Lambert diffuse lobe scaled by what the Fresnel
// term leaves, plus a Cook-Torrance specular lobe with the GGX distribution,
// the height-correlated Smith visibility and the Schlick Fresnel, with F0
// taken from the index of refraction for dielectrics and from the albedo for
// metals. The light rig is the same three view-space directional lights as
// before (two cool shoulder lights, one warm waist light) plus the hemisphere
// ambient in world Z-up, which also lights the specular lobe along the
// reflection vector through the split-sum environment-BRDF fit, so metals do
// not go black. Emission is added last, and the result is tone mapped with
// the Khronos PBR Neutral curve before it is written, so the composite's
// opacity mixing sees display-ready values as it always has.
//
// Calibration lives in the `knobs` uniform (see SHADING_DEFAULTS above): the
// key-light radiance, the hemisphere fill, the exposure and the height of the
// warm waist light.
//
// gsl_shadeSurface is the tone-mapped, display-ready colour the viewers write
// for an opaque hit. gsl_shadeLinear is the scene-referred radiance it is
// built from; the glass path (gsl-glass.js) sums that radiance along a
// refracted ray before tone mapping once. A transmissive material takes its
// transmission out of the diffuse lobe here, so the residual (1 - T) diffuse
// and the specular lobes are what the surface itself contributes; at T = 0
// the scale is exactly 1 and an opaque surface is unchanged.
//
//   hitPos        world-space (Z-up) hit point
//   localNormal   world-space outward normal, already flipped toward the viewer
//   viewDirWorld  normalize(camera position - hitPos), world space
//   baseColor     surface colour as authored (sRGB), palette, or overlay
//   mat           the material record (gsl_materialField or the default)
//   aoFactor      Quilez SDF ambient occlusion in [0, 1] (1 = unoccluded)
//   dimFactor     1.0 for a front face, renderKnobs.z for a face seen from behind
//   zUpToView     the world Z-up -> view rotation the lights are defined in
//   skyCol/groundCol  hemisphere ambient colours (viewer uniforms)
//   knobs         (lightScale, ambientScale, exposure, warmLightHeight)
export const GSL_SHADING_WGSL = `
fn gsl_shadeSurface(
    hitPos: vec3<f32>,
    localNormal: vec3<f32>,
    viewDirWorld: vec3<f32>,
    baseColor: vec3<f32>,
    mat: gsl_material,
    aoFactor: f32,
    dimFactor: f32,
    zUpToView: mat4x4<f32>,
    skyCol: vec3<f32>,
    groundCol: vec3<f32>,
    knobs: vec4<f32>
) -> vec3<f32> {
    let color = gsl_shadeLinear(hitPos, localNormal, viewDirWorld, baseColor, mat, aoFactor,
                                zUpToView, skyCol, groundCol, knobs);
    return gsl_tonemapPbrNeutral(color * dimFactor);
}

// The scene-referred radiance leaving the surface toward the viewer: direct
// and ambient light through the BRDF, exposed, plus emission. Not tone
// mapped, so radiance from several surfaces along one ray can be summed.
fn gsl_shadeLinear(
    hitPos: vec3<f32>,
    localNormal: vec3<f32>,
    viewDirWorld: vec3<f32>,
    baseColor: vec3<f32>,
    mat: gsl_material,
    aoFactor: f32,
    zUpToView: mat4x4<f32>,
    skyCol: vec3<f32>,
    groundCol: vec3<f32>,
    knobs: vec4<f32>
) -> vec3<f32> {
    // Calibration knobs (SHADING_DEFAULTS in gsl-shading.js).
    let lightScale = knobs.x;      // key-light radiance (the Lambert lobe divides by pi)
    let ambientScale = knobs.y;    // hemisphere fill, diffuse and specular
    let exposure = knobs.z;        // applied before emission and tone mapping
    let warmLightHeight = knobs.w; // height below eye for waist light (view Y)

    // Three-light rig — the shoulder lights are fixed:
    const coolLightOffset: f32 = 0.5;   // horizontal shoulder separation (view X)
    const coolLightHeight: f32 = 0.6;   // height above eye for shoulder lights (view Y)

    let cool1Dir = normalize(vec3<f32>(-coolLightOffset, coolLightHeight, 0.5));
    let cool2Dir = normalize(vec3<f32>( coolLightOffset, coolLightHeight, 0.5));
    let warmDir  = normalize(vec3<f32>(0.0, warmLightHeight, 1.0));
    // An environment preset may dim the rig (gsl-environment.js); 1 otherwise.
    let rigScale = gsl_envRigScale();
    let coolCol = vec3<f32>(0.618, 0.684, 0.855) * 0.75 * lightScale * rigScale; // cool blue-white
    let warmCol  = vec3<f32>(0.600, 0.420, 0.200) * lightScale * rigScale;       // warm amber, waist

    // Material, in linear light.
    let albedo = gsl_srgbToLinear(baseColor);
    let emissive = gsl_srgbToLinear(mat.emissive.rgb) * mat.emissive.w;
    let roughness = clamp(mat.surface.x, 0.045, 1.0); // floor keeps the GGX peak finite
    let alpha2 = roughness * roughness * roughness * roughness;
    let metallic = clamp(mat.surface.y, 0.0, 1.0);
    let ior = max(mat.surface.z, 1.0);
    let f0Dielectric = ((ior - 1.0) / (ior + 1.0)) * ((ior - 1.0) / (ior + 1.0));
    let F0 = mix(vec3<f32>(f0Dielectric), albedo, metallic);
    let transmission = clamp(mat.volume.x, 0.0, 1.0);
    let diffuseColor = albedo * (1.0 - metallic) * (1.0 - transmission);

    let N = normalize((zUpToView * vec4<f32>(localNormal, 0.0)).xyz);
    let V = normalize((zUpToView * vec4<f32>(viewDirWorld, 0.0)).xyz);
    let NoV = max(dot(N, V), 1e-4);
    // The material's lay, in the view frame for the rig and in the world's
    // for the reflection.
    let layView = gsl_layFrame(N, vec4<f32>((zUpToView * vec4<f32>(mat.lay.xyz, 0.0)).xyz, mat.lay.w));
    let layWorld = gsl_layFrame(localNormal, mat.lay);

    // Direct light from the rig.
    var direct = gsl_directLightLay(N, V, NoV, cool1Dir, coolCol, diffuseColor, F0, alpha2, roughness, layView);
    direct = direct + gsl_directLightLay(N, V, NoV, cool2Dir, coolCol, diffuseColor, F0, alpha2, roughness, layView);
    direct = direct + gsl_directLightLay(N, V, NoV, warmDir, warmCol, diffuseColor, F0, alpha2, roughness, layView);

    // Hemisphere ambient: sky above, ground below (Z-up). Diffuse along the
    // normal; specular along the reflection, weighted by the environment BRDF.
    // An environment preset replaces the hemisphere with its own sky, blurred
    // by roughness, and adds its panels (gsl-environment.js).
    var hemiN = mix(groundCol, skyCol, localNormal.z * 0.5 + 0.5) * ambientScale;
    let R = reflect(-viewDirWorld, gsl_layBentNormal(localNormal, viewDirWorld, layWorld));
    var hemiR = mix(groundCol, skyCol, R.z * 0.5 + 0.5) * ambientScale;
    var panels = vec3<f32>(0.0);
    if (gsl_envAnalytic()) {
        hemiN = gsl_envDiffuse(localNormal);
        hemiR = gsl_envSkySpecular(R, roughness);
        panels = gsl_envPanelSpecular(localNormal, viewDirWorld, F0, roughness);
    }
    let Fa = gsl_fresnelSchlickRoughness(NoV, F0, roughness);
    let ambientDiffuse = hemiN * diffuseColor * (vec3<f32>(1.0) - Fa);
    let ambientSpecular = hemiR * gsl_envBRDFApprox(F0, roughness, NoV) + panels;
    let ambient = (ambientDiffuse + ambientSpecular) * aoFactor;

    return (direct + ambient) * exposure + emissive;
}

// The fraction of light a transmissive interface passes rather than
// reflects: one minus the roughness-aware Schlick Fresnel of the material at
// this viewing angle, with F0 from the index of refraction (symmetric, so
// the same term serves the exit interface). Total internal reflection is
// handled geometrically by the caller.
fn gsl_transmitWeight(NoV: f32, mat: gsl_material, baseColor: vec3<f32>) -> vec3<f32> {
    let albedo = gsl_srgbToLinear(baseColor);
    let roughness = clamp(mat.surface.x, 0.045, 1.0);
    let metallic = clamp(mat.surface.y, 0.0, 1.0);
    let ior = max(mat.surface.z, 1.0);
    let f0Dielectric = ((ior - 1.0) / (ior + 1.0)) * ((ior - 1.0) / (ior + 1.0));
    let F0 = mix(vec3<f32>(f0Dielectric), albedo, metallic);
    return vec3<f32>(1.0) - gsl_fresnelSchlickRoughness(NoV, F0, roughness);
}

// Beer-Lambert absorption over a path through a tinted medium, in the glTF
// KHR_materials_volume form: at absorptionDistance the transmitted colour is
// the authored colour, and it darkens as a power of the path beyond that.
// absorptionDistance <= 0 means no absorption.
fn gsl_absorb(baseColor: vec3<f32>, thickness: f32, absorptionDistance: f32) -> vec3<f32> {
    if (absorptionDistance <= 0.0) { return vec3<f32>(1.0); }
    let tint = max(gsl_srgbToLinear(baseColor), vec3<f32>(1e-4));
    return pow(tint, vec3<f32>(max(thickness, 0.0) / absorptionDistance));
}

// A microfacet normal drawn from the GGX distribution around N (alpha =
// roughness squared) for the uniform pair xi, so a rough interface refracts
// and reflects into a lobe instead of a line. roughness 0 returns N.
fn gsl_ggxNormal(N: vec3<f32>, roughness: f32, xi: vec2<f32>) -> vec3<f32> {
    let a = roughness * roughness;
    if (a < 1e-4) { return N; }
    let phi = 6.28318530718 * xi.x;
    let cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
    let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(N.z) < 0.999);
    let tx = normalize(cross(up, N));
    let ty = cross(N, tx);
    return normalize(tx * (sinTheta * cos(phi)) + ty * (sinTheta * sin(phi)) + N * cosTheta);
}

// Two uniform numbers in [0, 1) from a 2-D seed and a sample index (Hoskins'
// hash without sine), for the per-pixel jitter of the glass samples.
fn gsl_hash2(p: vec2<f32>, s: f32) -> vec2<f32> {
    var h = fract(vec3<f32>(p, s) * vec3<f32>(0.1031, 0.1030, 0.0973));
    h = h + dot(h, h.yzx + 33.33);
    return fract((h.xx + h.yz) * h.zy);
}

// One directional light's contribution: Lambert diffuse scaled by what the
// Fresnel term leaves, plus the GGX / Smith / Schlick specular lobe.
fn gsl_directLight(N: vec3<f32>, V: vec3<f32>, NoV: f32, L: vec3<f32>, radiance: vec3<f32>,
                   diffuseColor: vec3<f32>, F0: vec3<f32>, alpha2: f32) -> vec3<f32> {
    let NoL = dot(N, L);
    if (NoL <= 0.0) { return vec3<f32>(0.0); }
    let H = normalize(L + V);
    let NoH = max(dot(N, H), 0.0);
    let VoH = max(dot(V, H), 0.0);
    let D = gsl_distributionGGX(NoH, alpha2);
    let Vis = gsl_visibilitySmithGGX(NoV, NoL, alpha2);
    let F = gsl_fresnelSchlick(VoH, F0);
    let specular = D * Vis * F;
    let diffuse = (vec3<f32>(1.0) - F) * diffuseColor / 3.14159265;
    return (diffuse + specular) * radiance * NoL;
}

// A material's lay (material.withLay): grooves too fine to see, running along
// a direction, that stretch the specular lobe across them. gsl_layFrame takes
// the lay in the same space as N and returns the unit tangent along it across
// the surface in xyz and the anisotropy in w, which is 0 where the material has
// none or the lay meets the surface head on.
fn gsl_layFrame(N: vec3<f32>, lay: vec4<f32>) -> vec4<f32> {
    let amount = clamp(lay.w, 0.0, 1.0);
    let across = lay.xyz - N * dot(lay.xyz, N);
    let len2 = dot(across, across);
    if (amount <= 0.0 || len2 < 1e-10) { return vec4<f32>(1.0, 0.0, 0.0, 0.0); }
    return vec4<f32>(across / sqrt(len2), amount);
}

// The lobe's widths along the lay and across it, for roughness and anisotropy
// a: alpha = roughness^2 shrunk and stretched by sqrt(1 - 0.9 a) (Burley 2012).
fn gsl_layAlphas(roughness: f32, amount: f32) -> vec2<f32> {
    let alpha = roughness * roughness;
    let aspect = sqrt(1.0 - 0.9 * amount);
    return vec2<f32>(max(alpha * aspect, 0.002), max(alpha / aspect, 0.002));
}

// Anisotropic GGX (Heitz 2014): the distribution of microfacet normals H in
// the frame of N, the tangent T along the lay and B = N x T.
fn gsl_distributionGGXAniso(NoH: f32, ToH: f32, BoH: f32, aT: f32, aB: f32) -> f32 {
    let d = ToH * ToH / (aT * aT) + BoH * BoH / (aB * aB) + NoH * NoH;
    return 1.0 / (3.14159265 * aT * aB * d * d);
}

// Its height-correlated Smith visibility, already divided by 4 NoL NoV.
fn gsl_visibilitySmithGGXAniso(NoV: f32, NoL: f32, ToV: f32, BoV: f32, ToL: f32, BoL: f32, aT: f32, aB: f32) -> f32 {
    let lambdaV = NoL * length(vec3<f32>(aT * ToV, aB * BoV, NoV));
    let lambdaL = NoV * length(vec3<f32>(aT * ToL, aB * BoL, NoL));
    return 0.5 / max(lambdaV + lambdaL, 1e-5);
}

// gsl_directLight with the material's lay: the isotropic lobe where there is
// none, the anisotropic one along it where there is. frame is gsl_layFrame's.
fn gsl_directLightLay(N: vec3<f32>, V: vec3<f32>, NoV: f32, L: vec3<f32>, radiance: vec3<f32>,
                      diffuseColor: vec3<f32>, F0: vec3<f32>, alpha2: f32, roughness: f32, frame: vec4<f32>) -> vec3<f32> {
    if (frame.w <= 0.0) {
        return gsl_directLight(N, V, NoV, L, radiance, diffuseColor, F0, alpha2);
    }
    let NoL = dot(N, L);
    if (NoL <= 0.0) { return vec3<f32>(0.0); }
    let T = frame.xyz;
    let B = cross(N, T);
    let a = gsl_layAlphas(roughness, frame.w);
    let H = normalize(L + V);
    let D = gsl_distributionGGXAniso(max(dot(N, H), 0.0), dot(T, H), dot(B, H), a.x, a.y);
    let Vis = gsl_visibilitySmithGGXAniso(NoV, NoL, dot(T, V), dot(B, V), dot(T, L), dot(B, L), a.x, a.y);
    let F = gsl_fresnelSchlick(max(dot(V, H), 0.0), F0);
    let diffuse = (vec3<f32>(1.0) - F) * diffuseColor / 3.14159265;
    return (diffuse + D * Vis * F) * radiance * NoL;
}

// The specular visibility for light L with the material's lay.
fn gsl_visibilityLay(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, NoV: f32, NoL: f32, alpha2: f32, roughness: f32, frame: vec4<f32>) -> f32 {
    if (frame.w <= 0.0) { return gsl_visibilitySmithGGX(NoV, NoL, alpha2); }
    let T = frame.xyz;
    let B = cross(N, T);
    let a = gsl_layAlphas(roughness, frame.w);
    return gsl_visibilitySmithGGXAniso(NoV, NoL, dot(T, V), dot(B, V), dot(T, L), dot(B, L), a.x, a.y);
}

// The specular distribution of H with the material's lay.
fn gsl_distributionLay(N: vec3<f32>, H: vec3<f32>, alpha2: f32, roughness: f32, frame: vec4<f32>) -> f32 {
    let NoH = max(dot(N, H), 1e-4);
    if (frame.w <= 0.0) { return gsl_distributionGGX(NoH, alpha2); }
    let T = frame.xyz;
    let a = gsl_layAlphas(roughness, frame.w);
    return gsl_distributionGGXAniso(NoH, dot(T, H), dot(cross(N, T), H), a.x, a.y);
}

// A microfacet normal drawn with density D(H) NoH, as gsl_ggxNormal draws it,
// for the material's lay: its slope drawn as (aT r cos phi, aB r sin phi) with
// r = sqrt(u / (1 - u)), which is the anisotropic lobe's own slope spread.
fn gsl_ggxNormalLay(N: vec3<f32>, roughness: f32, frame: vec4<f32>, xi: vec2<f32>) -> vec3<f32> {
    if (frame.w <= 0.0) { return gsl_ggxNormal(N, roughness, xi); }
    let T = frame.xyz;
    let B = cross(N, T);
    let a = gsl_layAlphas(roughness, frame.w);
    let phi = 6.28318530718 * xi.x;
    let r = sqrt(xi.y / max(1.0 - xi.y, 1e-6));
    return normalize(T * (a.x * r * cos(phi)) + B * (a.y * r * sin(phi)) + N);
}

// The normal the reflection is taken about for light that is not a point: bent
// toward the plane the lobe stretches in, as far as the anisotropy (Filament's
// bent normal), so a lay streaks the environment's reflection too.
fn gsl_layBentNormal(N: vec3<f32>, V: vec3<f32>, frame: vec4<f32>) -> vec3<f32> {
    if (frame.w <= 0.0) { return N; }
    let stretched = cross(cross(frame.xyz, V), frame.xyz);
    return normalize(mix(N, stretched, frame.w));
}

// Exact sRGB electro-optical transfer function.
fn gsl_srgbToLinear(c: vec3<f32>) -> vec3<f32> {
    let lo = c / 12.92;
    let hi = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
    return select(hi, lo, c <= vec3<f32>(0.04045));
}

// GGX / Trowbridge-Reitz normal distribution.
fn gsl_distributionGGX(NoH: f32, alpha2: f32) -> f32 {
    let f = NoH * NoH * (alpha2 - 1.0) + 1.0;
    return alpha2 / (3.14159265 * f * f);
}

// Height-correlated Smith visibility for GGX (already divided by 4 NoL NoV).
fn gsl_visibilitySmithGGX(NoV: f32, NoL: f32, alpha2: f32) -> f32 {
    let ggxV = NoL * sqrt(NoV * NoV * (1.0 - alpha2) + alpha2);
    let ggxL = NoV * sqrt(NoL * NoL * (1.0 - alpha2) + alpha2);
    return 0.5 / max(ggxV + ggxL, 1e-5);
}

// Schlick's Fresnel approximation.
fn gsl_fresnelSchlick(VoH: f32, F0: vec3<f32>) -> vec3<f32> {
    let f = pow(1.0 - VoH, 5.0);
    return F0 + (vec3<f32>(1.0) - F0) * f;
}

// Schlick's Fresnel with the roughness-aware ceiling, for ambient light.
fn gsl_fresnelSchlickRoughness(NoV: f32, F0: vec3<f32>, roughness: f32) -> vec3<f32> {
    let f = pow(1.0 - NoV, 5.0);
    return F0 + (max(vec3<f32>(1.0 - roughness), F0) - F0) * f;
}

// Karis' analytic fit of the split-sum environment BRDF: the scale and bias
// applied to F0 for a given roughness and viewing angle.
fn gsl_envBRDFApprox(F0: vec3<f32>, roughness: f32, NoV: f32) -> vec3<f32> {
    let c0 = vec4<f32>(-1.0, -0.0275, -0.572, 0.022);
    let c1 = vec4<f32>(1.0, 0.0425, 1.04, -0.04);
    let r = roughness * c0 + c1;
    let a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
    let ab = vec2<f32>(-1.04, 1.04) * a004 + r.zw;
    return F0 * ab.x + vec3<f32>(ab.y);
}

// Khronos PBR Neutral tone mapper: identity up to 0.8, then a hue-preserving
// shoulder that desaturates toward white as it clips.
fn gsl_tonemapPbrNeutral(c: vec3<f32>) -> vec3<f32> {
    const startCompression: f32 = 0.8 - 0.04;
    const desaturation: f32 = 0.15;
    let x = min(c.r, min(c.g, c.b));
    let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
    var color = c - vec3<f32>(offset);
    let peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) { return color; }
    let d = 1.0 - startCompression;
    let newPeak = 1.0 - d * d / (peak + d - startCompression);
    color = color * (newPeak / peak);
    let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3<f32>(newPeak), g);
}
${GSL_ENVIRONMENT_WGSL}
`;
