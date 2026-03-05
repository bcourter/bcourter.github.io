// Shader: GCL Logo
// Author: bcourter
// Description: The unit circle with three hyperbolic geodesics via argument folding.

#include "library.glsl"

const float PI = 3.14159265358979;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = fragCoord - 0.5 * iResolution.xy;
    float scale = iResolution.y * 0.35;

    vec4 opColor = vec4(1.0);

    // Unit circle as a light gray boundary
    vec4 gray = vec4(0.75, 0.75, 0.75, 1.0);
    Implicit unit = Circle(p, vec2(0.0), scale, gray);
    opColor = strokeImplicit(unit, 3.0, opColor);

    // Three geodesics: orthogonal to the unit circle, each spanning 2pi/3.
    // Center (0,+2) and radius sqrt(3) in unit-circle coords, rotated by 0, ±2pi/3.
    float r = sqrt(3.0) * scale;
    vec2 c1 = vec2(0.0, -2.0 * scale);

    float angle = atan(p.x, -p.y);
    float len = length(p);
    float sector = mod(angle + PI / 3.0, 2.0 * PI / 3.0) - PI / 3.0;
    vec2 pMod = Rotate2(sector) * vec2(0.0, -len);

    Implicit geodesic = Circle(pMod, c1, r, colorCool);
    opColor = drawImplicit(geodesic, opColor);

    fragColor = opColor;
}
