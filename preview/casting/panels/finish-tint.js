// A finish's swatch in a body's own colour.
//
// A finish carries no colour, so its swatch is rendered against a stand-in
// grey — which says nothing about how it will look on the body it is about to
// go on. Rendering every finish in every colour is not possible ahead of time,
// but it is not needed: before tone mapping, a render is linear in the albedo.
// Diffuse light is the albedo times the light, and a metal's reflectance is its
// albedo. So tool/materialswatch renders each finish twice, with albedo 0 and
// albedo 1, keeping the radiance before tone mapping, and any colour a is
//
//	radiance(a) = R0 + a * (R1 - R0)      (per channel, linear light)
//
// which is then tone-mapped and encoded exactly as the renderer does
// (internal/fidget/internal/mesh/litrender.go: litTonemapPbrNeutral,
// litEncodeDisplay, toByte). tool/materialswatch's TestTintedFinishIsARender
// holds this to a direct render of the finish in that colour.
//
// Pure functions of arrays, so the arithmetic is testable without a browser.

// srgbToLinear is litSrgbToLinear: the exact sRGB transfer function.
export function srgbToLinear(v) {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// encodeDisplay is litEncodeDisplay, one channel.
function encodeDisplay(v) {
    v = Math.min(Math.max(v, 0), 1);
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// toByte is the renderer's toByte.
function toByte(v) {
    return Math.floor(Math.min(Math.max(v, 0), 1) * 255 + 0.5);
}

// tonemapPbrNeutral is litTonemapPbrNeutral, the Khronos PBR Neutral tone
// mapper.
export function tonemapPbrNeutral(c) {
    const startCompression = 0.8 - 0.04;
    const desaturation = 0.15;
    const x = Math.min(c[0], c[1], c[2]);
    const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    let color = [c[0] - offset, c[1] - offset, c[2] - offset];
    const peak = Math.max(color[0], color[1], color[2]);
    if (peak < startCompression) return color;
    const d = 1 - startCompression;
    const newPeak = 1 - (d * d) / (peak + d - startCompression);
    color = color.map((v) => v * (newPeak / peak));
    const g = 1 - 1 / (desaturation * (peak - newPeak) + 1);
    return color.map((v) => v + (newPeak - v) * g);
}

// halfToFloat decodes one IEEE 754 half, the form the basis is stored in.
export function halfToFloat(h) {
    const sign = h & 0x8000 ? -1 : 1;
    const exp = (h >> 10) & 0x1f;
    const frac = h & 0x3ff;
    if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024);
    if (exp === 31) return frac ? NaN : sign * Infinity;
    return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

// tintFinish draws a finish in an sRGB colour. r0 and r1 are the two renders'
// radiance, three halves per pixel (Uint16Array); background is the swatch's
// own pixels, RGBA (Uint8ClampedArray), used where the sphere was not hit —
// the ground, which the sphere's colour does not reach. Returns RGBA.
export function tintFinish(r0, r1, background, rgb) {
    const a = rgb.map(srgbToLinear);
    const n = background.length / 4;
    const out = new Uint8ClampedArray(background.length);
    for (let i = 0; i < n; i++) {
        const lo = [0, 1, 2].map((k) => halfToFloat(r0[3 * i + k]));
        const hi = [0, 1, 2].map((k) => halfToFloat(r1[3 * i + k]));
        const hit = hi[0] !== 0 || hi[1] !== 0 || hi[2] !== 0 || lo[0] !== 0 || lo[1] !== 0 || lo[2] !== 0;
        if (!hit) {
            for (let k = 0; k < 4; k++) out[4 * i + k] = background[4 * i + k];
            continue;
        }
        const shown = tonemapPbrNeutral([0, 1, 2].map((k) => lo[k] + a[k] * (hi[k] - lo[k])));
        for (let k = 0; k < 3; k++) out[4 * i + k] = toByte(encodeDisplay(shown[k]));
        out[4 * i + 3] = 255;
    }
    return out;
}
