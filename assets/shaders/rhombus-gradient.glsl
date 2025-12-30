// Original Shadertoy: https://www.shadertoy.com/view/dd2cWy
// Adapted for standalone viewer from shaders_public.json

// ===== Common Code =====
vec4 bounds = vec4(30,70,160,18);

// Note: Common Implicit code is in library.glsl, automatically included by shadertoy-viewer.js

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


vec4 strokeImplicit(Implicit a, float width, vec4 base) {
    vec4 color = vec4(a.Color.rgb * 0.25, a.Color.a);
    float interp = clamp(width * 0.5 - abs(a.Distance), 0.0, 1.0);
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

vec4 blend(vec4 c, vec4 base) {
    return mix(base, c, c.a);
}

vec4 drawLine(Implicit a, vec4 opColor) {
    a.Color.a = 0.75;
    return strokeImplicit(a, 2.0, opColor);
}

vec4 drawFill(Implicit a, vec4 opColor) {
  //  if (a.Distance <= 0.0)
    float d = clamp(a.Distance + 0.5, 0., 1.);
    return mix(opColor, a.Color, mix(a.Color.a, 0., d));

    return opColor;
}

vec4 white = vec4(1.);
vec4 black = vec4(vec3(0.), 1.);   
float pointRadius = 5.0;  
float arrowRadius = 8.0;
float arrowSize = 30.0;
    
vec4 drawPoint(vec2 p, vec2 center, vec4 opColor) {
    Implicit circle = Circle(p, center, pointRadius, white);
    opColor = drawFill(circle, opColor);
    circle.Color = black;
    return strokeImplicit(circle, 3.0, opColor);
}

vec4 drawArrow(vec2 p, vec2 startPt, vec2 endPt, vec4 color, vec4 opColor) {
    vec2 delta = startPt - endPt;
    vec2 arrowNormal = vec2(delta.y, -delta.x);
    Implicit arrowSpine = Plane(p, endPt, arrowNormal, color);
    mat2 arrowSideRotation = Rotate2(pi / 12.0);
    Implicit arrowTip = Max(
        Plane(p, endPt, -arrowNormal * arrowSideRotation, color),
        Plane(p, endPt, arrowNormal * inverse(arrowSideRotation), color)
    );
    
    vec2 spineDir = normalize(delta);
    vec2 arrowBackPt = endPt + arrowSize * spineDir;
    vec2 arrowTailPt = startPt;

    arrowTip = Max(arrowTip, Plane(p, arrowBackPt, delta, color));
    
    Implicit bound = Shell(Plane(p, 0.5 * (arrowBackPt + arrowTailPt), spineDir, color), length(arrowBackPt - arrowTailPt), 0.0);
    if (bound.Distance < 0.0 && dot(spineDir, arrowBackPt - arrowTailPt) < 0.)
        opColor = strokeImplicit(arrowSpine, 4.0, opColor);
    
    return drawFill(arrowTip, opColor);
}

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
    
    opColor = drawPoint(p, center, opColor);    
    opColor = drawPoint(p, pointA, opColor);    
    opColor = drawPoint(p, pointB, opColor);    
    opColor = drawPoint(p, pointAB, opColor);
    
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



