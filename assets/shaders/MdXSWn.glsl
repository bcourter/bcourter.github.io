// Fractal Tufted Furniture (by EvilRyu)
// Original Shadertoy: https://www.shadertoy.com/view/MdXSWn
// Placeholder - Replace with actual shader code from Shadertoy

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord / iResolution.xy;
    vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

    // Simple fractal pattern as placeholder
    float d = 1e10;

    for (int i = 0; i < 5; i++) {
        p = abs(p) - 0.3;
        p = p.yx;
        d = min(d, length(p) - 0.1);
    }

    // Color based on distance
    vec3 col = vec3(0.0);
    col = mix(vec3(0.8, 0.6, 0.4), vec3(0.2, 0.1, 0.05), smoothstep(0.0, 0.05, d));
    col = mix(col, vec3(0.9, 0.8, 0.7), smoothstep(0.05, 0.06, d));

    // Add some shading
    col *= 1.0 - 0.3 * smoothstep(0.0, 0.2, d);

    fragColor = vec4(col, 1.0);
}
