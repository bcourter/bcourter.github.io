// Render image as a background job.
//
// The viewer's progressive pass is one WGSL function, gsl_progressiveFragment,
// fed by a map of TSL nodes. buildRenderJob snapshots it: the function and
// everything it includes become one WGSL module, every uniform it takes is
// baked in as a literal at the value it has now, and every texture it takes
// is copied out to be bound again. A compute entry around it accumulates
// samples into a buffer instead of a render target.
//
// gsl-render-worker.js runs that module on its own WebGPU device, a tile at
// a time, and hands back a PNG. Nothing it uses is shared with the viewer, so
// orbiting, editing or recompiling while it runs cannot touch the image.
//
// The PNG is the model alone: no grid, outlines or section view. Its alpha is
// the pixel's coverage, so the background is transparent; a ray that leaves
// through glass shows the viewer's background colour, as on screen.

// First binding free for textures and samplers; 0-2 are the entry's own.
const FIRST_RESOURCE_BINDING = 3;

// collectWGSL returns the source of a wgslFn and everything it includes,
// each piece once, dependencies first.
export function collectWGSL(root) {
  const seen = new Set();
  const seenCode = new Set();
  const out = [];
  const visit = (n) => {
    // Up to r178 a wgslFn is a function carrying .functionNode; from r187 it is a Proxy
    // that reads every property through to its FunctionNode, so it stands for the node itself.
    if (typeof n === "function") n = n.functionNode ?? n;
    if (!n || seen.has(n)) return;
    seen.add(n);
    for (const inc of n.includes || []) visit(inc);
    if (n.code && !seenCode.has(n.code)) {
      seenCode.add(n.code);
      out.push(n.code);
    }
  };
  visit(root);
  return out.join("\n");
}

// parseParams reads `fn name(a: T, b: U, ...)` out of a WGSL source.
function parseParams(src, name) {
  const m = new RegExp(`\\bfn\\s+${name}\\s*\\(([^)]*)\\)`).exec(src);
  if (!m) throw new Error(`render job: fn ${name} not found`);
  return m[1].split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.indexOf(":");
    return { name: s.slice(0, i).trim(), type: s.slice(i + 1).trim() };
  });
}

function f32Literal(v) {
  let x = Number(v);
  if (!Number.isFinite(x)) x = Number.isNaN(x) ? 0 : Math.sign(x) * 3.4e38;
  const s = String(Math.fround(x));
  return /[.e]/.test(s) ? s : s + ".0";
}

// components flattens a uniform's value in WGSL order: vectors x y z w,
// colours r g b, matrices column-major (three's elements already are).
function components(v) {
  if (typeof v === "number" || typeof v === "boolean") return [Number(v)];
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v);
  if (v.isColor) return [v.r, v.g, v.b];
  if (v.isMatrix4 || v.isMatrix3) return Array.from(v.elements);
  if (v.isVector4 || v.isQuaternion) return [v.x, v.y, v.z, v.w];
  if (v.isVector3) return [v.x, v.y, v.z];
  if (v.isVector2) return [v.x, v.y];
  throw new Error("render job: cannot bake a uniform of this kind");
}

const TYPE_SIZE = {
  "f32": 1, "vec2<f32>": 2, "vec3<f32>": 3, "vec4<f32>": 4,
  "mat3x3<f32>": 9, "mat4x4<f32>": 16,
};

function bakeConst(name, type, value) {
  const n = TYPE_SIZE[type];
  if (!n) throw new Error(`render job: cannot bake ${name}: ${type}`);
  const c = components(value);
  if (c.length < n) throw new Error(`render job: ${name} has ${c.length} components, ${type} needs ${n}`);
  const lits = c.slice(0, n).map(f32Literal);
  return n === 1
    ? `const ${name}: f32 = ${lits[0]};`
    : `const ${name}: ${type} = ${type}(${lits.join(", ")});`;
}

// textureFormat picks the WebGPU format a Data3DTexture's bytes already are.
function textureFormat(tex) {
  const { data, width, height, depth } = tex.image;
  const channels = data.length / (width * height * depth);
  if (data instanceof Uint8Array && channels === 4) return "rgba8unorm";
  if (data instanceof Uint16Array && channels === 1) return "r16float";
  if (data instanceof Uint16Array && channels === 4) return "rgba16float";
  if (data instanceof Float32Array && channels === 1) return "r32float";
  if (data instanceof Float32Array && channels === 4) return "rgba32float";
  throw new Error("render job: unsupported 3D texture layout");
}

