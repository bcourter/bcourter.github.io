#ifndef FRAGMENT_GLSL
#define FRAGMENT_GLSL

#include "./drawing/drawing.glsl"

void main() {
    if (u_mode == 0) { // Raymarching Mode
        vec2 resolution = u_resolution;
        // Normalize coordinates to [-1, 1] range, maintaining aspect ratio
        vec2 p = (2.0 * gl_FragCoord.xy - resolution.xy) / min(resolution.x, resolution.y);
        
        // Camera controls with mouse rotation
        float camDist = 2.0;  // Increased distance for better view
        float camFOV = 1.5;
        
        // Convert mouse coordinates to spherical coordinates
        float theta = u_mouse_X;  // Horizontal rotation around Y axis
        float phi = u_mouse_Y;    // Vertical rotation
        phi = clamp(phi, -1.57, 1.57);  // Clamp to [-π/2, π/2] to prevent flipping
        
        // Camera position using spherical coordinates
        // We swap Y and Z to get a side view by default
        vec3 ro = vec3(
            camDist * cos(phi) * sin(theta),  // x = r * cos(φ) * sin(θ)
            camDist * cos(phi) * cos(theta),  // y = r * cos(φ) * cos(θ)
            camDist * sin(phi)                // z = r * sin(φ)
        );
        vec3 ta = vec3(0.0, 0.0, 0.0);  // Look at origin
        
        // Camera matrix - using world up vector (0,0,1) for side view
        vec3 ww = normalize(ta - ro);
        vec3 uu = normalize(cross(ww, vec3(0.0, 0.0, 1.0)));
        vec3 vv = normalize(cross(uu, ww));

        // Create view ray with controlled FOV
        vec3 rd = normalize(p.x*uu + p.y*vv + camFOV*ww);

        // Raymarch with increased precision
        const float tmax = 8.0;
        float t = 0.0;
        float precis = 0.0001;  // Increased precision threshold
        
        Implicit hit;
        for(int i=0; i<256; i++) {
            vec3 pos = ro + t*rd;
            hit = map(pos);
            if(hit.Distance < precis || t > tmax) break;
            t += hit.Distance * 0.35;  // Smaller step size for more accuracy
        }

        // Background color matching Gruvbox dark (#282828 = 40/255 = 0.156862745)
        vec3 col = vec3(0.156862745);
        
        // Only render surface if we hit something within max distance
        // and the hit is precise enough
        if(t < tmax && hit.Distance < precis) {
            vec3 pos = ro + t*rd;
            vec3 nor = calcNormal(pos);
            
            // World-space light direction (fixed behind and above)
            vec3 lig = normalize(vec3(-1.0, -0.5, 2.0));
            
            // Ambient term with warm vanilla tint
            vec3 ambColor = vec3(0.98, 0.95, 0.87);
            float ambStr = 0.25;
            vec3 amb = ambColor * ambStr;
            
            // Diffuse term
            float dif = clamp(dot(nor, lig), 0.0, 1.0);
            
            // Occlusion with warm tint
            vec3 occColor = vec3(0.95, 0.85, 0.7);  // Warm cream
            float occ = calcOcclusion(pos, nor);
            
            // Soft shadows
            float shadow = 1.0;
            if(dif > 0.001) {
                shadow = calcSoftshadow(pos, lig, 0.002, 2.0);
                dif *= shadow;
            }
            
            // Specular term with creamy highlights
            vec3 hal = normalize(lig - rd);
            float spe = pow(clamp(dot(nor, hal), 0.0, 1.0), 64.0);  // Sharp for sugar-like sparkle
            
            // Material properties
            vec3 albedo = vec3(0.95, 0.92, 0.85);     // Vanilla cream
            vec3 specColor = vec3(1.0, 0.98, 0.95);   // Warm white specular
            
            // Combine terms
            col = albedo * (amb + dif * mix(occColor, vec3(1.0), occ))
                + specColor * spe * dif * shadow;
        }

        gl_FragColor = vec4(col, 1.0);
    } else { // Mesh Mode
        vec3 viewDir = normalize(-vPosition);
        vec3 normal = normalize(vNormal);
        float rim = 0.0;

        if (u_effectType == 0) { // Bump
            float eps = 0.01;
            vec3 p = vWorldPosition;

            float center = mapSdf(p);
            float dx = mapSdf(p + vec3(eps, 0, 0)) - center;
            float dy = mapSdf(p + vec3(0, eps, 0)) - center;
            float dz = mapSdf(p + vec3(0, 0, eps)) - center;

            vec3 sdfNormal = normalize(vec3(dx, dy, dz));
            center = tanh(center * u_contrast);
            normal = normalize(normal + sdfNormal * u_effectStrength * center);
        } else { // Displacement
            float eps = 0.001;
            vec3 p = vWorldPosition;

            float center = mapSdf(p);
            float dx = mapSdf(p + vec3(eps, 0, 0)) - center;
            float dy = mapSdf(p + vec3(0, eps, 0)) - center;
            float dz = mapSdf(p + vec3(0, 0, eps)) - center;

            normal = normalize(vec3(dx, dy, dz));
            rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
        }

        // Lighting
        vec3 lightDir1 = normalize(vec3(2.0, 2.0, 2.0));
        vec3 lightDir2 = normalize(vec3(-2.0, 1.0, 1.0));
        vec3 lightDir3 = normalize(vec3(1.0, 0.0, 5.0));

        float diff1 = max(dot(normal, lightDir1), 0.0);
        float diff2 = max(dot(normal, lightDir2), 0.0);
        float diff3 = max(dot(normal, lightDir3), 0.0);

        vec3 ambient = vec3(0.3);
        vec3 diffuse = u_color * (diff1 * 1.0 + diff2 * 0.7 + diff3 * 0.8);

        if (u_effectType == 1) {
            diffuse += u_color * rim * 0.7;
        }

        vec3 reflectDir1 = reflect(-lightDir1, normal);
        float spec1 = pow(max(dot(viewDir, reflectDir1), 0.0), 32.0);
        vec3 specular = vec3(0.5) * spec1;

        vec3 color = ambient + diffuse + specular;
        gl_FragColor = vec4(color, 1.0);
    }
}

#endif // FRAGMENT_GLSL