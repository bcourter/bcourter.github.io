// Shader: Rhombus Gradient
// Adapted for standalone viewer from shaders_public.json

#include "library.glsl"

// ===== Common Code =====
vec4 bounds = vec4(30,70,160,18);

// Shader-specific function
Implicit Sampson(Implicit a) {
    return Multiply(1. / length(a.Gradient), a);
}



// ===== Adapted Image Code =====
// The sum and difference fields are orthogonal  
// Illustration for: https://www.blakecourter.com/2023/07/01/two-body-field.html

// Sliders thanks to https://www.shadertoy.com/view/XlG3WD

float pi = 3.1415926535;

vec2 center = vec2(0.0);
vec2 direction = vec2(1.0, 1.0);
bool isSDF = false;

// Sliders
// Slider functions removed - using iParam uniforms
// Note: Drawing functions (strokeImplicit, drawImplicit, drawLine, drawFill, drawPoint, drawArrow) are in library.glsl

vec4 blend(vec4 c, vec4 base) {
    return mix(base, c, c.a);
}

float pointRadius = 5.0;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);
    
    float angledot = iParam1 - 0.5 + 0.1 * sin(iTime);
    float angle = angledot * pi;
    direction = vec2(cos(angle), sin(angle));
    isSDF = true; // Always use SDF mode
    
    vec2 p = (fragCoord - vec2(0.5, 0.333) * iResolution.xy); // * iResolution.xy;    

    // planes
    Implicit a = Plane(p, center, vec2(0.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0));
    Implicit b = Plane(p, center, direction, vec4(0.0, 0.0, 1.0, 1.0));
    Implicit abOrig = Max(a, b);
    Implicit aNorm = Plane(p, center, vec2(a.Gradient.y, -a.Gradient.x), a.Color);
    Implicit bNorm = Plane(p, center, vec2(-b.Gradient.y, b.Gradient.x), b.Color);
    
    
    // normal cone
    if (min(aNorm.Distance, bNorm.Distance) > 0.)
        opColor = vec4(0.9, 1., 0.9, 1.);
        
        
    float size = iResolution.y * 0.33;
    Implicit unitCircle = Circle(p, center, size, vec4(vec3(0.), 0.25));
    opColor = strokeImplicit(unitCircle, 2., opColor);

    opColor = drawLine(aNorm, opColor);
    opColor = drawLine(bNorm, opColor);
    
    // layout
    opColor = drawImplicit(a, opColor);
    opColor = drawImplicit(b, opColor);

    opColor = drawLine(a, opColor);
    opColor = drawLine(b, opColor);

    Implicit sum = Add(a, b);
    Implicit diff = Subtract(a, b);

    // arrows
    vec2 pointA = center + size * a.Gradient.xy;    
    vec2 pointB = center + size * b.Gradient.xy;
    vec2 sumVec = size * sum.Gradient.xy;
    vec2 pointAB = center + sumVec;
    
    vec4 red = vec4(0.5, 0., 0., 1.0);    
    vec4 blue = vec4(0., 0., 0.5, 1.0);
    opColor = drawArrow(p, center, pointA, red, opColor);
    opColor = drawArrow(p, center, pointB, blue, opColor); 
    red.a = 0.5;
    blue.a = 0.5;    
    opColor = drawArrow(p, pointA, pointAB, blue, opColor);
    opColor = drawArrow(p, pointB, pointAB, red, opColor);
    
    if (abs(angledot) != 0.5) {
        opColor = drawArrow(p, center, pointAB, black, opColor); // sum
        opColor = drawArrow(p, pointB, pointA, black, opColor); // diff
    }
    
    opColor = drawPoint(p, center, pointRadius, opColor);
    opColor = drawPoint(p, pointA, pointRadius, opColor);
    opColor = drawPoint(p, pointB, pointRadius, opColor);
    opColor = drawPoint(p, pointAB, pointRadius, opColor);
    
    // perp square
    float perpSize = 12.;
    float halfPerpSize = perpSize * 0.5;
    Implicit square = Max(Abs(Subtract(Sampson(sum), halfPerpSize + 0.5 * length(sumVec))), Abs(Subtract(Sampson(Negate(diff)), halfPerpSize)));
    square = Subtract(square, halfPerpSize);
    square.Color = black;
    opColor = strokeImplicit(square, 3., opColor);


    // UI overlay removed
    
    fragColor = opColor;
}



