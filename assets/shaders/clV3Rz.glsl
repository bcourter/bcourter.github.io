// UGF Field Notation - Plane Intersection
// Original Shadertoy: https://www.shadertoy.com/view/clV3Rz
// Placeholder - Replace with actual shader code from Shadertoy

// SDF for a plane
float sdPlane(vec2 p, vec2 n, float d) {
    return dot(p, n) - d;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Two plane normals
    vec2 n1 = normalize(vec2(1.0, 0.0));
    vec2 n2 = normalize(vec2(0.0, 1.0));

    // Plane distances
    float d1 = sdPlane(uv, n1, -0.1);
    float d2 = sdPlane(uv, n2, -0.1);

    // Distance cap (max operation)
    float field = max(d1, d2);

    // Offset controlled by parameter
    float offset = iParam2;
    field += offset;

    // Visualize the field
    vec3 col = vec3(0.0);

    // Distance field visualization
    if (field > 0.0) {
        col = vec3(0.0, 0.5 + 0.5 * tanh(field), 0.0);
    } else {
        col = vec3(0.5 - 0.5 * tanh(-field), 0.0, 0.0);
    }

    // Contour lines
    float contour = fract(field * 10.0);
    col = mix(col, vec3(1.0), smoothstep(0.45, 0.55, contour) * 0.3);

    // Highlight boundary
    if (abs(field) < 0.02) {
        col = vec3(1.0);
    }

    fragColor = vec4(col, 1.0);
}
