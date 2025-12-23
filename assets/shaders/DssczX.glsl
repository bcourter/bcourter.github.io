// Two-Body Field Shader
// Original Shadertoy: https://www.shadertoy.com/view/DssczX
// Placeholder - Replace with actual shader code from Shadertoy

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Two center points
    vec2 p1 = vec2(-0.3, 0.0);
    vec2 p2 = vec2(0.3, 0.0);

    // Distance fields to each point
    float d1 = length(uv - p1);
    float d2 = length(uv - p2);

    // Two-body field: (d1 - d2) / (d1 + d2)
    float xi = (d1 - d2) / (d1 + d2);

    // Visualization mode controlled by iParam1
    int mode = int(iParam1);
    vec3 col;

    if (mode == 0) {
        // Show two-body field
        col = vec3(0.5 + 0.5 * xi);
    } else if (mode == 1) {
        // Show clearance field (d1 + d2)
        float clearance = d1 + d2;
        col = vec3(clearance * 0.5);
    } else if (mode == 2) {
        // Show midsurface field (d1 - d2)
        float midsurface = d1 - d2;
        col = vec3(0.5 + 0.5 * tanh(midsurface * 2.0));
    } else if (mode == 3) {
        // Show contour lines
        float contour = fract(xi * 10.0);
        col = vec3(smoothstep(0.45, 0.55, contour));
    } else if (mode == 4) {
        // Colored visualization
        col = 0.5 + 0.5 * cos(6.28 * xi + vec3(0.0, 2.0, 4.0));
    } else {
        // Combined view
        float contour = smoothstep(0.9, 1.0, fract(xi * 10.0));
        col = mix(vec3(0.5 + 0.5 * xi), vec3(1.0), contour);
    }

    // Draw the two points
    if (d1 < 0.02 || d2 < 0.02) {
        col = vec3(1.0, 0.0, 0.0);
    }

    fragColor = vec4(col, 1.0);
}
