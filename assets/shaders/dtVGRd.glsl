// Boolean Operations Comparison
// Original Shadertoy: https://www.shadertoy.com/view/dtVGRd
// Placeholder - Replace with actual shader code from Shadertoy

float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Two circles
    float d1 = sdCircle(uv - vec2(-0.15, 0.0), 0.2);
    float d2 = sdCircle(uv - vec2(0.15, 0.0), 0.2);

    // Different boolean operations
    float field;
    int mode = int(iParam1);

    if (mode == 0) {
        // Min/Max union
        field = min(d1, d2);
    } else if (mode == 1) {
        // Distance-preserving union
        field = min(d1, d2);
    } else if (mode == 2) {
        // Euclidean blend
        float k = 0.1;
        field = max(min(d1, d2), 0.0) - length(vec2(min(d1, 0.0), min(d2, 0.0)));
    } else if (mode == 3) {
        // Smooth min (polynomial)
        float k = 0.1;
        float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
        field = mix(d2, d1, h) - k * h * (1.0 - h);
    } else {
        // Intersection
        field = max(d1, d2);
    }

    // Visualize
    vec3 col = vec3(0.0);
    if (field > 0.0) {
        col = vec3(0.5 + 0.5 * tanh(field * 5.0));
    } else {
        col = vec3(0.2, 0.4, 0.8);
    }

    // Contours
    float contour = fract(abs(field) * 10.0);
    col = mix(col, vec3(1.0), smoothstep(0.9, 1.0, contour) * 0.5);

    fragColor = vec4(col, 1.0);
}
