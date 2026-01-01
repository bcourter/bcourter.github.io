// Shader: Apollonian Circles
// Adapted for standalone viewer

#include "library.glsl"

// ===== Common Code =====
// Note: Drawing functions (DrawVectorField, strokeImplicit, drawImplicit, drawLine, drawFill) are in library.glsl
vec4 bounds = vec4(30,100,160,18);

// ===== Adapted Image Code =====
// Apollonian and conic two-body fields
// Illustration for: https://www.blakecourter.com/2023/07/01/two-body-field.html

// Sliders thanks to https://www.shadertoy.com/view/XlG3WD

float pi = 3.1415926535;

vec2 mouse = vec2(-180.0, 250.0);

vec2 center = vec2(0.0);
float offset = 0.5;
vec2 direction = vec2(1.0, 1.0);
int viz = 0;

// Sliders
// Slider functions removed - using iParam uniforms

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);
    
    offset = iParam1;
    viz = int(iParam2);
    
    vec2 p = fragCoord - 0.5 * iResolution.xy; // * iResolution.xy;
    
    if (iMouse.x > bounds.x + bounds.z + 20.0 || iMouse.y > bounds.y + bounds.w + 20.0)
        mouse = iMouse.xy - 0.5 * iResolution.xy;
    
    vec3 p3 = vec3(p, 0.0);

    float paddingAmt = 0.33;
    float padding = iResolution.x * paddingAmt; // * (0.3 + cos(iTime) * 0.05);
    float size = iResolution.x * (0.5 - paddingAmt) * sin(iTime) * offset;   
    
    Implicit a;
    vec2 aCenter = vec2(padding, iResolution.y / 2.0);
    float aRadius = size;
    vec4 red = vec4(1., 0., 0., 1);
    switch (viz) {
    case 0:
        a = Circle(fragCoord, aCenter, aRadius, red);
        break;
    default:
        a = Plane(fragCoord, aCenter + vec2(aRadius, 0.), vec2(1, 0), red);
    }
 
    
    Implicit b = Circle(fragCoord, vec2(iResolution.x - padding, iResolution.y / 2.0), -size, vec4(0., 0., 1., 1));
    
    Implicit shapes = Min(a, b);
    Implicit sum = Add(a, b);   
    Implicit diff = Subtract(a, b);
    Implicit interp = Divide(diff, sum);
    
    opColor = min(
        drawImplicit(Multiply(interp, 100.), opColor),
        drawImplicit(Multiply(Subtract(1., Abs(interp)), 100.), opColor)
    );
 
 
    if (shapes.Distance < 0.)
        opColor.rgb = min(opColor.rgb, opColor.rgb * 0.65 + shapes.Color.rgb * 0.2);

    // Draw distance value as text near mouse
    if (iMouse.xy != vec2(0.0)) {
        vec2 mouseP = iMouse.xy - 0.5 * iResolution.xy;

        // Recalculate shapes at mouse position
        Implicit mouseA;
        vec2 mouseACenter = aCenter;
        float mouseARadius = aRadius;
        switch (viz) {
        case 0:
            mouseA = Circle(iMouse.xy, mouseACenter, mouseARadius, red);
            break;
        default:
            mouseA = Plane(iMouse.xy, mouseACenter + vec2(mouseARadius, 0.), vec2(1, 0), red);
        }

        Implicit mouseB = Circle(iMouse.xy, vec2(iResolution.x - padding, iResolution.y / 2.0), -size, vec4(0., 0., 1., 1));
        Implicit mouseInterp = Divide(Subtract(mouseA, mouseB), Add(mouseA, mouseB));
        float hoverValue = mouseInterp.Distance * 100.0;

        // Text scale at 2x
        float iTextScale = 2.0;
        vec2 textPos = iMouse.xy + vec2(10.0, -4.0) * iTextScale;

        // Draw black circle background
        float circle = 1.0 - smoothstep(0.0, 1.0, length(fragCoord - iMouse.xy) - 2.0 * iTextScale);
        opColor = mix(opColor, colorBlack, circle * 0.85);

        // Draw white text
        float text = printFloat(fragCoord, textPos, hoverValue, iTextScale);
        if (text > 0.5) {
            opColor = colorBlack;
        }
    }

    fragColor = opColor;
}



