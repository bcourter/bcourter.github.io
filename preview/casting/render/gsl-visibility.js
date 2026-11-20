// Per-shape visibility for the GSL shaders (the raymarch viewer and the
// mesher and auto-bbox compute passes that share their sdShape).
//
// Each returned shape has a visibility flag the UI toggles. gsl_min asks
// gsl_isShapeVisible about both of its operands, and a document's sdShape is a
// chain of one gsl_min per return, inlined at every place a shader samples the
// field — the march, the normal's taps, the secondary march. So the lookup is
// paid (#returns x call sites) times over, in code the GPU compiler has to
// digest, not just in time.
//
// THE FLAGS ARE AN ARRAY, and the lookup is an index. It used to be a switch
// over one private scalar per shape, and a switch that size, inlined that
// often, is what the compiler chokes on: the 30-part Fastener Matrix took 657 s
// to compile with the switch and 1.1 s with this (Chrome, Metal).

// visArrayDeclWGSL declares the module-scope flags, all visible.
export function visArrayDeclWGSL(shapeCount) {
  const n = Math.max(shapeCount, 1);
  const ones = Array.from({ length: n }, () => "1.0").join(", ");
  return `var<private> gsl_vis: array<f32, ${n}> = array<f32, ${n}>(${ones});`;
}

// visAssignWGSL sets the flag of the shape numbered i (0-based) to value.
export function visAssignWGSL(i, value) {
  return `gsl_vis[${i}u] = ${value};`;
}

// isShapeVisibleWGSL is gsl_isShapeVisible over those flags. Index 0 is
// "nothing here" and anything past the last shape is visible.
export function isShapeVisibleWGSL(shapeCount) {
  return `
fn gsl_isShapeVisible(shapeIndex: u32) -> bool {
    if (shapeIndex == 0u || shapeIndex > ${shapeCount}u) { return true; }
    return gsl_vis[shapeIndex - 1u] > 0.5;
}
`;
}
