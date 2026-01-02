#ifndef IMPLICIT_GLSL
#define IMPLICIT_GLSL

#include "../utils/constants.glsl"

//======================================
// IMPLICIT CLASS & FUNCTIONS
//======================================

struct Implicit {
    float Distance;
    vec3 Gradient;
};

// Basic construction functions
Implicit CreateImplicit() {
    return Implicit(0.0, vec3(0.0));
}
Implicit CreateImplicit(float iValue) {
    return Implicit(iValue, vec3(0.0));
}

Implicit Negate(Implicit v) {
    return Implicit(-v.Distance, -v.Gradient);
}

Implicit Add(Implicit a, Implicit b) {
    return Implicit(a.Distance + b.Distance, a.Gradient + b.Gradient);
}

Implicit Add(Implicit a, float b) {
    return Implicit(a.Distance + b, a.Gradient);
}

Implicit Subtract(Implicit a, Implicit b) {
    return Implicit(a.Distance - b.Distance, a.Gradient - b.Gradient);
}

Implicit Subtract(Implicit a, float b) {
    return Implicit(a.Distance - b, a.Gradient);
}

Implicit Subtract(float a, Implicit b) {
    return Implicit(a - b.Distance, -b.Gradient);
}

Implicit Multiply(Implicit a, Implicit b) {
    return Implicit(a.Distance * b.Distance, a.Distance * b.Gradient + b.Distance * a.Gradient);
}

Implicit Multiply(float a, Implicit b) {
    return Implicit(a * b.Distance, a * b.Gradient);
}

Implicit Multiply(Implicit a, float b) {
    return Multiply(b, a);
}

// NEW
Implicit Square(Implicit v) {
    return Multiply(v, v);
}

Implicit Divide(Implicit a, Implicit b) {
    return Implicit(a.Distance / b.Distance, (b.Distance * a.Gradient - a.Distance * b.Gradient) / (b.Distance * b.Distance));
}
Implicit Divide(Implicit a, float b) {
    return Implicit(a.Distance / b, a.Gradient / b);
}
Implicit Divide(float a, Implicit b) {
    return Divide(CreateImplicit(a), b);
}

// Min — standard overloads
Implicit Min(Implicit a, Implicit b) {
    if(a.Distance <= b.Distance) {
        return a;
    } else {
        return b;
    }
}

Implicit Min(Implicit a, float b) {
    return Min(a, CreateImplicit(b));
}
Implicit Min(float a, Implicit b) {
    return Min(CreateImplicit(a), b);
}
Implicit Min(Implicit a, Implicit b, Implicit c) {
    return Min(a, Min(b, c));
}
Implicit Min(Implicit a, Implicit b, Implicit c, Implicit d) {
    return Min(a, Min(b, Min(c, d)));
}

// Max — standard overloads
Implicit Max(Implicit a, Implicit b) {
    if(a.Distance >= b.Distance) {
        return a;
    } else {
        return b;
    }
}

Implicit Max(Implicit a, float b) {
    return Max(a, CreateImplicit(b));
}
Implicit Max(float a, Implicit b) {
    return Max(CreateImplicit(a), b);
}
Implicit Max(Implicit a, Implicit b, Implicit c) {
    return Max(a, Max(b, c));
}
Implicit Max(Implicit a, Implicit b, Implicit c, Implicit d) {
    return Max(a, Max(b, Max(c, d)));
}

Implicit Compare(Implicit iA, Implicit iB) {
    if(iA.Distance < iB.Distance)
        return CreateImplicit(-1.0);
    if(iA.Distance > iB.Distance)
        return CreateImplicit(1.0);
    return CreateImplicit(0.0);
}

Implicit Compare(Implicit iA, float iB) {
    return Compare(iA, CreateImplicit(iB));
}
Implicit Compare(float iA, Implicit iB) {
    return Compare(CreateImplicit(iA), iB);
}
Implicit Compare(float iA, float iB) {
    return CreateImplicit(iA == iB ? 0.0 : (iA > iB ? 1.0 : -1.0));
}

Implicit Conditional(bool condition, Implicit shape1, Implicit shape2) {
    if(condition) {
        return shape1;
    } else {
        return shape2;
    }
}

