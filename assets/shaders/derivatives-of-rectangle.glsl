// Shader: Derivatives of Rectangle
// Author: bcourter
// Description: Let's look at the derivatives of a rectangle.  In the SDF of the rectangle, we color by averaging in binary operations like sum, illustrating parameter contribution by count.  For the two derivatives, red is zero and blue is one.

#include "library.glsl"

// ===== Shader-Specific Code =====

// Primitives specific to this shader

Implicit RectangleCenterRotatedExp(vec2 p, vec2 center, vec2 size, float angle, vec4 color)
{
	vec2 centered = p - center;
    mat2 rot = Rotate2(-angle);
    centered = rot * centered;
    size = size * 0.5;
    Implicit xPlane = Subtract(Abs(Implicit(centered.x, vec3(1, 0, 0), color)), size.x);
    Implicit yPlane = Subtract(Abs(Implicit(centered.y, vec3(0, 1, 0), color)), size.y);



	return IntersectionExponential(xPlane, yPlane, 20.0);
}

// Shape
const float bandWidth = 20.0;
const float falloff = 150.0;
const float widthThin = 2.0;
const float widthThick = 4.0;

const Implicit Zero = Implicit(0.0, zero, vec4(1, 1, 1, 1));

// The main implicit aka "map(vec3 p)".  In common for point sampling.
Implicit Shape(vec2 p, float wobble, float len, float iTime, 
        out Implicit XPlane, out Implicit YPlane, 
        out Implicit shape_x, out Implicit shape_y, 
        out Implicit spur
    ) {
    float halfGolden = 0.5*0.618;
    vec2 size = len * 0.2 * vec2(1.0 + halfGolden * (1.0 + cos(iTime) * wobble), 1.0) + vec2(140.0 * wobble * cos(iTime * 0.5));

    Implicit shape;
    vec2 pCenter = abs(p) - size * 0.5;
    
    XPlane = Implicit(pCenter.x, xDir, colorWarm);
    YPlane = Implicit(pCenter.y, yDir, colorCool);

    if (min(pCenter.x, pCenter.y) >= 0.0) {
        shape = EuclideanNorm(XPlane, YPlane);
        shape_x = Negate(Divide(XPlane, shape));
        shape_y = Negate(Divide(YPlane, shape));
    } else {
        if (pCenter.x > pCenter.y) {
            shape = XPlane;
            shape_x = Implicit(-1.0, zero, YPlane.Color); 
            shape_y = Zero;
        } else {
            shape = YPlane;
            shape_x = Zero;
            shape_y = Implicit(-1.0, zero, YPlane.Color); 
        }
    }
    
    spur = Implicit(pCenter.x - pCenter.y, vec3(1, -1, 0), vec4(0, 0, 0, 0.4));

    return shape;
}





// ===== Image Code =====
// Derivatives of an exact rectangle SDF 
// Blog post: https://www.blakecourter.com/2024/04/12/differential-engineering.html


// Sliders thanks to https://www.shadertoy.com/view/XlG3WD

float pi = 3.1415926535;



vec2 center = vec2(0.0);
float wobble = 0.0;
int shapeIndex = 0;
vec2 mouse = vec2(0.0);
vec4 bounds = vec4(0.0, 0.0, 0.0, 0.0);

// Note: Text rendering and drawing functions (strokeImplicit, drawImplicit, drawLine, drawFill, DrawVectorField) are in library.glsl

vec4 colorImplicit(Implicit a, vec4 base) {
    vec4 opColor = mix(base, a.Color, 0.1);
    Implicit wave = TriangleWaveEvenPositive(a, bandWidth, a.Color);  

    wave.Color.a = max(0.2, 1.0 - abs(a.Distance) / falloff);
    opColor = strokeImplicit(wave, widthThin, opColor);
    opColor = strokeImplicit(a, widthThick, opColor);
    
    return opColor;
}

vec4 colorDerivative(Implicit a, vec4 base) {
    vec4 opColor = mix(base, mix(colorCool, colorWarm, -a.Distance), 0.1);
    Implicit wave = TriangleWaveEvenPositive(a, 0.1, a.Color);  

    opColor = strokeImplicit(wave, widthThin, opColor);
    
    return opColor;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);

    wobble = iParam1;
    shapeIndex = int(iParam2);

    vec2 p = (fragCoord - 0.5 * iResolution.xy);
    if (iMouse.x > bounds.x + bounds.z + 20.0 || iMouse.y > bounds.y + (bounds.w + 20.0) * 3.0)
        mouse = iMouse.xy - 0.5 * iResolution.xy;
    else
        mouse = shapeIndex == 0 ? vec2(0.0) : vec2(iResolution.x * 0.5, 0.0);

    if (iMouse.xy == vec2(0.0))
        mouse = vec2(0.0);

    vec3 p3 = vec3(p, 0.0);

    Implicit shape, XPlane, YPlane, shape_x, shape_y, spur;
    shape = Shape(p, wobble, iResolution.x, iTime, XPlane, YPlane, shape_x, shape_y, spur);

    if (shapeIndex == 0) {
        opColor = colorImplicit(shape, opColor);
    } else {
        shape.Color.a = 0.4;
        opColor = strokeImplicit(shape, widthThin, opColor);

        if (shapeIndex == 1){
            opColor = colorDerivative(shape_x, opColor);
        } else {
            opColor = colorDerivative(shape_y, opColor);
        }

        opColor = strokeImplicit(Min(XPlane, YPlane), widthThin * 1.2, opColor);
    }

    // medial axis
    if (shape.Distance < 0.0)
        opColor = strokeImplicit(spur, widthThin, opColor);

    // Draw distance value as text near mouse
    if (iMouse.xy != vec2(0.0)) {
        // Calculate shape at MOUSE position, not current pixel position
        vec2 mouseP = iMouse.xy - 0.5 * iResolution.xy;
        Implicit mouseShape, mouseXPlane, mouseYPlane, mouseShape_x, mouseShape_y, mouseSpur;
        mouseShape = Shape(mouseP, wobble, iResolution.x, iTime, mouseXPlane, mouseYPlane, mouseShape_x, mouseShape_y, mouseSpur);

        // Get the distance value at mouse position
        float hoverValue;
        if (shapeIndex == 0) {
            hoverValue = mouseShape.Distance / bandWidth;
        } else if (shapeIndex == 1) {
            hoverValue = mouseShape_x.Distance; 
        } else {
            hoverValue = mouseShape_y.Distance; 
        }

        // Text scale at 2x
        float iTextScale = 2.0;
        vec2 textPos = iMouse.xy + vec2(10.0, -4.0) * iTextScale;

        // Draw black circle background first
        float circle = 1.0 - smoothstep(0.0, 1.0, length(fragCoord - iMouse.xy) - 2.0 * iTextScale);
        opColor = mix(opColor, colorBlack, circle * 0.85);

        // Draw white text on top (8x8 font with dynamic scale)
        // Use 2 decimal places for gradients, 1 for distance
        int decimals = (shapeIndex == 0) ? 1 : 2;
        float text = printFloat(fragCoord, textPos, hoverValue, iTextScale, decimals);
        if (text > 0.5) {
            opColor = colorBlack;
        }
    }

    fragColor = opColor;
}



