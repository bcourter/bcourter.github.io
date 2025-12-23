// Rhombus Gradient Field Visualization
// Original Shadertoy: https://www.shadertoy.com/view/dd2cWy
// Placeholder - Replace with actual shader code from Shadertoy

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Two planes/lines represented as distance fields
    vec2 p1 = vec2(-0.2, 0.0);
    vec2 p2 = vec2(0.2, 0.0);

    float d1 = length(uv - p1);
    float d2 = length(uv - p2);

    // Gradients (unit vectors pointing to each center)
    vec2 g1 = normalize(uv - p1);
    vec2 g2 = normalize(uv - p2);

    // Sum and difference gradients
    vec2 gSum = normalize(g1 + g2);
    vec2 gDiff = normalize(g1 - g2);

    // Visualize the orthogonality
    float dotProduct = dot(gSum, gDiff);

    vec3 col;
    int mode = int(iParam1);

    if (mode == 0) {
        // Show sum gradient field
        col = vec3(0.5 + 0.5 * gSum.x, 0.5 + 0.5 * gSum.y, 0.5);
    } else if (mode == 1) {
        // Show difference gradient field
        col = vec3(0.5 + 0.5 * gDiff.x, 0.5 + 0.5 * gDiff.y, 0.5);
    } else if (mode == 2) {
        // Show orthogonality (should be near zero)
        col = vec3(0.5 + 0.5 * dotProduct);
    } else {
        // Show both with contours
        float s = d1 + d2;
        float d = d1 - d2;
        float cs = fract(s * 5.0);
        float cd = fract(d * 5.0);
        col = vec3(
            smoothstep(0.9, 1.0, cs),
            smoothstep(0.9, 1.0, cd),
            0.0
        );
    }

    fragColor = vec4(col, 1.0);
}
