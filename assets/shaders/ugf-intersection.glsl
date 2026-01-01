// Shader: UGF Intersection
// Author: bcourter
// Description: A sharp minmax intersection versus a true SDF intersection of two planes and their offset. All of the cases are UGFs (have unit gradient magnitude).  The SDF and UGF differ only in the normal cone of the original intersection.

#include "library.glsl"

// ===== Common Code =====



// ===== Image Code =====
// UGF intersection demo
// Post 1: https://www.blakecourter.com/2023/05/05/what-is-offset.html

// Sliders thanks to https://www.shadertoy.com/view/XlG3WD

float pi = 3.1415926535;



vec2 center = vec2(0.0);
float offset = 0.0;
vec2 direction = vec2(1.0, 1.0);
bool isSDF = false;
vec2 mouse = vec2(-180.0, 150.0);
vec4 bounds = vec4(0.0, 0.0, 0.0, 0.0);

// Sliders
// Note: Drawing functions (strokeImplicit, drawImplicit, drawLine, drawFill) are in library.glsl

vec4 blend(vec4 c, vec4 base) {
    return mix(base, c, c.a);
}

Implicit shape(vec2 p){
    Implicit a = Plane(p, center, vec2(0.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0));
    Implicit b = Plane(p, center, direction, vec4(0.0, 0.0, 1.0, 1.0));   
    Implicit minmax = Max(a, b);
    
    // Mercury Blend
    if (false)
        return IntersectionEuclidean(a, b, 0.0);
    
    Implicit aNorm = Plane(p, center, vec2(a.Gradient.y, -a.Gradient.x), a.Color);
    Implicit bNorm = Plane(p, center, vec2(-b.Gradient.y, b.Gradient.x), b.Color);
    Implicit normalCone = Min(aNorm, bNorm);

    // DF-based intersection
    if (isSDF && normalCone.Distance > 0.0)
        minmax = Circle(p, center, 0.0, 0.5 * (a.Color + b.Color));
        
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
    isSDF = iParam2 > 0.5;

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

    // normal cone
    if (min(aNorm.Distance, bNorm.Distance) > 0.)
        opColor = vec4(0.9, 1., 0.9, 1.);

    if (abOrig.Distance > 0.0) {
        opColor = drawLine(aNorm, opColor);
        opColor = drawLine(bNorm, opColor);
    }

    //detail
    opColor = drawImplicit(op, opColor);

    opColor = drawLine(a, opColor);
    opColor = drawLine(b, opColor);


    // offset
    vec2 newCenter = center - offset * normalize(a.Gradient + b.Gradient).xy / cos(0.5 * acos(dot(a.Gradient, b.Gradient)));
    
    // offset normal cone
    if (abOrig.Distance > -offset && offset > 0.) {
        opColor = drawLine(Plane(p, newCenter, vec2(a.Gradient.y, -a.Gradient.x), a.Color), opColor);
        opColor = drawLine(Plane(p, newCenter, vec2(b.Gradient.y, -b.Gradient.x), b.Color), opColor);
    }
    
    // swallowtail arc
    if (isSDF && max(aNorm.Distance, bNorm.Distance) < 0.0) {
        opColor = drawLine(Circle(p, center, offset, (a.Color + b.Color)), opColor);  
        opColor = drawLine(Add(a, offset), opColor);
        opColor = drawLine(Add(b, offset), opColor);
    }

    Implicit diff = Divide(Subtract(a, b), length(a.Gradient - b.Gradient));
    diff.Color.a *= 0.5;
    if (!(isSDF && a.Distance + b.Distance > 0.0))
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



