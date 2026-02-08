// Shader: Ray Casting
// Demonstrates the point-in-polygon problem for traditional boundary representations
// See blog post at: https://www.blakecourter.com/2026/02/07/geometry-as-code.html

#include "library.glsl"

vec4 bounds = vec4(30,70,160,18);

float pi = 3.1415926535;

// Draw an X marker at a position
vec4 drawXMarker(vec2 p, vec2 pos, float size, vec4 color, vec4 opColor) {
    vec2 d = p - pos;
    float dist = length(d);
    if (dist > size) return opColor;

    float lineWidth = 2.0;
    float d1 = abs(d.x + d.y) * 0.7071;
    float d2 = abs(d.x - d.y) * 0.7071;
    float minDist = min(d1, d2);

    float alpha = smoothstep(lineWidth, lineWidth - 1.5, minDist) * smoothstep(size, size - 1.5, dist);
    return mix(opColor, color, color.a * alpha);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);

    float wobble = iParam1;

    vec2 p = fragCoord - 0.5 * iResolution.xy;

    // Circle at origin
    float radius = iResolution.y * 0.28;
    vec2 center = vec2(0.0);

    // Fixed point p, above-left of the circle
    vec2 pointP = center + vec2(-radius * 0.55, radius * 1.2);

    // Compute the tangent angle from p to the circle to set sweep range
    vec2 toCenter = center - pointP;
    float dirToCenter = atan(toCenter.y, toCenter.x);
    float distPC = length(toCenter);
    float tangentHalf = asin(radius / distPC);
    float upperTangent = dirToCenter + tangentHalf;

    // Wobble sweeps the ray around the tangent: from missing to through
    float t = sin(iTime * 0.5);
    float angle = upperTangent - 0.35 * t * wobble;
    vec2 dir = vec2(cos(angle), sin(angle));

    // Ray-circle intersection: |pointP + s*dir - center|^2 = radius^2
    vec2 oc = pointP - center;
    float B = 2.0 * dot(oc, dir);
    float C = dot(oc, oc) - radius * radius;
    float disc = B * B - 4.0 * C;

    // Draw the ray as an arrow
    float rayLen = iResolution.x * 0.55;
    vec2 arrowEnd = pointP + dir * rayLen;
    vec4 rayColor = vec4(0.35, 0.35, 0.35, 0.5);
    opColor = drawArrow(p, pointP, arrowEnd, rayColor, opColor);

    // Draw the circle
    Implicit circle = Circle(p, center, radius, colorBlack);
    opColor = strokeImplicit(circle, 4.0, opColor);

    // Draw X markers at ray-circle intersection points
    vec4 xColor = vec4(0.85, 0.25, 0.25, 1.0);
    if (disc > 0.0) {
        float sqrtDisc = sqrt(disc);
        float s1 = (-B - sqrtDisc) * 0.5;
        float s2 = (-B + sqrtDisc) * 0.5;

        if (s1 > 0.0) {
            vec2 hit = pointP + s1 * dir;
            opColor = drawXMarker(p, hit, 10.0, xColor, opColor);
        }
        if (s2 > 0.0) {
            vec2 hit = pointP + s2 * dir;
            opColor = drawXMarker(p, hit, 10.0, xColor, opColor);
        }
    }

    // Seam point on the right side of the circle
    vec2 seamPt = center + vec2(radius, 0.0);
    opColor = drawPoint(p, seamPt, 5.0, opColor);

    // Draw point p
    opColor = drawPoint(p, pointP, 6.0, opColor);

    fragColor = opColor;
}
