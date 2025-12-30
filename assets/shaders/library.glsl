// Shared library for Shadertoy shaders
// Common Implicit struct and operations, text rendering functions

//////////////////
// Implicit Struct and Basic Operations
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

//////////////////
// Boolean Operations
//////////////////

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

// https://iquilezles.org/articles/smin/
Implicit IntersectionExponential(Implicit a, Implicit b, float radius) {
//    float res = exp2( -a/k ) + exp2( -b/k );
//    return -k*log2( res );

    a = Exp(Divide(a, radius));
    b = Exp(Divide(b, radius));
    Implicit res = Add(a, b);

    return Multiply(Log(res), radius);
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



// R0 from https://www.cambridge.org/core/journals/acta-numerica/article/abs/semianalytic-geometry-with-rfunctions/3F5E061C35CA6A712BE338FE4AD1DB7B
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

//////////////////
// Primitives
//////////////////

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

//////////////////
// Text Rendering - 8x8 Bitmap Font
//////////////////

// 8x8 font rendering - returns 1.0 if pixel is part of character, 0.0 otherwise
float char8x8(vec2 p, int b1, int b2, int b3, int b4) {
    // Check bounds before flooring
    if (p.x < 0.0 || p.x >= 8.0 || p.y < 0.0 || p.y >= 8.0) return 0.0;

    // Floor and flip coordinates to match bitmap layout
    vec2 pf = floor(8.0 - p);
    int row = int(pf.y / 2.0);
    int bin = (row == 0) ? b1 : (row == 1) ? b2 : (row == 2) ? b3 : b4;

    // Determine which half of the row (even/odd y values share same integer)
    float bitOffset = (int(mod(pf.y, 2.0)) == 0) ? 8.0 : 0.0;
    return mod(floor(float(bin) / pow(2.0, pf.x + bitOffset)), 2.0);
}

// Digit bitmaps (0-9) from 8x8 font
void getDigitBitmap(int digit, out int b1, out int b2, out int b3, out int b4) {
    if (digit == 0) { b1 = 0x384C; b2 = 0xC6C6; b3 = 0xC664; b4 = 0x3800; }
    else if (digit == 1) { b1 = 0x1838; b2 = 0x1818; b3 = 0x1818; b4 = 0x7E00; }
    else if (digit == 2) { b1 = 0x7CC6; b2 = 0x0E3C; b3 = 0x78E0; b4 = 0xFE00; }
    else if (digit == 3) { b1 = 0x7E0C; b2 = 0x183C; b3 = 0x06C6; b4 = 0x7C00; }
    else if (digit == 4) { b1 = 0x1C3C; b2 = 0x6CCC; b3 = 0xFE0C; b4 = 0x0C00; }
    else if (digit == 5) { b1 = 0xFCC0; b2 = 0xFC06; b3 = 0x06C6; b4 = 0x7C00; }
    else if (digit == 6) { b1 = 0x3C60; b2 = 0xC0FC; b3 = 0xC6C6; b4 = 0x7C00; }
    else if (digit == 7) { b1 = 0xFEC6; b2 = 0x0C18; b3 = 0x3030; b4 = 0x3000; }
    else if (digit == 8) { b1 = 0x78C4; b2 = 0xE478; b3 = 0x9E86; b4 = 0x7C00; }
    else if (digit == 9) { b1 = 0x7CC6; b2 = 0xC67E; b3 = 0x060C; b4 = 0x7800; }
}

// Print a floating point number with one decimal place
float printFloat(vec2 fragCoord, vec2 pos, float value, float scale) {
    vec2 p = (fragCoord - pos) / scale;
    float result = 0.0;
    float xOffset = 0.0;

    // Handle negative numbers
    if (value < 0.0) {
        // Minus sign: horizontal line
        if (p.x >= 0.0 && p.x < 6.0 && p.y >= 3.5 && p.y < 4.5) {
            result = 1.0;
        }
        xOffset = 9.0;
        value = -value;
    }

    // Calculate number of integer digits
    float intPart = floor(value);
    float fracPart = fract(value);
    float numDigits = (intPart == 0.0) ? 1.0 : floor(log(intPart) / 2.302585) + 1.0;

    // Declare bitmap variables once
    int bitmap1, bitmap2, bitmap3, bitmap4;

    // Draw integer digits
    for (int i = 0; i < 5; i++) {
        if (float(i) >= numDigits) break;

        // Extract digit using mod to avoid precision issues
        float digitPow = pow(10.0, numDigits - float(i) - 1.0);
        int digitValue = int(mod(floor(intPart / digitPow), 10.0));

        getDigitBitmap(digitValue, bitmap1, bitmap2, bitmap3, bitmap4);

        vec2 charPos = p - vec2(xOffset, 0.0);
        result = max(result, char8x8(charPos, bitmap1, bitmap2, bitmap3, bitmap4));

        xOffset += 9.0;
    }

    // Decimal point (check relative to offset)
    vec2 dotPos = p - vec2(xOffset, 0.0);
    if (dotPos.x >= 0.0 && dotPos.x < 2.0 && dotPos.y >= 0.0 && dotPos.y < 2.0) {
        result = 1.0;
    }
    xOffset += 4.0;

    // One decimal digit
    int decDigit = int(fracPart * 10.0);
    getDigitBitmap(decDigit, bitmap1, bitmap2, bitmap3, bitmap4);

    vec2 decCharPos = p - vec2(xOffset, 0.0);
    result = max(result, char8x8(decCharPos, bitmap1, bitmap2, bitmap3, bitmap4));

    return result;
}
