// Shader: Ray Casting
// Demonstrates the point-in-polygon problem for traditional boundary representations
// See blog post at: https://www.blakecourter.com/2026/02/07/geometry-as-code.html

#include "library.glsl"

vec4 bounds = vec4(30,70,160,18);

float pi = 3.1415926535;

// Radius used for X marker sizing and edge case proximity tests
float R = 15.0;

// X marker color - muted pink-red to match the PNG
vec4 xColor = vec4(0.78, 0.38, 0.38, 1.0);

// Draw an X marker using two rectangles rotated to tangent/normal of the circle
vec4 drawXMarker(vec2 p, vec2 pos, vec2 circleCenter, vec4 opColor) {
    vec2 radial = pos - circleCenter;
    float angle = atan(radial.y, radial.x) + pi * 0.25;

    // Two thin rectangles unioned into a cross
    vec2 armSize = vec2(R * 1.8, 7.0);
    Implicit arm1 = RectangleCenterRotated(p, pos, armSize, angle, xColor);
    Implicit arm2 = RectangleCenterRotated(p, pos, armSize, angle + pi * 0.5, xColor);
    Implicit cross = Min(arm1, arm2);

    opColor = drawFill(cross, opColor);
    opColor = strokeImplicit(cross, 2.0, opColor);
    return opColor;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);

    float wobble = iParam1;
    vec2 p = fragCoord - 0.5 * iResolution.xy;

    // Circle at center
    float radius = iResolution.y * 0.28;
    vec2 center = vec2(0.0);

    // Periodic (seam) point on the right side of the circle
    vec2 seamPt = center + vec2(radius, 0.0);

    // Arrow length
    float rayLen = iResolution.x * 0.55;

    // Fixed point p, above-left of circle, shifted down 20% and left for visual centering
    vec2 pointP = center + vec2(-radius * 0.55 - 0.25 * rayLen, radius * 1.2 - 0.2 * iResolution.y);

    // Check if mouse is hovering in the scene
    bool mouseActive = iMouse.x >= 0.0;
    vec2 mouseScene = iMouse.xy - 0.5 * iResolution.xy;

    vec2 arrowEnd;
    vec2 dir;
    bool endpointInside = false;

    if (mouseActive) {
        // Use mouse position as the arrow endpoint
        arrowEnd = mouseScene;
        dir = normalize(arrowEnd - pointP);
        endpointInside = length(arrowEnd - center) < radius;
    } else {
        // Compute tangent angle from p to circle to set sweep range
        vec2 toCenter = center - pointP;
        float dirToCenter = atan(toCenter.y, toCenter.x);
        float distPC = length(toCenter);
        float tangentHalf = asin(radius / distPC);
        float upperTangent = dirToCenter + tangentHalf;

        // Wobble sweeps the ray from missing (above tangent) through to seam
        vec2 toSeam = seamPt - pointP;
        float seamAngle = atan(toSeam.y, toSeam.x);
        float sweepRange = 2.0 * (upperTangent - seamAngle);

        float t = sin(iTime * 0.5);
        float angle = upperTangent - sweepRange * (0.5 + 0.5 * t * wobble);
        dir = vec2(cos(angle), sin(angle));
        arrowEnd = pointP + dir * rayLen;
    }

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
    if (endpointInside) {
        isEdgeCase = true;
    } else {
        if (hasHit1 && hasHit2) {
            if (length(hit1 - hit2) < 4.0 * R) isEdgeCase = true;
        }
        if (hasHit1 && length(hit1 - seamPt) < R) isEdgeCase = true;
        if (hasHit2 && length(hit2 - seamPt) < R) isEdgeCase = true;
    }

    vec4 greenFill = vec4(0.88, 1.0, 0.88, 1.0);
    vec4 redFill = vec4(1.0, 0.88, 0.88, 1.0);
    vec4 fillColor = isEdgeCase ? redFill : greenFill;

    // Fill circle interior
    Implicit circle = Circle(p, center, radius, colorBlack);
    float fill = 0.5 - clamp(circle.Distance / length(circle.Gradient), -0.5, 0.5);
    opColor = mix(opColor, fillColor, fill);

    // Draw the ray as an arrow from pointP
    vec4 rayColor = endpointInside ? vec4(0.8, 0.2, 0.2, 1.0) : vec4(0.3, 0.3, 0.3, 1.0);
    opColor = drawArrow(p, pointP, arrowEnd, rayColor, opColor);

    // Stroke the circle outline
    opColor = strokeImplicit(circle, 4.0, opColor);

    // X markers at ray-circle intersection points
    if (hasHit1) opColor = drawXMarker(p, hit1, center, opColor);
    if (hasHit2 && !endpointInside) opColor = drawXMarker(p, hit2, center, opColor);

    // Periodic (seam) point - same radius as pivot point
    opColor = drawPoint(p, seamPt, 6.0, opColor);

    // Draw point p
    opColor = drawPoint(p, pointP, 6.0, opColor);

    fragColor = opColor;
}
