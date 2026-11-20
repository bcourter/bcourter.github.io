// Runs a render job from gsl-render-job.js on its own WebGPU device.
//
// The image is traced a tile at a time: every sample of one tile, then the
// next, so the accumulation buffer is one tile's worth at any output size.
// Samples go to the GPU in small batches, each awaited before the next, and
// a batch's size adapts to hold it near BATCH_TARGET_MS. The viewer shares
// the GPU, so short batches are what keep it responsive while this runs.
//
// Messages out: {type: "progress", done, total}, {type: "done", blob},
// {type: "error", message}.

const TILE = 256;
const BATCH_TARGET_MS = 12;
const MAX_BATCH = 64;
const FRAME_STRIDE = 256;   // minUniformBufferOffsetAlignment's usual value

self.onmessage = async ({ data }) => {
  if (data.type !== "start") return;
  try {
    const blob = await run(data.job);
    self.postMessage({ type: "done", blob });
  } catch (e) {
    self.postMessage({ type: "error", message: e?.message || String(e) });
  }
};

async function run(job) {
  const { width, height, samples } = job;
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("no WebGPU adapter in the render worker");
  const device = await adapter.requestDevice();
  let lost = null;
  device.lost.then((info) => { lost = info.message || "device lost"; });

  device.pushErrorScope("validation");
  const module = device.createShaderModule({ code: job.wgsl });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === "error");
  if (errors.length) {
    throw new Error("render shader: " + errors.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join("; "));
  }

  const entries = [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
  ];
  const resources = [];
  for (const t of job.textures) {
    const tex = device.createTexture({
      size: t.size, dimension: "3d", format: t.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    const bpp = t.data.BYTES_PER_ELEMENT * (t.format.startsWith("rgba") ? 4 : 1);
    device.queue.writeTexture({ texture: tex }, t.data,
      { bytesPerRow: t.size[0] * bpp, rowsPerImage: t.size[1] }, t.size);
    const sampleType = t.format.endsWith("32float") ? "unfilterable-float" : "float";
    entries.push({ binding: t.binding, visibility: GPUShaderStage.COMPUTE, texture: { sampleType, viewDimension: "3d" } });
    resources.push({ binding: t.binding, resource: tex.createView() });
  }
  if (job.samplers.length) {
    const smp = device.createSampler({
      magFilter: "linear", minFilter: "linear",
      addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", addressModeW: "clamp-to-edge",
    });
    for (const s of job.samplers) {
      entries.push({ binding: s.binding, visibility: GPUShaderStage.COMPUTE, sampler: { type: "filtering" } });
      resources.push({ binding: s.binding, resource: smp });
    }
  }
  const layout = device.createBindGroupLayout({ entries });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const [trace, resolve] = await Promise.all(["gsl_jobTrace", "gsl_jobResolve"].map((entryPoint) =>
    device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint } })));

  const frames = device.createBuffer({ size: FRAME_STRIDE * (MAX_BATCH + 1), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const accum = device.createBuffer({ size: TILE * TILE * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const pixels = device.createBuffer({ size: TILE * TILE * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readback = device.createBuffer({ size: TILE * TILE * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: frames, size: 32 } },
      { binding: 1, resource: { buffer: accum } },
      { binding: 2, resource: { buffer: pixels } },
      ...resources,
    ],
  });
  const setupError = await device.popErrorScope();
  if (setupError) throw new Error("render setup: " + setupError.message);

  const image = new Uint8ClampedArray(width * height * 4);
  const tiles = [];
  for (let y = 0; y < height; y += TILE) {
    for (let x = 0; x < width; x += TILE) {
      tiles.push([x, y, Math.min(TILE, width - x), Math.min(TILE, height - y)]);
    }
  }
  const total = tiles.length * samples;
  const frameData = new Uint32Array(FRAME_STRIDE / 4 * (MAX_BATCH + 1));
  let batch = 1;
  let done = 0;
  let lastReport = 0;

  for (const [x, y, w, h] of tiles) {
    const groups = [Math.ceil(w / 8), Math.ceil(h / 8)];
    const setFrame = (slot, frame) => {
      frameData.set([x, y, w, h, frame, samples, 0, 0], slot * FRAME_STRIDE / 4);
    };
    {
      const enc = device.createCommandEncoder();
      enc.clearBuffer(accum);
      device.queue.submit([enc.finish()]);
    }
    for (let s = 0; s < samples;) {
      const n = Math.min(batch, samples - s);
      for (let k = 0; k < n; k++) setFrame(k, s + k);
      device.queue.writeBuffer(frames, 0, frameData, 0, n * FRAME_STRIDE / 4);
      const enc = device.createCommandEncoder();
      for (let k = 0; k < n; k++) {
        const pass = enc.beginComputePass();
        pass.setPipeline(trace);
        pass.setBindGroup(0, bindGroup, [k * FRAME_STRIDE]);
        pass.dispatchWorkgroups(groups[0], groups[1]);
        pass.end();
      }
      const t0 = performance.now();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      if (lost) throw new Error("render worker: " + lost);
      const ms = performance.now() - t0;
      batch = Math.max(1, Math.min(MAX_BATCH, Math.round(n * BATCH_TARGET_MS / Math.max(ms, 0.5))));
      s += n;
      done += n;
      const now = performance.now();
      if (now - lastReport > 100) {
        lastReport = now;
        self.postMessage({ type: "progress", done, total });
      }
    }

    // Resolve the tile and copy it into the image.
    setFrame(MAX_BATCH, samples);
    device.queue.writeBuffer(frames, MAX_BATCH * FRAME_STRIDE, frameData, MAX_BATCH * FRAME_STRIDE / 4, 8);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(resolve);
    pass.setBindGroup(0, bindGroup, [MAX_BATCH * FRAME_STRIDE]);
    pass.dispatchWorkgroups(groups[0], groups[1]);
    pass.end();
    enc.copyBufferToBuffer(pixels, 0, readback, 0, w * h * 4);
    device.queue.submit([enc.finish()]);
    await readback.mapAsync(GPUMapMode.READ, 0, w * h * 4);
    const src = new Uint8Array(readback.getMappedRange(0, w * h * 4));
    for (let r = 0; r < h; r++) {
      image.set(src.subarray(r * w * 4, (r + 1) * w * 4), ((y + r) * width + x) * 4);
    }
    readback.unmap();
  }
  self.postMessage({ type: "progress", done: total, total });

  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").putImageData(new ImageData(image, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  device.destroy();
  return blob;
}
