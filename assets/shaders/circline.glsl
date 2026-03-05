// Complex numbers, Möbius transformations, and Circlines for GLSL
//
// Complex numbers are represented as vec2 (x = real, y = imaginary).
// Möbius transformations are 2×2 complex matrices stored as a struct of four vec2.
// Circlines are Hermitian 2×2 matrices [a, b; conj(b), c] with a, c real.
//
// Note: ComplexCollection (the JS spatial hash) has no GLSL equivalent and is omitted.

// ============================================================
// Constants
// ============================================================

const float CIRCLINE_TOL = 1e-6;

const vec2 C_ZERO = vec2(0.0, 0.0);
const vec2 C_ONE  = vec2(1.0, 0.0);
const vec2 C_I    = vec2(0.0, 1.0);

// ============================================================
// Complex arithmetic  (prefix: c)
// ============================================================

vec2 cConj(vec2 z)            { return vec2(z.x, -z.y); }
vec2 cNeg(vec2 z)             { return -z; }
float cModSq(vec2 z)          { return dot(z, z); }
float cMod(vec2 z)            { return length(z); }
float cArg(vec2 z)            { return atan(z.y, z.x); }
vec2 cScale(vec2 z, float s)  { return z * s; }
vec2 cAdd(vec2 a, vec2 b)     { return a + b; }
vec2 cSub(vec2 a, vec2 b)     { return a - b; }

vec2 cMul(vec2 a, vec2 b) {
    return vec2(a.x*b.x - a.y*b.y,
                a.x*b.y + a.y*b.x);
}

vec2 cDiv(vec2 a, vec2 b) {
    float d = dot(b, b);
    return vec2(dot(a, b), a.y*b.x - a.x*b.y) / d;
}

vec2 cPolar(float r, float theta) {
    return r * vec2(cos(theta), sin(theta));
}

bool cEquals(vec2 a, vec2 b) {
    return cModSq(cSub(a, b)) < CIRCLINE_TOL * CIRCLINE_TOL;
}

// ---- Transcendentals ----

vec2 cExp(vec2 z) {
    return exp(z.x) * vec2(cos(z.y), sin(z.y));
}

vec2 cLog(vec2 z) {
    return vec2(log(length(z)), atan(z.y, z.x));
}

// Numerically stable square root (Pavpanchekha algorithm)
vec2 cSqrt(vec2 z) {
    float r = length(z);
    float re = (z.x >= 0.0)
        ? 0.5 * sqrt(2.0 * (r + z.x))
        : abs(z.y) / sqrt(2.0 * (r - z.x));
    float im = (z.x <= 0.0)
        ? 0.5 * sqrt(2.0 * (r - z.x))
        : abs(z.y) / sqrt(2.0 * (r + z.x));
    return vec2(re, z.y >= 0.0 ? im : -im);
}

vec2 cSinh(vec2 z) {
    return vec2(sinh(z.x) * cos(z.y), cosh(z.x) * sin(z.y));
}

vec2 cCosh(vec2 z) {
    return vec2(cosh(z.x) * cos(z.y), sinh(z.x) * sin(z.y));
}

vec2 cTanh(vec2 z) {
    return cDiv(cSinh(z), cCosh(z));
}

vec2 cAtanh(vec2 z) {
    return cScale(cSub(cLog(cAdd(C_ONE, z)), cLog(cSub(C_ONE, z))), 0.5);
}

vec2 cAsinh(vec2 z) {
    return cLog(cAdd(z, cSqrt(cAdd(cMul(z, z), C_ONE))));
}

vec2 cAcosh(vec2 z) {
    return cLog(cAdd(z, cMul(cSqrt(cAdd(z, C_ONE)), cSqrt(cSub(z, C_ONE)))));
}

// ============================================================
// Möbius transformations  (prefix: m)
//
// Represents the matrix  | a  b |  acting as (az+b)/(cz+d).
//                        | c  d |
// ============================================================

struct Mobius {
    vec2 a, b, c, d;
};

Mobius mIdentity() {
    return Mobius(C_ONE, C_ZERO, C_ZERO, C_ONE);
}

