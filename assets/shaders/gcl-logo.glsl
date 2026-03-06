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

// 6-fold tertiary: logo remapped through inversion across c2
Implicit Tertiary(vec2 q, vec2 c1, float r, float scale, vec2 c2, float r2) {
    Mobius inv2 = Mobius(C_ZERO, vec2(r2 * r2, 0.0), C_ONE, C_ZERO);
    vec2 qInv2 = cAdd(c2, mApply(inv2, cConj(cSub(FoldPoint6(q), c2))));
    return Logo(qInv2, c1, r, scale);
}

// Full pattern: logo + tertiary (both halves, with swapped color for reflected half)
Implicit TertiaryCombined(vec2 q, vec2 c1, float r, float scale, vec2 c2, float r2) {
    Implicit t1 = Tertiary(q, c1, r, scale, c2, r2);
    Implicit t2 = Tertiary(q * vec2(-1.0, 1.0), c1, r, scale, c2, r2);
    Implicit tertiary = Min(t1, t2);
    tertiary.Color = tertiary.Color.bgra;
    return Min(Logo(q, c1, r, scale), tertiary);
}

// Invert circle (cj, rj) through reference circle (cinv, rinv), returning the image as a Circline
Circline circleInvertedThrough(vec2 cj, float rj, vec2 cinv, float rinv) {
    vec2 d = cj - cinv;
    float k = (rinv * rinv) / (dot(d, d) - rj * rj);
    return clCircle(cinv + k * d, abs(k * rj));
}

// 3-fold fold into canonical wedge [-π/2, π/6] (center -π/6, period 2π/3)
// Mirror axis (√3,-1) is at -π/6 — exactly the sector bisector.
vec2 Fold3(vec2 q) {
    float ang = atan(q.y, q.x);
    float sec = mod(ang + PI / 2.0, 2.0 * PI / 3.0) - PI / 3.0;
    return length(q) * vec2(cos(sec - PI / 6.0), sin(sec - PI / 6.0));
}

// Reflect across line with direction (√3,-1) — the canonical sector bisector
vec2 MirrorLine(vec2 q) {
    return vec2(0.5 * q.x - sqrt(3.0) * 0.5 * q.y, -sqrt(3.0) * 0.5 * q.x - 0.5 * q.y);
}

// TertiaryCombined remapped through the 5 daughter circle inversions of c2
Implicit Quaternary(vec2 q, vec2 c1, float r, float scale, vec2 c2, float r2) {
    Circline daughters[5];
    for(int k = 1; k <= 5; k++) {
        vec2 ck = Rotate2(float(k) * PI / 3.0) * c2;
        daughters[k - 1] = circleInvertedThrough(ck, r2, c2, r2);
    }
    Implicit result = CreateImplicit();
    for(int k = 0; k < 5; k++) {
        vec2 dk = clCenter(daughters[k]);
        float rk = clRadius(daughters[k]);
        Mobius invD = Mobius(C_ZERO, vec2(rk * rk, 0.0), C_ONE, C_ZERO);
        vec2 qInvD = cAdd(dk, mApply(invD, cConj(cSub(q, dk))));
        result = Min(result, TertiaryCombined(qInvD, c1, r, scale, c2, r2));
    }
    result.Color = result.Color.bgra;
    return result;
}

// Full pattern at q: TertiaryCombined + Quaternary mirrored across the sector bisector
Implicit Quinary(vec2 q, vec2 c1, float r, float scale, vec2 c2, float r2) {
    Implicit tertiary = TertiaryCombined(q, c1, r, scale, c2, r2);
    Implicit q1 = Quaternary(q, c1, r, scale, c2, r2);
    Implicit q2 = Quaternary(MirrorLine(q), c1, r, scale, c2, r2);
    return Min(tertiary, Min(q1, q2));
}

// Parabolic (limit rotation) Möbius fixing ideal point i = (0,1) with parameter t.
// Derived by conjugating z→z+t through T(z)=1/(z−i):
//   M(z) = ((1+it)z + t) / (tz + (1−it)),   det = 1,  tr = 2  (parabolic ✓)
Mobius mLimitRotation(float t) {
    return Mobius(vec2(1.0, t),   // a = 1 + it
    vec2(t, 0.0),   // b = t
    vec2(t, 0.0),   // c = t
    vec2(1.0, -t));  // d = 1 - it
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = fragCoord - 0.5 * iResolution.xy;
    float scale = iResolution.y * 0.5;

    vec4 opColor = vec4(1.0);

    float r = sqrt(3.0) * scale;
    vec2 c1 = vec2(0.0, -2.0 * scale);

    // Secondary geodesic: spans 2π/6, endpoints (±½, √3/2) on unit circle
    // Orthogonality: (2/√3)² = 4/3 = 1/3 + 1  →  c2=(2/√3, 0), r2=1/√3  (unit coords)
    float r2 = scale / sqrt(3.0);
    vec2 c2 = vec2(2.0 * scale / sqrt(3.0), 0.0);

    // Pretransform p by the limit rotation (parabolic Möbius fixing (0,1))
    // Normalize to unit disk, apply Möbius, scale back
    vec2 pUnit = mApply(mLimitRotation(iParam1), p / scale);
    p = pUnit * scale;

    // 3-fold fold into canonical wedge [-π/2, π/6]; evaluate full pattern at folded point
    vec2 pF = Fold3(p);

    opColor = drawImplicitInterior(Quinary(pF, c1, r, scale, c2, r2), opColor);
    opColor = strokeImplicit(Circle(p, vec2(0.0), scale, vec4(0.75, 0.75, 0.75, 1.0)), 3.0, opColor);

    fragColor = opColor;
}
