// The render graph the GSL viewer draws with, and
// that the image-parity test builds headlessly: every WGSL function around
// the compiled program -- visibility, gsl_min, the displaced field, normals,
// shape colour, shading, glass, the standard raymarch fragment, the
// progressive path-trace fragment and the Simple fragment -- as TSL wgslFn
// nodes.
//
// buildRenderGraph takes only the program and the WGSL of its extra sdShape
// arguments, never a viewer's uniforms, so the same call gives a viewer its
// shaders and gives a test the identical source. Binding values to the nodes
// (the uniforms, textures and per-shape colours) stays with the caller.

import * as THREE from "three";
import { wgslFn } from "three/tsl";
import { GSL_SHAPE_STRUCT_WGSL, GSL_MIN_WGSL } from "./gsl-host.js";
import { GSL_SHADING_WGSL, GSL_MATERIAL_STRUCT_WGSL, GSL_MATERIAL_DEFAULT_WGSL, partDetailWGSL, hasParts, hasSimpleValues, partDetailSetupWGSL } from "./gsl-shading.js";
import { GSL_SECONDARY_HIT_STRUCT_WGSL, marchSecondaryWGSL, shadeGlassWGSL } from "./gsl-glass.js";
import { displaceSampleWGSL, sdDisplacedWGSL, renameToDisplaced, GSL_DISPLACE_STATE_WGSL } from "./gsl-displace.js";
import { visArrayDeclWGSL, visAssignWGSL, isShapeVisibleWGSL } from "./gsl-visibility.js";
import { traceSampleWGSL, GSL_TRACE_STATE_WGSL } from "./gsl-trace.js";
import { simpleFragmentWGSL } from "./gsl-simple.js";

export const gsl_shape = new THREE.CodeNode(GSL_SHAPE_STRUCT_WGSL, [], "wgsl");

// The material record gsl_materialField returns; host-declared like gsl_shape.
export const gsl_material = new THREE.CodeNode(GSL_MATERIAL_STRUCT_WGSL, [], "wgsl");

// The result of a secondary (refracted) march; host-declared like gsl_shape.
export const gsl_secondaryHit = new THREE.CodeNode(GSL_SECONDARY_HIT_STRUCT_WGSL, [gsl_shape], "wgsl");

// The displacement scale, per fragment invocation: gsl_sdDisplaced stands in
// for sdShape at call sites that cannot grow an argument.
export const gsl_displaceState = new THREE.CodeNode(GSL_DISPLACE_STATE_WGSL, [], "wgsl");

// The progressive pass's random-number state.
export const gsl_traceState = new THREE.CodeNode(GSL_TRACE_STATE_WGSL, [], "wgsl");

// Per-invocation filter: when non-zero, gsl_min only accepts shapes with matching index.
// Used by the non-union field rendering to evaluate each shape's SDF independently.
export const gsl_fieldFilterNode = new THREE.CodeNode(
  `var<private> gsl_fieldFilterIdx: u32 = 0u;`,
  [],
  "wgsl",
);

// buildShapeColorWGSL returns gsl_shapeColor: return i's colour is argument ci.
export function buildShapeColorWGSL(shapeCount) {
  const colorParams = [];
  const switchCases = [];

  for (let i = 1; i <= shapeCount; i++) {
    colorParams.push(`c${i}: vec3<f32>`);
    switchCases.push(`        case ${i}u: { return c${i}; }`);
  }

  return `
fn gsl_shapeColor(shapeIndex: u32, ${colorParams.join(", ")}) -> vec3<f32> {
    switch shapeIndex {
${switchCases.join("\n")}
        default: { return vec3(1.0, 1.0, 1.0); }
    }
}
`;
}

// How close to a surface, in mm, a march starts paying for the displaced field:
// the primary march and the secondary one agree on it (see gsl_dispNearMargin
// in the primary march for why 4).
const DISP_NEAR_MARGIN = "4.0";

// No field overlay: an app that has one passes its own fieldInfo in its place.
const NO_FIELD = Object.freeze({ active: false, paramsWGSL: "" });