vec2 mApply(Mobius m, vec2 z) {
    return cDiv(cAdd(cMul(m.a, z), m.b),
                cAdd(cMul(m.c, z), m.d));
}

Mobius mMul(Mobius p, Mobius q) {
    return Mobius(
        cAdd(cMul(p.a, q.a), cMul(p.b, q.c)),
        cAdd(cMul(p.a, q.b), cMul(p.b, q.d)),
        cAdd(cMul(p.c, q.a), cMul(p.d, q.c)),
        cAdd(cMul(p.c, q.b), cMul(p.d, q.d))
    );
}

Mobius mAdd(Mobius p, Mobius q) {
    return Mobius(cAdd(p.a, q.a), cAdd(p.b, q.b),
                  cAdd(p.c, q.c), cAdd(p.d, q.d));
}

Mobius mScale(Mobius m, float s) {
    return Mobius(cScale(m.a, s), cScale(m.b, s),
                  cScale(m.c, s), cScale(m.d, s));
}

// Inverse of | a b | is | d -b |  (up to determinant, which cancels in mApply)
//            | c d |    | -c a |
Mobius mInverse(Mobius m) {
    return Mobius(m.d, cNeg(m.b), cNeg(m.c), m.a);
}

Mobius mConjugate(Mobius m) {
    return Mobius(cConj(m.a), cConj(m.b), cConj(m.c), cConj(m.d));
}

Mobius mTranspose(Mobius m) {
    return Mobius(m.a, m.c, m.b, m.d);
}

Mobius mConjugateTranspose(Mobius m) {
    return Mobius(cConj(m.a), cConj(m.c), cConj(m.b), cConj(m.d));
}

// ---- Factory functions ----

Mobius mRotation(float phi) {
    return Mobius(cPolar(1.0, phi), C_ZERO, C_ZERO, C_ONE);
}

Mobius mTranslation(vec2 t) {
    return Mobius(C_ONE, t, C_ZERO, C_ONE);
}

Mobius mScaleMap(float s) {
    return Mobius(vec2(s, 0.0), C_ZERO, C_ZERO, C_ONE);
}

// Disc automorphism: rotation by phi composed with the automorphism sending a -> 0
Mobius mDiscAutomorphism(vec2 a, float phi) {
    return mMul(mRotation(phi),
                Mobius(C_ONE, cNeg(a), cConj(a), vec2(-1.0, 0.0)));
}

// Disc translation: maps point a to point b inside the unit disc
Mobius mDiscTranslation(vec2 a, vec2 b) {
    return mMul(mDiscAutomorphism(b, 0.0),
                mInverse(mDiscAutomorphism(a, 0.0)));
}

// ============================================================
// Circlines  (prefix: cl)
//
// A circline is a generalised circle encoded as the Hermitian matrix
//     H = | a      b    |    with a, c ∈ ℝ and b ∈ ℂ.
//         | conj(b)  c  |
//
// The corresponding locus is  { z : a|z|² + 2 Re(conj(b)·z) + c = 0 }.
//   a ≠ 0  →  circle   (normalised to a = 1)
//   a = 0  →  line     (a = 0 is preserved)
// ============================================================

struct Circline {
    float a;
    vec2  b;
    float c;
};

bool clIsLine(Circline cl) {
    return abs(cl.a) < CIRCLINE_TOL;
}

// Divide through by a so that a = 1 (no-op for lines)
Circline clNormalize(Circline cl) {
    if (abs(cl.a) < CIRCLINE_TOL) return cl;
    float inv = 1.0 / cl.a;
    return Circline(1.0, cScale(cl.b, inv), cl.c * inv);
}

// ---- Circle geometry ----

// center = -b / a   (normalised: a = 1, so center = -b)
vec2 clCenter(Circline cl) {
    return cScale(cNeg(cl.b), 1.0 / cl.a);
}

float clRadiusSq(Circline cl) {
    return cModSq(clCenter(cl)) - cl.c / cl.a;
}

float clRadius(Circline cl) {
    return sqrt(max(0.0, clRadiusSq(cl)));
}

// ---- Constructors ----

Circline clCircle(vec2 center, float radius) {
    return Circline(1.0, cNeg(center), cModSq(center) - radius * radius);
}

Circline clLine(vec2 b, float c) {
    return Circline(0.0, b, c);
}

