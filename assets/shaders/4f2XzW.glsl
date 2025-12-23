// Rectangle SDF with Derivatives
// Original Shadertoy: https://www.shadertoy.com/view/4f2XzW
// Placeholder - Replace with actual shader code from Shadertoy

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Rectangle size (can be controlled by parameters)
    vec2 size = vec2(0.3, 0.15);

    // SDF to rectangle
    float d = sdBox(uv, size);

    // Approximate spatial gradient (for visualization)
    vec2 eps = vec2(0.001, 0.0);
    vec2 grad = vec2(
        sdBox(uv + eps.xy, size) - sdBox(uv - eps.xy, size),
        sdBox(uv + eps.yx, size) - sdBox(uv - eps.yx, size)
    ) / (2.0 * eps.x);

    // Visualize based on mode
    vec3 col;
    int mode = int(iParam1);

    if (mode == 0) {
        // Show distance field
        col = vec3(0.5 + 0.5 * tanh(d * 5.0));
    } else if (mode == 1) {
        // Show gradient X component
        col = vec3(0.5 + 0.5 * grad.x);
    } else if (mode == 2) {
        // Show gradient Y component
        col = vec3(0.5 + 0.5 * grad.y);
    } else {
        // Show gradient magnitude
        col = vec3(length(grad));
    }

    // Highlight boundary
    if (abs(d) < 0.01) {
        col = vec3(1.0, 0.0, 0.0);
    }

    fragColor = vec4(col, 1.0);
}
