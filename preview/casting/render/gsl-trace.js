// Progressive path tracing for the GSL raymarch viewer:
// the "Progressive" render tier at rest.
//
// Each frame adds one path per pixel to a running sum the composite averages,
// so the image converges while the view is still. The standard frame is still
// drawn first and keeps supplying the pick data (shape index and depth in its
// alpha), so picking, outlines and depth compositing never see the jitter.
//
// One path:
//   - The primary ray is jittered inside its pixel, which antialiases edges;
//     the composite weights the average by how many samples hit a shape.
//   - Every ray is marched with gsl_marchSecondary (the primary loop's
//     algorithm, gsl-glass.js), through the displaced field when the document
//     displaces.
//   - At a hit, the three rig lights are sampled directly (next-event
//     estimation) with a shadow ray each, through the same BRDF
//     gsl_shadeLinear uses; emission is added; then the path continues along
//     one lobe chosen in proportion to its weight: GGX specular, Lambert
//     diffuse, or transmission into the solid. Leaving a transmissive solid
//     applies Beer-Lambert absorption and refracts out, or reflects back in.
//   - A ray that escapes the scene sees the sky/ground hemisphere Standard
//     uses for its ambient, so the two tiers are lit by the same light. A ray
//     that has only ever refracted sees the flat background instead, as
//     through glass in Standard.
//   - Russian roulette on the throughput ends paths after a couple of
//     bounces, instead of a fixed bounce cap.
//
// No ambient-occlusion approximation: occlusion and bounce light come from
// the paths themselves, and so do shadows, which Standard does not draw.
//
// Scene-referred radiance is accumulated; the composite tone maps the
// average. Shadow rays pass through transmissive surfaces, attenuated by the
// transmission and by absorption inside; they do not bend, so glass casts a
// tinted shadow but no caustic.

import * as THREE from "three";
import { uniform } from "three/tsl";
import { BACK_FACE_DIM } from "./gsl-shading.js";

//   x  maxDepth   path segments before a path is cut regardless (Russian
//                 roulette usually ends it sooner)
//   y  maxSteps   march steps per ray
//   z  cap        frames accumulated before the image is left as it is
//   w  clamp      largest radiance a single path may add per channel, which
//                 tames the rare very bright path at the cost of a little
//                 energy
export const TRACE_DEFAULTS = Object.freeze({ maxDepth: 8, maxSteps: 256, cap: 512, clamp: 16 });

export const traceKnobsU = uniform(
  new THREE.Vector4(TRACE_DEFAULTS.maxDepth, TRACE_DEFAULTS.maxSteps, TRACE_DEFAULTS.cap, TRACE_DEFAULTS.clamp),
);

// The thin lens for depth of field, set by the viewer each frame:
//   x  lensRadius  world-space radius of the lens; 0 is a pinhole (no blur)
//   y  focusDist   distance along the view axis that is in focus
export const lensKnobsU = uniform(new THREE.Vector4(0, 1, 0, 0));

// Switches on the path tracer, set from the Render panel:
//   x  shadows  1 sends a shadow ray toward each rig light; 0 lets every
//               light reach every surface that faces it, as Standard does
//   y  backDim  how bright an opaque surface seen from behind is:
//               BACK_FACE_DIM with Back faces at Dim, as Standard draws it,
//               1 at Full
export const traceFlagsU = uniform(new THREE.Vector4(1, BACK_FACE_DIM, 0, 0));

// The Depth of field slider's full travel: at 1 the lens radius is this
// fraction of the focus distance.
export const LENS_RADIUS_AT_FULL = 0.02;

// How many samples "Render image" accumulates.
export const FINAL_RENDER_SAMPLES = 1024;

// How many path-traced samples the standard frame counts as at the head of
// the progressive sum: the composite shows mix(standard, traced average,
// n / (n + TRACE_STANDARD_WEIGHT)), so the image opens exactly as Standard
// and fades into the traced result (1.5% Standard is left at the 512-sample cap).
export const TRACE_STANDARD_WEIGHT = 8;

// The random-number state, one per fragment invocation.
export const GSL_TRACE_STATE_WGSL = `var<private> gsl_rngState: u32 = 0u;`;