Implicit Exp(Implicit iImplicit) {
    float e = exp(iImplicit.Distance);
    return Implicit(e, e * iImplicit.Gradient);
}
Implicit Log(Implicit iImplicit) {
    return Implicit(log(iImplicit.Distance), iImplicit.Gradient / iImplicit.Distance);
}
Implicit Pow(Implicit iMantissa, Implicit iExponent) {
    float result = pow(iMantissa.Distance, iExponent.Distance);
    return Implicit(result, result * log(iMantissa.Distance) * iMantissa.Gradient);
}
Implicit Sqrt(Implicit iImplicit) {
    float s = sqrt(iImplicit.Distance);
    return Implicit(s, iImplicit.Gradient / (2.0 * s));
}
Implicit Abs(Implicit iImplicit) {
    return Implicit(abs(iImplicit.Distance), sign(iImplicit.Distance) * iImplicit.Gradient);
}

Implicit Mod(Implicit iImplicit, Implicit iM) {
    return Implicit(mod(iImplicit.Distance, iM.Distance), iImplicit.Gradient);  // TODO: fix gradient
}
Implicit Mod(Implicit iImplicit, float iM) {
    return Implicit(mod(iImplicit.Distance, iM), iImplicit.Gradient);  // TODO: fix gradient
}

Implicit Sin(Implicit iImplicit) {
    return Implicit(sin(iImplicit.Distance), cos(iImplicit.Distance) * iImplicit.Gradient);
}

Implicit Cos(Implicit iImplicit) {
    return Implicit(cos(iImplicit.Distance), -sin(iImplicit.Distance) * iImplicit.Gradient);
}

Implicit Tan(Implicit iImplicit) {
    float sec = 1. / cos(iImplicit.Distance);
    return Implicit(tan(iImplicit.Distance), sec * sec * iImplicit.Gradient);
}

Implicit Asin(Implicit iImplicit) {
    return Implicit(asin(iImplicit.Distance), iImplicit.Gradient / sqrt(1.0 - iImplicit.Distance * iImplicit.Distance));
}

Implicit Acos(Implicit iImplicit) {
    return Implicit(acos(iImplicit.Distance), -iImplicit.Gradient / sqrt(1.0 - iImplicit.Distance * iImplicit.Distance));
}

Implicit Atan(Implicit iImplicit) {
    return Implicit(atan(iImplicit.Distance), iImplicit.Gradient / (1.0 + iImplicit.Distance * iImplicit.Distance));
}

Implicit Atan(Implicit a, Implicit b) {
    float x = b.Distance;
    float y = a.Distance;
    float ir2 = 1.0 / (x * x + y * y);
    return Implicit(atan(y, x), vec3(-y * ir2, x * ir2, 0.0));
}

// Primitives

Implicit Plane(vec3 p, vec3 origin, vec3 normal) {
    vec3 grad = normalize(normal);
    float v = dot(p - origin, grad);
    return Implicit(v, grad);
}

Implicit Plane(vec2 p, vec2 origin, vec2 normal) {
    return Plane(vec3(p, 0.0), vec3(origin, 0.0), vec3(normal, 0.0));
}

Implicit Circle(vec2 p, vec2 center, float iRadius) {
    vec2 centered = p - center;
    float len = length(centered);
    float length = len - iRadius;
    return Implicit(length, vec3(centered / len, 0.0));
}

Implicit LineSegment(vec2 p, vec2 start, vec2 end) {
    vec2 span = end - start;
    float length = length(span);
    vec2 dir = span / length;

    Implicit plane = Abs(Plane(p, start, vec2(dir.y, -dir.x)));
    vec2 center = (start + end) * 0.5;
    Implicit bounds = Subtract(Abs(Plane(p, center, dir)), length * 0.5);

    return Max(plane, bounds);
}

Implicit RectangleCentered(vec2 p, vec2 center, vec2 size) {
    vec2 centered = p - center;
    vec2 b = size * 0.5;
    vec2 d = abs(centered) - b;
    float dist = length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);

    vec2 grad = d.x > d.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    if(d.x > 0. && d.y > 0.)
        grad = d / length(d);

    grad *= -sign(centered);

    return Implicit(dist, vec3(grad, 0.0));
}

