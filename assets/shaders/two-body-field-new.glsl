// Shader: Two-Body Field (migrated to new library)
// Adapted for standalone viewer

#include "library/utils/constants.glsl"
#include "library/implicits/implicit.glsl"
#include "library/implicits/colorImplicit.glsl"
#include "library/drawing/drawing.glsl"

// ===== Common Code =====
vec4 bounds = vec4(30,70,160,18);

// Viz
vec4 DrawVectorField(vec3 p, ColorImplicit iImplicit, vec4 iColor, float iSpacing, float iLineHalfThick)
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

// ===== Image Code =====

vec2 mouse = vec2(0.0);
vec2 direction = vec2(0.0);
int viz = 0;

vec4 strokeImplicit(ColorImplicit a, float iStrokeHalfWidth, vec4 opColor) {
    float strokedDist = abs(a.Distance) - iStrokeHalfWidth;

    if (strokedDist <= 0.0) {
        vec4 color = vec4(a.Color.rgb * 0.25, a.Color.a);
        return mix(opColor, color, min(-strokedDist, 1.0));
    }

    return opColor;
}

vec4 drawImplicit(ColorImplicit a, vec4 opColor) {
    float bandWidth = 30.0;

    vec4 base = vec4(0.95);

    float falloff = 150.0;
    float widthThin = 2.0;
    float widthThick = 4.0;

    vec4 opColor2 = mix(base, a.Color, (a.Distance < 0.0 ? a.Color.a * 0.1 : 0.0));
    ColorImplicit wave = TriangleWaveEvenPositive(Implicit(a.Distance, a.Gradient), bandWidth, a.Color);

    wave.Color.a = max(0.2, 1.0 - abs(a.Distance) / falloff);
    opColor2 = strokeImplicit(wave, widthThin, opColor2);
    opColor2 = strokeImplicit(a, widthThick, opColor2);

    return opColor2;
}

vec4 drawLine(ColorImplicit a, vec4 opColor) {
    a.Color.a = 0.75;
    return strokeImplicit(a, 2.0, opColor);
}

vec4 drawFill(ColorImplicit a, vec4 opColor) {
    if (a.Distance <= 0.0)
        return mix(opColor, a.Color, a.Color.a);

    return opColor;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);

    float angle = 0.0;
    direction = vec2(cos(angle), sin(angle));
    viz = int(iParam1);

    vec2 p = (fragCoord - 0.5 * iResolution.xy);

    mouse = iMouse.xy - 0.5 * iResolution.xy;

    vec3 p3 = vec3(p, 0.0);

    float padding = iResolution.x * (0.3 + cos(iTime) * 0.05);
    float size = iResolution.x * 0.1 + sin(iTime) * 12.0;

    ColorImplicit a = RectangleUGFSDFCenterRotated(fragCoord, vec2(padding, iResolution.y / 2.0), size * 1.8, iTime * 0.1, vec4(1., 0., 0., 1));
    ColorImplicit b = Circle(fragCoord, vec2(iResolution.x - padding, iResolution.y / 2.0), size, vec4(0., 0., 1., 1));

    ColorImplicit shapes = Min(a, b);
    ColorImplicit sum = Add(Implicit(a.Distance, a.Gradient), Implicit(b.Distance, b.Gradient), a.Color, b.Color);
    ColorImplicit diff = Subtract(Implicit(a.Distance, a.Gradient), Implicit(b.Distance, b.Gradient), a.Color, b.Color);
    ColorImplicit interp = Divide(diff, sum);

    switch (viz) {
    case 0:
        opColor = drawImplicit(shapes, opColor);
        break;
    case 1:
        opColor = drawImplicit(Multiply(interp, 0.5), opColor);
        break;
    case 2:
        opColor = drawImplicit(Multiply(interp, 0.5), opColor);
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
            drawImplicit(Multiply(Subtract(CreateColorImplicit(1.0, vec3(0), vec4(1)), Abs(interp)), 100.), opColor)
        );
        break;
    }

    if (shapes.Distance < 0.)
        opColor.rgb = min(opColor.rgb, opColor.rgb * 0.65 + shapes.Color.rgb * 0.2);

    // Draw distance value as text near mouse
    if (iMouse.xy != vec2(0.0)) {
        vec2 mouseP = iMouse.xy - 0.5 * iResolution.xy;

        // Recalculate shapes at mouse position
        ColorImplicit mouseA = RectangleUGFSDFCenterRotated(iMouse.xy, vec2(padding, iResolution.y / 2.0), size * 1.8, iTime * 0.1, vec4(1., 0., 0., 1));
        ColorImplicit mouseB = Circle(iMouse.xy, vec2(iResolution.x - padding, iResolution.y / 2.0), size, vec4(0., 0., 1., 1));

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
            ColorImplicit mouseInterp = Divide(
                Subtract(Implicit(mouseA.Distance, mouseA.Gradient), Implicit(mouseB.Distance, mouseB.Gradient), mouseA.Color, mouseB.Color),
                Add(Implicit(mouseA.Distance, mouseA.Gradient), Implicit(mouseB.Distance, mouseB.Gradient), mouseA.Color, mouseB.Color)
            );
            hoverValue = mouseInterp.Distance * 100.0;
        }

        // Text scale at 2x
        float iTextScale = 2.0;
        vec2 textPos = iMouse.xy + vec2(10.0, -4.0) * iTextScale;

        // Draw black circle background
        float circle = 1.0 - smoothstep(0.0, 1.0, length(fragCoord - iMouse.xy) - 2.0 * iTextScale);
        opColor = mix(opColor, vec4(0.0, 0.0, 0.0, 1.0), circle * 0.85);

        // Draw white text
        float text = printFloat(fragCoord, textPos, hoverValue, iTextScale);
        if (text > 0.5) {
            opColor = vec4(1.0, 1.0, 1.0, 1.0);
        }
    }

    fragColor = opColor;
}
