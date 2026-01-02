#ifndef DRAWING_GLSL
#define DRAWING_GLSL

#include "../implicits/implicit.glsl"
#include "../implicits/colorImplicit.glsl"

//======================================
// DRAWING FUNCTIONS
//======================================

// Simple SDF functions for mesh mode
float sdfGyroid(vec3 p, float scale) {
    p *= scale;
    return abs(sin(p.x)*cos(p.y) + sin(p.y)*cos(p.z) + sin(p.z)*cos(p.x)) - u_thickness;
}

float sdfSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdfBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdfTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

float sdfWaves(vec3 p, float scale) {
    p *= scale;
    return 0.5 * (
        sin(p.x) * sin(p.z) * 0.5 +
        sin(p.x * 0.4 + p.z * 0.5) * 0.7 +
        sin(length(p.xz) * 0.5) * 0.2
    );
}

// Mesh mode SDF function
float mapSdf(vec3 p) {
    // Apply time-based animation
    float timeOffset = u_time * 0.0;
    p.x += sin(timeOffset) * 0.2;
    p.y += cos(timeOffset) * 0.2;

    // Apply position offset
    p.x -= u_posX;
    p.y -= u_posY;
    p.z -= u_posZ;

    if (u_sdfType == 0) {
        return sdfGyroid(p, 5.0 * u_scale);
    } else if (u_sdfType == 1) {
        return sdfSphere(p, u_scale * 0.5);
    } else if (u_sdfType == 2) {
        return sdfBox(p, vec3(u_scale * 0.4));
    } else if (u_sdfType == 3) {
        return sdfTorus(p, vec2(0.5 * u_scale, 0.2 * u_scale));
    } else {
        return sdfWaves(p, 6.0 * u_scale);
    }
}

float mix11(float a, float b, float t) {
    return mix(a, b, t * 0.5 + 0.5);
}

float Dot(vec3 a, vec3 b) {
float _Dot_002 = a.x * b.x + a.y * b.y;
return _Dot_002 + a.z * b.z;
}

mat3 RotateZ(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, -s, 0.0),
        vec3(s, c, 0.0),
        vec3(0.0, 0.0, 1.0)
    );
}

vec3 RotateX(vec3 p, float a) {
    float sa = sin(a);
    float ca = cos(a);
    return vec3(p.x, -sa * p.y + ca * p.z, ca * p.y + sa * p.z);
}
vec3 RotateY(vec3 p, float a) {
    float sa = sin(a);
    float ca = cos(a);
    return vec3(ca * p.x + sa * p.z, p.y, -sa * p.x + ca * p.z);
}
vec3 RotateZ(vec3 p, float a) {
    float sa = sin(a);
    float ca = cos(a);
    return vec3(ca * p.x + sa * p.y, -sa * p.x + ca * p.y, p.z);
}

// Helper function to get just the SDF distance for raymarching mode
float getRaymarchDistance(vec3 p) {
    return map(p).Distance;
}

vec3 calcNormal(in vec3 pos) {
    const float eps = 0.0002;  // Smaller epsilon for more precise normals
    const vec2 h = vec2(eps, 0.0);
    
    // Use central differences for more accurate normals
    return normalize(vec3(
        map(pos + h.xyy).Distance - map(pos - h.xyy).Distance,
        map(pos + h.yxy).Distance - map(pos - h.yxy).Distance,
        map(pos + h.yyx).Distance - map(pos - h.yyx).Distance
    ));
}

float calcSoftshadow(in vec3 ro, in vec3 rd, float mint, float tmax) {
    float res = 1.0;
    float t = mint;
    float ph = 1e10; // Previous height
    
    for(int i=0; i<128; i++) {
        float h = getRaymarchDistance(ro + rd*t);
        
        // Improved shadow softness calculation
        float y = h*h/(2.0*ph);
        float d = sqrt(h*h-y*y);
        res = min(res, 10.0*d/max(0.0,t-y));
        ph = h;
        
        t += h * 0.5;  // Smaller step size for better quality
        if(res < 0.0001 || t > tmax) break;
    }
    return clamp(res, 0.0, 1.0);
}

float calcOcclusion(in vec3 pos, in vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    
    // Increased samples and adjusted parameters
    for(int i=0; i<8; i++) {
        float hr = 0.02 + 0.2*float(i)/7.0;
        vec3 aopos = nor * hr + pos;
        float dd = getRaymarchDistance(aopos);
        occ += -(dd-hr)*sca;
        sca *= 0.85;  // Slower falloff
    }
    return clamp(1.0 - occ*1.0, 0.0, 1.0);  // Reduced strength multiplier
}

vec4 DrawVectorField(vec3 p, ColorImplicit iImplicit, float iSpacing, float iLineHalfThick, vec4 iColor)
{
    vec2 spacingVec = vec2(iSpacing);
    vec2 param = mod(p.xy, spacingVec);
    vec2 center = p.xy - param + 0.5 * spacingVec;
    vec2 toCenter = p.xy - center;

    float gradParam = dot(toCenter, iImplicit.Gradient.xy) / length(iImplicit.Gradient);
    float gradLength = length(iImplicit.Gradient);

    float circleSizeFactor = max(length(iImplicit.Gradient.xy) / gradLength, 0.2);
    bool isInCircle = length(p.xy - center) < iSpacing * 0.45 * circleSizeFactor;
    bool isNearLine = abs(dot(toCenter, vec2(-iImplicit.Gradient.y, iImplicit.Gradient.x))) / gradLength < iLineHalfThick + (-gradParam + iSpacing * 0.5) * 0.125;

    if (isInCircle && isNearLine)
        return vec4(iColor.rgb * 0.5, 1.0);

    return iColor;
}