Implicit Rectangle(vec2 p, vec2 min, vec2 max) {
    vec2 center = (min + max) * 0.5;
    vec2 size = max - min;
    return RectangleCentered(p, center, size);
}

Implicit RectangleCenterRotated(vec2 p, vec2 center, vec2 size, float angle) {
    vec2 centered = p - center;
    mat2 rot = Rotate2D(-angle);
    centered = rot * centered;

    vec2 b = size * 0.5;
    vec2 d = abs(centered) - b;
    float dist = length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);

    vec2 grad = d.x > d.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    if(d.x > 0. && d.y > 0.)
        grad = d / length(d);

    grad *= -sign(centered);

    return Implicit(dist, vec3(grad * rot, 0.0));
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

Implicit RectangleCenterRotatedExp(vec2 p, vec2 center, vec2 size, float angle) {
    vec2 centered = p - center;
    mat2 rot = Rotate2D(-angle);
    size = size * 0.5;

    Implicit xPlane = Subtract(Abs(Implicit(centered.x, vec3(1, 0, 0))), size.x);
    Implicit yPlane = Subtract(Abs(Implicit(centered.y, vec3(0, 1, 0))), size.y);

    return Add(xPlane, yPlane);
}

vec3 Boundary(Implicit i) {
    return -i.Distance * i.Gradient;
}

Implicit Shell(Implicit iImplicit, float thickness, float bias) {
    thickness *= 0.5;
    return Subtract(Abs(Add(iImplicit, bias * thickness)), thickness);
}

Implicit EuclideanNorm(Implicit a, Implicit b) {
    return Sqrt(Add(Multiply(a, a), Multiply(b, b)));
}
Implicit EuclideanNorm(Implicit a, Implicit b, Implicit c) {
    return Sqrt(Add(Add(Multiply(a, a), Multiply(b, b)), Multiply(c, c)));
}

// https://mercury.sexy/hg_sdf/
Implicit IntersectionEuclidean(Implicit a, Implicit b, float radius, out float blendingRatio) {

    Implicit maxab = Max(a, b);
    Implicit r = CreateImplicit(radius);

    Implicit ua = Implicit(Max(Add(a, r), CreateImplicit()).Distance, a.Gradient);
    Implicit ub = Implicit(Max(Add(b, r), CreateImplicit()).Distance, b.Gradient);

    Implicit op = Add(Min(Negate(r), maxab), EuclideanNorm(ua, ub));

    if(maxab.Distance <= 0.0) {
        op.Gradient = maxab.Gradient;
    }

    float sum = a.Distance + b.Distance;
    blendingRatio = (sum == 0.0) ? 0.5 : (0.5 + 0.5 * b.Distance / sum);

    return op;
}

Implicit IntersectionEuclidean(Implicit a, Implicit b, float radius) {
    float unusedBlendingRatio;
    return IntersectionEuclidean(a, b, radius, unusedBlendingRatio);
}

Implicit RectangleUGFSDFCenterRotated(vec2 p, vec2 center, float size, float angle) {
    vec2 centered = p - center;
    mat2 rot = Rotate2D(-angle);
    size *= 0.5;

    Implicit x = Plane(centered, vec2(0.0), rot * vec2(-1.0, 0.0));
    Implicit y = Plane(centered, vec2(0.0), rot * vec2(0.0, -1.0));
    Implicit cornerA = Subtract(Max(x, y), size);
    Implicit cornerB = Subtract(Max(Negate(x), Negate(y)), size);

    return IntersectionEuclidean(cornerA, cornerB, 0.0);
}

Implicit TriangleWaveEvenPositive(Implicit param, float period) {
    float halfPeriod = 0.5 * period;
    float wave = mod(param.Distance, period) - halfPeriod;
    float dist = halfPeriod - abs(wave);
    vec3 grad = -sign(wave) * param.Gradient;

    return Implicit(dist, grad);
}

