// Transparency and refraction for the GSL raymarch viewer, by marching the
// refracted ray through the same SDF.
//
// A hit whose material has transmission (the `volume.x` row of the material
// record) is shaded in two parts. The surface itself contributes its specular
// lobes, its residual (1 - T) diffuse and its emission (gsl_shadeLinear). The
// transmitted part is found by refracting the view ray into the solid and
// marching it: the same gradient-corrected sphere trace the primary ray uses,
// started inside the glass, stops at whichever comes first, the glass's own
// exit or the surface of a part embedded in it. At an exit the path is tinted
// by Beer-Lambert absorption over the thickness just crossed and refracted
// out (or reflected back in under total internal reflection); at an entry the
// surface is shaded and, if it is itself transmissive, entered. A ray that
// escapes shows the viewer's flat background. Everything is summed in linear
// light and tone mapped once. Rough interfaces jitter the microfacet normal
// over a few samples per pixel.
//
// Both functions call the compiled sdShape, so they carry the viewer's
// injected parameter suffix the way gsl_calcNormal does; the viewer wraps the
// strings in wgslFn after running its injectExtraArgs over the call sites.
// Reflections are the specular lobes of gsl_shadeLinear (the lights and the
// hemisphere along R); the refracted ray does not spawn a reflected one.

// The result of a secondary march; host-declared like gsl_shape.
export const GSL_SECONDARY_HIT_STRUCT_WGSL = `
struct gsl_secondaryHit {
    pos: vec3<f32>,
    sd: gsl_shape,
    t: f32,
    hit: f32,   // 1 = a surface was found, 0 = the ray escaped the scene
}
`;

