// Original Shadertoy: https://www.shadertoy.com/view/dd2cWy
// Adapted for standalone viewer from shaders_public.json

// ===== Common Code =====
vec4 bounds = vec4(30,70,160,18);

//////////////////
// Work in progress

struct Implicit {
	float Distance;
	vec3 Gradient;
	vec4 Color;
};

Implicit CreateImplicit() { return Implicit(0.0, vec3(0.0), vec4(0.0)); }
Implicit CreateImplicit(float iValue) { return Implicit(iValue, vec3(0.0), vec4(0.0)); }
Implicit CreateImplicit(float iValue, vec4 iColor) { return Implicit(iValue, vec3(0.0),iColor); }

Implicit Negate(Implicit iImplicit) {
	return Implicit(-iImplicit.Distance, -iImplicit.Gradient, iImplicit.Color);
}

Implicit Add(Implicit a, Implicit b) {
	return Implicit(a.Distance + b.Distance, a.Gradient + b.Gradient, (a.Color + b.Color) * 0.5);
}

Implicit Subtract(Implicit a, Implicit b)  {
	return Implicit(a.Distance - b.Distance, a.Gradient - b.Gradient, (a.Color + b.Color) * 0.5);
}

Implicit Add(float iT, Implicit iImplicit) {
	return Implicit(iT + iImplicit.Distance, iImplicit.Gradient, iImplicit.Color);
}
Implicit Add(Implicit iImplicit, float iT) { return Add(iT, iImplicit); }
Implicit Subtract(float iT, Implicit iImplicit) { return Add(iT, Negate(iImplicit)); }
Implicit Subtract(Implicit iImplicit, float iT) { return Add(-iT, iImplicit); }

Implicit Multiply(Implicit a, Implicit b) {
	return Implicit(a.Distance * b.Distance, a.Distance * b.Gradient + b.Distance * a.Gradient, (a.Color + b.Color) * 0.5);
}
Implicit Multiply(float iT, Implicit iImplicit) { return Implicit(iT * iImplicit.Distance, iT * iImplicit.Gradient, iImplicit.Color); }
Implicit Multiply(Implicit iImplicit, float iT) { return Multiply(iT, iImplicit); }

Implicit Divide(Implicit a, Implicit b) {
	return Implicit(a.Distance / b.Distance, (b.Distance * a.Gradient - a.Distance * b.Gradient) / (b.Distance * b.Distance), (a.Color + b.Color) * 0.5);
}
Implicit Divide(Implicit a, float b) { return Implicit(a.Distance / b, a.Gradient / b, a.Color); }

Implicit Min(Implicit a, Implicit b) 
{
	if (a.Distance <= b.Distance)
		return a;
	
	return b;
}

Implicit Max(Implicit a, Implicit b) {
	if (a.Distance >= b.Distance)
		return a;
	
	return b;
}

float mix11(float a, float b, float t) {
    return mix(a, b, t * 0.5 + 0.5);
}

Implicit Exp(Implicit iImplicit)
{
	float exp = exp(iImplicit.Distance);
	return Implicit(exp, exp * iImplicit.Gradient, iImplicit.Color);
}

Implicit Log(Implicit iImplicit)
{
	return Implicit(log(iImplicit.Distance), iImplicit.Gradient / iImplicit.Distance, iImplicit.Color);
}

Implicit Sqrt(Implicit iImplicit)
{
	float sqrt = sqrt(iImplicit.Distance);
	return Implicit(sqrt, iImplicit.Gradient / (2.0 * sqrt), iImplicit.Color);
}

Implicit Abs(Implicit iImplicit)
{
	return Implicit(abs(iImplicit.Distance), sign(iImplicit.Distance) * iImplicit.Gradient, iImplicit.Color);
}

Implicit Shell(Implicit iImplicit, float thickness, float bias) 
{
	thickness *= 0.5;
	return Subtract(Abs(Add(iImplicit, bias * thickness)), thickness);
}

Implicit EuclideanNorm(Implicit a, Implicit b) {
    return Sqrt(Add(Multiply(a, a), Multiply(b, b)));
}
Implicit EuclideanNorm(Implicit a, Implicit b, Implicit c) {
    return Sqrt(Add(Add(Multiply(a, a), Multiply(b, b)), Multiply(c, c)));
}

Implicit Sampson(Implicit a) {
    return Multiply(1. / length(a.Gradient), a);
}