Implicit BoxCenter(vec3 iP, vec3 iCenter, vec3 iSize) {
    vec3 p = iP - iCenter;
    vec3 b = iSize * 0.5;

    vec3 d = abs(p) - b;
    float dist = length(max(d, vec3(0.))) + min(max(d.x, max(d.y, d.z)), 0.);

    vec3 grad = (d.x > d.y) && (d.x > d.z) ? vec3(1., 0., 0.) : (d.y > d.z ? vec3(0., 1., 0.) : vec3(0., 0., 1.));

    if(d.x > 0. || d.y > 0. || d.z > 0.) {
        d = max(d, 0.);
        grad = d / length(d);
    }

    grad *= sign(p);

    return Implicit(dist, grad);
}

Implicit SphereNative(vec3 iP, vec3 iCenter, float iRadius) {
    vec3 centered = iP - iCenter;
    float length = length(centered);
    float dist = length - iRadius;
    return Implicit(dist, centered / length);
}

Implicit Dot(Implicit a_x, Implicit a_y, Implicit a_z, Implicit b_x, Implicit b_y, Implicit b_z) {
    Implicit _Dot_000 = Multiply(a_x, b_x);
    Implicit _Dot_001 = Multiply(a_y, b_y);
    Implicit _Dot_002 = Add(_Dot_000, _Dot_001);
    Implicit _Dot_003 = Multiply(a_z, b_z);
    return Add(_Dot_002, _Dot_003);
}

Implicit IntersectSharp3(Implicit a, Implicit b, Implicit c) {
    Implicit _IntersectSharp3_000 = Max(a, b);
    return Max(_IntersectSharp3_000, c);
}

Implicit Sphere(vec3 p, vec3 center, float radius) {
    vec3 c = p - center;
    float len = Length(c);
    float dist = len - radius;
    vec3 _Sphere_000 = c / len;
    return Implicit(dist, _Sphere_000);
}

Implicit BoxCenteredSharp(Implicit p_x, Implicit p_y, Implicit p_z, vec3 center, vec3 size) {
    Implicit _planes_000_x = Subtract(p_x, center.x);
    Implicit _planes_001_x = Abs(_planes_000_x);
    vec3 _planes_002 = size * 0.5;
    Implicit planes_x = Subtract(_planes_001_x, _planes_002.x);
    Implicit _planes_000_y = Subtract(p_y, center.y);
    Implicit _planes_001_y = Abs(_planes_000_y);
    Implicit planes_y = Subtract(_planes_001_y, _planes_002.y);
    Implicit _planes_000_z = Subtract(p_z, center.z);
    Implicit _planes_001_z = Abs(_planes_000_z);
    Implicit planes_z = Subtract(_planes_001_z, _planes_002.z);
    return IntersectSharp3(planes_x, planes_y, planes_z);
}

Implicit TPMS_Gyroid(Implicit p_x, Implicit p_y, Implicit p_z, vec3 period, vec3 drop) {
    vec3 frequency = 2.0 * PI / period;
    Implicit xyz_x = Multiply(p_x, frequency.x);
    Implicit xyz_y = Multiply(p_y, frequency.y);
    Implicit xyz_z = Multiply(p_z, frequency.z);
    Implicit _TPMS_Gyroid_003_x = Sin(xyz_x);
    Implicit _TPMS_Gyroid_004_x = Multiply(drop.x, _TPMS_Gyroid_003_x);
    Implicit _TPMS_Gyroid_003_y = Sin(xyz_y);
    Implicit _TPMS_Gyroid_004_y = Multiply(drop.y, _TPMS_Gyroid_003_y);
    Implicit _TPMS_Gyroid_003_z = Sin(xyz_z);
    Implicit _TPMS_Gyroid_004_z = Multiply(drop.z, _TPMS_Gyroid_003_z);
    Implicit _TPMS_Gyroid_005_x = Cos(xyz_y);
    Implicit _TPMS_Gyroid_005_y = Cos(xyz_z);
    Implicit _TPMS_Gyroid_005_z = Cos(xyz_x);
    Implicit _TPMS_Gyroid_006 = Dot(_TPMS_Gyroid_004_x, _TPMS_Gyroid_004_y, _TPMS_Gyroid_004_z, _TPMS_Gyroid_005_x, _TPMS_Gyroid_005_y, _TPMS_Gyroid_005_z);
    float _TPMS_Gyroid_007 = AddVec(period);
    Implicit _TPMS_Gyroid_008 = Multiply(_TPMS_Gyroid_006, _TPMS_Gyroid_007);
    return Divide(_TPMS_Gyroid_008, 18.0);
}

