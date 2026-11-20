// The Schematic render tier, `simple` in the code: the least a raymarched GSL
// frame can be, drawn two ways from one spec so the pair can be compared. The GPU draws it from the
// compiled WGSL (gsl-render-graph.js's simpleFragment); a CPU tier
// draws it with fidget-wasm from the program's omega tape (fw_render_simple,
// internal/fidget/internal/wasm), and shadeSimple below finishes that frame.
//
// The spec:
//   - The ray is the standard frame's: the camera basis, perspective or
//     orthographic, clipped to the scene box.
//   - The composite is gsl_min's: the visible return with the smallest |d|,
//     the later return on a tie.
//   - A plain sphere trace on it: from the box entry, up to SIMPLE.steps
//     times, stop at t > the box exit; a hit is |d| below the larger of
//     SIMPLE.hitFloor and SIMPLE.hitPixel pixels; otherwise t += |d| *
//     SIMPLE.fudge. No gradient correction, bisection, backface march,
//     displacement or axis lines.
//   - The normal is the tetrahedral difference of the composite's signed
//     distance at the hit, over the larger of SIMPLE.normalFloor and
//     SIMPLE.normalPixel pixels.
//   - The colour is the return's schematic color, the viewer's palette, which
//     the document's .color and materials never reach, lit by a headlight:
//     color * (ambient + (1 - ambient) * |n . v|), so a surface seen from
//     behind shades like one seen from the front, then times the Render
//     panel's back-face brightness (renderKnobs.z) where n faces away from
//     the camera, as the standard frame dims it.
//   - The alpha is the standard frame's: shape index, + 0.5 below the
//     section plane, + depth / far (at most 0.498), so picking, outlines and
//     the composite read it unchanged.

import { visAssignWGSL } from "./gsl-visibility.js";

export const SIMPLE = Object.freeze({
  steps: 256,
  fudge: 0.8,
  hitFloor: 0.001,
  hitPixel: 0.5,
  normalFloor: 0.0001,
  normalPixel: 0.05,
  ambient: 0.25,
});

// srgbToLinear decodes one channel of a schematic color, which the viewer holds
// as sRGB, so a surface facing the headlight shows the color its chip does.
export function srgbToLinear(c) {
  return Math.fround(c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
}

const f = (v) => {
  const s = Math.fround(v).toPrecision(9);
  return s.includes(".") || s.includes("e") ? s : `${s}.0`;
};

// simpleFragmentWGSL is the GPU side of the spec, as one fragment function.
// visParamsWGSL / visArgsWGSL are the visibility flags' parameter and
// argument lists, colorParamsWGSL / colorArgsWGSL the schematic colors', read
// through gsl_shapeColor; extraParamsWGSL is ", name: type, ..." for sdShape's extra
// arguments. The caller rewrites the sdShape call sites to pass them.
// setupWGSL runs first, after the visibility flags (the camera and the detail
// rungs for the program's part guards). parts is whether the program has
// parts: while the ray marches, a part far from it reads as its box
// (backend/wgsl/internal/codegen/vanish.go).
export function simpleFragmentWGSL({ visParamsWGSL, visArgsWGSL, colorParamsWGSL, colorArgsWGSL, extraParamsWGSL, setupWGSL = "", parts = false }) {
  return `
        fn gsl_simpleFragment(
            uv: vec2<f32>,
            camPosZUp: vec3<f32>,
            camRight: vec3<f32>,
            camUp: vec3<f32>,
            camFwd: vec3<f32>,
            camTanFov: vec2<f32>,
            camOrtho: f32,
            pixelScale: f32,
            worldExtent: f32,
            nearFar: vec2<f32>,
            time: f32,
            fieldActive: f32,
            fieldHeight: f32,
            fieldNormal: vec3<f32>,
            renderKnobs: vec4<f32>,
            detailKnobs: vec4<f32>,
            detailKnobs2: vec4<f32>,
            ${[...visParamsWGSL, ...colorParamsWGSL].join(", ")}${extraParamsWGSL}
        ) -> vec4<f32> {
            ${visArgsWGSL.map((v, i) => visAssignWGSL(i, v)).join(" ")}
            ${setupWGSL}

            let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
            let rayOffset = ndc.x * camTanFov.x * camRight + ndc.y * camTanFov.y * camUp;
            let rayOrigin = camPosZUp + rayOffset * camOrtho;
            let rayDir = normalize(mix(camFwd + rayOffset, camFwd, camOrtho));

            let boxMin = vec3<f32>(-worldExtent, -worldExtent, -worldExtent);
            let boxMax = vec3<f32>(worldExtent, worldExtent, worldExtent);
            let invRd = 1.0 / rayDir;
            let t1 = (boxMin - rayOrigin) * invRd;
            let t2 = (boxMax - rayOrigin) * invRd;
            let tMin = min(t1, t2);
            let tMax = max(t1, t2);
            let tEntry = max(max(tMin.x, tMin.y), tMin.z);
            let tExit = min(min(tMax.x, tMax.y), tMax.z);
            if (!(tEntry <= tExit && tExit > 0.0)) { return vec4<f32>(0.0); }

            var t = max(tEntry, 0.0);
            var hitIndex = 0u;
            ${parts ? `// A part reads as its box past four pixels at the far end of the
            // ray, never under eight hit floors; the normal below reads it whole.
            gsl_vanishView.w = max(${f(8 * SIMPLE.hitFloor)}, pixelScale * mix(max(tExit, 1.0), 1.0, camOrtho) * 4.0);` : ""}
            for (var i = 0u; i < ${SIMPLE.steps}u; i = i + 1u) {
                if (t > tExit) { break; }
                let sd = sdShape(rayOrigin + rayDir * t, time);
                let pixelWorld = pixelScale * mix(max(t, 1.0), 1.0, camOrtho);
                if (abs(sd.distance) < max(${f(SIMPLE.hitFloor)}, pixelWorld * ${f(SIMPLE.hitPixel)})) {
                    hitIndex = sd.shapeIndex;
                    break;
                }
                t = t + abs(sd.distance) * ${f(SIMPLE.fudge)};
            }
            ${parts ? "gsl_vanishView.w = 0.0;" : ""}
            if (hitIndex == 0u) { return vec4<f32>(0.0); }

            let hitPos = rayOrigin + rayDir * t;
            let e = max(${f(SIMPLE.normalFloor)}, pixelScale * mix(max(t, 1.0), 1.0, camOrtho) * ${f(SIMPLE.normalPixel)});
            let k0 = vec3<f32>( 1.0, -1.0, -1.0);
            let k1 = vec3<f32>(-1.0, -1.0,  1.0);
            let k2 = vec3<f32>(-1.0,  1.0, -1.0);
            let k3 = vec3<f32>( 1.0,  1.0,  1.0);
            // The taps go through one sdShape call in a loop: the GPU compiler
            // inlines sdShape at every call site, so a large program compiles
            // once per call written out.
            let kTaps = array<vec3<f32>, 4>(k0, k1, k2, k3);
            var g = vec3<f32>(0.0);
            for (var k = 0u; k < 4u; k = k + 1u) {
                g = g + kTaps[k] * sdShape(hitPos + kTaps[k] * e, time).distance;
            }
            let n = normalize(g);

            let schematic = gsl_shapeColor(hitIndex, ${colorArgsWGSL.join(", ")});
            let base = select(pow((schematic + 0.055) / 1.055, vec3<f32>(2.4)), schematic / 12.92, schematic <= vec3<f32>(0.04045));
            let lit = base * (${f(SIMPLE.ambient)} + ${f(1 - SIMPLE.ambient)} * abs(dot(n, rayDir)))
                * select(1.0, renderKnobs.z, dot(n, rayDir) > 0.0);
            let depth = dot(hitPos - rayOrigin, camFwd) / nearFar.y;
            let belowPlane = fieldActive > 0.5 && dot(fieldNormal, hitPos) < fieldHeight;
            return vec4<f32>(lit, f32(hitIndex) + select(0.0, 0.5, belowPlane) + clamp(depth, 0.0, 0.498));
        }
    `;
}

// simpleRay is the spec's ray through the centre of pixel (x, y) of a
// width x height frame, row 0 at the top, for a camera snapshot
// {pos, right, up, fwd, tanFov, ortho} of arrays.
export function simpleRay(cam, x, y, width, height) {
  const ndcX = ((x + 0.5) / width) * 2 - 1;
  const ndcY = 1 - ((y + 0.5) / height) * 2;
  const origin = [0, 0, 0];
  const dir = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const off = ndcX * cam.tanFov[0] * cam.right[k] + ndcY * cam.tanFov[1] * cam.up[k];
    origin[k] = cam.pos[k] + off * cam.ortho;
    dir[k] = cam.fwd[k] + off * (1 - cam.ortho);
  }
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  return { origin, dir: dir.map((v) => v / len) };
}

