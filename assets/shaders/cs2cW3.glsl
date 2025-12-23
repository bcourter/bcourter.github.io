// Apollonian Circles / Conic Sections
// Original Shadertoy: https://www.shadertoy.com/view/cs2cW3
// Placeholder - Replace with actual shader code from Shadertoy

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Two focal points for Apollonian circles
    vec2 f1 = vec2(-0.25, 0.0);
    vec2 f2 = vec2(0.25, 0.0);

    float d1 = length(uv - f1);
    float d2 = length(uv - f2);

    // Apollonian parameter
    float xi = (d1 - d2) / (d1 + d2);

    // Draw contour lines for different values of xi
    vec3 col = vec3(0.1);

    // Multiple contour levels
    for (float level = -0.9; level < 0.95; level += 0.2) {
        float dist = abs(xi - level);
        float line = smoothstep(0.02, 0.0, dist);

        // Color based on level
        vec3 lineCol = 0.5 + 0.5 * cos(6.28 * level + vec3(0.0, 2.0, 4.0));
        col = mix(col, lineCol, line);
    }

    // Highlight the zero level (parabola case)
    float parabolaDist = abs(xi);
    if (parabolaDist < 0.02) {
        col = vec3(1.0, 1.0, 0.0);
    }

    // Mark focal points
    if (d1 < 0.02 || d2 < 0.02) {
        col = vec3(1.0, 0.0, 0.0);
    }

    fragColor = vec4(col, 1.0);
}