Implicit indexedLattice(vec3 p, int index, out Implicit solid) {
    vec3 size = vec3(u_size_x, u_size_y, u_size_z);
    vec3 drop = vec3(u_drop_xy, u_drop_yz, u_drop_zx);
    Implicit p_x = Implicit(p.x, DirX);
    Implicit p_y = Implicit(p.y, DirY);
    Implicit p_z = Implicit(p.z, DirZ);
    Implicit _lattice_000 = TPMS_Gyroid(p_x, p_y, p_z, size, drop);
    Implicit lattice = Subtract(_lattice_000, u_bias);
    solid = lattice;
    if(index == 0)
        return solid;
    Implicit inverse = Multiply(-1.0, lattice);
    if(index == 1)
        return inverse;
    Implicit _thin_000 = Abs(lattice);
    Implicit thin = Subtract(_thin_000, u_sdf_thickness * 0.5);
    if(index == 2)
        return thin;
    Implicit twin = Multiply(-1.0, thin);
    if(index == 3)
        return twin;
    return Sphere(p, vec3(0.0), 0.5);
}

Implicit scaledLattice(vec3 scaledP, int index, out Implicit scaledBase) {
    vec3 p = (scaledP - center) * 10.0;
    Implicit base;
    Implicit indexed = indexedLattice(p, index, base);
    scaledBase = Divide(base, 10.0);
    return Divide(indexed, 10.0);
}

// Booleans

Implicit UnionEuclidean(Implicit a, Implicit b, float radius, out float blendingRatio) {
    Implicit ab = Min(a, b);
    Implicit r = CreateImplicit(radius);

    Implicit ua = Max(Subtract(r, a), CreateImplicit(0.0));
    Implicit ub = Max(Subtract(r, b), CreateImplicit(0.0));

    Implicit op = Subtract(Max(r, ab), EuclideanNorm(ua, ub));

    if(ab.Distance > 0.0) {
        op.Gradient = ab.Gradient;
    }

    float sum = a.Distance + b.Distance;
    blendingRatio = (sum == 0.0) ? 0.5 : (0.5 + 0.5 * b.Distance / sum);

    return op;
}

Implicit UnionEuclidean(Implicit a, Implicit b, float radius) {
    float unused;
    return UnionEuclidean(a, b, radius, unused);
}

Implicit UnionEuclidean(Implicit a, Implicit b, Implicit c, float radius) {
    Implicit zero = CreateImplicit(0.0);
    Implicit r = CreateImplicit(radius);
    Implicit ua = Max(Subtract(r, a), zero);
    Implicit ub = Max(Subtract(r, b), zero);
    Implicit uc = Max(Subtract(r, c), zero);

    Implicit abc = Min(a, Min(b, c));
    Implicit op = Subtract(Max(r, abc), EuclideanNorm(ua, ub, uc));

    if(abc.Distance > 0.0) {
        op.Gradient = abc.Gradient;
    }

    return op;
}

Implicit UnionChamfer(Implicit iA, Implicit iB, float k, out float param) {
    Implicit h = Multiply(Max(Subtract(CreateImplicit(k), Abs(Subtract(iA, iB))), CreateImplicit()), 1.0 / k);
    Implicit h2 = Multiply(h, 0.5);
    Implicit result = Subtract(Min(iA, iB), Multiply(h2, k * 0.5));
    param = h2.Distance;
    param = iA.Distance < iB.Distance ? param : (1.0 - param);

    return result;
}

Implicit UnionChamfer(Implicit iA, Implicit iB, float k) {
    float param;
    return UnionChamfer(iA, iB, k, param);
}