// buildRenderGraph builds the shaders for one compiled program.
//   wgslCode         the codegen output (sdShape, and gsl_colorField /
//                    gsl_materialField when the program authors them)
//   shapeCount       the number of returns, at least 1
//   extraParamsWGSL  ", name: type, ..." for sdShape's arguments beyond
//                    (p, time), in the codegen's order: sliders, mesh-SDF
//                    slots, warp field, noise tile
//   extraArgsWGSL    the matching ", name, ..."
//   fieldInfo        an app's simulated-field overlay ({active, paramsWGSL, rampWGSL}):
//                    colours the standard frame's front faces by a simulated
//                    field
//   trace            also build the progressive fragment
//   materials        false builds the fragments as if the program authored no
//                    material: every hit shades with the default record, so
//                    no glass, emission or displacement (the Color tier)
//   pixelWidthNode   the declaration of gsl_pw, the pixel footprint a
//                    program's pixelSize() reads, and of gsl_pwScale, the
//                    Render panel's Pixel filter that scales it; the
//                    fragments set both, gsl_pw at each hit. A viewer passes the one its other shaders
//                    share; without one the graph declares its own.
// The fragments take the per-shape colours as c1..cN (all but Simple, which
// colours by return index) and the visibility flags as vis1..visN, after
// their named parameters.
export function buildRenderGraph({ wgslCode, shapeCount, extraParamsWGSL, extraArgsWGSL, fieldInfo = NO_FIELD, trace = true, materials = true,
                                  pixelWidthNode = new THREE.CodeNode("var<private> gsl_pw: f32 = 0.0;\nvar<private> gsl_pwScale: f32 = 1.0;", [], "wgsl") }) {
  // injectExtraArgs rewrites every sdShape(...) / gsl_calcNormal(...)
  // call site in a WGSL string to append the combined arguments in a
  // single pass, so the slider and mesh-SDF rewrites cannot disturb
  // each other. The [^)]* assumes call sites don't contain nested
  // parens — true for every site in this file. Never apply this to a
  // string containing a definition of either function; definitions
  // interpolate ${extraParamsWGSL} into their signatures directly.
  const injectExtraArgs = (wgsl) =>
    extraArgsWGSL
      ? wgsl
          .replace(/\bsdShape\(([^)]*)\)/g, (_, a) => `sdShape(${a}${extraArgsWGSL})`)
          .replace(/(?<!\bfn\s+)\bgsl_sdDisplaced\(([^)]*)\)/g, (_, a) => `gsl_sdDisplaced(${a}${extraArgsWGSL})`)
          .replace(/\bgsl_calcNormal\(([^)]*)\)/g, (_, a) => `gsl_calcNormal(${a}${extraArgsWGSL})`)
          .replace(/\bgsl_colorField\(([^)]*)\)/g, (_, a) => `gsl_colorField(${a}${extraArgsWGSL})`)
          .replace(/\bgsl_materialField\(([^)]*)\)/g, (_, a) => `gsl_materialField(${a}${extraArgsWGSL})`)
      : wgsl;

  // The codegen emits `fn gsl_colorField(p, time, gsl_colorIdx, …) -> vec4<f32>`
  // only when the program authors color (name.color = …). It rides along in
  // sdShape's wgslCode, so any shader that depends on sdShape can call it. When
  // absent, shading keeps the cosine palette. alpha 1 = computed color present.
  const hasColorField = wgslCode.includes("fn gsl_colorField(");
  // Likewise `fn gsl_materialField(p, time, gsl_materialIdx, …) -> gsl_material`
  // only when the program authors a material (name.material = …); absent, every
  // hit shades with the default record.
  const hasMaterialField = materials && wgslCode.includes("fn gsl_materialField(");
  const materialAt = (pos, sd) =>
    hasMaterialField ? `gsl_materialField(${pos}, time, ${sd}.shapeIndex)` : GSL_MATERIAL_DEFAULT_WGSL;
  const materialAtIdx = (pos, idx) =>
    hasMaterialField ? `gsl_materialField(${pos}, time, ${idx})` : GSL_MATERIAL_DEFAULT_WGSL;

  // The visibility flags' parameter and argument lists.
  const visParamsWGSL = Array.from({ length: shapeCount }, (_, i) => `vis${i + 1}: f32`);
  const visArgsWGSL = Array.from({ length: shapeCount }, (_, i) => `vis${i + 1}`);

  // Module-scope private vars for visibility, set at start of each fragment function
  const visPrivateDecls = visArrayDeclWGSL(shapeCount);
  const gsl_visibilityNode = new THREE.CodeNode(visPrivateDecls, [], "wgsl");

  const gsl_isShapeVisible = wgslFn(isShapeVisibleWGSL(shapeCount), [gsl_visibilityNode]);

  const gsl_min = wgslFn(GSL_MIN_WGSL, [gsl_shape, gsl_fieldFilterNode, gsl_isShapeVisible]);

  // pixelWidthNode declares gsl_pw, which a program's pixelSize() reads,
  // in every shader that carries the program.
  const sdShape = wgslFn(wgslCode, [gsl_shape, gsl_min, gsl_material, pixelWidthNode]);

  // The detail ladder (gsl-shading.js), for a program with parts: the
  // fragments hand the part guards the camera and the rungs, and displacement
  // and textures read back the part nearest each point. texturePw wraps the
  // pixel footprint set at a hit.
  const parts = hasParts(wgslCode);
  const partDetailDeps = parts ? [new THREE.CodeNode(partDetailWGSL(hasSimpleValues(wgslCode)), [], "wgsl")] : [];
  const texturePw = (pw) => (parts ? `gsl_texturePw(${pw})` : pw);
  // A colour is evaluated at the screen's pixel, not the Textures rung's
  // (gsl_texturePw): its flat look alone flattens it. call is the colour
  // field's statement; name keeps its saved pixel's name unique.
  const atScreenPw = (name, call) =>
    parts ? `let ${name}_pw = gsl_pw; gsl_pw = gsl_screenPw;
                ${call}
                gsl_pw = ${name}_pw;` : call;

  // Displacement: the material's height row moves the surface, so the render
  // path marches d(p) - h(p) instead of d(p) (gsl-displace.js). Only built
  // when the material field actually varies with position, so a document made
  // of library presets pays nothing. marchDisplaced rewrites sdShape call
  // sites to the displaced field wholesale; it is applied to the normal and
  // the secondary march (both already surface-adjacent), and deliberately
  // NOT to the section-plane shader or the mesher, which show the geometry
  // as it is built. The PRIMARY march (in gsl_wgslFragment below) does NOT
  // use marchDisplaced: height is small render-only relief, so paying for a
  // full material evaluation at every step across the whole domain — not
  // just near a surface — is wasted work for the vast majority of steps.
  // It instead uses nearFieldFn to march the cheap undisplaced field by
  // default, switching to the expensive displaced field only once already
  // close to a surface (see gsl_dispNearMargin there).
  const displaceActive = hasMaterialField;
  // The codegen's per-return displaced composite (gsl-displace.js).
  const perReturn = wgslCode.includes("fn gsl_sdShapeDisplaced(");
  const gsl_displaceSample = displaceActive
    ? wgslFn(injectExtraArgs(displaceSampleWGSL({ extraParamsWGSL, materialAtIdx, parts, perReturn })),
             [gsl_shape, gsl_material, gsl_displaceState, ...partDetailDeps, ...(perReturn ? [sdShape] : [])])
    : null;
  const gsl_sdDisplaced = displaceActive
    ? wgslFn(injectExtraArgs(sdDisplacedWGSL({ extraParamsWGSL, extraArgsWGSL })),
             [sdShape, gsl_shape, gsl_displaceSample])
    : null;
  // The state var is listed on the fragment too, the way gsl_pixelWidthNode is:
  // the fragment assigns gsl_dispScale directly.
  const displaceDeps = displaceActive ? [gsl_sdDisplaced, gsl_displaceSample, gsl_displaceState] : [];
  const marchDisplaced = (src) => (displaceActive ? renameToDisplaced(src) : src);
  // A program that reads displacementDrawn() is told, at each hit it shades,
  // how much of the displacement was drawn there: the scale, faded by the
  // part's displacement rung the way gsl_displaceSample fades it. Set after
  // gsl_pw, which it reads as the tolerance gsl_texturePw uses.
  const setDispDrawn = displaceActive && /\bvar<private> gsl_dispDrawn\b/.test(wgslCode)
    ? ` gsl_dispDrawn = gsl_dispScale${parts ? " * gsl_partDetail(gsl_detail.x, 0.0, 4.0 * gsl_pw)" : ""};`
    : "";
  // A program with fine detail (name.detail) switches it by the Textures
  // rung's pixel, gsl_pw as gsl_texturePw raised it, in a colour too, which is
  // evaluated at the screen's (atScreenPw).
  const setDetailPw = parts && /\bvar<private> gsl_detailPw\b/.test(wgslCode) ? " gsl_detailPw = gsl_pw;" : "";
  const setHitState = setDispDrawn + setDetailPw;
  const fieldDep = displaceActive ? gsl_sdDisplaced : sdShape;

  // nearFieldFn: the primary march only pays for the displaced (material-
  // evaluating) field once it is already close to a surface. Height is
  // render-only relief, small relative to any reasonable scene, so far from
  // a surface the plain undisplaced field is a safe, much cheaper proxy for
  // step-size purposes — the true displaced value only matters for the
  // final approach and the hit itself. gsl_wgslFragment below is the one
  // template that implements that two-phase logic explicitly (not via
  // marchDisplaced's blanket rename); every other call site there (the
  // AO loops) is inherently already surface-adjacent, so it always uses
  // nearFieldFn unconditionally, matching marchDisplaced's prior behavior.
  const nearFieldFn = displaceActive ? "gsl_sdDisplaced" : "sdShape";

  // The six central-difference taps go through one sdShape call in a loop: the
  // GPU compiler inlines sdShape at every call site, so a large program
  // compiles once per call written out (the march's taps below do the same).
  // Each tap lands on its own component, n.x = d(p + e x) - d(p - e x) and so
  // on, as the six calls written out computed it.
  const gsl_calcNormal = wgslFn(
    marchDisplaced(`
        fn gsl_calcNormal( p : vec3<f32>, time: f32, eps: f32${extraParamsWGSL} ) -> vec3<f32> {
            let e = max(eps, 1e-6);
            var n = vec3<f32>(0.0);
            for (var k = 0u; k < 6u; k = k + 1u) {
                let s = select(e, -e, (k & 1u) == 1u);
                var o = vec3<f32>(0.0);
                o[k / 2u] = s;
                let d = sdShape(p + o, time${extraArgsWGSL}).distance;
                n[k / 2u] = n[k / 2u] + select(d, -d, (k & 1u) == 1u);
            }
            return normalize(n);
        }
    `),
    [fieldDep],
  );

  const gsl_shapeColor = wgslFn(buildShapeColorWGSL(shapeCount));
  const gsl_shadeSurface = wgslFn(GSL_SHADING_WGSL, [gsl_material]);

  // Build color parameter/argument lists for fragment shader
  const colorParamsWGSL = [];
  const colorArgsWGSL = [];
  for (let i = 1; i <= shapeCount; i++) {
    colorParamsWGSL.push(`c${i}: vec3<f32>`);
    colorArgsWGSL.push(`c${i}`);
  }

  // Glass: a front-face hit whose material has transmission refracts the
  // view ray into the solid and marches it (gsl-glass.js). Both functions
  // call sdShape, so their definitions carry the injected suffix, and the
  // sdShape / gsl_materialField call sites inside them are rewritten by
  // injectExtraArgs like any other. Calls TO them, on the other hand, append
  // ${extraArgsWGSL} by hand: injectExtraArgs must not learn their names,
  // because it would then also rewrite their definitions' parameter lists.
  // Only built when the program authors a material, since transmission
  // cannot appear otherwise.
  const colorStmt = (name, pos, sd) =>
    hasColorField
      ? `${atScreenPw(name, `let ${name}_cf = gsl_colorField(${pos}, time, ${sd}.shapeIndex);`)}
            let ${name} = select(gsl_shapeColor(${sd}.shapeIndex, ${colorArgsWGSL.join(", ")}), ${name}_cf.rgb, ${name}_cf.a > 0.5);`
      : `let ${name} = gsl_shapeColor(${sd}.shapeIndex, ${colorArgsWGSL.join(", ")});`;
  // Built for every program, since the progressive pass marches with it too;
  // it only reaches the standard fragment through glassDeps.
  // It writes its own near and far phases, as the primary march does, so it
  // is not renamed wholesale.
  const gsl_marchSecondary = wgslFn(injectExtraArgs(marchSecondaryWGSL(extraParamsWGSL,
                                      { parts, displace: displaceActive, nearMargin: DISP_NEAR_MARGIN, extraArgsWGSL })),
                                    [sdShape, gsl_secondaryHit, ...(displaceActive ? [gsl_displaceSample, gsl_displaceState] : [])]);
  const gsl_shadeGlass = hasMaterialField
    ? wgslFn(
        injectExtraArgs(shadeGlassWGSL({
          extraParamsWGSL,
          extraArgsWGSL,
          colorParamsWGSL: colorParamsWGSL.join(", "),
          colorStmt,
          materialAt,
        })),
        [sdShape, gsl_material, gsl_calcNormal, gsl_shapeColor, gsl_shadeSurface, gsl_marchSecondary, gsl_displaceState],
      )
    : null;
  const glassDeps = hasMaterialField ? [gsl_shadeGlass] : [];

  const shadeFrontWGSL = hasMaterialField
    ? `var litColor = vec3<f32>(0.0);
                if (gsl_mat.volume.x > 0.0 && !facingAway) {
                    litColor = gsl_shadeGlass(hitPos, localNormal, viewDirWorld, baseColor, gsl_mat, aoFactor,
                                              zUpToView, skyCol, groundCol, shadingKnobs, glassKnobs, bgColor,
                                              pixelScale, camOrtho, worldExtent, camPosZUp, uv, time, ${colorArgsWGSL.join(", ")}${extraArgsWGSL});
                } else {
                    litColor = gsl_shadeSurface(hitPos, localNormal, viewDirWorld, baseColor, gsl_mat, aoFactor,
                                                select(1.0, renderKnobs.z, facingAway), zUpToView, skyCol, groundCol, shadingKnobs);
                }`
    : `let litColor = gsl_shadeSurface(hitPos, localNormal, viewDirWorld, baseColor, gsl_mat, aoFactor,
                                                select(1.0, renderKnobs.z, facingAway), zUpToView, skyCol, groundCol, shadingKnobs);`;

  // Full-screen quad raymarching fragment shader
  const wgslFragmentShader = wgslFn(
    injectExtraArgs(`
        fn gsl_wgslFragment(
            uv: vec2<f32>,
            camPosZUp: vec3<f32>,
            camRight: vec3<f32>,
            camUp: vec3<f32>,
            camFwd: vec3<f32>,
            camTanFov: vec2<f32>,
            camOrtho: f32,
            projViewZUp: mat4x4<f32>,
            zUpToView: mat4x4<f32>,
            skyCol: vec3<f32>,
            groundCol: vec3<f32>,
            envA: mat4x4<f32>,
            envB: mat4x4<f32>,
            envC: mat4x4<f32>,
            shadingKnobs: vec4<f32>,
            glassKnobs: vec4<f32>,
            surfaceKnobs: vec4<f32>,
            renderKnobs: vec4<f32>,
            detailKnobs: vec4<f32>,
            detailKnobs2: vec4<f32>,
            bgColor: vec3<f32>,
            pixelScale: f32,
            worldExtent: f32,
            nearFar: vec2<f32>,
            time: f32,
            fieldActive: f32,
            fieldHeight: f32,
            fieldNormal: vec3<f32>,
            ${colorParamsWGSL.join(", ")},
            ${visParamsWGSL.join(", ")}${extraParamsWGSL}${fieldInfo.paramsWGSL}
        ) -> vec4<f32> {
            ${visArgsWGSL.map((v, i) => visAssignWGSL(i, v)).join(" ")}
            ${partDetailSetupWGSL(wgslCode)}
            gsl_envA = envA; gsl_envB = envB; gsl_envC = envC;
            gsl_pwScale = surfaceKnobs.z;

            ${displaceActive ? "gsl_dispScale = surfaceKnobs.x;" : ""}

            // Reconstruct ray from screen UV
            // UV is [0,1] with Y=0 at top (WebGPU convention), convert to NDC [-1,1] with Y=1 at top
            let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);

            // Build the ray directly from the camera basis.
            // Unprojecting near/far points instead would subtract two huge
            // world positions whose cancellation makes rayDir per-pixel noisy
            // off-axis at large camera distances.
            let rayOffset = ndc.x * camTanFov.x * camRight + ndc.y * camTanFov.y * camUp;
            let rayOrigin = camPosZUp + rayOffset * camOrtho;
            let rayDir = normalize(mix(camFwd + rayOffset, camFwd, camOrtho));

            // Ray-AABB test: skip marching entirely if ray misses bounding volume
            let boxMin = vec3<f32>(-worldExtent, -worldExtent, -worldExtent);
            let boxMax = vec3<f32>(worldExtent, worldExtent, worldExtent);
            let invRd = 1.0 / rayDir;
            let t1 = (boxMin - rayOrigin) * invRd;
            let t2 = (boxMax - rayOrigin) * invRd;
            let tMin = min(t1, t2);
            let tMax = max(t1, t2);
            let tEntry = max(max(tMin.x, tMin.y), tMin.z);
            let tExit = min(min(tMax.x, tMax.y), tMax.z);
            let boxHit = tEntry <= tExit && tExit > 0.0;

            // Gradient-corrected sphere tracing (Quilez): divide SDF by its
            // tet gradient magnitude to recover the true distance even when the
            // SDF is not Lipschitz-1.
            //
            // Epsilons use tiny fixed absolute floors plus a camera-distance-
            // relative term. Orthographic views use a constant pixel footprint.
            let baseGradEps = 0.0001;
            let baseHitEps = 0.001;
            let baseStepEps = 0.002;
            let boxPathScale = clamp(
                max(tExit - max(tEntry, 0.0), 0.0) / max(2.0 * worldExtent, 1e-6),
                1.0,
                1.75
            );
            let maxMarchSteps = u32(clamp(256.0 * boxPathScale, 256.0, 1024.0) * renderKnobs.y);
            // The AO loop runs 5 taps, or none when a draft frame turns it off.
            let aoTaps = select(0, 5, renderKnobs.x > 0.5);
            var t = max(tEntry, 0.0);
            var prev_t = t;
            var hitPos = vec3<f32>(0.0);
            var hitSd : gsl_shape;
            var backHitPos = vec3<f32>(0.0);
            var backHitSd : gsl_shape;
            var backT = 1e7;

            if (boxHit) {
                let fudge = 0.8;
                // How much steeper than the gradient last measured the field may be
                // between two samples and still cross zero there (see crossed).
                let jumpSlack = 4.0;
                let k0 = vec3( 1.0, -1.0, -1.0);
                let k1 = vec3(-1.0, -1.0,  1.0);
                let k2 = vec3(-1.0,  1.0, -1.0);
                let k3 = vec3( 1.0,  1.0,  1.0);
                // The taps as one list, so the gradient below calls sdShape once
                // in a loop (see gsl_calcNormal).
                let kTaps = array<vec3<f32>, 4>(k0, k1, k2, k3);
                ${displaceActive ? `// Height is render-only relief. This is how close a ray has to
                // be before the displaced (material-evaluating) field can
                // matter; farther out, the plain undisplaced field is a safe,
                // much cheaper proxy for step-size purposes. Its edge is a
                // jump of the height in the marched field, and the crossed
                // test below gives up on a jump past jumpSlack times the
                // interval, so a height has to stay well under the margin:
                // at 2.0 the peaks opened into holes from about 1.7 mm up
                // (measured on natural.terrain). The largest preset height
                // today is the terrain's 2.5 mm.
                let gsl_dispNearMargin = ${DISP_NEAR_MARGIN};` : ""}
                ${parts ? `// While it marches, a part far from the ray reads as its box
                // (vanish.go): past four pixels at the far end of the ray and
                // never under eight hit tolerances${displaceActive ? ", beyond the reach of\n                // displacement" : ""}. Shading below reads every part whole.
                gsl_vanishView.w = ${displaceActive ? "gsl_dispNearMargin + " : ""}max(baseHitEps * 8.0, pixelScale * mix(max(tExit, 1.0), 1.0, camOrtho) * 4.0);` : ""}

                // Only read once a step has been taken (crossed needs t >
                // prev_t), by which time it holds that step's sample.
                var prevSd: gsl_shape;
                var prevGradMag = 1.0;

                for (var i = 0u; i < 1024u; i = i + 1u) {
                    if (i >= maxMarchSteps || t > tExit) { break; }

                    let p = rayOrigin + rayDir * t;
                    let cheapSd = sdShape(p, time);
                    // With marchFade on, detail fades by the pixel footprint
                    // here too, not only where the surface is shaded.
                    if (surfaceKnobs.y != 0.0) { gsl_pw = gsl_pwScale * pixelScale * mix(max(t, 1.0), 1.0, camOrtho); }
                    ${displaceActive
                      ? `let gsl_dispNear = gsl_dispScale != 0.0 && abs(cheapSd.distance) < gsl_dispNearMargin;
                    var sd = cheapSd;
                    if (gsl_dispNear) { sd = gsl_displaceSample(p, cheapSd, time${extraArgsWGSL}); }`
                      : `let sd = cheapSd;`}
                    let pixelWorld = pixelScale * mix(max(t, 1.0), 1.0, camOrtho);
                    let hitEps = max(baseHitEps, pixelWorld * 0.5);

                    if (abs(sd.distance) < hitEps) {
                        hitPos = p;
                        hitSd = sd;
                        break;
                    }

                    // A negative distance no longer means "we overshot into a
                    // solid". Under the nearest-crossing composite it usually just
                    // means the closest surface is one we are behind — a half-space
                    // field like p.x puts the camera on its negative side from half
                    // of all viewing angles — and the march must keep going forward.
                    // An overshoot is specifically a sign change of the SAME shape
                    // between consecutive samples, so bisect on that and nothing else.
                    // Unless the samples are too far from zero for the field to cross
                    // it between them: a field with gradient up to prevGradMag has
                    // |d| at each end no more than that times the distance to its
                    // zero. Past jumpSlack times that, the field steps across 0
                    // without passing through it (a cut part's hollow, a ternary
                    // switching sides), bisecting would only close in on the step,
                    // and the march steps on instead.
                    let crossed = sd.shapeIndex == prevSd.shapeIndex
                        && (sd.distance < 0.0) != (prevSd.distance < 0.0)
                        && t > prev_t
                        && abs(prevSd.distance) + abs(sd.distance) <= jumpSlack * prevGradMag * (t - prev_t);
                    if (crossed) {
                        t = (prev_t + t) * 0.5;
                    } else {
                        // Never under about four float32 ulps of the point
                        // itself: finer taps round to the same place far from
                        // the origin, and the gradient they give is noise.
                        let ge = max(max(baseGradEps, pixelWorld * 0.025), length(p) * 4e-7);
                        var g = vec3<f32>(0.0);
                        for (var k = 0u; k < 4u; k = k + 1u) {
                            let q = p + kTaps[k] * ge;
                            ${displaceActive
                              ? `var tap = sdShape(q, time);
                            if (gsl_dispNear) { tap = gsl_displaceSample(q, tap, time${extraArgsWGSL}); }`
                              : `let tap = sdShape(q, time);`}
                            g = g + kTaps[k] * tap.distance;
                        }
                        let gradMag = max(length(g) / (4.0 * ge), 1.0);

                        prev_t = t;
                        prevSd = sd;
                        prevGradMag = gradMag;
                        t = t + abs(sd.distance) / gradMag * fudge;
                    }
                }

                // Backface march: find where the ray exits a shape.
                // Starts just past the frontface hit, or from tEntry if the ray began inside.
                let frontPixelWorld = pixelScale * mix(max(t, 1.0), 1.0, camOrtho);
                backT = t + max(baseStepEps, frontPixelWorld * 0.5);
                var backPrev_t = backT;
                for (var i = 0u; i < 1024u; i = i + 1u) {
                    if (i >= maxMarchSteps || backT > tExit) { break; }
                    let bp = rayOrigin + rayDir * backT;
                    let backCheapSd = sdShape(bp, time);
                    ${displaceActive
                      ? `var bsd = backCheapSd;
                    if (gsl_dispScale != 0.0 && abs(backCheapSd.distance) < gsl_dispNearMargin) { bsd = gsl_displaceSample(bp, backCheapSd, time${extraArgsWGSL}); }`
                      : `let bsd = backCheapSd;`}
                    let backPixelWorld = pixelScale * mix(max(backT, 1.0), 1.0, camOrtho);
                    let backHitEps = max(baseHitEps, backPixelWorld * 0.5);
                    if (abs(bsd.distance) < backHitEps) {
                        backHitPos = bp;
                        backHitSd = bsd;
                        break;
                    }
                    if (bsd.distance > 0.0) {
                        // Exited the shape — binary-search backward to refine the exit surface
                        backT = (backPrev_t + backT) * 0.5;
                    } else {
                        // Still inside — step forward through the interior
                        backPrev_t = backT;
                        backT += max(abs(bsd.distance) * fudge, max(baseStepEps, backPixelWorld * 0.5));
                    }
                }
            }
            ${parts ? "gsl_vanishView.w = 0.0;" : ""}

            // Analytical ray-axis intersection for 1px lines
            // For each axis, project onto the perpendicular 2D plane,
            // find closest approach to origin, check screen-space distance
            var axisHitT = 1e6;
            var axisHitIdx = 0u;
            let ro = vec3(rayOrigin.x, rayOrigin.y, rayOrigin.z);
            let rd = vec3(rayDir.x, rayDir.y, rayDir.z);

            for (var ax = 0; ax < 3; ax = ax + 1) {
                // Project to the plane perpendicular to this axis
                // ax=0 (X): use YZ, ax=1 (Y): use XZ, ax=2 (Z): use XY
                let ro2 = vec2(ro[(ax + 1) % 3], ro[(ax + 2) % 3]);
                let rd2 = vec2(rd[(ax + 1) % 3], rd[(ax + 2) % 3]);
                let denom = dot(rd2, rd2);
                if (denom > 1e-8) {
                    let tc = -dot(ro2, rd2) / denom;
                    if (tc > 0.0) {
                        let worldDist = length(ro2 + tc * rd2);
                        let screenDist = worldDist / (pixelScale * mix(tc, 1.0, camOrtho));
                        if (screenDist < 1.0 && tc < axisHitT) {
                            axisHitT = tc;
                            axisHitIdx = u32(ax) + 1u;
                        }
                    }
                }
            }

            let shapeHit = hitSd.shapeIndex > 0u && gsl_isShapeVisible(hitSd.shapeIndex);
            let backHit = backHitSd.shapeIndex > 0u && gsl_isShapeVisible(backHitSd.shapeIndex);
            let axisHit = axisHitIdx > 0u;
            let shapeInFront = shapeHit && (!axisHit || t <= axisHitT);
            // Backface only shows when there is no frontface hit
            let backInFront = backHit && !shapeHit && (!axisHit || backT <= axisHitT);

            if (!shapeHit && !backHit && !axisHit) { discard; }

            if (shapeInFront) {
                // The pixel footprint here, for the program's pixelSize().
                gsl_pw = ${texturePw("gsl_pwScale * pixelScale * mix(max(t, 1.0), 1.0, camOrtho)")};${setHitState}
                let normalEps = max(baseGradEps, pixelScale * mix(max(t, 1.0), 1.0, camOrtho) * 0.05);
                // The march now lands on the nearest crossing from whichever
                // side the ray approached, so this hit can be a surface we are
                // behind: the far wall when the camera sits inside a solid, or
                // the reverse face of an open surface. Shade those the way the
                // backface pass below always has — flip the outward normal and
                // dim to renderKnobs.z (25% unless Back faces is Full) — so a
                // closed solid viewed from outside, where the normal already
                // faces the camera, is bit-for-bit unchanged.
                let rawNormal = gsl_calcNormal(hitPos, time, normalEps);
                let facingAway = dot(rayDir, rawNormal) > 0.0;
                let localNormal = select(rawNormal, -rawNormal, facingAway);
                ${hasColorField
                  ? `${atScreenPw("gsl_cf", "let gsl_cf = gsl_colorField(hitPos, time, hitSd.shapeIndex);")}
                var baseColor = select(gsl_shapeColor(hitSd.shapeIndex, ${colorArgsWGSL.join(", ")}), gsl_cf.rgb, gsl_cf.a > 0.5);`
                  : `var baseColor = gsl_shapeColor(hitSd.shapeIndex, ${colorArgsWGSL.join(", ")});`}
                ${fieldInfo.active ? `
                // Field result: colour the surface by the simulated field at
                // the hit point. Sampled clamped, so the geometry outside the
                // baked bbox takes the boundary value rather than going black.
                // Overrides an authored colorField: the overlay is switched on
                // to be read, and a document that paints itself would otherwise
                // show no result at all.
                {
                    let cUvw = (hitPos - fieldBMin) / fieldBSize;
                    let cVal = textureSampleLevel(fieldTex, fieldSmp,
                        clamp(cUvw, vec3<f32>(0.0), vec3<f32>(1.0)), 0.0).r;
                    baseColor = gsl_fieldColor(cVal, fieldThr);
                }` : ""}
                let gsl_mat = ${materialAt("hitPos", "hitSd")};

                // SDF ambient occlusion (Quilez).
                // Clamp d to >= 0: for grid-baked SDFs the surface normal can be a
                // few degrees off (trilinear-interp gradient discontinuities at cell
                // boundaries), which makes hitPos + h*normal occasionally land
                // *inside* an adjacent part of the same mesh. Without the clamp,
                // a strongly-negative d makes (h - d) huge, ao saturates, and
                // aoFactor pins to 0 — visible as random black speckle on the
                // surface. Clamping treats false-occlusion as full-occlusion at
                // h, preserving genuine dark crevices but bounded.
                var ao = 0.0;
                var aoScale = 2.0;
                for (var aoStep = 0; aoStep < aoTaps; aoStep = aoStep + 1) {
                    let h = 0.01 + 0.12 * f32(aoStep) / 4.0;
                    // A face seen from behind is seen from inside its solid, where the
                    // field is negative; negated, the space the camera is in reads as
                    // open, as it does in front of a face, rather than as occluded.
                    let aoSd = ${nearFieldFn}(hitPos + localNormal * h, time).distance;
                    let d = max(0.0, select(aoSd, -aoSd, facingAway));
                    ao = ao + (h - d) * aoScale;
                    aoScale = aoScale * 0.95;
                }
                let aoFactor = clamp(1.0 - 3.0 * ao, 0.0, 1.0);

                let viewDirWorld = normalize(camPosZUp - hitPos);
                ${shadeFrontWGSL}
                let sLinDepth = dot(hitPos - rayOrigin, camFwd) / nearFar.y;
                let belowPlane = fieldActive > 0.5 && dot(fieldNormal, hitPos) < fieldHeight;
                return vec4<f32>(litColor, f32(hitSd.shapeIndex) + select(0.0, 0.5, belowPlane) + clamp(sLinDepth, 0.0, 0.498));
            }

            if (backInFront) {
                // Backface: flip the outward normal to shade the interior surface at renderKnobs.z
                gsl_pw = ${texturePw("gsl_pwScale * pixelScale * mix(max(backT, 1.0), 1.0, camOrtho)")};${setHitState}
                let normalEps = max(baseGradEps, pixelScale * mix(max(backT, 1.0), 1.0, camOrtho) * 0.05);
                let localNormal = -gsl_calcNormal(backHitPos, time, normalEps);
                ${hasColorField
                  ? `${atScreenPw("gsl_cf", "let gsl_cf = gsl_colorField(backHitPos, time, backHitSd.shapeIndex);")}
                let baseColor = select(gsl_shapeColor(backHitSd.shapeIndex, ${colorArgsWGSL.join(", ")}), gsl_cf.rgb, gsl_cf.a > 0.5);`
                  : `let baseColor = gsl_shapeColor(backHitSd.shapeIndex, ${colorArgsWGSL.join(", ")});`}
                let gsl_mat = ${materialAt("backHitPos", "backHitSd")};

                // See comment on the front-face AO loop above for why d is
                // clamped to >= 0, and why a face seen from behind negates it.
                var ao = 0.0;
                var aoScale = 2.0;
                for (var aoStep = 0; aoStep < aoTaps; aoStep = aoStep + 1) {
                    let h = 0.01 + 0.12 * f32(aoStep) / 4.0;
                    let d = max(0.0, -${nearFieldFn}(backHitPos + localNormal * h, time).distance);
                    ao = ao + (h - d) * aoScale;
                    aoScale = aoScale * 0.95;
                }
                let aoFactor = clamp(1.0 - 3.0 * ao, 0.0, 1.0);

                let viewDirWorld = normalize(camPosZUp - backHitPos);
                let litColor = gsl_shadeSurface(backHitPos, localNormal, viewDirWorld, baseColor, gsl_mat, aoFactor,
                                                renderKnobs.z, zUpToView, skyCol, groundCol, shadingKnobs);
                let sLinDepth = dot(backHitPos - rayOrigin, camFwd) / nearFar.y;
                let belowPlane = fieldActive > 0.5 && dot(fieldNormal, backHitPos) < fieldHeight;
                return vec4<f32>(litColor, f32(backHitSd.shapeIndex) + select(0.0, 0.5, belowPlane) + clamp(sLinDepth, 0.0, 0.498));
            }

            if (axisHit) {
                var axisColor = vec3<f32>(0.259, 0.020, 0.024); // X red
                if (axisHitIdx == 2u) { axisColor = vec3(0.008, 0.220, 0.024); } // Y green
                if (axisHitIdx == 3u) { axisColor = vec3(0.020, 0.176, 0.490); } // Z blue
                let axisPos = rayOrigin + rayDir * axisHitT;
                let aLinDepth = dot(axisPos - rayOrigin, camFwd) / nearFar.y;
                return vec4<f32>(axisColor, clamp(aLinDepth, 0.001, 0.999));
            }

            return vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }
    `),
    fieldInfo.active
      ? [sdShape, gsl_material, gsl_calcNormal, gsl_shapeColor, gsl_shadeSurface, ...glassDeps, ...displaceDeps, ...partDetailDeps, gsl_isShapeVisible, wgslFn(fieldInfo.rampWGSL)]
      : [sdShape, gsl_material, gsl_calcNormal, gsl_shapeColor, gsl_shadeSurface, ...glassDeps, ...displaceDeps, ...partDetailDeps, gsl_isShapeVisible],
  );

  // The progressive pass: one path per pixel, added to the previous sum.
  let ptFragment = null;
  if (trace) {
    const gsl_traceSample = wgslFn(
      injectExtraArgs(traceSampleWGSL({
        extraParamsWGSL,
        extraArgsWGSL,
        colorParamsWGSL: colorParamsWGSL.join(", "),
        colorStmt,
        materialAt,
        texturePw,
        setDispDrawn: setHitState,
        displace: displaceActive,
      })),
      [sdShape, gsl_material, gsl_calcNormal, gsl_shapeColor, gsl_shadeSurface, gsl_marchSecondary, gsl_traceState, ...partDetailDeps, ...(displaceActive ? [gsl_displaceState] : [])],
    );
    ptFragment = wgslFn(`
        fn gsl_progressiveFragment(
            uv: vec2<f32>,
            prev: vec4<f32>,
            resolution: vec2<f32>,
            frame: f32,
            camPosZUp: vec3<f32>,
            camRight: vec3<f32>,
            camUp: vec3<f32>,
            camFwd: vec3<f32>,
            camTanFov: vec2<f32>,
            camOrtho: f32,
            zUpToView: mat4x4<f32>,
            skyCol: vec3<f32>,
            groundCol: vec3<f32>,
            envA: mat4x4<f32>,
            envB: mat4x4<f32>,
            envC: mat4x4<f32>,
            shadingKnobs: vec4<f32>,
            traceKnobs: vec4<f32>,
            lens: vec4<f32>,
            traceFlags: vec4<f32>,
            surfaceKnobs: vec4<f32>,
            detailKnobs: vec4<f32>,
            detailKnobs2: vec4<f32>,
            bgColor: vec3<f32>,
            pixelScale: f32,
            worldExtent: f32,
            time: f32,
            ${colorParamsWGSL.join(", ")},
            ${visParamsWGSL.join(", ")}${extraParamsWGSL}
        ) -> vec4<f32> {
            ${visArgsWGSL.map((v, i) => visAssignWGSL(i, v)).join(" ")}
            ${partDetailSetupWGSL(wgslCode)}
            gsl_envA = envA; gsl_envB = envB; gsl_envC = envC;
            gsl_pwScale = surfaceKnobs.z;
            ${displaceActive ? "gsl_dispScale = surfaceKnobs.x;" : ""}
            return prev + gsl_traceSample(uv, resolution, frame, camPosZUp, camRight, camUp, camFwd, camTanFov,
                camOrtho, zUpToView, skyCol, groundCol, shadingKnobs, traceKnobs, lens, traceFlags, bgColor, pixelScale,
                worldExtent, time, ${colorArgsWGSL.join(", ")}${extraArgsWGSL});
        }
    `, [gsl_traceSample, gsl_isShapeVisible, ...displaceDeps, ...partDetailDeps]);
  }

  // The Schematic tier (gsl-simple.js): a plain sphere trace and a headlight,
  // on the undisplaced field.
  const simpleFragment = wgslFn(
    injectExtraArgs(simpleFragmentWGSL({ visParamsWGSL, visArgsWGSL, colorParamsWGSL, colorArgsWGSL, extraParamsWGSL,
      setupWGSL: partDetailSetupWGSL(wgslCode), parts })),
    [sdShape, gsl_isShapeVisible, gsl_shapeColor, ...partDetailDeps],
  );

  return {
    sdShape,
    gsl_min,
    gsl_isShapeVisible,
    gsl_shapeColor,
    gsl_calcNormal,
    injectExtraArgs,
    colorParamsWGSL,
    colorArgsWGSL,
    wgslFragmentShader,
    ptFragment,
    simpleFragment,
  };
}