// snapshotCall turns a call to a wgslFn into one a compute entry can make
// without TSL: the function's source and everything it includes, and for each
// of its parameters an argument.
//   entryArgs  parameter name -> WGSL expression the entry supplies itself
//   overrides  parameter name -> value to bake instead of the node's own
//   params     the TSL nodes the function is otherwise called with
// A uniform is baked in as a const at its value, a 3D texture is copied out to
// be bound again (from firstBinding on, with a declaration for it), and a
// sampler becomes a linear, clamped one. Throws on a parameter it cannot bake.
export function snapshotCall({ fn, name, params = {}, overrides = {}, entryArgs = {}, firstBinding = 0 }) {
  const src = collectWGSL(fn);
  const decls = [];
  const args = [];
  const textures = [];
  const samplers = [];
  let binding = firstBinding;
  for (const p of parseParams(src, name)) {
    if (p.name in entryArgs) {
      args.push(entryArgs[p.name]);
      continue;
    }
    const g = `job_${p.name}`;
    args.push(g);
    const node = params[p.name];
    if (p.type.startsWith("texture_3d")) {
      const tex = node?.value;
      if (!tex?.image?.data) throw new Error(`render job: ${p.name} has no texture data`);
      const { data, width: w, height: h, depth: d } = tex.image;
      textures.push({ binding, format: textureFormat(tex), size: [w, h, d], data: data.slice() });
      decls.push(`@group(0) @binding(${binding++}) var ${g}: texture_3d<f32>;`);
    } else if (p.type === "sampler") {
      samplers.push({ binding });
      decls.push(`@group(0) @binding(${binding++}) var ${g}: sampler;`);
    } else {
      const value = p.name in overrides ? overrides[p.name] : node?.value;
      if (value == null) throw new Error(`render job: no value for ${p.name}`);
      decls.push(bakeConst(g, p.type, value));
    }
  }
  return { src, decls, args, textures, samplers };
}

// buildRenderJob snapshots the progressive pass for gsl-render-worker.js.
//   fn         the gsl_progressiveFragment wgslFn
//   params     the TSL nodes it is called with
//   overrides  values to bake instead of a node's current one (pixelScale,
//              which follows the output resolution)
//   width, height, samples
// Throws if the pass takes a parameter it cannot bake.
export function buildRenderJob({ fn, params, overrides = {}, width, height, samples }) {
  const name = "gsl_progressiveFragment";
  const { src, decls, args, textures, samplers } = snapshotCall({
    fn,
    name,
    params,
    overrides,
    entryArgs: { uv: "uv", prev: "jobAccum[i]", resolution: "job_resolution", frame: "f32(job.frame)" },
    firstBinding: FIRST_RESOURCE_BINDING,
  });

  const wgsl = `${src}

// ── render job ──
struct gsl_jobFrame {
    origin: vec2<u32>,   // the tile's top-left pixel
    size: vec2<u32>,     // the tile's size
    frame: u32,          // this sample's index
    samples: u32,        // the total, for coverage
    pad0: u32,
    pad1: u32,
}
@group(0) @binding(0) var<uniform> job: gsl_jobFrame;
@group(0) @binding(1) var<storage, read_write> jobAccum: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> jobPixels: array<u32>;
const job_resolution = vec2<f32>(${f32Literal(width)}, ${f32Literal(height)});
${decls.join("\n")}

@compute @workgroup_size(8, 8)
fn gsl_jobTrace(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= job.size.x || gid.y >= job.size.y) { return; }
    let i = gid.y * job.size.x + gid.x;
    let uv = (vec2<f32>(job.origin + gid.xy) + 0.5) / job_resolution;
    jobAccum[i] = ${name}(${args.join(", ")});
}

fn gsl_jobEncode(c: f32) -> f32 {
    let x = clamp(c, 0.0, 1.0);
    return select(1.055 * pow(x, 1.0 / 2.4) - 0.055, 12.92 * x, x <= 0.0031308);
}

// The composite's progressive colour, alone: the tone-mapped mean of the
// samples that hit, with coverage as alpha. Straight alpha, as PNG stores it.
@compute @workgroup_size(8, 8)
fn gsl_jobResolve(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= job.size.x || gid.y >= job.size.y) { return; }
    let i = gid.y * job.size.x + gid.x;
    let s = jobAccum[i];
    let rgb = gsl_tonemapPbrNeutral(s.rgb / max(s.a, 1.0));
    let a = clamp(s.a / f32(max(job.samples, 1u)), 0.0, 1.0);
    jobPixels[i] = pack4x8unorm(vec4<f32>(gsl_jobEncode(rgb.r), gsl_jobEncode(rgb.g), gsl_jobEncode(rgb.b), a));
}
`;
  return { wgsl, textures, samplers, width, height, samples };
}

// RenderJob runs one job in a worker. Callbacks:
//   onProgress(done, total)  samples done, summed over tiles
//   onDone(blob)             the PNG
//   onError(message)
export class RenderJob {
  constructor(job, { onProgress, onDone, onError }) {
    this.worker = new Worker(new URL("./gsl-render-worker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.(data.done, data.total);
      else if (data.type === "done") { this.finish(); onDone?.(data.blob); }
      else if (data.type === "error") { this.finish(); onError?.(data.message); }
    };
    this.worker.onerror = (e) => { this.finish(); onError?.(e.message || "render worker failed"); };
    this.worker.postMessage({ type: "start", job });
  }

  // cancel stops the job; no callback follows.
  cancel() { this.finish(); }

  finish() {
    this.worker?.terminate();
    this.worker = null;
  }
}
