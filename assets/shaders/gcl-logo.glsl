// Shader: GCL Logo
// Author: bcourter
// Description: The unit circle with three hyperbolic geodesics and their circle inversion.

#include "library.glsl"
#include "circline.glsl"

const float PI = 3.14159265358979;

// 3-fold: period 2π/3, canonical → -y axis (c1 at (0,-2))
vec2 FoldPoint(vec2 q) {
    float ang = atan(q.x, -q.y);
    float sec = mod(ang + PI / 3.0, 2.0 * PI / 3.0) - PI / 3.0;
    return Rotate2(sec) * vec2(0.0, -length(q));
}

// 6-fold: period π/3, canonical → +x axis (c2 at (2/√3, 0))
// Center of fold sector is at ang = π/2, so offset by π/3 before mod, shift by half-period π/6
vec2 FoldPoint6(vec2 q) {
    float ang = atan(q.x, -q.y);
    float sec = mod(ang, 2.0 * PI / 3.0) - PI / 6.0;
    return Rotate2(sec) * vec2(length(q), 0.0);
}

Implicit Geodesic(vec2 q, vec2 c1, float r, vec4 color) {
    return Circle(FoldPoint(q), c1, r, color);
}

Implicit Primary(vec2 q, vec2 c1, float r, float scale, vec4 color) {
    return Max(Negate(Geodesic(q, c1, r, color)), Circle(q, vec2(0.0), scale, color));
}

// 3-fold logo: cool geodesic arcs + warm inverted caps
Implicit Logo(vec2 q, vec2 c1, float r, float scale) {
    Mobius inv = Mobius(C_ZERO, vec2(r * r, 0.0), C_ONE, C_ZERO);
    vec2 qInv = cAdd(c1, mApply(inv, cConj(cSub(FoldPoint(q), c1))));
    return Min(Primary(q, c1, r, scale, colorCool), Primary(qInv, c1, r, scale, colorWarm));
}

// 6-fold tertiary: logo + logo remapped through inversion across c2
Implicit Tertiary(vec2 q, vec2 c1, float r, float scale, vec2 c2, float r2) {
    Mobius inv2 = Mobius(C_ZERO, vec2(r2 * r2, 0.0), C_ONE, C_ZERO);
    vec2 qInv2 = cAdd(c2, mApply(inv2, cConj(cSub(FoldPoint6(q), c2))));
    return Logo(qInv2, c1, r, scale);
    // return Min(Logo(q, c1, r, scale), Logo(qInv2, c1, r, scale));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = fragCoord - 0.5 * iResolution.xy;
    float scale = iResolution.y * 0.35;

    vec4 opColor = vec4(1.0);

    float r = sqrt(3.0) * scale;
    vec2 c1 = vec2(0.0, -2.0 * scale);

    // Secondary geodesic: spans 2π/6, endpoints (±½, √3/2) on unit circle
    // Orthogonality: (2/√3)² = 4/3 = 1/3 + 1  →  c2=(2/√3, 0), r2=1/√3  (unit coords)
    float r2 = scale / sqrt(3.0);
    vec2 c2 = vec2(2.0 * scale / sqrt(3.0), 0.0);

    Implicit logo = Logo(p, c1, r, scale);

    Implicit t1 = Tertiary(p, c1, r, scale, c2, r2);
    Implicit t2 = Tertiary(p * vec2(-1.0, 1.0), c1, r, scale, c2, r2);
    Implicit tertiary = Min(t1, t2);
    tertiary.Color = tertiary.Color.bgra;

    opColor = drawImplicitInterior(Min(logo, tertiary), opColor);
    opColor = strokeImplicit(Circle(p, vec2(0.0), scale, vec4(0.75, 0.75, 0.75, 1.0)), 3.0, opColor);

    fragColor = opColor;
}
