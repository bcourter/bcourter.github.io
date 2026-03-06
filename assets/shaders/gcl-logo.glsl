// Shader: GCL Logo
// Author: bcourter
// Description: The unit circle with three hyperbolic geodesics and their circle inversion.

#include "library.glsl"
#include "circline.glsl"

const float PI = 3.14159265358979;
const int ITER = 111;

// 3-fold: period 2π/3, canonical → -y axis (c1 at (0,-2))
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

// 3-fold logo: cool geodesic arcs + warm inverted caps
Implicit Logo(vec2 q, vec2 c1, float r, float scale) {
    Mobius inv = Mobius(C_ZERO, vec2(r * r, 0.0), C_ONE, C_ZERO);
    vec2 qInv = cAdd(c1, mApply(inv, cConj(cSub(FoldPoint(q), c1))));
    return Min(Primary(q, c1, r, scale, colorCool), Primary(qInv, c1, r, scale, colorWarm));
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

// Inversion of Logo through geodesic fixing i=(0,1) that swaps e^{-iπ/6} ↔ e^{iπ/6}:
//   center (√3/2, 1)·scale, radius (√3/2)·scale
vec4 Revolving(vec2 q, vec2 c1, float r, float scale, float t) {
    t = clamp(t, 0.0, 1.0);
    t = 1.0 - (t - 1.0) * (t - 1.0); // ease out

    q = mApply(mLimitRotation(t * 2.0 / sqrt(3.0)), q / scale) * scale;

    Implicit logo1 = Logo(q, c1, r, scale);

    // Geodesic fixing i=(0,1) that swaps e^{-iπ/6} ↔ e^{iπ/6}: center (√3/2, 1)·scale, radius √3/2·scale
    float r2 = sqrt(3.0) / 2.0 * scale;
    vec2 c2 = vec2(r2, scale);
    Mobius inv2 = Mobius(C_ZERO, vec2(r2 * r2, 0.0), C_ONE, C_ZERO);
    vec2 qInv = cAdd(c2, mApply(inv2, cConj(cSub(q, c2))));
    Implicit logo2 = Logo(qInv, c1, r, scale);

    // float r3 = scale / sqrt(3.0);
    // vec2 c3 = vec2(r3, scale);
    // Mobius inv3 = Mobius(C_ZERO, vec2(r3 * r3, 0.0), C_ONE, C_ZERO);
    // vec2 qInv3 = cAdd(c3, mApply(inv3, cConj(cSub(q, c3))));

    // if(t > 0.5) {
    //     logo1 = Logo(qInv3, c1, r, scale);
    //     logo1.Color = logo1.Color.bgra;
    // }

    // logo2.Color = logo2.Color.bgra;

    vec4 color1 = drawImplicitInterior(logo1, colorWhite);
    vec4 color2 = drawImplicitInterior(logo2, colorWhite);

    const float slope = 1.0;
    color1 = mix(colorWhite, color1, clamp((1.0 - t) * slope, 0.0, 1.0));
    color2 = mix(colorWhite, color2, clamp(t * slope, 0.0, 1.0));
    return color1.r + color1.b < color2.r + color2.b ? color1 : color2;
}

// Reflection group iteration: repeatedly rotate into the primary sector (-5π/6, -π/6)
// then invert through c1 until the point lands inside the primary triangle.
vec4 IteratedLogo(vec2 q, vec2 c1, float r, float scale) {
    Mobius inv1 = Mobius(C_ZERO, vec2(r * r, 0.0), C_ONE, C_ZERO);

    for(int i = 0; i < ITER; i++) {
        // Rotate into primary sector (-5π/6, -π/6): centered at -π/2, period 2π/3
        float ang = atan(q.y, q.x);
        float newAng = mod(ang + 5.0 * PI / 6.0, 2.0 * PI / 3.0) - 5.0 * PI / 6.0;
        q = length(q) * vec2(cos(newAng), sin(newAng));

        // If inside primary triangle (inside unit disk, outside geodesic), render Logo
        if(length(q) < scale && length(q - c1) > r) {
            return drawImplicitInterior(Primary(q, c1, r, scale, i % 2 == 0 ? colorCool : colorWarm), colorWhite);
        }

        // Invert through c1
        q = cAdd(c1, mApply(inv1, cConj(cSub(q, c1))));
    }

    return drawImplicitInterior(Primary(q, c1, r, scale, colorBlack), colorWhite);
}

// iParam1: display mode (0 = Full Disc, 1 = Revolving)
// iParam2: limit rotation parameter t
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = fragCoord - 0.5 * iResolution.xy;
    float scale = iResolution.y * 0.5;

    float r = sqrt(3.0) * scale;
    vec2 c1 = vec2(0.0, -2.0 * scale);

    float t = mod(iTime * 0.8, 4.0);

    // Pretransform by the limit rotation (parabolic Möbius fixing (0,1))
    p = mApply(mLimitRotation(iParam2), p / scale) * scale;

    vec4 opColor = colorWhite;
    if(iParam1 < 0.5) {
        opColor = IteratedLogo(p, c1, r, scale);
    } else {
        opColor = Revolving(p, c1, r, scale, t);
    }
    opColor = strokeImplicit(Circle(p, vec2(0.0), scale, vec4(0.75, 0.75, 0.75, 1.0)), 3.0, opColor);

    fragColor = opColor;
}
