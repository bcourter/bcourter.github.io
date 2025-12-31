// Shader: UGF and Traditional Blends
// Author: bcourter
// Description: A comparison of blending techniques. Full post here: https://www.blakecourter.com/2023/05/18/field-notation.html

#include "library.glsl"

// ===== Common Code =====

// ===== Image Code =====
// UGF intersection demo
// Post 1: https://www.blakecourter.com/2023/05/18/field-notation.html

// Sliders thanks to https://www.shadertoy.com/view/XlG3WD

float pi = 3.1415926535;



vec2 center = vec2(0.0);
float offset = 0.0;
vec2 direction = vec2(1.0, 1.0);
int blend = 0;
vec2 mouse = vec2(-180.0, 150.0);
vec4 bounds = vec4(0.0, 0.0, 0.0, 0.0);

// Sliders



vec4 strokeImplicit(Implicit a, float width, vec4 base) {
    vec4 color = vec4(a.Color.rgb * 0.25, a.Color.a);
    float interp = clamp(width * 0.5 - abs(a.Distance / length(a.Gradient)), 0.0, 1.0);
    return mix(base, color, color.a * interp);
    
    return base;
}

vec4 drawImplicit(Implicit a, vec4 base) {
    float bandWidth = 20.0;
    float falloff = 150.0;
    float widthThin = 2.0;
    float widthThick = 4.0;

    vec4 opColor = mix(base, a.Color, (a.Distance < 0.0 ? a.Color.a * 0.1 : 0.0));
    Implicit wave = TriangleWaveEvenPositive(a, bandWidth, a.Color);    

    wave.Color.a = 0.5 * max(0.2, 1.0 - abs(a.Distance) / falloff);
    opColor = strokeImplicit(wave, widthThin, opColor);
    opColor = strokeImplicit(a, widthThick, opColor);
    
    return opColor;
}

vec4 drawLine(Implicit a, vec4 opColor) {
    a.Color.a = 0.75;
    return strokeImplicit(a, 2.0, opColor);
}

vec4 drawFill(Implicit a, vec4 opColor) {
    if (a.Distance <= 0.0)
        return mix(opColor, a.Color, a.Color.a);

    return opColor;
}
    
Implicit shape(vec2 p){
    Implicit a = Plane(p, center, vec2(0.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0));
    Implicit b = Plane(p, center, direction, vec4(0.0, 0.0, 1.0, 1.0));   
    Implicit minmax = Max(a, b);
    
    // Mercury Blend
    if (blend == 1)
        return Add(IntersectionEuclidean(a, b, 0.0), offset);        
        
    // IQ Blend
    if (blend == 2)
        return Add(IntersectionSmooth(a, b, 0.), offset);
        
    // Rvachev Blend
    if (blend == 3)
        return Add(IntersectionRvachev(a, b, 0.0), offset);   
    
    // Exponential Blend
    if (blend == 4)
        return Add(IntersectionSmoothExp(a, b, 10.), offset);   
 //       return Add(IntersectionSmoothExp(a, b, length(vec2(a.Distance, b.Distance))), offset);   
    
    Implicit aNorm = Plane(p, center, vec2(a.Gradient.y, -a.Gradient.x), a.Color);
    Implicit bNorm = Plane(p, center, vec2(-b.Gradient.y, b.Gradient.x), b.Color);
    Implicit normalCone = Min(aNorm, bNorm);

    // DF-based intersection
    if (blend == 0 && normalCone.Distance > 0.0)
        minmax = Circle(p, center, 0.0, 0.5 * (a.Color + b.Color));
        
    // Default is max 
    return Implicit(minmax.Distance + offset, minmax.Gradient, minmax.Color);
}