// marchSecondaryWGSL returns the source of
//
//   fn gsl_marchSecondary(origin, dir, tStart, worldExtent, pixelScale,
//                         camOrtho, camDist, maxSteps, time, <suffix>) -> gsl_secondaryHit
//
// the primary loop's algorithm (a sphere trace on |d| with the tet-gradient
// step correction and bisection on a same-shape sign change), started tStart
// along the ray so it does not re-find the surface it leaves, and stopped at
// the scene's bounding box. camDist is the camera distance of the origin, so
// the pixel-footprint epsilons continue from the primary ray's.
//
// parts is whether the program has parts: while this march runs, a part far
// from the ray reads as its box (backend/wgsl/internal/codegen/vanish.go), as in
// the primary march, and whatever the margin was is restored after it.
// displace widens that margin by the reach of displacement, which moves the
// surface off the undisplaced part its box bounds.
//
// With displace the march pays for the displaced field only within nearMargin
// of a surface, as the primary march does: far from one the undisplaced field
// steps as safely and costs a fraction, a displaced sample evaluating the
// material five times a step. Marching it everywhere made the path tracer lose
// the GPU device on sand cast. The caller passes the source unrenamed, and
// extraArgsWGSL for the gsl_displaceSample calls, which injectExtraArgs does
// not know.
export function marchSecondaryWGSL(extraParamsWGSL, { parts = false, displace = false, nearMargin = "4.0", extraArgsWGSL = "" } = {}) {
  const sample = (pos, name) => displace
    ? `let ${name}Plain = sdShape(${pos}, time);
        var ${name} = ${name}Plain;
        if (near) { ${name} = gsl_displaceSample(${pos}, ${name}Plain, time${extraArgsWGSL}); }`
    : `let ${name} = sdShape(${pos}, time);`;
  return `
fn gsl_marchSecondary(
    origin: vec3<f32>,
    dir: vec3<f32>,
    tStart: f32,
    worldExtent: f32,
    pixelScale: f32,
    camOrtho: f32,
    camDist: f32,
    maxSteps: u32,
    time: f32${extraParamsWGSL}
) -> gsl_secondaryHit {
    var res: gsl_secondaryHit;
    res.hit = 0.0;
    res.t = tStart;

    // Leave at the scene's bounding box.
    let boxMin = vec3<f32>(-worldExtent);
    let boxMax = vec3<f32>(worldExtent);
    let invRd = 1.0 / dir;
    let t1 = (boxMin - origin) * invRd;
    let t2 = (boxMax - origin) * invRd;
    let tMax = max(t1, t2);
    let tExit = min(min(tMax.x, tMax.y), tMax.z);
    if (tExit <= tStart) { return res; }

    let baseGradEps = 0.0001;
    let baseHitEps = 0.001;
    let fudge = 0.8;
    let jumpSlack = 4.0;   // see crossed below
    let k0 = vec3<f32>( 1.0, -1.0, -1.0);
    let k1 = vec3<f32>(-1.0, -1.0,  1.0);
    let k2 = vec3<f32>(-1.0,  1.0, -1.0);
    let k3 = vec3<f32>( 1.0,  1.0,  1.0);
    // The taps as one list, so the gradient below calls sdShape once in a
    // loop: the GPU compiler inlines sdShape at every call site.
    let kTaps = array<vec3<f32>, 4>(k0, k1, k2, k3);
${parts ? `
    // Past four pixels at the far end of the ray, and never under eight hit
    // tolerances${displace ? ", plus the reach of displacement (gsl_dispNearMargin)" : ""}.
    let marginWas = gsl_vanishView.w;
    gsl_vanishView.w = ${displace ? "4.0 + " : ""}max(baseHitEps * 8.0, pixelScale * mix(max(camDist + tExit, 1.0), 1.0, camOrtho) * 4.0);
` : ""}

    var t = tStart;
    var prev_t = t;
    // Only read once a step has been taken (crossed needs t > prev_t), by
    // which time it holds that step's sample.
    var prevSd: gsl_shape;
    var prevGradMag = 1.0;
    for (var i = 0u; i < 1024u; i = i + 1u) {
        if (i >= maxSteps || t > tExit) { break; }
        let p = origin + dir * t;
        ${displace ? `let plain = sdShape(p, time);
        let near = gsl_dispScale != 0.0 && abs(plain.distance) < ${nearMargin};
        var sd = plain;
        if (near) { sd = gsl_displaceSample(p, plain, time${extraArgsWGSL}); }` : "let sd = sdShape(p, time);"}
        let pixelWorld = pixelScale * mix(max(camDist + t, 1.0), 1.0, camOrtho);
        let hitEps = max(baseHitEps, pixelWorld * 0.5);
        if (abs(sd.distance) < hitEps) {
            res.pos = p;
            res.sd = sd;
            res.t = t;
            res.hit = 1.0;
            break;
        }
        // A sign change of the same shape is an overshoot to bisect back
        // from, unless the samples are too far from zero for the field to
        // cross it between them, as the primary march decides: then the
        // field steps across 0 there, and the march steps on.
        let crossed = sd.shapeIndex == prevSd.shapeIndex
            && (sd.distance < 0.0) != (prevSd.distance < 0.0)
            && t > prev_t
            && abs(prevSd.distance) + abs(sd.distance) <= jumpSlack * prevGradMag * (t - prev_t);
        if (crossed) {
            t = (prev_t + t) * 0.5;
        } else {
            let ge = max(baseGradEps, pixelWorld * 0.025);
            var g = vec3<f32>(0.0);
            for (var k = 0u; k < 4u; k = k + 1u) {
                ${sample("p + kTaps[k] * ge", "tap")}
                g = g + kTaps[k] * tap.distance;
            }
            let gradMag = max(length(g) / (4.0 * ge), 1.0);
            prev_t = t;
            prevSd = sd;
            prevGradMag = gradMag;
            t = t + abs(sd.distance) / gradMag * fudge;
        }
    }
    ${parts ? "gsl_vanishView.w = marginWas;" : ""}
    return res;
}
`;
}