Implicit UnionRound(Implicit iA, Implicit iB, float k, out float param) {
    Implicit h = Multiply(Max(Subtract(CreateImplicit(k), Abs(Subtract(iA, iB))), CreateImplicit()), 1.0 / k);
    Implicit h2 = Multiply(Multiply(h, h), 0.5);
    Implicit result = Subtract(Min(iA, iB), Multiply(h2, k * 0.5));
    param = 0.5 + 0.5 * (iA.Distance - iB.Distance) / (iA.Distance + iB.Distance);

    return result;
}
Implicit UnionRound(Implicit iA, Implicit iB, float k) {
    float param;
    return UnionRound(iA, iB, k, param);
}

// Polynomial Smooth Min 2 from https://iquilezles.org/articles/smin/ and https://iquilezles.org/articles/distgradfunctions2d/
Implicit UnionSmoothMedial(Implicit a, Implicit b, float k, out float blendingRatio) {
    float h = max(k - abs(a.Distance - b.Distance), 0.0);
    float m = 0.25 * h * h / k;
    float n = 0.5 * h / k;

    float dist = min(a.Distance, b.Distance) - m;
    blendingRatio = (a.Distance < b.Distance) ? n : 1.0 - n;
    vec3 grad = mix(a.Gradient, b.Gradient, blendingRatio);

    return Implicit(dist, grad);
}

Implicit UnionSmoothMedial(Implicit a, Implicit b, float k) {
    float unused;
    return UnionSmoothMedial(a, b, k, unused);
}

Implicit UnionSmooth(Implicit a, Implicit b, float k) {
    a.Distance -= k;
    b.Distance -= k;
    //   if (min(a.Distance, b.Distance) >= 0.)
    //       return (Min(a, b));
    return Add(UnionSmoothMedial(a, b, abs(a.Distance + b.Distance) * abs(1. - dot(a.Gradient, b.Gradient))), k);
}

Implicit IntersectionSmoothMedial(Implicit iA, Implicit iB, float k) {
    return Negate(UnionSmoothMedial(Negate(iA), Negate(iB), k));
}

Implicit IntersectionSmooth(Implicit iA, Implicit iB, float k) {
    return Negate(UnionSmooth(Negate(iA), Negate(iB), k));
}

// R0 fro, https://www.cambridge.org/core/journals/acta-numerica/article/abs/semianalytic-geometry-with-rfunctions/3F5E061C35CA6A712BE338FE4AD1DB7B
Implicit UnionRvachev(Implicit iA, Implicit iB, float k) {
    Implicit result = Subtract(Add(iA, iB), Sqrt(Add(Square(iA), Square(iB))));
    //  float param = 0.5;
    //  result.Color = mix(iA.Color, iB.Color, iA.Distance < iB.Distance ? param : (1.0 - param));

    return result;
}

Implicit IntersectionRvachev(Implicit iA, Implicit iB, float k) {
    return Negate(UnionRvachev(Negate(iA), Negate(iB), k));
}

Implicit PlaneNative(vec3 p, vec3 origin, vec3 normal) {
    vec3 grad = normalize(normal);
    float v = dot(p - origin, grad);
    return Implicit(v, grad);
}

Implicit PlaneNative(vec2 p, vec2 origin, vec2 normal) {
    return PlaneNative(vec3(p, 0.0), vec3(origin, 0.0), vec3(normal, 0.0));
}

Implicit Sampson(Implicit a) {
    return Multiply(1.0 / length(a.Gradient), a);
}

// Rotation matrices for vec3
vec3 rotateX(vec3 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(
        p.x,
        c * p.y - s * p.z,
        s * p.y + c * p.z
    );
}

vec3 rotateY(vec3 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(
        c * p.x + s * p.z,
        p.y,
        -s * p.x + c * p.z
    );
}

