// Displacement for the GSL raymarch viewer.
//
// The third row of a material record carries a signed height in millimetres
// (`material.withDisplacement`). The renderer marches the displaced field,
//
//     d'(p) = d(p) - h(p)
//
// so the surface genuinely moves: silhouettes follow the relief, the ambient
// occlusion loop sees it, refraction through displaced glass bends on it, and
// the shading normal comes out as grad(d) - grad(h) from the usual central
// differences, with no separate bump term. Positive height pushes the surface
// outward.
//
// This is a render-only finish. The mesher, the client compute mesher and
// every export path keep evaluating the undisplaced sdShape, so what is
// manufactured does not change. Relief that should be manufactured is a
// geometry operation instead: `ball - 0.3 * noise.cellularEdges(1.5)`.
//
// Subtracting a height field breaks the Lipschitz bound, which the march
// already handles: it divides each step by the magnitude of the field's
// tetrahedral gradient, clamped at 1, so the step shrinks exactly where the
// height is steep. Every call site in the render path is rewritten from
// sdShape to gsl_sdDisplaced, which keeps that correction, the nearest-
// crossing comparison and the hit epsilons untouched.
//
// Cost: one material-field evaluation per field evaluation, and the march
// takes five per step (the sample plus the four gradient taps). The material
// field the compiler emits hoists every return's height expression to the top
// of its body, so a noise-driven height is paid in full on each of them. The
// fix is a codegen change, a gsl_heightField that lowers only the third row
// for the winning index.
//
// Displacement is on for every document with a material field. It used to be
// on only when the field referenced its position, which kept preset-only
// documents off this path but also dropped a constant non-zero height:
// material.withDisplacement(m, 0.5) inflated nothing. A constant record's
// lookup is a branch and a constant, so the preset documents that shortcut
// protected pay little for being included.

// The displacement scale, as a per-invocation private var rather than a
// parameter: gsl_sdDisplaced has to stand in for sdShape at call sites that
// cannot grow an argument. Follows the gsl_pw / gsl_fieldFilterIdx pattern
// already in the viewers. The render path sets it from the surface knobs at
// fragment entry; 0 marches the undisplaced field.
export const GSL_DISPLACE_STATE_WGSL = `var<private> gsl_dispScale: f32 = 1.0;`;

// displaceSampleWGSL returns the source of
//
//   fn gsl_displaceSample(p: vec3<f32>, sd: gsl_shape, time: f32, <suffix>) -> gsl_shape
//
// sd, the undisplaced sample sdShape gave at p, displaced. A march that already
// holds that sample calls this rather than gsl_sdDisplaced, so it does not
// evaluate sdShape at p twice, and the shader carries one copy of sdShape the
// fewer: the GPU compiler inlines sdShape wherever it is called, and a large
// program's compile time grows with the number of copies. The winning shape's
// own height is the one subtracted: the index comes from sdShape, chosen on
// the undisplaced field, so two returns with very different heights can show a
// seam where they meet.
//
//   materialAtIdx(pos, idx)  WGSL expression for the material record at pos
//                            for the return numbered idx
//   parts                    the program has parts (gsl-shading.js), so a
//                            part smaller on screen than the displacement
//                            rung loses its height
//
// EACH RETURN MOVES BY ITS OWN HEIGHT when the program has a displaced return:
// the codegen then emits gsl_sdShapeDisplaced (backend/wgsl/internal/codegen/
// displace.go), which subtracts every return's own height from its own
// distance before the composite — so where two returns overlap, a screw in the
// hole tapped for it, each keeps its own thread and neither opens a hole in the
// other. A single sample holds only the winner's distance, so this path
// re-evaluates the parts and uses sd only for the part scale. perReturn says
// the module has it; without it the winner's height is exact, there being one
// height or none.
//
//   perReturn                the module defines gsl_sdShapeDisplaced
//
// to fill in, like every other module here. The call to gsl_sdShapeDisplaced
// is written in full: its displacement scale sits before the suffix, where
// injectExtraArgs would not put it.
export function displaceSampleWGSL({ materialAtIdx, extraParamsWGSL, parts = false, perReturn = false }) {
  if (perReturn) {
    const partScale = parts ? " * gsl_partDetail(gsl_detail.x, sd.distance, 1e-3)" : "";
    return `
fn gsl_displaceSample(p: vec3<f32>, sd: gsl_shape, time: f32${extraParamsWGSL}) -> gsl_shape {
    if (gsl_dispScale == 0.0) { return sd; }
    return gsl_sdShapeDisplaced(p, time, gsl_dispScale${partScale}${argsFromParams(extraParamsWGSL)});
}
`;
  }
  // A part below its Relief rung has no height, so its material, which can
  // be the costliest thing a step evaluates, is not asked for.
  const partScale = parts
    ? `
    let w = gsl_dispScale * gsl_partDetail(gsl_detail.x, sd.distance, 1e-3);
    if (w == 0.0) { return sd; }`
    : `
    let w = gsl_dispScale;`;
  return `
fn gsl_displaceSample(p: vec3<f32>, sd: gsl_shape, time: f32${extraParamsWGSL}) -> gsl_shape {
    if (gsl_dispScale == 0.0) { return sd; }${partScale}
    // Index 0 is "nothing here" (a hidden shape, or no shape at all) and the
    // material field answers with the default record, whose height is 0.
    let h = (${materialAtIdx("p", "sd.shapeIndex")}).volume.z;
    return gsl_shape(sd.distance - h * w, sd.shapeIndex);
}
`;
}

// sdDisplacedWGSL returns the source of
//
//   fn gsl_sdDisplaced(p: vec3<f32>, time: f32, <suffix>) -> gsl_shape
//
// the same signature and return type as the compiled sdShape, so it can
// replace it at a call site by name alone: sdShape at p, displaced by
// gsl_displaceSample.
//
// The sdShape call is written bare, for the viewer's injectExtraArgs to fill
// in. The gsl_displaceSample call takes extraArgsWGSL here, since
// injectExtraArgs does not know that name.
export function sdDisplacedWGSL({ extraParamsWGSL, extraArgsWGSL }) {
  return `
fn gsl_sdDisplaced(p: vec3<f32>, time: f32${extraParamsWGSL}) -> gsl_shape {
    let sd = sdShape(p, time);
    return gsl_displaceSample(p, sd, time${extraArgsWGSL});
}
`;
}

// argsFromParams turns a comma-prefixed parameter list (", a: f32, b: sampler")
// into the matching argument list (", a, b"). No parameter type in the suffix
// contains a comma.
function argsFromParams(params) {
  return params
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => ", " + s.split(":")[0].trim())
    .join("");
}

// renameToDisplaced rewrites every sdShape( call in a shader string to
// gsl_sdDisplaced(. Apply it AFTER injectExtraArgs, so the arguments are
// already in place, and never to a string that defines sdShape or
// gsl_sdDisplaced itself. The section-plane and mesher shaders are
// deliberately left alone: they show the geometry as it is built.
export function renameToDisplaced(wgsl) {
  return wgsl.replace(/\bsdShape\(/g, "gsl_sdDisplaced(");
}
