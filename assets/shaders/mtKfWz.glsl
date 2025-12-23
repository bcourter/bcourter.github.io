// Rotational Derivative Visualization
// Original Shadertoy: https://www.shadertoy.com/view/mtKfWz
// Placeholder - Replace with actual shader code from Shadertoy

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

mat2 rot2d(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Animation parameter
    float phi = iTime * 0.5;

    // Rectangle size
    vec2 size = vec2(0.3, 0.15);

    // Rotate UV
    float angle = 0.0;
    vec2 uvRot = rot2d(angle) * uv;

    // Original field
    float field = sdBox(uvRot, size);

    // Rotational derivative (perpendicular field)
    vec2 uvPerp = rot2d(angle + 1.5708) * uv; // +90 degrees
    float fieldDeriv = sdBox(rot2d(-1.5708) * uvPerp, size);

    // Interpolate between field and its rotational derivative
    float blendedField = field * cos(phi) + fieldDeriv * sin(phi);

    // Visualize
    vec3 col;
    if (blendedField > 0.0) {
        col = vec3(0.0, 0.5 + 0.5 * tanh(blendedField * 3.0), 0.0);
    } else {
        col = vec3(0.5 - 0.5 * tanh(-blendedField * 3.0), 0.0, 0.0);
    }

    // Contours
    float contour = fract(blendedField * 8.0);
    col = mix(col, vec3(1.0), smoothstep(0.9, 1.0, contour) * 0.3);

    fragColor = vec4(col, 1.0);
}