// Line through two complex-plane points
Circline clLineTwoPoint(vec2 p1, vec2 p2) {
    float dx = p2.x - p1.x;
    float dy = p2.y - p1.y;
    // Equation: -dy·x + dx·y = dx·p1.y - dy·p1.x
    return Circline(0.0, vec2(-dy * 0.5, dx * 0.5), dx * p1.y - dy * p1.x);
}

// Line from real-coefficient equation  a·x + b·y + c = 0
Circline clLineFromEquation(float a, float b, float c) {
    return Circline(0.0, vec2(a * 0.5, b * 0.5), c);
}

// Line through 'point' at 'angle'
Circline clLinePointAngle(vec2 point, float angle) {
    return clLineTwoPoint(point, cSub(point, cPolar(1.0, angle)));
}

Circline clUnitCircle() {
    return clCircle(C_ZERO, 1.0);
}

// ---- Point tests ----

// Evaluates a|z|² + 2 Re(conj(b)·z) + c.
// Zero on the circline; positive on the "left" / outside for normalised circles.
// Note: Re(conj(b)·z) = b.x·z.x + b.y·z.y = dot(b, z)
float clEval(Circline cl, vec2 z) {
    return cl.a * dot(z, z) + 2.0 * dot(cl.b, z) + cl.c;
}

bool clContainsPoint(Circline cl, vec2 z) {
    return abs(clEval(cl, z)) < CIRCLINE_TOL;
}

bool clIsPointOnLeft(Circline cl, vec2 z) {
    return clEval(cl, z) + CIRCLINE_TOL > 0.0;
}

bool clArePointsOnSameSide(Circline cl, vec2 p1, vec2 p2) {
    if (cEquals(p1, p2)) return true;
    return clIsPointOnLeft(cl, p1) == clIsPointOnLeft(cl, p2);
}

// ---- Transformations ----

// Conjugate: reflects the circline (a, b, c) -> (a, conj(b), c)
Circline clConjugate(Circline cl) {
    return clNormalize(Circline(cl.a, cConj(cl.b), cl.c));
}

// Inversion under z -> 1/z.
// If H = (a, b, c) represents { a|z|²+2Re(conj(b)z)+c=0 },
// substituting z=1/w and multiplying by |w|² gives { c|w|²+2Re(b·w)+a=0 },
// i.e. the new Hermitian is (c, conj(b), a).
Circline clInverse(Circline cl) {
    return clNormalize(Circline(cl.c, cConj(cl.b), cl.a));
}

// Push-forward by a Möbius transformation m.
// Uses the contravariant formula:  H_new = (m^{-1})^T · H · conj(m^{-1})
Circline clTransform(Circline cl, Mobius m) {
    Mobius inv  = mInverse(m);
    // Pack the Hermitian matrix into a Mobius struct for matrix multiplication.
    //   | a       conj(b) |
    //   | b       c       |
    Mobius herm = Mobius(vec2(cl.a, 0.0), cConj(cl.b),
                         cl.b,            vec2(cl.c, 0.0));
    Mobius result = mMul(mMul(mTranspose(inv), herm), mConjugate(inv));
    // Upper-left and lower-right entries are real; lower-left gives new b.
    return clNormalize(Circline(result.a.x, result.c, result.d.x));
}

// ---- Möbius associated to a circline ----

// Returns a Möbius that maps the circline to the unit circle (circles)
// or to the real axis (lines).
Mobius clAsMobius(Circline cl) {
    if (clIsLine(cl)) {
        // Mobius(b, 1, 0, -conj(b))
        return Mobius(cl.b, C_ONE, C_ZERO, cNeg(cConj(cl.b)));
    }
    vec2  ctr = clCenter(cl);
    float rSq = clRadiusSq(cl);
    return Mobius(ctr, vec2(rSq - cModSq(ctr), 0.0), C_ONE, cConj(cNeg(cl.b)));
}

// ---- Scaling ----

// Scale a circle uniformly (lines are unchanged)
Circline clScale(Circline cl, float s) {
    if (clIsLine(cl)) return cl;
    return clCircle(cScale(clCenter(cl), s), clRadius(cl) * s);
}