// traceSampleWGSL returns the source of
//
//   fn gsl_traceSample(uv, resolution, frame, camera..., zUpToView, skyCol,
//                      groundCol, knobs, traceKnobs, lens, traceFlags, bgColor, pixelScale,
//                      worldExtent, time, <palette colours>, <suffix>) -> vec4<f32>
//
// one path's radiance in rgb and 1 in alpha when the primary ray hit a shape,
// or all zeros when it missed. The caller supplies how a hit's colour and
// material are looked up, exactly as for gsl_shadeGlass (gsl-glass.js).
// texturePw(pw) wraps the pixel footprint set at the primary hit, which
// textures fade their detail by (the detail ladder's, for a program with
// parts; gsl-render-graph.js). setDispDrawn is the statement that tells a
// program reading displacementDrawn() how much displacement was drawn there.
export function traceSampleWGSL({ extraParamsWGSL, extraArgsWGSL, colorParamsWGSL, colorStmt, materialAt, texturePw = (pw) => pw, setDispDrawn = "", displace = false }) {
  const colorParams = colorParamsWGSL ? `,\n    ${colorParamsWGSL}` : "";
  return `
fn gsl_traceSample(
    uv: vec2<f32>,
    resolution: vec2<f32>,
    frame: f32,
    camPos: vec3<f32>,
    camRight: vec3<f32>,
    camUp: vec3<f32>,
    camFwd: vec3<f32>,
    camTanFov: vec2<f32>,
    camOrtho: f32,
    zUpToView: mat4x4<f32>,
    skyCol: vec3<f32>,
    groundCol: vec3<f32>,
    knobs: vec4<f32>,
    traceKnobs: vec4<f32>,
    lens: vec4<f32>,
    traceFlags: vec4<f32>,
    bgColor: vec3<f32>,
    pixelScale: f32,
    worldExtent: f32,
    time: f32${colorParams}${extraParamsWGSL}
) -> vec4<f32> {
    let maxDepth = u32(clamp(traceKnobs.x, 1.0, 16.0));
    let maxSteps = u32(clamp(traceKnobs.y, 8.0, 1024.0));
    let pathClamp = max(traceKnobs.w, 1.0);
    let exposure = knobs.z;
    let baseGradEps = 0.0001;

    // One independent stream per pixel and frame.
    let px = vec2<u32>(clamp(uv * resolution, vec2<f32>(0.0), resolution - 1.0));
    gsl_rngState = gsl_pcg(px.x ^ gsl_pcg(px.y ^ gsl_pcg(u32(frame) + 0x9e3779b9u)));

    // The camera ray, jittered inside the pixel.
    let uvj = uv + (vec2<f32>(gsl_rand(), gsl_rand()) - 0.5) / resolution;
    let ndc = vec2<f32>(uvj.x * 2.0 - 1.0, 1.0 - uvj.y * 2.0);
    let rayOffset = ndc.x * camTanFov.x * camRight + ndc.y * camTanFov.y * camUp;
    var camOrigin = camPos + rayOffset * camOrtho;
    var dir = normalize(mix(camFwd + rayOffset, camFwd, camOrtho));

    // Depth of field: a thin lens of radius lens.x, focused lens.y along the
    // view axis. A pinhole in orthographic views.
    if (lens.x > 0.0 && camOrtho < 0.5) {
        let focusPoint = camOrigin + dir * (lens.y / max(dot(dir, camFwd), 1e-4));
        let r = lens.x * sqrt(gsl_rand());
        let a = 6.28318530718 * gsl_rand();
        camOrigin = camOrigin + camRight * (r * cos(a)) + camUp * (r * sin(a));
        dir = normalize(focusPoint - camOrigin);
    }

    // Start at the scene box, as the primary march does.
    let invRd = 1.0 / dir;
    let t1 = (vec3<f32>(-worldExtent) - camOrigin) * invRd;
    let t2 = (vec3<f32>(worldExtent) - camOrigin) * invRd;
    let tEntry = max(max(min(t1.x, t2.x), min(t1.y, t2.y)), min(t1.z, t2.z));
    let tExit = min(min(max(t1.x, t2.x), max(t1.y, t2.y)), max(t1.z, t2.z));
    if (tEntry > tExit || tExit <= 0.0) { return vec4<f32>(0.0); }
    var origin = camOrigin + dir * max(tEntry, 0.0);
    var camDist = max(tEntry, 0.0);

    // The rig's directions are view-space; the path runs in world Z-up.
    let toWorld = transpose(mat3x3<f32>(zUpToView[0].xyz, zUpToView[1].xyz, zUpToView[2].xyz));

    var throughput = vec3<f32>(1.0);
    var radiance = vec3<f32>(0.0);
    var onlyRefracted = true;   // escaping now shows the background, as through glass
    var ior = 1.0;              // index of the medium the ray is in
    // The density the last bounce drew its direction with, for weighting
    // environment panels a ray finds against the ones next-event estimation
    // already sampled; 0 after a refraction, which nothing else samples.
    var lastPdf = 0.0;
    ${displace ? "let dispAtStart = gsl_dispScale;" : ""}

    for (var depth = 0u; depth < 16u; depth = depth + 1u) {
        if (depth >= maxDepth) { break; }
        let pw = pixelScale * mix(max(camDist, 1.0), 1.0, camOrtho);
        let tStart = select(0.0, max(0.002, pw * 0.5), depth > 0u);
        let h = gsl_marchSecondary(origin, dir, tStart, worldExtent, pixelScale, camOrtho, camDist,
                                   maxSteps, time${extraArgsWGSL});
        if (h.hit < 0.5) {
            if (depth == 0u) { return vec4<f32>(0.0); }
            if (onlyRefracted) {
                radiance = radiance + throughput * bgColor;
            } else if (gsl_envPanelCount() > 0u && lastPdf > 0.0) {
                // The panels were also sampled directly at the last bounce:
                // weight this hit on them by the power heuristic.
                let pl = gsl_envPanelPdf(dir);
                let w = lastPdf * lastPdf / (lastPdf * lastPdf + pl * pl);
                radiance = radiance + throughput
                    * (gsl_envSkyRadiance(dir) + gsl_envPanelRadiance(dir) * w) * exposure;
            } else {
                radiance = radiance + throughput * gsl_traceSky(dir, skyCol, groundCol, knobs) * exposure;
            }
            break;
        }
        camDist = camDist + h.t;
        gsl_pw = ${texturePw("gsl_pwScale * pixelScale * mix(max(camDist, 1.0), 1.0, camOrtho)")};${setDispDrawn}
        let off = gsl_traceOffset(camDist, pixelScale, camOrtho);
        let normalEps = max(baseGradEps, pixelScale * mix(max(camDist, 1.0), 1.0, camOrtho) * 0.05);
        let nRaw = gsl_calcNormal(h.pos, time, normalEps);
        ${colorStmt("hColor", "h.pos", "h.sd")}
        let hMat = ${materialAt("h.pos", "h.sd")};
        let T = clamp(hMat.volume.x, 0.0, 1.0);
        let exiting = dot(dir, nRaw) > 0.0;

        if (exiting && T > 0.0) {
            // Leaving a transmissive solid: tint by the path just crossed, pay
            // the exit Fresnel, refract out or reflect back in.
            throughput = throughput * gsl_absorb(hColor, h.t, hMat.volume.y);
            let nIn = -nRaw;
            let hRough = clamp(hMat.surface.x, 0.0, 1.0);
            let nj = gsl_ggxNormal(nIn, hRough, vec2<f32>(gsl_rand(), gsl_rand()));
            let n = select(nIn, nj, dot(dir, nj) < 0.0);
            throughput = throughput * gsl_transmitWeight(max(-dot(n, dir), 1e-4), hMat, hColor);
            var out = refract(dir, n, ior);
            if (dot(out, out) < 1e-6) {
                out = reflect(dir, n);
            } else {
                ior = 1.0;
            }
            dir = out;
            origin = h.pos + nRaw * select(-off, off, dot(out, nRaw) > 0.0);
            lastPdf = 0.0;
            continue;
        }

        // An opaque surface is two-sided: a face seen from behind is lit as a
        // face (the camera inside a solid, or an open surface), and dimmed as
        // Standard dims it: everything it sends back is scaled by backDim.
        let N = select(nRaw, -nRaw, exiting);
        throughput = throughput * select(1.0, traceFlags.y, exiting);
        let V = -dir;
        let NoV = max(dot(N, V), 1e-4);
        let layFrame = gsl_layFrame(N, hMat.lay);

        let albedo = gsl_srgbToLinear(hColor);
        let roughness = clamp(hMat.surface.x, 0.045, 1.0);
        let alpha2 = roughness * roughness * roughness * roughness;
        let metallic = clamp(hMat.surface.y, 0.0, 1.0);
        let matIor = max(hMat.surface.z, 1.0);
        let f0d = ((matIor - 1.0) / (matIor + 1.0)) * ((matIor - 1.0) / (matIor + 1.0));
        let F0 = mix(vec3<f32>(f0d), albedo, metallic);
        let diffuseColor = albedo * (1.0 - metallic) * (1.0 - T);

        radiance = radiance + throughput * gsl_srgbToLinear(hMat.emissive.rgb) * hMat.emissive.w;

        // Direct light from the rig, each light behind a shadow ray unless
        // shadows are switched off. An environment preset may turn the rig
        // off, and then its shadow rays are skipped.
        let lit = h.pos + N * off;
        let rigLights = select(0u, 3u, gsl_envRigScale() > 0.0);
        for (var li = 0u; li < rigLights; li = li + 1u) {
            let L = normalize(toWorld * gsl_traceRigDir(li, knobs));
            if (dot(N, L) <= 0.0) { continue; }
            var vis = vec3<f32>(1.0);
            if (traceFlags.x > 0.5) {
                vis = gsl_traceShadow(lit, L, camDist, pixelScale, camOrtho, worldExtent, maxSteps, time${colorArgsForCall(colorParamsWGSL)}${extraArgsWGSL});
            }
            if (max(vis.x, max(vis.y, vis.z)) <= 0.0) { continue; }
            radiance = radiance + throughput * vis
                * gsl_directLightLay(N, V, NoV, L, gsl_traceRigColor(li, knobs) * exposure, diffuseColor, F0, alpha2, roughness, layFrame);
        }

        // Continue along one lobe, chosen in proportion to its weight.
        let Fv = gsl_fresnelSchlickRoughness(NoV, F0, roughness);
        let wSpec = gsl_luminance(Fv);
        let wDiff = gsl_luminance(diffuseColor * (vec3<f32>(1.0) - Fv));
        let wTrans = T * (1.0 - metallic) * gsl_luminance(vec3<f32>(1.0) - Fv);
        let wSum = wSpec + wDiff + wTrans;
        if (wSum <= 1e-6) { break; }
        let pSpec = wSpec / wSum;
        let pDiff = wDiff / wSum;

        // Direct light from the environment's panels: one direction drawn
        // toward them, behind a shadow ray, weighted against the chance the
        // bounce below would have found the same light (power heuristic).
        if (gsl_envPanelCount() > 0u) {
            let L = gsl_envSamplePanel(gsl_rand(), vec2<f32>(gsl_rand(), gsl_rand()));
            let pl = gsl_envPanelPdf(L);
            if (dot(N, L) > 0.0 && pl > 0.0) {
                var vis = vec3<f32>(1.0);
                if (traceFlags.x > 0.5) {
                    vis = gsl_traceShadow(lit, L, camDist, pixelScale, camOrtho, worldExtent, maxSteps, time${colorArgsForCall(colorParamsWGSL)}${extraArgsWGSL});
                }
                if (max(vis.x, max(vis.y, vis.z)) > 0.0) {
                    let pb = gsl_traceBsdfPdf(N, V, L, alpha2, roughness, layFrame, pSpec, pDiff);
                    let w = pl * pl / (pl * pl + pb * pb);
                    radiance = radiance + throughput * vis * (w / pl)
                        * gsl_directLightLay(N, V, NoV, L, gsl_envPanelRadiance(L) * exposure, diffuseColor, F0, alpha2, roughness, layFrame);
                }
            }
        }

        let pick = gsl_rand() * wSum;
        let xi = vec2<f32>(gsl_rand(), gsl_rand());

        if (pick < wSpec) {
            let H = gsl_ggxNormalLay(N, roughness, layFrame, xi);
            let L = reflect(-V, H);
            let NoL = dot(N, L);
            if (NoL <= 0.0) { break; }
            let VoH = max(dot(V, H), 1e-4);
            let NoH = max(dot(N, H), 1e-4);
            let F = gsl_fresnelSchlick(VoH, F0);
            let Vis = gsl_visibilityLay(N, V, L, NoV, NoL, alpha2, roughness, layFrame);
            // f * NoL / pdf, with pdf = D * NoH / (4 VoH); D cancels.
            throughput = throughput * F * (Vis * 4.0 * NoL * VoH / NoH) * (wSum / wSpec);
            lastPdf = gsl_traceBsdfPdf(N, V, L, alpha2, roughness, layFrame, pSpec, pDiff);
            dir = L;
            origin = h.pos + N * off;
            onlyRefracted = false;
        } else if (pick < wSpec + wDiff) {
            let L = gsl_cosineDir(N, xi);
            let H = normalize(L + V);
            let F = gsl_fresnelSchlick(max(dot(V, H), 0.0), F0);
            // Lambert f * NoL / pdf is the albedo itself.
            throughput = throughput * diffuseColor * (vec3<f32>(1.0) - F) * (wSum / wDiff);
            lastPdf = gsl_traceBsdfPdf(N, V, L, alpha2, roughness, layFrame, pSpec, pDiff);
            dir = L;
            origin = h.pos + N * off;
            onlyRefracted = false;
        } else {
            let nj = gsl_ggxNormal(N, roughness, xi);
            let n = select(N, nj, dot(V, nj) > 0.0);
            throughput = throughput * T * (1.0 - metallic) * gsl_transmitWeight(max(dot(n, V), 1e-4), hMat, hColor)
                * (wSum / wTrans);
            var into = refract(dir, n, ior / matIor);
            if (dot(into, into) < 1e-6) {
                into = reflect(dir, n);
                onlyRefracted = false;
            } else {
                ior = matIor;
            }
            lastPdf = 0.0;
            dir = into;
            ${displace ? `// Past a rough interface the rest of the path marches the
            // undisplaced field, starting below the relief, as gsl_shadeGlass
            // does and for its reason: the relief beyond cannot be seen, and
            // paying for it at every step lost the GPU device.
            var below = 0.0;
            if (hMat.surface.x > 0.02) {
                below = abs(hMat.volume.z) * gsl_dispScale;
                gsl_dispScale = 0.0;
            }
            origin = h.pos + N * select(-off - below, off, dot(into, N) > 0.0);` : `origin = h.pos + N * select(-off, off, dot(into, N) > 0.0);`}
        }

        // Russian roulette.
        if (depth >= 2u) {
            let survive = clamp(max(throughput.x, max(throughput.y, throughput.z)), 0.05, 1.0);
            if (gsl_rand() > survive) { break; }
            throughput = throughput / survive;
        }
    }
    ${displace ? "gsl_dispScale = dispAtStart;" : ""}

    return vec4<f32>(min(radiance, vec3<f32>(pathClamp)), 1.0);
}

// How much of a rig light reaches p along L: 0 behind an opaque surface,
// otherwise the product of the transmission of every transmissive surface
// crossed and the absorption inside it.
fn gsl_traceShadow(
    p: vec3<f32>,
    L: vec3<f32>,
    camDist: f32,
    pixelScale: f32,
    camOrtho: f32,
    worldExtent: f32,
    maxSteps: u32,
    time: f32${colorParams}${extraParamsWGSL}
) -> vec3<f32> {
    var transmit = vec3<f32>(1.0);
    var origin = p;
    var inside = false;
    ${displace ? `// Past a rough transmissive surface the shadow ray marches the
    // undisplaced field, as the path does (see the transmission lobe).
    let dispAtStart = gsl_dispScale;` : ""}
    for (var k = 0u; k < 6u; k = k + 1u) {
        let pw = pixelScale * mix(max(camDist, 1.0), 1.0, camOrtho);
        let h = gsl_marchSecondary(origin, L, max(0.002, pw * 0.5), worldExtent, pixelScale, camOrtho,
                                   camDist, maxSteps, time${extraArgsWGSL});
        if (h.hit < 0.5) { ${displace ? "gsl_dispScale = dispAtStart; " : ""}return transmit; }
        ${colorStmt("sColor", "h.pos", "h.sd")}
        let sMat = ${materialAt("h.pos", "h.sd")};
        let T = clamp(sMat.volume.x, 0.0, 1.0);
        if (T <= 0.0) { ${displace ? "gsl_dispScale = dispAtStart; " : ""}return vec3<f32>(0.0); }
        if (inside) {
            transmit = transmit * gsl_absorb(sColor, h.t, sMat.volume.y);
        } else {
            transmit = transmit * T * (1.0 - clamp(sMat.surface.y, 0.0, 1.0));
        }
        inside = !inside;
        ${displace ? `var below = 0.0;
        if (sMat.surface.x > 0.02 && gsl_dispScale != 0.0) {
            below = abs(sMat.volume.z) * gsl_dispScale;
            gsl_dispScale = 0.0;
        }
        origin = h.pos + L * (gsl_traceOffset(camDist, pixelScale, camOrtho) + below);` : "origin = h.pos + L * gsl_traceOffset(camDist, pixelScale, camOrtho);"}
    }
    ${displace ? "gsl_dispScale = dispAtStart;" : ""}
    return vec3<f32>(0.0);
}

// The density the bounce draws direction L with at a surface: the GGX lobe,
// along the material's lay where it has one (gsl_ggxNormal and
// gsl_ggxNormalLay sample D(h) NoH, so L has D NoH / (4 VoH)) with probability
// pSpec, the cosine lobe with pDiff. The transmission lobe never draws a
// reflected direction.
fn gsl_traceBsdfPdf(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, alpha2: f32, roughness: f32, layFrame: vec4<f32>, pSpec: f32, pDiff: f32) -> f32 {
    let NoL = dot(N, L);
    if (NoL <= 0.0) { return 0.0; }
    let H = normalize(L + V);
    let NoH = max(dot(N, H), 1e-4);
    let VoH = max(dot(V, H), 1e-4);
    let spec = gsl_distributionLay(N, H, alpha2, roughness, layFrame) * NoH / (4.0 * VoH);
    return pSpec * spec + pDiff * NoL / 3.14159265;
}

// The sky/ground hemisphere Standard's ambient uses (gsl_shadeLinear), as
// radiance arriving from direction d; under an environment preset, the
// preset's own radiance (gsl-environment.js).
fn gsl_traceSky(d: vec3<f32>, skyCol: vec3<f32>, groundCol: vec3<f32>, knobs: vec4<f32>) -> vec3<f32> {
    if (gsl_envAnalytic()) { return gsl_envRadiance(d); }
    return mix(groundCol, skyCol, d.z * 0.5 + 0.5) * knobs.y;
}

// The rig light i's view-space direction and radiance. Must match the lights
// in gsl_shadeLinear (gsl-shading.js).
fn gsl_traceRigDir(i: u32, knobs: vec4<f32>) -> vec3<f32> {
    if (i == 0u) { return normalize(vec3<f32>(-0.5, 0.6, 0.5)); }
    if (i == 1u) { return normalize(vec3<f32>( 0.5, 0.6, 0.5)); }
    return normalize(vec3<f32>(0.0, knobs.w, 1.0));
}

fn gsl_traceRigColor(i: u32, knobs: vec4<f32>) -> vec3<f32> {
    let rigScale = gsl_envRigScale();
    if (i < 2u) { return vec3<f32>(0.618, 0.684, 0.855) * 0.75 * knobs.x * rigScale; }
    return vec3<f32>(0.600, 0.420, 0.200) * knobs.x * rigScale;
}

// How far off a surface a continuing ray starts; see gsl_surfaceOffset in
// gsl-glass.js.
fn gsl_traceOffset(camDist: f32, pixelScale: f32, camOrtho: f32) -> f32 {
    let pixelWorld = pixelScale * mix(max(camDist, 1.0), 1.0, camOrtho);
    return 2.0 * max(0.001, pixelWorld * 0.5);
}

// A cosine-weighted direction about N.
fn gsl_cosineDir(N: vec3<f32>, xi: vec2<f32>) -> vec3<f32> {
    let r = sqrt(xi.x);
    let phi = 6.28318530718 * xi.y;
    let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(N.z) < 0.999);
    let tx = normalize(cross(up, N));
    let ty = cross(N, tx);
    return normalize(tx * (r * cos(phi)) + ty * (r * sin(phi)) + N * sqrt(max(0.0, 1.0 - xi.x)));
}

fn gsl_luminance(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// PCG hash (Jarzynski and Olano).
fn gsl_pcg(v: u32) -> u32 {
    let state = v * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn gsl_rand() -> f32 {
    gsl_rngState = gsl_pcg(gsl_rngState);
    return f32(gsl_rngState >> 8u) / 16777216.0;
}
`;
}

// The palette arguments, forwarded from gsl_traceSample to the shadow ray.
function colorArgsForCall(colorParamsWGSL) {
  if (!colorParamsWGSL) return "";
  const names = colorParamsWGSL.split(",").map((p) => p.split(":")[0].trim()).filter(Boolean);
  return names.length ? ", " + names.join(", ") : "";
}
