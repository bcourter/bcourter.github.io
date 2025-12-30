// Original Shadertoy: https://www.shadertoy.com/view/DssczX
// Adapted for standalone viewer from shaders_public.json

// ===== Common Code =====
vec4 bounds = vec4(30,70,160,18);

//////////////////

struct Implicit {
	float Distance;
	vec3 Gradient;
	vec4 Color;
};

Implicit CreateImplicit() { return Implicit(0.0, vec3(0.0), vec4(0.0)); }
Implicit CreateImplicit(float iValue) { return Implicit(iValue, vec3(0.0), vec4(0.0)); }
Implicit CreateImplicit(float iValue, vec4 iColor) { return Implicit(iValue, vec3(0.0), iColor); }

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

Implicit Square(Implicit iA) { return Multiply(iA, iA); }

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

Implicit Mod(Implicit iImplicit, float iM)
{
	return Implicit(mod(iImplicit.Distance, iM), iImplicit.Gradient, iImplicit.Color);
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

// Booleans
// https://mercury.sexy/hg_sdf/
Implicit IntersectionEuclidean(Implicit a, Implicit b, float radius) {
    Implicit maxab = Max(a, b);
    Implicit r = CreateImplicit(radius, maxab.Color);
    
    Implicit ua = Implicit(Max(Add(a, r), CreateImplicit()).Distance, a.Gradient, a.Color);
    Implicit ub = Implicit(Max(Add(b, r), CreateImplicit()).Distance, b.Gradient, b.Color);
    
	Implicit op = Add(Min(Negate(r), maxab), EuclideanNorm(ua, ub));
    
    if (maxab.Distance <= 0.0)
        op.Gradient = maxab.Gradient;
        
    if (min(a.Distance, b.Distance) > 0.)
        op.Color = mix(a.Color, b.Color, 0.5 + 0.5 * (b.Distance - a.Distance)/(a.Distance + b.Distance));
        
    return op;
}

// https://mercury.sexy/hg_sdf/
Implicit UnionEuclidean(Implicit a, Implicit b, float radius) {
    Implicit ab = Min(a, b);
    Implicit r = CreateImplicit(radius, ab.Color);
    
    Implicit ua = Max(Subtract(r, a), CreateImplicit(0.0, a.Color));
    Implicit ub = Max(Subtract(r, b), CreateImplicit(0.0, b.Color));
    
	Implicit op = Subtract(Max(r, ab), EuclideanNorm(ua, ub));
    
    if (ab.Distance > 0.0)
        op.Gradient = ab.Gradient;
        
    return op;
}

// https://mercury.sexy/hg_sdf/
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

// Polynomial Smooth Min 2 from https://iquilezles.org/articles/smin/ and https://iquilezles.org/articles/distgradfunctions2d/
Implicit UnionSmoothMedial(Implicit a, Implicit b, float k) 
{
    float h = max(k-abs(a.Distance-b.Distance),0.0);
    float m = 0.25*h*h/k;
    float n = 0.50 * h/k;
    float dist = min(a.Distance,  b.Distance) - m; 
                 
    float param = (a.Distance < b.Distance) ? n : 1.0 - n;
    vec3 grad = mix(a.Gradient, b.Gradient, param);
    vec4 color = mix(a.Color, b.Color, param);


    return Implicit(dist, grad, color);
}

Implicit UnionSmooth(Implicit a, Implicit b, float k){
    a.Distance -= k;
    b.Distance -= k;

 //   if (min(a.Distance, b.Distance) >= 0.)
 //       return (Min(a, b));

    return Add(UnionSmoothMedial(a, b, abs(a.Distance + b.Distance) * abs(1.-dot(a.Gradient, b.Gradient))), k);
}


Implicit IntersectionSmoothMedial(Implicit iA, Implicit iB, float k){
    return Negate(UnionSmoothMedial(Negate(iA), Negate(iB), k));
}


Implicit IntersectionSmooth(Implicit iA, Implicit iB, float k){
    return Negate(UnionSmooth(Negate(iA), Negate(iB), k));
}



// R0 fro, https://www.cambridge.org/core/journals/acta-numerica/article/abs/semianalytic-geometry-with-rfunctions/3F5E061C35CA6A712BE338FE4AD1DB7B
Implicit UnionRvachev(Implicit iA, Implicit iB, float k)
{
    Implicit result = Subtract(Add(iA, iB), Sqrt(Add(Square(iA), Square(iB))));
  //  float param = 0.5;
  //  result.Color = mix(iA.Color, iB.Color, iA.Distance < iB.Distance ? param : (1.0 - param));

    return result;
}

Implicit IntersectionRvachev(Implicit iA, Implicit iB, float k){
    return Negate(UnionRvachev(Negate(iA), Negate(iB), k));
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

Implicit RectangleUGFSDFCenterRotated(vec2 p, vec2 center, float size, float angle, vec4 color)
{
	vec2 centered = p - center;
    mat2 rot = Rotate2(-angle);
 //   centered = rot * centered;
    size *= 0.5;
    
    Implicit x = Plane(centered, vec2(0.), rot * vec2(-1., 0.), color);
    Implicit y = Plane(centered, vec2(0.), rot * vec2(0., -1.), color);
    Implicit cornerA = Subtract(Max(x, y), size);
    Implicit cornerB = Subtract(Max(Negate(x), Negate(y)), size);
   
	return IntersectionEuclidean(cornerA, cornerB, 0.);
}

Implicit TriangleWaveEvenPositive(Implicit param, float period, vec4 color)
{
	float halfPeriod = 0.5 * period;
    float wave = mod(param.Distance, period) - halfPeriod;
	float dist = halfPeriod - abs(wave);
	vec3 grad = -sign(wave) * param.Gradient;
	return Implicit(dist, grad, color);
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

    // UI overlay removed
    
 //   opColor = DrawVectorField(p3, Divide(shape, length(shape.Gradient)), opColor, 25., 1.);
    
    fragColor = opColor;
}