vec4 drawArrow(vec2 p, vec2 mouse, vec4 opColor) {
    float arrowRadius = 8.0;
    float arrowSize = 30.0;
    
    vec4 annotationColor = vec4(vec3(0.0), 1.0);
    Implicit cursor = Circle(p, mouse, arrowRadius, annotationColor);
    opColor = strokeImplicit(cursor, 3.0, opColor);
    
    Implicit opMouse = shape(mouse);
    vec2 delta = (opMouse.Distance * opMouse.Gradient).xy;
    vec2 boundPt = mouse - delta;
    
    vec2 arrowNormal = vec2(delta.y, -delta.x);
    Implicit arrowSpine = Plane(p, boundPt, arrowNormal, annotationColor);
    mat2 arrowSideRotation = Rotate2(pi / 12.0);
    Implicit arrowTip = Max(
        Plane(p, boundPt, -arrowNormal * arrowSideRotation, annotationColor),
        Plane(p, boundPt, arrowNormal * inverse(arrowSideRotation), annotationColor)
    );
    
    vec2 spineDir = normalize(delta);
    vec2 arrowBackPt = boundPt + arrowSize * spineDir;
    vec2 arrowTailPt = mouse - arrowRadius * spineDir;
    arrowTip = Max(arrowTip, Max(Negate(cursor), Plane(p, arrowBackPt, delta, annotationColor)));
    
    Implicit bound = Shell(Plane(p, 0.5 * (arrowBackPt + arrowTailPt), spineDir, annotationColor), length(arrowBackPt - arrowTailPt), 0.0);
    if (bound.Distance < 0.0 && dot(spineDir, arrowBackPt - arrowTailPt) < 0.)
        opColor = strokeImplicit(arrowSpine, 4.0, opColor);
    
    return drawFill(arrowTip, opColor);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);

    offset = -iParam1 * 400.0 + 200.0;
    float angle = (-0.5 + iParam3) * pi;
    direction = vec2(cos(angle), sin(angle));
    blend = int(iParam2);

    vec2 p = (fragCoord - 0.5 * iResolution.xy);

    if (iMouse.x > bounds.x + bounds.z + 20.0 || iMouse.y > bounds.y + bounds.w + 20.0)
        mouse = iMouse.xy - 0.5 * iResolution.xy;

    vec3 p3 = vec3(p, 0.0);

    Implicit a = Plane(p, center, vec2(0.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0));
    Implicit b = Plane(p, center, direction, vec4(0.0, 0.0, 1.0, 1.0));
    Implicit abOrig = Max(a, b);
    Implicit aNorm = Plane(p, center, vec2(a.Gradient.y, -a.Gradient.x), a.Color);
    Implicit bNorm = Plane(p, center, vec2(-b.Gradient.y, b.Gradient.x), b.Color);

    Implicit op = shape(p);
    opColor = drawImplicit(op, opColor);

    opColor = drawLine(a, opColor);
    opColor = drawLine(b, opColor);

    opColor = drawLine(aNorm, opColor);
    opColor = drawLine(bNorm, opColor);

    vec2 newCenter = center - offset * normalize(a.Gradient + b.Gradient).xy / cos(0.5 * acos(dot(a.Gradient, b.Gradient)));

    Implicit diff = Divide(Subtract(a, b), length(a.Gradient - b.Gradient));
    diff.Color.a *= 0.5;
    if (!(a.Distance + b.Distance > 0.0))
        opColor = strokeImplicit(diff, 3.0, opColor);

    opColor = drawArrow(p, mouse, opColor);

    // Draw distance value as text near mouse
    if (iMouse.xy != vec2(0.0)) {
        // Calculate shape at MOUSE position
        vec2 mouseP = iMouse.xy - 0.5 * iResolution.xy;
        Implicit mouseOp = shape(mouseP);
        float hoverValue = mouseOp.Distance;

        // Text scale at 2x
        float iTextScale = 2.0;
        vec2 textPos = iMouse.xy + vec2(10.0, -4.0) * iTextScale;

        // Draw black text
        float text = printFloat(fragCoord, textPos, hoverValue, iTextScale);
        if (text > 0.5) {
            opColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    }

    fragColor = opColor;
}