// Booleans
// https://mercury.sexy/hg_sdf/
Implicit IntersectionEuclidean(Implicit a, Implicit b, float radius) {
    Implicit zero = CreateImplicit(0.0);
    Implicit r = CreateImplicit(radius);
    Implicit ua = Max(Add(a, r), zero);
    Implicit ub = Max(Add(b, r), zero);
    
    Implicit maxab = Max(a, b);

	Implicit op = Add(Min(Negate(r), maxab), EuclideanNorm(ua, ub));
    
    if (maxab.Distance < 0.0)
        op.Gradient = maxab.Gradient;
        
    return op;
}

Implicit UnionEuclidean(Implicit a, Implicit b, float radius) {
    Implicit zero = CreateImplicit(0.0);
    Implicit r = CreateImplicit(radius);
    Implicit ua = Max(Subtract(r, a), zero);
    Implicit ub = Max(Subtract(r, b), zero);
    
    Implicit ab = Min(a, b);

	Implicit op = Subtract(Max(r, ab), EuclideanNorm(ua, ub));
    
    if (ab.Distance > 0.0)
        op.Gradient = ab.Gradient;
        
    return op;
}

Implicit UnionEuclidean(Implicit a, Implicit b, Implicit c, float radius) {
    Implicit zero = CreateImplicit(0.0);
    Implicit r = CreateImplicit(radius);
    Implicit ua = Max(Subtract(r, a), zero);
    Implicit ub = Max(Subtract(r, b), zero);
    Implicit uc = Max(Subtract(r, c), zero);
    
    Implicit abc = Min(a, Min(b, c));

	Implicit op = Subtract(Max(r, abc), EuclideanNorm(ua, ub, uc));
    
    if (abc.Distance > 0.0)
        op.Gradient = abc.Gradient;
        
    return op;
}

Implicit UnionChamfer(Implicit iA, Implicit iB, float k)
{
    Implicit h = Multiply(Max(Subtract(CreateImplicit(k), Abs(Subtract(iA, iB))), CreateImplicit()), 1.0 / k);
    Implicit h2 = Multiply(h, 0.5);
    Implicit result = Subtract(Min(iA, iB), Multiply(h2, k * 0.5));
    float param = h2.Distance;
    result.Color = mix(iA.Color, iB.Color, iA.Distance < iB.Distance ? param : (1.0 - param));

    return result;
}

Implicit UnionRound(Implicit iA, Implicit iB, float k)
{
    Implicit h = Multiply(Max(Subtract(CreateImplicit(k), Abs(Subtract(iA, iB))), CreateImplicit()), 1.0 / k);
    Implicit h2 = Multiply(Multiply(h, h), 0.5);
    Implicit result = Subtract(Min(iA, iB), Multiply(h2, k * 0.5));
    float param = h2.Distance;
    result.Color = mix(iA.Color, iB.Color, iA.Distance < iB.Distance ? param : (1.0 - param));

    return result;
}



// Primitives

Implicit Plane(vec3 p, vec3 origin, vec3 normal, vec4 color) 
{
    vec3 grad = normalize(normal);
    float v = dot(p - origin, grad);
    return Implicit(v, grad, color);
}
Implicit Plane(vec2 p, vec2 origin, vec2 normal, vec4 color) 
{
    return Plane(vec3(p, 0.0), vec3(origin, 0.0), vec3(normal, 0.0), color);
}


Implicit Circle(vec2 p, vec2 center, float iRadius, vec4 color)
{
	vec2 centered = p - center;
    float len = length(centered);
	float length = len - iRadius;
	return Implicit(length, vec3(centered / len, 0.0), color);
}
 
mat2 Rotate2(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat2(
        vec2(c, -s),
        vec2(s, c)
    );
}

Implicit RectangleCenterRotated(vec2 p, vec2 center, vec2 size, float angle, vec4 color)
{
	vec2 centered = p - center;
    mat2 rot = Rotate2(-angle);
    centered = rot * centered;
    
	vec2 b = size * 0.5;
	vec2 d = abs(centered)-b;
	float dist = length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);

	vec2 grad = d.x > d.y ? vec2(1.0, 0.0) : vec2 (0.0, 1.0);
	if (d.x > 0. && d.y > 0.)
		grad = d / length(d);

	grad *= -sign(centered);

	return Implicit(dist, vec3(grad * rot, 0.0), color);
}

Implicit TriangleWaveEvenPositive(Implicit param, float period, vec4 color)
{
	float halfPeriod = 0.5 * period;
    float wave = mod(param.Distance, period) - halfPeriod;
	float dist = halfPeriod - abs(wave);
	vec3 grad = -sign(wave) * param.Gradient;
	return Implicit(dist, grad, color);
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
    
    float angledot = iParam1 * 0.01; // Controlled by slider
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



