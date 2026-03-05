// Shader: GCL Logo
// Author: bcourter
// Description: The unit circle with three hyperbolic geodesics and their circle inversion.

#include "library.glsl"
#include "circline.glsl"

const float PI = 3.14159265358979;

// Collapse the plane into a single canonical sector via 3-fold angle folding
vec2 FoldPoint(vec2 q) {
    float ang = atan(q.x, -q.y);
    float sec = mod(ang + PI / 3.0, 2.0 * PI / 3.0) - PI / 3.0;
    return Rotate2(sec) * vec2(0.0, -length(q));
}

Implicit Geodesic(vec2 q, vec2 c1, float r, vec4 color) {
    return Circle(FoldPoint(q), c1, r, color);
}

Implicit Primary(vec2 q, vec2 c1, float r, float scale, vec4 color) {
    return Max(Negate(Geodesic(q, c1, r, color)), Circle(q, vec2(0.0), scale, color));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = fragCoord - 0.5 * iResolution.xy;
    float scale = iResolution.y * 0.35;

    vec4 opColor = vec4(1.0);

    float r = sqrt(3.0) * scale;
    vec2 c1 = vec2(0.0, -2.0 * scale);

    // Circle inversion: I(p) = c1 + r²/conj(p−c1)  [Möbius M(ξ)=r²/ξ on ξ=conj(p−c1)]
    Mobius circleInv = Mobius(C_ZERO, vec2(r * r, 0.0), C_ONE, C_ZERO);
    vec2 pInv = cAdd(c1, mApply(circleInv, cConj(cSub(FoldPoint(p), c1))));

    opColor = drawImplicitInterior(Primary(p, c1, r, scale, colorCool), opColor);
    opColor = drawImplicitInterior(Primary(pInv, c1, r, scale, colorWarm), opColor);
    opColor = strokeImplicit(Circle(p, vec2(0.0), scale, vec4(0.75, 0.75, 0.75, 1.0)), 3.0, opColor);

    fragColor = opColor;
}
