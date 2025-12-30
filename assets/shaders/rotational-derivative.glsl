// Shader: Rotational Derivative
// Adapted for standalone viewer from shaders_public.json

// ===== Common Code =====
vec4 bounds = vec4(30,70,160,18);

// Note: Common Implicit code is in library.glsl, automatically included by shadertoy-viewer.js

// Shader-specific primitives
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
// Derivative of a field with respect to a rotation axis
// See blog post at: https://www.blakecourter.com/2024/04/12/differential-engineering.html


// Sliders thanks to https://www.shadertoy.com/view/XlG3WD

float pi = 3.1415926535;

vec2 mouse = vec2(-180.0, 250.0);

vec2 center = vec2(0.0);
float wobble = 0.0;
int shapeIndex = 0;

vec4 colorWarm = vec4(1, 0, 0, 1);
vec4 colorCool = vec4(0, 0, 1, 1);
vec4 colorBlack = vec4(0, 0, 0, 1);

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

    vec4 color = a.Distance > 0.0 ? colorWarm : colorCool;
    vec4 opColor = mix(base, color, 0.1);
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
    float clamped = 0.5 - clamp(a.Distance / length(a.Gradient), -0.5, 0.5);
    return mix(opColor, a.Color, a.Color.a * clamped);

    return opColor;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec4 opColor = vec4(1.0);
    
    wobble = iParam1; 
    shapeIndex = int(iParam2);

    float halfGolden = 0.5*0.618;
    vec2 size = iResolution.x * 0.2 * vec2(1.0 + halfGolden * (1.0 + cos(iTime) * wobble), 1.0) + vec2(160.0 * wobble * cos(iTime * 0.5));

    vec2 p = (fragCoord - 0.5 * iResolution.xy); // * iResolution.xy;
    if (iMouse.x > bounds.x + bounds.z + 20.0 || iMouse.y > bounds.y + bounds.w + 20.0)
        mouse = iMouse.xy - 0.5 * iResolution.xy;
    else
        mouse = shapeIndex == 0 ? vec2(0.0) : vec2(size.x * 0.5, 0.0);
        
    if (iMouse.xy == vec2(0.0)) 
        mouse = vec2(0.0);
    
    vec3 p3 = vec3(p, 0.0);

    Implicit shape;
    if (shapeIndex == 0) {
        shape = RectangleCenterRotated(p - mouse, vec2(0.0), size, 0.0, colorBlack);
    } else if (shapeIndex == 1){
        shape = Circle(p - mouse, center, size.x * 0.5, colorBlack);
    } else {
        shape = Plane(p - mouse, center, mouse - center, colorBlack);
    }
    
    // uncomment for squared Euclidean metric
    // shape.Distance = shape.Distance * shape.Distance * sign(shape.Distance) * 0.01;
    
    vec2 pRot = vec2(p.y, -p.x);
    vec3 gradRot = vec3(shape.Gradient.y, -shape.Gradient.x, 0.0);
    
    //    opColor = drawImplicit(shape, opColor);    
    Implicit grad = Implicit(dot(pRot, shape.Gradient.xy), gradRot, vec4(0., 0., 0., 1));
    float rotateTime = iTime * 0.25;
    Implicit pencilA = Add(Multiply(cos(rotateTime), shape), Multiply(sin(rotateTime), grad));
    Implicit pencilB = Add(Multiply(-sin(rotateTime), shape), Multiply(cos(rotateTime), grad));
    
    opColor = drawImplicit(pencilA, opColor);
    opColor = drawImplicit(pencilB, opColor);
    opColor = strokeImplicit(shape, 5.0, opColor);
    
    Implicit axis = Circle(p, center, 5.0, colorBlack);
    opColor = drawFill(axis, opColor);    

    // UI overlay removed
    
    fragColor = opColor;
}