// shadeGlassWGSL returns the source of
//
//   fn gsl_shadeGlass(hitPos, localNormal, viewDirWorld, baseColor, mat,
//                     aoFactor, zUpToView, skyCol, groundCol, knobs, glassKnobs,
//                     bgColor, pixelScale, camOrtho, worldExtent, camPos, uv,
//                     time, <palette colours>, <suffix>) -> vec3<f32>
//
// the tone-mapped colour of a front-face hit on a transmissive material. The
// caller supplies how a secondary hit's colour and material are looked up,
// since those depend on what the program authored:
//
//   colorStmt(name, pos, sd)  WGSL statements binding `let <name>` to the
//                             authored or palette colour at pos
//   materialAt(pos, sd)       WGSL expression for the material record at pos
//   colorParamsWGSL           the palette parameters (`c1: vec3<f32>, ...`),
//                             forwarded so the palette lookup can run here
//   extraArgsWGSL             the injected arguments, appended to the
//                             gsl_marchSecondary call here (the viewer's
//                             injectExtraArgs only knows the compiler's
//                             functions and gsl_calcNormal)
//
// Loop bounds are literal (WGSL needs them) and the live knobs cut them
// short: glassKnobs = (samples, cone scale, bounces, steps).
export function shadeGlassWGSL({ extraParamsWGSL, extraArgsWGSL, colorParamsWGSL, colorStmt, materialAt }) {
  const colorParams = colorParamsWGSL ? `,\n    ${colorParamsWGSL}` : "";
  return `
fn gsl_shadeGlass(
    hitPos: vec3<f32>,
    localNormal: vec3<f32>,
    viewDirWorld: vec3<f32>,
    baseColor: vec3<f32>,
    mat: gsl_material,
    aoFactor: f32,
    zUpToView: mat4x4<f32>,
    skyCol: vec3<f32>,
    groundCol: vec3<f32>,
    knobs: vec4<f32>,
    glassKnobs: vec4<f32>,
    bgColor: vec3<f32>,
    pixelScale: f32,
    camOrtho: f32,
    worldExtent: f32,
    camPos: vec3<f32>,
    uv: vec2<f32>,
    time: f32${colorParams}${extraParamsWGSL}
) -> vec3<f32> {
    let maxSamples = u32(clamp(glassKnobs.x, 1.0, 16.0));
    let coneScale = max(glassKnobs.y, 0.0);
    let maxBounces = u32(clamp(glassKnobs.z, 1.0, 8.0));
    let maxSteps = u32(clamp(glassKnobs.w, 8.0, 1024.0));
    let baseStepEps = 0.002;
    let baseGradEps = 0.0001;

    // What the surface itself contributes: specular, residual diffuse, emission.
    let local = gsl_shadeLinear(hitPos, localNormal, viewDirWorld, baseColor, mat, aoFactor,
                                zUpToView, skyCol, groundCol, knobs);

    let T0 = clamp(mat.volume.x, 0.0, 1.0);
    let rough0 = clamp(mat.surface.x, 0.0, 1.0) * coneScale;
    let ior0 = max(mat.surface.z, 1.0);
    let NoV0 = max(dot(localNormal, viewDirWorld), 1e-4);
    let enter0 = T0 * gsl_transmitWeight(NoV0, mat, baseColor);
    let camDist0 = length(hitPos - camPos);
    let seed = uv * 1024.0;

    // A smooth interface needs one ray; a rough one dithers over several.
    let nSamples = select(1u, maxSamples, rough0 > 0.02);

    // Behind a rough interface the jittered rays spread whatever lies beyond
    // it, so no relief there can be seen, and those rays march the undisplaced
    // field. A displaced step pays for the relief five times over, and a body
    // like coffee under sand cast ran the frame past the GPU's watchdog: the
    // device was lost and the view stayed black. The rays start below the
    // relief at the hit, so they do not find the undisplaced surface above it.
    let dispWas = gsl_dispScale;
    // The material's own roughness, not the cone the jitter is scaled by: a
    // draft that turns the cone off still sees through a rough surface.
    let roughInterface = mat.surface.x > 0.02;
    let reliefDepth = select(0.0, abs(mat.volume.z) * dispWas, roughInterface);
    if (roughInterface) { gsl_dispScale = 0.0; }
    var radiance = vec3<f32>(0.0);   // scene-referred light arriving through the glass
    var bgWeight = vec3<f32>(0.0);   // throughput of rays that escaped to the background

    for (var s = 0u; s < 16u; s = s + 1u) {
        if (s >= nSamples) { break; }
        var throughput = enter0;

        // Refract into the solid about a jittered microfacet normal; a facet
        // the view ray cannot see falls back to the true normal.
        let n0j = gsl_ggxNormal(localNormal, rough0, gsl_hash2(seed, f32(s)));
        let n0 = select(localNormal, n0j, dot(viewDirWorld, n0j) > 0.0);
        var dir = refract(-viewDirWorld, n0, 1.0 / ior0);
        if (dot(dir, dir) < 1e-6) { dir = reflect(-viewDirWorld, n0); }
        // Start off the surface along the normal, not just along the ray: the
        // march declares a hit within an epsilon of a surface, and an
        // along-ray offset shrinks to nothing at grazing angles, so the ray
        // would re-find the interface it just left and burn a bounce on it.
        var origin = hitPos - localNormal * (gsl_surfaceOffset(camDist0, pixelScale, camOrtho) + reliefDepth);
        var camDist = camDist0;
        var ior = ior0;   // index of the medium the ray is in (1 = air)

        for (var b = 0u; b < 8u; b = b + 1u) {
            if (b >= maxBounces) { bgWeight = bgWeight + throughput; break; }
            let pw = pixelScale * mix(max(camDist, 1.0), 1.0, camOrtho);
            let h = gsl_marchSecondary(origin, dir, max(baseStepEps, pw * 0.5), worldExtent,
                                       pixelScale, camOrtho, camDist, maxSteps, time${extraArgsWGSL});
            if (h.hit < 0.5) { bgWeight = bgWeight + throughput; break; }

            camDist = camDist + h.t;
            let surfOff = gsl_surfaceOffset(camDist, pixelScale, camOrtho);
            let normalEps = max(baseGradEps, pixelScale * mix(max(camDist, 1.0), 1.0, camOrtho) * 0.05);
            let nRaw = gsl_calcNormal(h.pos, time, normalEps);
            ${colorStmt("hColor", "h.pos", "h.sd")}
            let hMat = ${materialAt("h.pos", "h.sd")};
            let hT = clamp(hMat.volume.x, 0.0, 1.0);
            let hRough = clamp(hMat.surface.x, 0.0, 1.0) * coneScale;
            let hIor = max(hMat.surface.z, 1.0);
            let xi = gsl_hash2(seed + vec2<f32>(f32(b) + 1.0, 0.0), f32(s));

            if (dot(dir, nRaw) > 0.0) {
                // Leaving the solid: tint by the path just crossed, pay the
                // exit Fresnel, refract out or reflect back in.
                throughput = throughput * gsl_absorb(hColor, h.t, hMat.volume.y);
                let nIn = -nRaw;   // faces the arriving ray
                let nj = gsl_ggxNormal(nIn, hRough, xi);
                let n = select(nIn, nj, dot(dir, nj) < 0.0);
                let NoV = max(-dot(n, dir), 1e-4);
                throughput = throughput * gsl_transmitWeight(NoV, hMat, hColor);
                var out = refract(dir, n, ior);
                if (dot(out, out) < 1e-6) {
                    out = reflect(dir, n);   // total internal reflection: stay inside
                } else {
                    ior = 1.0;
                }
                dir = out;
                // Off the surface on whichever side the outgoing ray leaves,
                // so total internal reflection restarts inside the solid.
                origin = h.pos + nRaw * select(-surfOff, surfOff, dot(out, nRaw) > 0.0);
            } else {
                // Entering a surface: it is lit like any other, and entered
                // when it is itself transmissive.
                let hView = -dir;
                radiance = radiance + throughput * gsl_shadeLinear(h.pos, nRaw, hView, hColor, hMat, 1.0,
                                                                   zUpToView, skyCol, groundCol, knobs);
                if (hT <= 0.0) { break; }
                let nj = gsl_ggxNormal(nRaw, hRough, xi);
                let n = select(nRaw, nj, dot(hView, nj) > 0.0);
                let NoV = max(dot(n, hView), 1e-4);
                throughput = throughput * hT * gsl_transmitWeight(NoV, hMat, hColor);
                var into = refract(dir, n, ior / hIor);
                if (dot(into, into) < 1e-6) {
                    into = reflect(dir, n);
                } else {
                    ior = hIor;
                }
                dir = into;
                origin = h.pos + nRaw * select(-surfOff, surfOff, dot(into, nRaw) > 0.0);
            }
        }
    }

    gsl_dispScale = dispWas;

    // The scene is tone mapped; the background is already display-referred.
    let inv = 1.0 / f32(nSamples);
    return gsl_tonemapPbrNeutral(local + radiance * inv) + bgWeight * inv * bgColor;
}

// How far off a surface a secondary ray starts, along the normal: twice the
// distance within which the march declares a hit at this pixel footprint, so
// the ray cannot re-find the interface it just left. Sub-pixel by
// construction, which is also why a wall thinner than this is punched through.
fn gsl_surfaceOffset(camDist: f32, pixelScale: f32, camOrtho: f32) -> f32 {
    let pixelWorld = pixelScale * mix(max(camDist, 1.0), 1.0, camOrtho);
    return 2.0 * max(0.001, pixelWorld * 0.5);
}
`;
}