// This is just a test , I still intend to do the full clamshell from the book.
// Create a compound cut plane with flat and sloped sections
Implicit createCompoundCut(vec3 p, vec3 center, float slope) {
    // Parameters for the compound cut
    float splitX = 0.0;  // X position where slope starts
    
    // Create flat plane (vertical cut)
    Implicit flatPlane = Plane(p, 
        vec3(splitX, 0.0, 0.0),  // Center at split point
        vec3(0.0, 0.0, -1.0)     // Facing -Z direction
    );
    
    // Create sloped plane
    Implicit slopedPlane = Plane(p,
        vec3(splitX, 0.0, 0.0),           // Center at split point
        normalize(vec3(0.0, slope, -1.0))  // Normal with slope in Y
    );
    
    // Use position.x to blend between planes
    // Return flat plane for x < splitX, sloped plane for x > splitX
    return Min(
        flatPlane,  // Left side (flat)
        Max(        // Right side (sloped)
            slopedPlane,
            Plane(p, vec3(splitX, 0.0, 0.0), vec3(-1.0, 0.0, 0.0))  // Vertical dividing plane
        )
    );
}

// Clam Shell SDF
Implicit clamShellSDF(vec3 p) {
    // Object controls
    float objScale = 0.5;
    vec3 objOffset = vec3(0.0, 0.0, 0.0);
    vec3 objSize = vec3(1.5, 1.5, 1.5);
    float chamferDepth = 0.5;
    float wallThickness = 0.2;
    float shellBias = 0.0;
    
    // Cut controls
    vec3 cutCenter = vec3(0.0, 0.5, 0.0);  // Center of the cut
    float cutSlope = 0.5;                   // Slope of the angled section
    
    // Apply transformations
    vec3 pScaled = (p - objOffset) / objScale;  // Scale and position
    
    // Box dimensions
    vec3 boxSize = objSize * 0.5;  // Half-size for centering
    
    // Step 1: Create all six planes for a complete box
    // Top and bottom
    Implicit topPlane = Plane(pScaled, 
        vec3(0.0, boxSize.y, 0.0),
        vec3(0.0, 1.0, 0.0)
    );
    Implicit bottomPlane = Plane(pScaled, 
        vec3(0.0, -boxSize.y, 0.0),
        vec3(0.0, -1.0, 0.0)
    );
    
    // Left and right
    Implicit rightPlane = Plane(pScaled,
        vec3(boxSize.x, 0.0, 0.0),
        vec3(1.0, 0.0, 0.0)
    );
    Implicit leftPlane = Plane(pScaled,
        vec3(-boxSize.x, 0.0, 0.0),
        vec3(-1.0, 0.0, 0.0)
    );
    
    // Front and back
    Implicit frontPlane = Plane(pScaled,
        vec3(0.0, 0.0, boxSize.z),
        vec3(0.0, 0.0, 1.0)
    );
    Implicit backPlane = Plane(pScaled,
        vec3(0.0, 0.0, -boxSize.z),
        vec3(0.0, 0.0, -1.0)
    );
    
    // Step 2: Create chamfered edges by offsetting intersections
    Implicit topRightEdge = Max(
        Max(topPlane, rightPlane),
        Add(
            Add(topPlane, rightPlane),  // Sum of the two planes
            CreateImplicit(chamferDepth) // Offset by chamfer depth
        )
    );
    
    Implicit topFrontEdge = Max(
        Max(topPlane, frontPlane),
        Add(
            Add(topPlane, frontPlane),
            CreateImplicit(chamferDepth)
        )
    );
    
    Implicit rightFrontEdge = Max(
        Max(rightPlane, frontPlane),
        Add(
            Add(rightPlane, frontPlane),
            CreateImplicit(chamferDepth)
        )
    );
    
    // Step 3: Combine all edges and remaining planes
    Implicit solidBox = Max(
        Max(
            Max(topRightEdge, topFrontEdge),
            Max(rightFrontEdge, backPlane)
        ),
        Max(leftPlane, bottomPlane)
    );
    
    // Step 4: Create hollow box using Shell operation
    Implicit hollowBox = Shell(solidBox, wallThickness, shellBias);
    
    // Step 5: Create compound cutting plane
    Implicit cutPlane = createCompoundCut(pScaled, cutCenter, cutSlope);
    
    // Step 6: Apply cut using Boolean difference
    Implicit cutBox = Max(hollowBox, Negate(cutPlane));
    
    return Sampson(cutBox);
}

// Tree root
Implicit map(vec3 p) {
    #if (STANDALONE==0)
    float time = u_time;
    vec2 resolution = u_resolution;
    #endif

    return clamShellSDF(p);
}

#endif // IMPLICIT_GLSL