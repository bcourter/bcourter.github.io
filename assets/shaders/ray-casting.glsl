// Shader: Ray Casting
// Demonstrates the point-in-polygon problem for traditional boundary representations
// See blog post at: https://www.blakecourter.com/2026/02/07/geometry-as-code.html

#include "library.glsl"

vec4 bounds = vec4(30,70,160,18);

float pi = 3.1415926535;

// Radius of the periodic (seam) point marker and X markers
float R = 10.0;

// X marker colors matching the PNG
vec4 xStroke = vec4(0.78, 0.38, 0.38, 1.0);

// Draw an X marker with fill and stroke matching the PNG style
vec4 drawXMarker(vec2 p, vec2 pos, vec4 opColor) {
    // White-filled circle with red-pink outline (like drawPoint but tinted)
    Implicit bounds = Circle(p, pos, R, vec4(1.0));
    opColor = drawFill(bounds, opColor);
    bounds.Color = xStroke;
    opColor = strokeImplicit(bounds, 2.5, opColor);

    // X diagonal strokes within the circle
    vec2 d = p - pos;
    float dist = length(d);
    if (dist > R) return opColor;

    float lineWidth = 2.0;
    float d1 = abs(d.x + d.y) * 0.7071;
    float d2 = abs(d.x - d.y) * 0.7071;
    float minDist = min(d1, d2);

    float alpha = smoothstep(lineWidth, lineWidth - 1.5, minDist);
    return mix(opColor, xStroke, xStroke.a * alpha);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);

    float wobble = iParam1;
    vec2 p = fragCoord - 0.5 * iResolution.xy;

    // Circle at origin
    float radius = iResolution.y * 0.28;
    vec2 center = vec2(0.0);

    // Periodic (seam) point on the right side of the circle
    vec2 seamPt = center + vec2(radius, 0.0);

    // Fixed point p, above-left of the circle
    vec2 pointP = center + vec2(-radius * 0.55, radius * 1.2);

    // Compute tangent angle from p to circle to set sweep range
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

    // Compute intersection points
    vec2 hit1 = vec2(0.0);
    vec2 hit2 = vec2(0.0);
    bool hasHit1 = false;
    bool hasHit2 = false;

    if (disc > 0.0) {
        float sqrtDisc = sqrt(disc);
        float s1 = (-B - sqrtDisc) * 0.5;
        float s2 = (-B + sqrtDisc) * 0.5;

        if (s1 > 0.0) { hit1 = pointP + s1 * dir; hasHit1 = true; }
        if (s2 > 0.0) { hit2 = pointP + s2 * dir; hasHit2 = true; }
    }

    // Determine circle fill: light green normally, light red for edge cases
    bool isEdgeCase = false;
    if (hasHit1 && hasHit2) {
        if (length(hit1 - hit2) < 2.0 * R) isEdgeCase = true;
        if (length(hit2 - seamPt) < R) isEdgeCase = true;
    }

    vec4 greenFill = vec4(0.88, 1.0, 0.88, 1.0);
    vec4 redFill = vec4(1.0, 0.88, 0.88, 1.0);
    vec4 fillColor = isEdgeCase ? redFill : greenFill;

    // Fill circle interior
    Implicit circle = Circle(p, center, radius, colorBlack);
    float fill = 0.5 - clamp(circle.Distance / length(circle.Gradient), -0.5, 0.5);
    opColor = mix(opColor, fillColor, fill);

    // Draw the ray as an arrow, shifted 25% of its length in -x to center visually
    float rayLen = iResolution.x * 0.55;
    vec2 shift = vec2(-0.25 * rayLen, 0.0);
    vec2 arrowStart = pointP + shift;
    vec2 arrowEnd = pointP + dir * rayLen + shift;
    vec4 rayColor = vec4(0.35, 0.35, 0.35, 0.5);
    opColor = drawArrow(p, arrowStart, arrowEnd, rayColor, opColor);

    // Stroke the circle outline
    opColor = strokeImplicit(circle, 4.0, opColor);

    // X markers at ray-circle intersection points
    if (hasHit1) opColor = drawXMarker(p, hit1, opColor);
    if (hasHit2) opColor = drawXMarker(p, hit2, opColor);

    // Periodic (seam) point - same radius as pivot point
    opColor = drawPoint(p, seamPt, 6.0, opColor);

    // Draw point p
    opColor = drawPoint(p, pointP, 6.0, opColor);

    fragColor = opColor;
}
