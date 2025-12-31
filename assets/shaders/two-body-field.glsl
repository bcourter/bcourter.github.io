// Shader: Two-Body Field
// Adapted for standalone viewer

#include "library.glsl"

// ===== Common Code =====
vec4 bounds = vec4(30,70,160,18);


// Viz
vec4 DrawVectorField(vec3 p, Implicit iImplicit, vec4 iColor, float iSpacing, float iLineHalfThick)
{
	vec2 spacingVec = vec2(iSpacing);
	vec2 param = mod(p.xy, spacingVec);
	vec2 center = p.xy - param + 0.5 * spacingVec;
	vec2 toCenter = p.xy - center;

	float gradParam = dot(toCenter, iImplicit.Gradient.xy) / length(iImplicit.Gradient);
	float gradLength = length(iImplicit.Gradient);
	
	bool isInCircle = length(p.xy - center) < iSpacing * 0.45 * max(length(iImplicit.Gradient.xy) / gradLength, 0.2);
	bool isNearLine = abs(dot(toCenter, vec2(-iImplicit.Gradient.y, iImplicit.Gradient.x))) / gradLength < iLineHalfThick + (-gradParam + iSpacing * 0.5) * 0.125;
	
	if (isInCircle && isNearLine)
		return vec4(iColor.rgb * 0.5, 1.);

	return iColor;
}

// ===== Adapted Image Code =====
// The sum, difference, and two-body fields.
// Post: https://www.blakecourter.com/2023/07/01/two-body-field.html


// Sliders thanks to https://www.shadertoy.com/view/XlG3WD

float pi = 3.1415926535;

vec2 mouse = vec2(-180.0, 250.0);

vec2 center = vec2(0.0);
float offset = 0.0;
vec2 direction = vec2(1.0, 1.0);
int viz = 4;

// Sliders
// Slider functions removed - using iParam uniforms


vec4 strokeImplicit(Implicit a, float width, vec4 base) {
    vec4 color = vec4(a.Color.rgb * 0.25, a.Color.a);
    
    float interp = clamp(width * 0.5 - abs(a.Distance) / length(a.Gradient), 0.0, 1.);
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

    wave.Color.a = max(0.2, 1.0 - abs(a.Distance) / falloff);
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

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);
    
    float angle = 0.0;
    direction = vec2(cos(angle), sin(angle));
    viz = int(iParam1);
    
    vec2 p = (fragCoord - 0.5 * iResolution.xy); // * iResolution.xy;
    
    mouse = iMouse.xy - 0.5 * iResolution.xy;
    
    vec3 p3 = vec3(p, 0.0);

    float padding = iResolution.x * (0.3 + cos(iTime) * 0.05);
    float size = iResolution.x * 0.1 + sin(iTime) * 12.0;

    Implicit a = RectangleUGFSDFCenterRotated(fragCoord, vec2(padding, iResolution.y / 2.0), size * 1.8, iTime * 0.1, vec4(1., 0., 0., 1));
 //   Implicit a = RectangleCenterRotated(fragCoord, vec2(padding, iResolution.y / 2.0), vec2(size * 1.8), iTime * 0.1, vec4(1., 0., 0., 1));
    Implicit b = Circle(fragCoord, vec2(iResolution.x - padding, iResolution.y / 2.0), size, vec4(0., 0., 1., 1));
    
    Implicit shapes = Min(a, b);
    Implicit sum = Add(a, b);   
    Implicit diff = Subtract(a, b);
    Implicit interp = Divide(diff, sum);
    
    switch (viz) {
    case 0:
        opColor = drawImplicit(shapes, opColor);
        break;
    case 1:
        opColor = drawImplicit(Multiply(sum, 0.5), opColor);
        break;
    case 2:
        opColor = drawImplicit(Multiply(diff, 0.5), opColor);
        break;
    case 3:
        opColor = min(
            drawImplicit(Multiply(sum, 0.5), opColor),
            drawImplicit(Multiply(diff, 0.5), opColor)
        );
        break;
    default:
        opColor = min(
            drawImplicit(Multiply(interp, 100.), opColor),
            drawImplicit(Multiply(Subtract(1., Abs(interp)), 100.), opColor)
        );
        break;
    }
    
    if (shapes.Distance < 0.)
        opColor.rgb = min(opColor.rgb, opColor.rgb * 0.65 + shapes.Color.rgb * 0.2);

    // Draw distance value as text near mouse
    if (iMouse.xy != vec2(0.0)) {
        vec2 mouseP = iMouse.xy - 0.5 * iResolution.xy;

        // Recalculate shapes at mouse position
        Implicit mouseA = RectangleUGFSDFCenterRotated(iMouse.xy, vec2(padding, iResolution.y / 2.0), size * 1.8, iTime * 0.1, vec4(1., 0., 0., 1));
        Implicit mouseB = Circle(iMouse.xy, vec2(iResolution.x - padding, iResolution.y / 2.0), size, vec4(0., 0., 1., 1));

        float hoverValue;
        if (viz == 0) {
            hoverValue = min(mouseA.Distance, mouseB.Distance);
        } else if (viz == 1) {
            hoverValue = (mouseA.Distance + mouseB.Distance) * 0.5;
        } else if (viz == 2) {
            hoverValue = (mouseA.Distance - mouseB.Distance) * 0.5;
        } else if (viz == 3) {
            hoverValue = (mouseA.Distance + mouseB.Distance) * 0.5;
        } else {
            Implicit mouseInterp = Divide(Subtract(mouseA, mouseB), Add(mouseA, mouseB));
            hoverValue = mouseInterp.Distance * 100.0;
        }

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