vec4 strokeImplicit(ColorImplicit a, float width, vec4 base) {
    float interp = clamp(width * 0.5 - abs(a.Distance) / length(a.Gradient), 0.0, 1.0);
    return mix(base, a.Color, a.Color.a * interp);
}

vec4 drawImplicit(ColorImplicit a, vec4 base) {
    vec4 colorWarm = vec4(1.0, 0.4, 0.2, 1.0);
    vec4 colorCool = vec4(0.2, 0.4, 1.0, 1.0);
    float falloff = 100.0;
    float bandWidth = 20.0;
    float widthThin = 2.0;
    float widthThick = 4.0;

    vec4 color = a.Distance > 0.0 ? colorWarm : colorCool;
    vec4 opColor = mix(base, color, 0.1);
    ColorImplicit wave = TriangleWaveEvenPositive(a, bandWidth);

    wave.Color.a = max(0.2, 1.0 - abs(a.Distance) / falloff);
    opColor = strokeImplicit(wave, widthThin, opColor);
    opColor = strokeImplicit(a, widthThick, opColor);

    return opColor;
}

// Helper function for turboImplicit
vec4 breeze4(float t) {
    vec3 c0 = vec3(0.0, 0.0, 0.0);
    vec3 c1 = vec3(0.0, 0.0, 1.0);
    vec3 c2 = vec3(0.0, 1.0, 1.0);
    vec3 c3 = vec3(0.0, 1.0, 0.0);
    vec3 c4 = vec3(1.0, 1.0, 0.0);
    vec3 c5 = vec3(1.0, 0.0, 0.0);

    float x = clamp(t, 0.0, 1.0);
    float x2 = x * 5.0;
    int i = int(x2);
    float f = fract(x2);

    vec3 color;
    if (i == 0) color = mix(c0, c1, f);
    else if (i == 1) color = mix(c1, c2, f);
    else if (i == 2) color = mix(c2, c3, f);
    else if (i == 3) color = mix(c3, c4, f);
    else color = mix(c4, c5, f);

    return vec4(color, 1.0);
}

vec4 turboImplicit(ColorImplicit a, float range) {
    float widthThin = 2.0;
    float halfrange = range * 0.5;
    vec4 opColor = breeze4(abs(mod(a.Distance, range) - halfrange) / halfrange);

    ColorImplicit wave = TriangleWaveEvenPositive(a, range * 0.05);
    opColor = strokeImplicit(wave, widthThin, opColor);

    return opColor;
}

vec4 colorDerivative(ColorImplicit a, vec4 base) {
    vec4 colorWarm = vec4(1.0, 0.4, 0.2, 1.0);
    vec4 colorCool = vec4(0.2, 0.4, 1.0, 1.0);
    float widthThin = 2.0;

    vec4 opColor = mix(base, mix(colorCool, colorWarm, -a.Distance), 0.1);
    ColorImplicit wave = TriangleWaveEvenPositive(a, 0.1);

    opColor = strokeImplicit(wave, widthThin, opColor);

    return opColor;
}

vec4 drawLine(ColorImplicit a, vec4 base) {
ColorImplicit line = a;
line.Color.a = 0.75;
return strokeImplicit(line, 2.0, base);
}

vec4 fillImplicit(ColorImplicit a, vec4 base) {
    float interp = 0.5 - clamp(a.Distance / length(a.Gradient), -0.5, 0.5);
    return mix(base, a.Color, a.Color.a * interp);
}

// Arrow visualization constants
float arrowRadius = 8.0;
float arrowSize = 30.0;

vec4 drawArrow(vec2 p, vec2 startPt, vec2 endPt, vec4 color, vec4 base) {
    vec2 delta = startPt - endPt;
    vec2 arrowNormal = vec2(delta.y, -delta.x);
    Implicit arrowSpine = Plane(p, endPt, arrowNormal);
    mat2 arrowSideRotation = Rotate2D(PI / 12.0);

    Implicit tip1 = Plane(p, endPt, -arrowNormal * arrowSideRotation);
    Implicit tip2 = Plane(p, endPt, arrowNormal * inverse(arrowSideRotation));
    Implicit tipMax = Max(tip1, tip2);

    vec2 spineDir = normalize(delta);
    vec2 arrowBackPt = endPt + arrowSize * spineDir;
    vec2 arrowTailPt = startPt;

    Implicit backPlane = Plane(p, arrowBackPt, delta);
    tipMax = Max(tipMax, backPlane);

    Implicit spineBound = Shell(Plane(p, 0.5 * (arrowBackPt + arrowTailPt), spineDir), length(arrowBackPt - arrowTailPt), 0.0);

    // Convert to ColorImplicit before stroking/filling
    ColorImplicit spineColor = ColorImplicit(arrowSpine.Distance, arrowSpine.Gradient, color);
    ColorImplicit tipColor = ColorImplicit(tipMax.Distance, tipMax.Gradient, color);

    if (spineBound.Distance < 0.0 && dot(spineDir, arrowBackPt - arrowTailPt) < 0.0)
        base = strokeImplicit(spineColor, 4.0, base);

    return fillImplicit(tipColor, base);
}

#endif // DRAWING_GLSL
