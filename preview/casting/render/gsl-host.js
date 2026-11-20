// WGSL the host declares around a compiled GSL program.
//
// The generated sdShape, gsl_colorField and gsl_materialField reference
// gsl_shape and gsl_min without declaring them: the viewer supplies both, and
// so does the GPU field-parity test in internal/fidget/internal/gpuparity,
// which reads this file and extracts the two strings below by name. Keep them
// plain template literals with no ${} interpolation, so that extraction stays
// exact.
//
// gsl_min also needs the host to declare
//
//   var<private> gsl_fieldFilterIdx: u32
//   fn gsl_isShapeVisible(shapeIndex: u32) -> bool
//
// which the viewers build per program (the visibility switch depends on the
// shape count).

export const GSL_SHAPE_STRUCT_WGSL = `
struct gsl_shape {
    distance: f32,    // the distance from the shape
    shapeIndex: u32,  // the index of the shape or zero if none
}
`;

export const GSL_MIN_WGSL = `
fn gsl_min( a : gsl_shape, b : gsl_shape ) -> gsl_shape {
    if (gsl_fieldFilterIdx != 0u) {
        if (b.shapeIndex == gsl_fieldFilterIdx) { return b; }
        return a;
    }
    var ra = a;
    var rb = b;
    if (a.shapeIndex > 0u && !gsl_isShapeVisible(a.shapeIndex)) { ra = gsl_shape(1e9, 0u); }
    if (b.shapeIndex > 0u && !gsl_isShapeVisible(b.shapeIndex)) { rb = gsl_shape(1e9, 0u); }
    // Nearest crossing, not nearest signed distance: compare |d| so every
    // returned shape keeps its own zero set instead of being folded into one
    // solid. The first crossing along a ray is the union boundary whenever the
    // camera is outside every solid, so closed geometry is unaffected; open
    // surfaces stop trimming each other (a half-space field like p.x claims
    // half of all space as its "interior", which min() would swallow). Only
    // the comparison uses |d| -- the winner's signed distance passes through
    // untouched, so normals, AO and the backface march still see a sign.
    if (abs(ra.distance) < abs(rb.distance)) { return ra; } else { return rb; }
}
`;