// shadeSimple turns rows [row0, row0 + rows) of fw_render_simple's output
// (per pixel: shape index or 0, t, normal xyz) into the spec's RGBA, written
// into `out` (Float32Array, width x height x 4, row 0 at the top).
//   cam    the camera snapshot the rows were marched with
//   far    the far distance the depth is divided by
//   field  the section plane: {active, normal: [x, y, z], height}
//   backDim  the back-face brightness, renderKnobs.z
//   colors   each return's schematic color, linear
export function shadeSimple({ gbuf, out, width, height, row0, rows, cam, far, field, backDim, colors }) {
  const a = SIMPLE.ambient;
  for (let r = 0; r < rows; r++) {
    const y = row0 + r;
    for (let x = 0; x < width; x++) {
      const src = 5 * (r * width + x);
      const dst = 4 * (y * width + x);
      const index = gbuf[src];
      if (!(index > 0)) {
        out[dst] = out[dst + 1] = out[dst + 2] = out[dst + 3] = 0;
        continue;
      }
      const t = gbuf[src + 1];
      const n = [gbuf[src + 2], gbuf[src + 3], gbuf[src + 4]];
      const { origin, dir } = simpleRay(cam, x, y, width, height);
      const nv = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2];
      const lit = (a + (1 - a) * Math.abs(nv)) * (nv > 0 ? backDim : 1);
      const base = colors[index - 1] ?? [1, 1, 1];
      const hit = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
      const depth = ((hit[0] - origin[0]) * cam.fwd[0] + (hit[1] - origin[1]) * cam.fwd[1] + (hit[2] - origin[2]) * cam.fwd[2]) / far;
      const below = field.active && field.normal[0] * hit[0] + field.normal[1] * hit[1] + field.normal[2] * hit[2] < field.height;
      out[dst] = base[0] * lit;
      out[dst + 1] = base[1] * lit;
      out[dst + 2] = base[2] * lit;
      out[dst + 3] = index + (below ? 0.5 : 0) + Math.min(Math.max(depth, 0), 0.498);
    }
  }
}
