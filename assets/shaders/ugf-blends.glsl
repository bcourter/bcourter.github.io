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
// Note: Drawing functions (strokeImplicit, drawImplicit, drawLine, drawFill, drawBoundaryMapArrow) are in library.glsl

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

    // Draw boundary map arrow (always), with distance text (only on mouse hover)
    Implicit mouseOp = shape(mouse);
    opColor = drawBoundaryMapArrow(p, fragCoord, mouse, mouseOp, opColor, iMouse.xy != vec2(0.0));

    fragColor = opColor;
}



