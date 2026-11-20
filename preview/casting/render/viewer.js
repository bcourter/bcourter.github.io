import * as THREE from "three";
import eventManager from "../ui/event-manager.js";
import { uniform, wgslFn, texture as tslTexture, texture3D, sampler as tslSampler, viewportUV } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineSegments2 } from "three/addons/lines/webgpu/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { GslUiControls } from "./gsl-ui.js";
import { OrthoViewHelper, ViewCameraRig, bindFieldOfView } from "./ortho-view-helper.js";
import { DRAFT_SCALE, FrameRateMeter, MotionTracker, withDraftKnobs, bindTierButtons, getRestTier, getAperture, bindRenderControls, showRenderProgress, getImageScale } from "./gsl-render-tier.js";
import { traceKnobsU, lensKnobsU, traceFlagsU, TRACE_STANDARD_WEIGHT, LENS_RADIUS_AT_FULL, FINAL_RENDER_SAMPLES } from "./gsl-trace.js";
import { buildRenderJob, RenderJob } from "./gsl-render-job.js";
import { showNotification } from "../ui/notification.js";
import { buildRenderGraph, gsl_shape, gsl_material, gsl_fieldFilterNode } from "./gsl-render-graph.js";
import { GSL_SHADING_WGSL, shadingKnobsU, glassKnobsU, surfaceKnobsU, renderKnobsU, BACK_FACE_DIM, onShadingChange, srgbEncode, detailKnobsU, detailKnobs2U } from "./gsl-shading.js";
import { bindDetailSlider, showPartSizes } from "../panels/detail-slider.js";
import { createPartBoxes, partSizesPx } from "./part-view.js";
import { envAU, envBU, envCU, onEnvironmentChange, bindEnvironmentControls, followCamera } from "./gsl-environment.js";
import { visAssignWGSL } from "./gsl-visibility.js";

// ── Constants ──

// Cosine palette (Quilez): a + b * cos(2π(c*t + d))
// a=(0.5,0.5,0.5) b=(0.5,0.5,0.5) c=(1.0,1.0,1.0) d=(0.3,0.2,0.2)
function cosinePalette(t) {
  const a = [0.5, 0.5, 0.5];
  const b = [0.5, 0.5, 0.5];
  const c = [1.0, 1.0, 1.0];
  const d = [0.0, 0.33, 0.67];
  return a.map((ai, i) =>
    Math.max(
      0,
      Math.min(1, ai + b[i] * Math.cos(2 * Math.PI * (c[i] * t + d[i]))),
    ),
  ).map(srgbEncode); // displays as it did before linear-light shading (see srgbEncode)
}

const DRAG_THRESHOLD = 3; // pixels — distinguishes click from drag
const WORLD_EXTENT = 200; // default half-size of the bounding volume and grid
// Mutable current half-extent, adjustable via the Scene panel. This is a domain
// bound, not a geometry scale.
let worldExtent = WORLD_EXTENT;
// Grid line spacing in millimeters (the scene's units) — adjustable via the
// Scene panel. Absolute, so it survives a Scene Size change unchanged; the
// number of divisions across the width is what follows from it.
let gridSpacing = (2 * WORLD_EXTENT) / 20;
const BG_COLOR = new THREE.Color(0x1e1e1e);

// ── State ──

let camera, scene, renderer, controls, zUpWorld, uiScene, uiZUpWorld;
let gslUiControls, orthoViewHelper, cameraRig;
let shapeScene, shapeCam, shapeTarget, mainTarget;
// draftTarget takes the shape pass while the view moves; shapeTexNode is the
// composite's handle on whichever of the two was drawn last.
let draftTarget, shapeTexNode;
// The progressive tier (gsl-trace.js): ptScene draws one path per pixel and
// adds it to the running sum, which ping-pongs between the two accumTargets.
// accumN counts the samples in the sum; while it is 0 the composite shows the
// standard frame. accumDirty asks the next render to start the sum over.
let ptScene, accumPrevNode, accumTexNode;
let accumTargets = [];
let accumIdx = 0;
let accumN = 0;
let accumDirty = true;
let accumRunning = false;
let traceAvailable = false;
// The progressive pass as a Render image job snapshots it: the wgslFn and
// the TSL nodes it is called with. null when there is no such pass.
let ptJobSource = null;
// A running Render image (gsl-render-job.js), or null.
let renderJob = null;
// The Simple tier's pass (gsl-simple.js), drawn in place of the standard one.
let simpleScene;
// The Color tier's pass: the standard frame without the program's materials.
let colorScene;
// The depth-of-field focus the Focus tool picked (Z-up world), or null to
// focus on the orbit pivot; focusToolOn while the tool waits for its click.
let focusPointZUp = null;
let focusToolOn = false;
const accumNU = uniform(0);
const accumFrameU = uniform(0);
const accumResU = uniform(new THREE.Vector2(1, 1));
let fieldScene, fieldCam, fieldTarget, fieldMaterial;
let meshScene, meshZUpWorld, meshTarget;
let compositeScene, compositeCamera;

const meshGeometries = new Map(); // index -> { geometry, label } (uploaded, not in scene)
let nextMeshIndex = 0;             // monotonic per-session counter; removed slots stay vacant
const meshInstances = [];          // active scene objects: [{ mesh, material }]
let currentUiControls = [];
const uiMeshInstancesBySpan = new Map();
const identityMatrixArray = new THREE.Matrix4().elements.slice();
// Per-body placement: the mesh(index, pos, scale, rot) transform (part frame ->
// GSL/world), so resolved topology points land where the body is displayed.
const meshBodyXform = new Map();   // body index -> THREE.Matrix4

let renderPending = false;
let renderDisabled = false;
let renderErrMsg = ""
let lastFrameTime = 0;
const animFrameMs = 1000 / 30; // cap animation loop at 30fps
let animPaused = true;
let pauseStartMs = performance.now();   // performance.now() when last paused
let timeOffsetMs = 0;   // total ms to subtract (accumulated pauses + manual seeks)
// @duration: how long the document says its animation runs, in seconds. The
// clock starts over on passing it. 0 means the document names none, and the
// clock runs on. Declared up here with the rest of the clock: the first frame
// is drawn before the functions below are reached.
let loopSeconds = 0;
const fieldEnabledU = uniform(0.0);
const fieldHeightU = uniform(0.0);
const fieldNormalU = uniform(new THREE.Vector3(0, 0, 1));
const fieldIntervalU = uniform(0.25); // matches the panel default
const fieldFadeU = uniform(5.0); // matches the panel default (half of fade max)
const modelOpacityU = uniform(1.0);
const sectionOpacityU = uniform(0.25);
const fieldUnionU = uniform(0.0); // off by default — draw each shape's field independently
const fieldExternalU = uniform(1.0); // on by default — show external (dist>0) interval curves
const bgColorU = uniform(new THREE.Vector3(BG_COLOR.r, BG_COLOR.g, BG_COLOR.b));
let currentWGSL = "";
let currentShapeCount = 0;
// Slider uniforms keyed by the variable name in the GSL source. main.js
// writes .value on slider drag — the uniforms are threaded through every
// WGSL function that calls sdShape (gsl_calcNormal, the two fragment
// shaders) so the new value lands in sdShape's lifted-literal parameter
// on the next frame, no recompile.
const sliderUniformsByVar = new Map();
const uiUniformsByParam = new Map();
let frameCount = 0;
let lastLogTime = 0;
const startTimeMs = performance.now();
const timeU = uniform(0.0);
let mouseDownPos = null;
let hoverPending = false;
let outlinesEnabled = true;
let savedSelectedShape = 0;
// The Render panel's Resolution: a factor on the device pixel ratio.
let renderScale = 1;

const gsl_shapeColors = new Map();
const shapeVisibles = new Map();
const selectedShapeVec = new THREE.Vector2(0, 0);
const hoveredShapeVec = new THREE.Vector2(0, 0);
const compositePixelSizeVec = new THREE.Vector2();

const container = document.getElementById("canvas-container");

function effectivePixelRatio() {
  return window.devicePixelRatio * renderScale;
}

function setActiveCamera(next) {
  camera = next;
  if (controls) controls.object = next;
  if (gslUiControls) gslUiControls.setCamera(next);
  if (orthoViewHelper) orthoViewHelper.camera = next;
}

function cameraAspect() {
  return container.clientWidth / Math.max(container.clientHeight, 1);
}

// Corner-on view of an origin-centered box of half-size `extent`, looking at the
// origin from a distance of sqrt(3) * extent. This is the framing the viewer has
// always opened with; expressing it in terms of the extent lets a document's
// Scene Size drive the camera instead of a fixed default.
function framingPosition(extent) {
  return new THREE.Vector3(extent, extent, extent);
}

// ── Scene setup ──

camera = new THREE.PerspectiveCamera(
  50,
  container.clientWidth / container.clientHeight,
  0.01,
  100,
);
camera.position.copy(framingPosition(WORLD_EXTENT));

scene = new THREE.Scene();
scene.background = BG_COLOR;

// Z-up world: rotate Y-up (three.js default) so Z points up
zUpWorld = new THREE.Group();
zUpWorld.rotation.x = -Math.PI / 2;
scene.add(zUpWorld);

// The parts the program reports, and their boxes, drawn in the Z-up world when
// shown (part-view.js, setParts).
let currentParts = [];
const partBoxes = createPartBoxes();
zUpWorld.add(partBoxes.object);

uiScene = new THREE.Scene();
uiZUpWorld = new THREE.Group();
uiZUpWorld.rotation.copy(zUpWorld.rotation);
uiScene.add(uiZUpWorld);

// Ceiling on the line count, so a fine mm grid in a very large scene degrades
// to a coarser one instead of building millions of segments.
const MAX_GRID_DIVISIONS = 10000;

// The spacing actually drawn at a given extent: the requested mm, coarsened if
// it would put more than MAX_GRID_DIVISIONS lines across the width.
function drawnGridSpacing(ext, spacing) {
  return Math.max(spacing, (2 * ext) / MAX_GRID_DIVISIONS);
}

// Ruled grid on the XY plane
function makeGrid(ext, requested) {
  // Lines `spacing` mm apart, generated outward from a center line through the
  // origin. When the spacing doesn't divide the extent evenly, the leftover
  // partial cell sits at the far edge.
  const spacing = drawnGridSpacing(ext, requested);
  const coords = [0];
  for (let c = spacing; c <= ext + 1e-6; c += spacing) { coords.push(c, -c); }
  if (!coords.some((c) => Math.abs(c - ext) < 1e-6)) { coords.push(ext, -ext); }
  const verts = [];
  for (const c of coords) {
    verts.push(-ext, 0, c, ext, 0, c); // line parallel to X at z = c
    verts.push(c, 0, -ext, c, 0, ext); // line parallel to Z at x = c
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
  mat.transparent = true;
  mat.opacity = 0.015;
  mat.depthTest = true;
  mat.depthWrite = false;
  const g = new THREE.LineSegments(geom, mat);
  // Orientation set dynamically via quaternion in updateCameraUniforms
  g.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  );
  return g;
}

let grid = makeGrid(WORLD_EXTENT, gridSpacing);
zUpWorld.add(grid);

// ── WGSL types ──

const wgslShaderMaterial = new THREE.MeshBasicNodeMaterial({
  side: THREE.DoubleSide,
  // IMPORTANT: three will premultiply alpha if the below isn't added, which is bad when we're
  // using that channel to encode data.
  blending: THREE.NoBlending,
  depthTest: false,
  depthWrite: false,
});

// The progressive pass's material.
const ptMaterial = new THREE.MeshBasicNodeMaterial({
  blending: THREE.NoBlending,
  depthTest: false,
  depthWrite: false,
});

// The Simple tier's material; it writes the standard frame's encoding.
const simpleMaterial = new THREE.MeshBasicNodeMaterial({
  blending: THREE.NoBlending,
  depthTest: false,
  depthWrite: false,
});

// The Color tier's material, likewise.
const colorMaterial = new THREE.MeshBasicNodeMaterial({
  blending: THREE.NoBlending,
  depthTest: false,
  depthWrite: false,
});

// Analytically-computed pixel width in world units, set per-fragment before drawing.
// Avoids hardware dpdx/dpdy which are per-2x2-quad and cause ropey artifacts on curves.
const gsl_pixelWidthNode = new THREE.CodeNode(
    `var<private> gsl_pw: f32 = 0.0;
var<private> gsl_pwScale: f32 = 1.0;`,
    [],
    "wgsl",
);

// ── Field / section-view drawing primitives ──

const gsl_strokeField = wgslFn(`
fn gsl_strokeField(dist: f32, color: vec4<f32>, width: f32, base: vec4<f32>) -> vec4<f32> {
    // Use analytically-computed pixel width when set; fall back to hardware derivatives.
    let pw = select(length(vec2<f32>(dpdx(dist), dpdy(dist))), gsl_pw, gsl_pw > 0.0);
    // smoothstep over 1 pixel at each edge of the stroke
    let d = abs(dist);
    let interp = 1.0 - smoothstep(width * 0.5 * pw - 0.5 * pw, width * 0.5 * pw + 0.5 * pw, d);
    return mix(base, color, color.a * interp);
}
`, [gsl_pixelWidthNode]);

const gsl_drawField = wgslFn(
  `
fn gsl_drawField(dist: f32, color: vec4<f32>, base: vec4<f32>, bandWidth: f32, fade: f32, showExternal: f32) -> vec4<f32> {
    let widthThin = 2.0;
    let widthContour = 3.0;
    let widthHalo = 7.0;

    // fade=0 → only contour visible; fade=1e9 (slider max) → uniform, no fade
    let fadeFactor = clamp(1.0 - abs(dist) / max(fade, 1e-9), 0.0, 1.0);

    // Fill always at full strength — fade only affects interval lines
    var result = mix(base, color, select(0.0, color.a * 0.3, dist < 0.0));

    // TriangleWaveEvenPositive — matches GLSL reference (mod is always non-negative)
    let halfPeriod = 0.5 * bandWidth;
    let modDist = dist - bandWidth * floor(dist / bandWidth);
    let wave = modDist - halfPeriod;
    let wave_d = halfPeriod - abs(wave);

    // Outside: saturated shape color; inside: black — both fade with distance
    // When showExternal is off, skip the bright external (dist>0) interval curves
    let lineRGB = select(color.rgb, vec3<f32>(0.0), dist < 0.0);
    let waveColor = vec4<f32>(lineRGB, fadeFactor);

    if (showExternal > 0.5 || dist < 0.0) {
        result = gsl_strokeField(wave_d, waveColor, widthThin, result);
    }

    // Boundary: thick dark halo first, then bright contour on top
    result = gsl_strokeField(dist, vec4<f32>(0.0, 0.0, 0.0, 1.0), widthHalo, result);
    result = gsl_strokeField(dist, vec4<f32>(color.rgb, 1.0), widthContour, result);
    return result;
}
`,
  [gsl_strokeField],
);

// ── Camera uniforms ──

// Z-up rotation matrix: transforms Z-up world coords into three.js Y-up space
const zUpRotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const zUpRotationInverse = new THREE.Matrix4().copy(zUpRotation).invert();

const invProjViewZUpVal = new THREE.Matrix4();
const invProjViewZUpU = uniform(invProjViewZUpVal);

const camPosZUpVal = new THREE.Vector3();
const camPosZUpU = uniform(camPosZUpVal);

const zUpToViewMatVal = new THREE.Matrix4();
const zUpToViewMatU = uniform(zUpToViewMatVal);

// Three-light rig — parameters live in the WGSL shader (search coolLightOffset)

const skyColorVal = new THREE.Vector3(0.15, 0.13, 0.12);
const skyColorU = uniform(skyColorVal);

const groundColorVal = new THREE.Vector3(0.06, 0.07, 0.1);
const groundColorU = uniform(groundColorVal);

const nearFarVal = new THREE.Vector2(0.01, 10);
const nearFarU = uniform(nearFarVal);

const pixelScaleU = uniform(0.001);

// Camera basis in Z-up world space, used to build the primary ray directly in
// the shader. Reconstructing the ray by unprojecting near/far points instead
// subtracts two huge world positions whose float32 cancellation makes rayDir
// per-pixel noisy off-axis at large camera distances (fuzzy SDFs when zoomed
// out). camTanFov = (tan(fovY/2)*aspect, tan(fovY/2)).
const camRightZUpVal = new THREE.Vector3();
const camRightZUpU = uniform(camRightZUpVal);
const camUpZUpVal = new THREE.Vector3();
const camUpZUpU = uniform(camUpZUpVal);
const camFwdZUpVal = new THREE.Vector3();
const camFwdZUpU = uniform(camFwdZUpVal);
const camTanFovVal = new THREE.Vector2();
const camTanFovU = uniform(camTanFovVal);
const camOrthoU = uniform(0.0);

const projViewZUpVal = new THREE.Matrix4();
const projViewZUpU = uniform(projViewZUpVal);

const worldExtentU = uniform(worldExtent);

// Pre-allocated temporaries for updateCameraUniforms (avoid per-frame GC)
const _camPosTemp = new THREE.Vector3();
const _camBasisX = new THREE.Vector3();
const _camBasisY = new THREE.Vector3();
const _camBasisZ = new THREE.Vector3();
const _gridDefaultNormal = new THREE.Vector3(0, 1, 0); // GridHelper local up (= grid face normal)

function updateCameraUniforms() {
  camera.updateMatrixWorld();

  // Dynamic near/far tied to viewing distance. A fixed tiny near plane with a
  // huge far plane (needed to see a large scene) gives a near/far ratio in the
  // millions, which destroys depth-buffer precision and z-fights rasterized
  // meshes. Scaling near with the view distance keeps the ratio bounded (~500:1)
  // while staying small enough not to clip what's being looked at.
  const _viewDist = controls ? camera.position.distanceTo(controls.target) : camera.position.length();
  camera.near = Math.max(0.01, _viewDist * 0.002);
  camera.far = Math.max(100, _viewDist + worldExtent * 3);
  if (camera.isOrthographicCamera) cameraRig?.resize();
  else camera.updateProjectionMatrix();

  const viewMatrix = camera.matrixWorldInverse;
  const projMatrix = camera.projectionMatrix;

  // Sync near/far with camera
  nearFarVal.set(camera.near, camera.far);

  // projViewZUp: transforms Z-up world to clip space
  projViewZUpVal.copy(projMatrix).multiply(viewMatrix).multiply(zUpRotation);
  projViewZUpU.value.copy(projViewZUpVal);

  // invProjViewZUp: transforms NDC to Z-up world
  invProjViewZUpVal.copy(projViewZUpVal).invert();
  invProjViewZUpU.value.copy(invProjViewZUpVal);

  // Camera position in Z-up world space
  camera.getWorldPosition(_camPosTemp);
  camPosZUpVal.copy(_camPosTemp).applyMatrix4(zUpRotationInverse);
  camPosZUpU.value.copy(camPosZUpVal);

  // zUpToView: transforms Z-up normals/directions to view space
  zUpToViewMatVal.copy(viewMatrix).multiply(zUpRotation);
  zUpToViewMatU.value.copy(zUpToViewMatVal);

  const h = container.clientHeight * effectivePixelRatio();

  // Camera basis in Z-up world space (directions only). three's camera looks
  // down its local -Z, so the view direction is the negated Z basis vector.
  camera.matrixWorld.extractBasis(_camBasisX, _camBasisY, _camBasisZ);
  camRightZUpVal.copy(_camBasisX).transformDirection(zUpRotationInverse);
  camUpZUpVal.copy(_camBasisY).transformDirection(zUpRotationInverse);
  camFwdZUpVal.copy(_camBasisZ).transformDirection(zUpRotationInverse).negate();
  camRightZUpU.value.copy(camRightZUpVal);
  followCamera(camRightZUpVal.x, camRightZUpVal.y);
  camUpZUpU.value.copy(camUpZUpVal);
  camFwdZUpU.value.copy(camFwdZUpVal);
  if (camera.isOrthographicCamera) {
    const viewH = (camera.top - camera.bottom) / camera.zoom;
    const viewW = (camera.right - camera.left) / camera.zoom;
    pixelScaleU.value = viewH / h;
    camTanFovVal.set(viewW / 2, viewH / 2);
    camOrthoU.value = 1.0;
  } else {
    const fovRad = (camera.fov * Math.PI) / 180;
    const tanHalfFovY = Math.tan(fovRad / 2);
    pixelScaleU.value = (2.0 * tanHalfFovY) / h;
    camTanFovVal.set(tanHalfFovY * camera.aspect, tanHalfFovY);
    camOrthoU.value = 0.0;
  }
  camTanFovU.value.copy(camTanFovVal);

  // Grid always tracks the section plane direction/offset (panel open or closed)
  const n = fieldNormalU.value;
  grid.position.set(
    n.x * fieldHeightU.value,
    n.y * fieldHeightU.value,
    n.z * fieldHeightU.value,
  );
  grid.quaternion.setFromUnitVectors(_gridDefaultNormal, n);
}

// ── Shader construction ──

// decodeBase64ToUint16 decodes a base64 string of little-endian 16-bit
// values into a fresh Uint16Array. Used to unpack the SDF grid payloads the
// canvas agent ships alongside the shader. The values are IEEE 754 binary16
// (half-float) bit patterns; we hand them straight to a Data3DTexture with
// HalfFloatType.
function decodeBase64ToUint16(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // Copy into a properly-aligned ArrayBuffer before reinterpretation — the
  // atob-derived buffer may not be 2-byte aligned on some browsers.
  const aligned = new ArrayBuffer(bytes.length);
  new Uint8Array(aligned).set(bytes);
  return new Uint16Array(aligned);
}

// buildSdfSlotInfo turns the server's meshSdfBindings payload into the pieces
// the updateShader path needs: (a) a WGSL parameter string to splice into
// every wgslFn signature that calls sdShape; (b) a WGSL argument string to
// splice into every sdShape call site; (c) a TSL params object that goes
// into the fragment shader's invocation dict.
//
// Each binding contributes four parameters: a texture_3d<f32>, a sampler, a
// vec3<f32> bbox-min, and a vec3<f32> bbox-size. Names follow sdfTexN /
// sdfSmpN / sdfBMinN / sdfBSizeN where N is the densified slot number.
// Baked noise tile for the noiseHash3 builtin: a 64^3 rgba8unorm 3D texture the
// shader reads via textureLoad (exact texel fetch — no sampler/filtering). These
// are the same bytes program/noise.Bake() ships to the Fidget oracle (served from
// render/noise_tile.bin), so the WGSL preview matches the mesh. The texture
// is created up front and its data filled in when the fetch resolves, so a shader
// compiled before the tile arrives binds cleanly and self-corrects on load.
const NOISE_TILE_SIZE = 64;
const noiseTileData = new Uint8Array(NOISE_TILE_SIZE * NOISE_TILE_SIZE * NOISE_TILE_SIZE * 4);
const noiseTexture = new THREE.Data3DTexture(noiseTileData, NOISE_TILE_SIZE, NOISE_TILE_SIZE, NOISE_TILE_SIZE);
noiseTexture.format = THREE.RGBAFormat;
noiseTexture.type = THREE.UnsignedByteType;
noiseTexture.minFilter = THREE.NearestFilter;
noiseTexture.magFilter = THREE.NearestFilter;
noiseTexture.wrapS = THREE.RepeatWrapping;
noiseTexture.wrapT = THREE.RepeatWrapping;
noiseTexture.wrapR = THREE.RepeatWrapping;
noiseTexture.needsUpdate = true;
const noiseTexNode = texture3D(noiseTexture);
(async () => {
  try {
    const buf = await (await fetch("render/noise_tile.bin")).arrayBuffer();
    noiseTileData.set(new Uint8Array(buf));
    noiseTexture.needsUpdate = true;
    scheduleRender();
  } catch (e) {
    console.warn("noise tile load failed:", e);
  }
})();

// noiseTileInfo returns the params/args/TSL binding to thread the noise tile
// into the shader, but only when the generated WGSL actually references it (so
// non-noise programs are completely unaffected). Mirrors buildSdfSlotInfo, and
// must be appended AFTER the mesh-SDF params to match the sdShape signature
// order the codegen emits (sliders, mesh-SDF, then noise).
function noiseTileInfo(wgslCode) {
  if (!/\bnoiseTex\b/.test(wgslCode)) {
    return { paramsWGSL: "", argsWGSL: "", tslParams: {} };
  }
  return {
    paramsWGSL: ", noiseTex: texture_3d<f32>",
    argsWGSL: ", noiseTex",
    tslParams: { noiseTex: noiseTexNode },
  };
}

function buildSdfSlotInfo(meshSdfBindings) {
  if (!meshSdfBindings || meshSdfBindings.length === 0) {
    return { sdfParamsWGSL: "", sdfArgsWGSL: "", sdfTslParams: {} };
  }
  // Sort by slot so ordering is stable regardless of JSON key order.
  const bindings = [...meshSdfBindings].sort((a, b) => a.slot - b.slot);
  const paramParts = [];
  const argParts = [];
  const tsl = {};
  for (const b of bindings) {
    const [nx, ny, nz] = b.dims;
    const values = decodeBase64ToUint16(b.bytesB64);
    if (values.length !== nx * ny * nz) {
      console.warn(`SDF slot ${b.slot}: got ${values.length} half-floats but dims imply ${nx * ny * nz}; skipping`);
      continue;
    }
    // HalfFloatType (r16float in WebGPU) is linearly filterable on every
    // implementation without requiring the optional `float32-filterable`
    // feature. Using FloatType instead caused Three.js to silently set the
    // texture's sampleType to UnfilterableFloat on GPUs lacking that feature
    // — and WebGPU then degraded the sampler's linear filter to nearest at
    // the texel level with no error, producing visible voxel-stair-step
    // arcs across the rendered surface.
    const tex3d = new THREE.Data3DTexture(values, nx, ny, nz);
    tex3d.format = THREE.RedFormat;
    tex3d.type = THREE.HalfFloatType;
    tex3d.minFilter = THREE.LinearFilter;
    tex3d.magFilter = THREE.LinearFilter;
    tex3d.wrapS = THREE.ClampToEdgeWrapping;
    tex3d.wrapT = THREE.ClampToEdgeWrapping;
    tex3d.wrapR = THREE.ClampToEdgeWrapping;
    tex3d.needsUpdate = true;

    const texNode = texture3D(tex3d);
    const smpNode = tslSampler(texNode);
    const bMin = uniform(new THREE.Vector3(b.bboxMin[0], b.bboxMin[1], b.bboxMin[2]));
    const bSize = uniform(new THREE.Vector3(b.bboxSize[0], b.bboxSize[1], b.bboxSize[2]));

    const s = b.slot;
    paramParts.push(`sdfTex${s}: texture_3d<f32>`, `sdfSmp${s}: sampler`, `sdfBMin${s}: vec3<f32>`, `sdfBSize${s}: vec3<f32>`);
    argParts.push(`sdfTex${s}`, `sdfSmp${s}`, `sdfBMin${s}`, `sdfBSize${s}`);
    tsl[`sdfTex${s}`] = texNode;
    tsl[`sdfSmp${s}`] = smpNode;
    tsl[`sdfBMin${s}`] = bMin;
    tsl[`sdfBSize${s}`] = bSize;
  }
  const prefix = paramParts.length > 0 ? ", " : "";
  return {
    sdfParamsWGSL: prefix + paramParts.join(", "),
    sdfArgsWGSL: prefix + argParts.join(", "),
    sdfTslParams: tsl,
  };
}

function updateShader(wgslCode, shapeCount = 1, shapeNames = [], meshSdfBindings = [], sliders = [], uiControls = []) {
  console.log("Updating shader WGSL... shapeCount:", shapeCount, "meshSdfSlots:", meshSdfBindings.length, "sliders:", sliders.length);
  currentWGSL = wgslCode;
  currentShapeCount = Math.max(shapeCount, 1);

  // Reconcile slider uniforms. Reuse the existing TSL uniform for any
  // variable that's still around — that keeps the GPU-side binding
  // stable across compiles, and main.js's references stay valid. Drop
  // uniforms for variables that have disappeared from the program.
  const nextSliderUniforms = new Map();
  const sliderSpecs = sliders.map((s) => {
    let u = sliderUniformsByVar.get(s.variableName);
    if (u) {
      u.value = s.initialValue;
    } else {
      u = uniform(s.initialValue);
    }
    nextSliderUniforms.set(s.variableName, u);
    return {
      varName: s.variableName,
      // Codegen-emitted parameter name on sdShape (gsl_param_<line>_<col>).
      paramName: s.paramName,
      // Matching parameter name on every wrapper function in the JS
      // pipeline. Prefixed with `u_` so it can't collide with a
      // user-authored identifier surfacing in the lifted sdShape sig.
      fragParamName: `u_${s.paramName}`,
      initialValue: s.initialValue,
      uniform: u,
    };
  });
  sliderUniformsByVar.clear();
  for (const [k, v] of nextSliderUniforms) sliderUniformsByVar.set(k, v);

  const sliderParamNames = new Set(sliderSpecs.map((s) => s.paramName));
  const nextUiUniforms = new Map();
  const uiSpecs = [];
  for (const c of uiControls || []) {
    for (const p of c.params || []) {
      if (sliderParamNames.has(p.paramName) || nextUiUniforms.has(p.paramName)) continue;
      let u = uiUniformsByParam.get(p.paramName);
      if (u) {
        u.value = p.value;
      } else {
        u = uniform(p.value);
      }
      nextUiUniforms.set(p.paramName, u);
      uiSpecs.push({
        paramName: p.paramName,
        fragParamName: `u_${p.paramName}`,
        uniform: u,
      });
    }
  }
  uiUniformsByParam.clear();
  for (const [k, v] of nextUiUniforms) uiUniformsByParam.set(k, v);
  const liveSpecs = [...sliderSpecs, ...uiSpecs];

  const sliderParamsWGSL = liveSpecs.map((s) => `${s.fragParamName}: f32`);
  const sliderArgsWGSL = liveSpecs.map((s) => s.fragParamName);
  const sliderParamSuffix = sliderParamsWGSL.length > 0 ? ", " + sliderParamsWGSL.join(", ") : "";
  const sliderArgSuffix = sliderArgsWGSL.length > 0 ? ", " + sliderArgsWGSL.join(", ") : "";

  // ── Mesh-SDF 3D texture bindings ──
  // For every bvhSdf(i) / vdbSdf(i) referenced in the program the server bakes a 3D
  // distance grid and sends back a per-slot binding payload. We turn each
  // into a Data3DTexture + TSL nodes, and extend every wgslFn that calls
  // sdShape() to pass the textures / samplers / bboxes through.
  const sdfSlotInfo = buildSdfSlotInfo(meshSdfBindings);
  const { sdfParamsWGSL, sdfArgsWGSL, sdfTslParams } = sdfSlotInfo;

  // Combined slider + mesh-SDF parameter/argument suffixes. Order is
  // load-bearing: the generated sdShape signature appends slider
  // parameters first and the mesh-SDF slot parameters after them (see
  // backend/wgsl/internal/codegen/build.go), so every call-site argument
  // list must match that order positionally.
  // Noise tile: appended last so the argument order matches the sdShape
  // signature (sliders, mesh-SDF, then noise). Active only when the shader
  // references noiseTex.
  const noiseInfo = noiseTileInfo(wgslCode);
  const noiseTslParams = noiseInfo.tslParams;

  const extraParamsWGSL = sliderParamSuffix + sdfParamsWGSL + noiseInfo.paramsWGSL;
  const extraArgsWGSL = sliderArgSuffix + sdfArgsWGSL + noiseInfo.argsWGSL;

  // Reset shape colors using cosine palette
  gsl_shapeColors.clear();
  const colorUniforms = {};
  for (let i = 1; i <= currentShapeCount; i++) {
    const t = (1 / 3 + (i - 1) * (5 / 12)) % 1;
    const vec = new THREE.Vector3(...cosinePalette(t));

    const u = uniform(vec);
    gsl_shapeColors.set(i, { vec, uniform: u });
    colorUniforms[`c${i}`] = u;
  }

  // Per-shape visibility uniforms (1.0 = visible, 0.0 = hidden). Rasterized
  // meshes track the same per-shape state separately, so reset it here too —
  // a recompile can renumber shapes, and stale hidden indices would hide the
  // wrong body while the body list showed everything as visible.
  shapeVisibles.clear();
  hiddenMeshShapes.clear();
  const visUniforms = {};
  const visParamsWGSL = [];
  const visArgsWGSL = [];
  for (let i = 1; i <= currentShapeCount; i++) {
    const u = uniform(1.0);
    shapeVisibles.set(i, u);
    visUniforms[`vis${i}`] = u;
    visParamsWGSL.push(`vis${i}: f32`);
    visArgsWGSL.push(`vis${i}`);
  }

  // The shaders around the compiled program (gsl-render-graph.js).
  const { sdShape, gsl_min, gsl_shapeColor, injectExtraArgs, colorParamsWGSL, colorArgsWGSL, wgslFragmentShader, ptFragment, simpleFragment } =
    buildRenderGraph({ wgslCode, shapeCount: currentShapeCount, extraParamsWGSL, extraArgsWGSL, pixelWidthNode: gsl_pixelWidthNode });
  // The Color tier's frame: the standard one as if the program authored no
  // material. Its pipeline compiles only once the tier is drawn.
  const { wgslFragmentShader: colorFragment } =
    buildRenderGraph({ wgslCode, shapeCount: currentShapeCount, extraParamsWGSL, extraArgsWGSL, trace: false, materials: false,
                       pixelWidthNode: gsl_pixelWidthNode });

  const fragmentParams = {
    uv: viewportUV,
    camPosZUp: camPosZUpU,
    camRight: camRightZUpU,
    camUp: camUpZUpU,
    camFwd: camFwdZUpU,
    camTanFov: camTanFovU,
    camOrtho: camOrthoU,
    projViewZUp: projViewZUpU,
    zUpToView: zUpToViewMatU,
    skyCol: skyColorU,
    groundCol: groundColorU,
    envA: envAU,
    envB: envBU,
    envC: envCU,
    shadingKnobs: shadingKnobsU,
    glassKnobs: glassKnobsU,
    surfaceKnobs: surfaceKnobsU,
    renderKnobs: renderKnobsU,
    detailKnobs: detailKnobsU,
    detailKnobs2: detailKnobs2U,
    bgColor: bgColorU,
    pixelScale: pixelScaleU,
    worldExtent: worldExtentU,
    nearFar: nearFarU,
    time: timeU,
    fieldActive: fieldEnabledU,
    fieldHeight: fieldHeightU,
    fieldNormal: fieldNormalU,
    ...colorUniforms,
    ...visUniforms,
    ...Object.fromEntries(liveSpecs.map((s) => [s.fragParamName, s.uniform])),
    ...sdfTslParams,
    ...noiseTslParams,
  };

  wgslShaderMaterial.fragmentNode = wgslFragmentShader(fragmentParams);
  wgslShaderMaterial.needsUpdate = true;
  simpleMaterial.fragmentNode = simpleFragment(fragmentParams);
  simpleMaterial.needsUpdate = true;
  colorMaterial.fragmentNode = colorFragment(fragmentParams);
  colorMaterial.needsUpdate = true;

  // The progressive pass: one path per pixel, added to the previous sum.
  traceAvailable = !!accumPrevNode;
  ptJobSource = null;
  if (traceAvailable) {
    // Same uniforms as the standard fragment (Three passes each function only
    // the parameters it declares), plus the sum and the sample's coordinates.
    const ptParams = {
      ...fragmentParams,
      prev: accumPrevNode.sample(viewportUV),
      resolution: accumResU,
      frame: accumFrameU,
      traceKnobs: traceKnobsU,
      lens: lensKnobsU,
      traceFlags: traceFlagsU,
    };
    ptMaterial.fragmentNode = ptFragment(ptParams);
    ptJobSource = { fn: ptFragment, params: ptParams };
    ptMaterial.needsUpdate = true;
  }

  // ── Field plane shader ──
  // Infinite plane at Z=fieldHeight — no worldExtent check.

  // Non-union mode: draw every shape's field independently, combined additively so overlapping
  // lines from different shapes are all visible. Shape ordering doesn't affect visibility.
  // Each shape's SDF is isolated via gsl_fieldFilterIdx before calling sdShape.
  const nonUnionShapes = [];
  for (let i = currentShapeCount; i >= 1; i--) {
    nonUnionShapes.push(`
            if (vis${i} > 0.5) {
                gsl_fieldFilterIdx = ${i}u;
                let sd_nu = sdShape(hitPoint, time);
                let rgb_nu = gsl_shapeColor(${i}u, ${colorArgsWGSL.join(", ")});
                nuResult = clamp(nuResult + gsl_drawField(sd_nu.distance, vec4<f32>(rgb_nu, 1.0),
                    vec4<f32>(0.0, 0.0, 0.0, 0.0), max(fieldInterval, 1e-4), fieldFade, fieldExternal), vec4<f32>(0.0), vec4<f32>(1.0));
            }`);
  }

  const fieldFragmentShader = wgslFn(
    injectExtraArgs(`
        fn gsl_fieldFragment(
            uv: vec2<f32>,
            camPosZUp: vec3<f32>,
            camRight: vec3<f32>,
            camUp: vec3<f32>,
            camFwd: vec3<f32>,
            camTanFov: vec2<f32>,
            camOrtho: f32,
            projViewZUp: mat4x4<f32>,
            pixelScale: f32,
            fieldHeight: f32,
            time: f32,
            fieldNormal: vec3<f32>,
            fieldInterval: f32,
            fieldFade: f32,
            fieldUnion: f32,
            fieldExternal: f32,
            bgColor: vec3<f32>,
            ${colorParamsWGSL.join(", ")},
            ${visParamsWGSL.join(", ")}${extraParamsWGSL}
        ) -> vec4<f32> {
            ${visArgsWGSL.map((v, i) => visAssignWGSL(i, v)).join(" ")}
            let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
            // Build the ray from the camera basis (O(1) vectors) — same as the
            // shape shader — to avoid the huge-magnitude unproject cancellation
            // that makes rayDir noisy off-axis at large camera distances.
            let rayOffset = ndc.x * camTanFov.x * camRight + ndc.y * camTanFov.y * camUp;
            let rayOrigin = camPosZUp + rayOffset * camOrtho;
            let rayDir = normalize(mix(camFwd + rayOffset, camFwd, camOrtho));

            let denom = dot(fieldNormal, rayDir);
            if (abs(denom) < 1e-6) { discard; }
            let t = (fieldHeight - dot(fieldNormal, rayOrigin)) / denom;
            if (t <= 0.0) { discard; }

            let hitPoint = rayOrigin + rayDir * t;
            // Analytical pixel width at this depth — no per-quad artifacts
            gsl_pw = pixelScale * mix(t, 1.0, camOrtho);
            let clipPos = projViewZUp * vec4<f32>(hitPoint, 1.0);
            let depth01 = clipPos.z / clipPos.w;

            if (fieldUnion > 0.5) {
                // Union mode: take the SDF union, draw with opaque gray background.
                // Alpha channel encodes depth for fieldHit detection in composite.
                gsl_fieldFilterIdx = 0u;
                let sd = sdShape(hitPoint, time);
                let shapeRGB = gsl_shapeColor(sd.shapeIndex, ${colorArgsWGSL.join(", ")});
                let drawn = gsl_drawField(sd.distance, vec4<f32>(shapeRGB, 1.0),
                    vec4<f32>(bgColor, 1.0), max(fieldInterval, 1e-4), fieldFade, fieldExternal);
                return vec4<f32>(drawn.rgb, depth01);
            }

            // Non-union mode: all shape fields combined additively (all lines visible),
            // then mixed over gray background. Returns same format as union (depth01 in alpha).
            var nuResult = vec4<f32>(0.0, 0.0, 0.0, 0.0);
            ${nonUnionShapes.join("")}
            gsl_fieldFilterIdx = 0u;
            let nuAlpha = nuResult.a;
            let lineRGB = select(bgColor, nuResult.rgb / max(nuAlpha, 0.001), nuAlpha > 0.001);
            return vec4<f32>(mix(bgColor, lineRGB, nuAlpha), depth01);
        }
    `),
    [
      sdShape,
      gsl_shape,
      gsl_min,
      gsl_shapeColor,
      gsl_drawField,
      gsl_fieldFilterNode,
      gsl_pixelWidthNode,
    ],
  );

  if (!fieldMaterial) {
    fieldMaterial = new THREE.MeshBasicNodeMaterial({
      side: THREE.DoubleSide,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    fieldScene = new THREE.Scene();
    fieldCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    fieldScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fieldMaterial),
    );
  }
  fieldMaterial.fragmentNode = fieldFragmentShader({
    uv: viewportUV,
    camPosZUp: camPosZUpU,
    camRight: camRightZUpU,
    camUp: camUpZUpU,
    camFwd: camFwdZUpU,
    camTanFov: camTanFovU,
    camOrtho: camOrthoU,
    projViewZUp: projViewZUpU,
    pixelScale: pixelScaleU,
    time: timeU,
    fieldHeight: fieldHeightU,
    fieldInterval: fieldIntervalU,
    fieldFade: fieldFadeU,
    fieldNormal: fieldNormalU,
    fieldUnion: fieldUnionU,
    fieldExternal: fieldExternalU,
    bgColor: bgColorU,
    ...colorUniforms,
    ...visUniforms,
    ...Object.fromEntries(liveSpecs.map((s) => [s.fragParamName, s.uniform])),
    ...sdfTslParams,
    ...noiseTslParams,
  });
  fieldMaterial.needsUpdate = true;

  renderDisabled = false;
  renderErrMsg = ""
  scheduleRender();

  eventManager.dispatchEvent("shapes/detected", {
    count: currentShapeCount,
    names: shapeNames,
  });
}

// ── Rendering ──

// render draws one frame. Only the scheduled frame loop passes allowDraft:
// captures and other direct calls always get the standard tier. useAccum
// false draws without the progressive sum, for a view other than the one
// the sum was made from (captureSceneViews).
function render(allowDraft = false, useAccum = true) {
  frameRate.frame();
  if (accumDirty) {
    accumDirty = false;
    accumN = 0;
  }
  accumNU.value = useAccum ? accumN : 0;
  timeU.value = getAnimTime();
  updateCameraUniforms();
  updatePartView();

  // Bypass Three.js internal framebuffer + sRGB conversion for intermediate
  // render targets. These store raw linear data for the composite pass.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  // Render shapes to shapeTarget (full-screen quad raymarch)
  // RGB = lit color, A = float(shapeIndex) + depth01
  if (shapeTarget) {
    // The Simple tier draws the Simple pass, moving or not.
    const simple = getRestTier() === "simple";
    const draft = !simple && allowDraft && motion.draftNow();
    const target = draft ? draftTarget : shapeTarget;
    const drawShapes = () => {
      renderer.setRenderTarget(target);
      renderer.clearColor();
      renderer.render(simple ? simpleScene : getRestTier() === "color" ? colorScene : shapeScene, shapeCam);
      renderer.setRenderTarget(null);
    };
    if (draft) {
      // Every hit epsilon scales with the pixel footprint, so it follows
      // the smaller target.
      const pixelScale = pixelScaleU.value;
      pixelScaleU.value = pixelScale * shapeTarget.height / draftTarget.height;
      withDraftKnobs(drawShapes, shapeTarget.height / draftTarget.height);
      pixelScaleU.value = pixelScale;
    } else {
      drawShapes();
    }
    shapeTexNode.value = target.texture;
    compositePixelSizeVec.set(1 / target.width, 1 / target.height);
  }

  // Render SDF field plane to fieldTarget (only when enabled)
  if (fieldTarget) {
    renderer.setRenderTarget(fieldTarget);
    renderer.clearColor();
    if (fieldEnabledU.value > 0.5 && fieldScene) {
      renderer.render(fieldScene, fieldCam);
    }
    renderer.setRenderTarget(null);
  }

  // Render imported meshes to meshTarget (transparent bg + depth)
  if (meshTarget) {
    updateMeshLights();
    renderer.setRenderTarget(meshTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    if (meshInstances.length > 0) {
      sizeTopoVertexMarkers();
      renderer.render(meshScene, camera);
    }
    renderer.setRenderTarget(null);
  }

  // Render main scene (background, grid) to mainTarget with depth
  if (mainTarget) {
    renderer.setRenderTarget(mainTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  }

  // Restore sRGB output for final composite to screen
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Composite: compare depths, output final pixel
  if (compositeScene) {
    renderer.render(compositeScene, compositeCamera);
  }
  gslUiControls?.render(renderer);
  orthoViewHelper?.render(renderer);
  if (useAccum) startProgressive();
}

onShadingChange(() => scheduleRender());
onEnvironmentChange(() => scheduleRender());

// Camera and slider changes, and a running clock, draw draft frames (when
// that tier is chosen); once they stop, one standard frame follows.
const motion = new MotionTracker(() => scheduleRender());

// The Render panel's Frame rate row, with how far the progressive sum has
// got when that tier is chosen.
const frameRate = new FrameRateMeter(() => {
  if (getRestTier() !== "progressive" || !traceAvailable) return null;
  return Math.min(1, accumN / traceKnobsU.value.z);
});

// scheduleRender queues a frame. Anything that changes the image starts the
// progressive sum over, which is the default; a change the composite alone
// shows (hover, selection, outlines) passes { keepAccum: true }.
function scheduleRender(opts) {
  if (!(opts && opts.keepAccum === true)) accumDirty = true;
  if (renderDisabled || renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    if (!renderDisabled) {
      // A running clock is motion too: it draws the Moving tier, and the
      // standard frame follows once it pauses.
      if (!animPaused) motion.note();
      render(true);
      frameCount++;
      const now = performance.now();
      if (now - lastLogTime > 1000) {
        console.log(
          `[render] ${frameCount} frames in last ${((now - lastLogTime) / 1000).toFixed(1)}s`,
        );
        frameCount = 0;
        lastLogTime = now;
      }
      if (!animPaused) {
        const wait = animFrameMs - (performance.now() - lastFrameTime);
        if (wait > 1) {
          setTimeout(scheduleRender, wait);
        } else {
          scheduleRender();
        }
        lastFrameTime = performance.now();
      }
    }
  });
}

// progressiveWanted reports whether the progressive tier should add another
// sample: it is chosen, the program has a progressive pass, nothing moves or
// animates, and the sum is below its cap.
function progressiveWanted() {
  return getRestTier() === "progressive" && traceAvailable && animPaused
    && !motion.moving && !renderDisabled && accumN < traceKnobsU.value.z;
}

// updateLens focuses the path tracer's thin lens on the Focus tool's point,
// or the orbit pivot until one is picked, with the radius the Depth of field
// slider sets. Orthographic views are a pinhole.
function updateLens() {
  const focus = Math.max(focusPointZUp
    ? focusPointZUp.clone().sub(camPosZUpVal).dot(camFwdZUpU.value)
    : camera.position.distanceTo(controls.target), 1e-6);
  const radius = camera.isOrthographicCamera ? 0 : getAperture() * LENS_RADIUS_AT_FULL * focus;
  lensKnobsU.value.set(radius, focus, 0, 0);
}

// startRenderImage path traces the current view in a worker at the Render
// panel's size and downloads it as a PNG with a transparent background. The
// job is a snapshot (gsl-render-job.js), so the view can move and the
// program recompile while it runs. Pressed again, it cancels.
function startRenderImage() {
  if (renderJob) {
    renderJob.cancel();
    renderJob = null;
    showRenderProgress(null);
    return;
  }
  if (!ptJobSource) return;
  const scale = getImageScale();
  const width = renderer.domElement.width * scale;
  const height = renderer.domElement.height * scale;
  updateCameraUniforms();
  updateLens();
  let job;
  try {
    job = buildRenderJob({
      ...ptJobSource,
      // Hit tolerances are in pixels of the image being drawn.
      overrides: { pixelScale: pixelScaleU.value * renderer.domElement.height / height },
      width,
      height,
      samples: FINAL_RENDER_SAMPLES,
    });
  } catch (e) {
    showNotification(true, `Render image: ${e.message}`);
    return;
  }
  const finish = () => {
    renderJob = null;
    showRenderProgress(null);
  };
  showRenderProgress(0);
  renderJob = new RenderJob(job, {
    onProgress: (done, total) => showRenderProgress(done / total),
    onDone: (blob) => {
      finish();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "render.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: (message) => {
      finish();
      showNotification(true, `Render image failed: ${message}`);
    },
  });
}

function startProgressive() {
  if (accumRunning || !progressiveWanted()) return;
  accumRunning = true;
  requestAnimationFrame(progressiveStep);
}

// progressiveStep adds one path-traced sample per pixel to the sum and
// recomposites. The other passes are left as they are: nothing they draw has
// changed, or accumDirty would be set and a full render would be coming.
function progressiveStep() {
  accumRunning = false;
  if (accumDirty || renderPending || !progressiveWanted()) return;
  frameRate.frame();
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const src = accumTargets[accumIdx];
  const dst = accumTargets[1 - accumIdx];
  if (accumN === 0) {
    renderer.setRenderTarget(src);
    renderer.setClearColor(0x000000, 0);
    renderer.clearColor();
  }
  accumPrevNode.value = src.texture;
  accumFrameU.value = accumN;
  updateLens();
  renderer.setRenderTarget(dst);
  renderer.render(ptScene, shapeCam);
  renderer.setRenderTarget(null);
  accumIdx = 1 - accumIdx;
  accumN++;
  accumTexNode.value = dst.texture;
  accumNU.value = accumN;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.render(compositeScene, compositeCamera);
  gslUiControls?.render(renderer);
  orthoViewHelper?.render(renderer);
  startProgressive();
}

// ── Renderer init ──

renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(effectivePixelRatio());
renderer.setSize(container.clientWidth, container.clientHeight);

// Shape scene: full-screen quad with orthographic camera
shapeScene = new THREE.Scene();
shapeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
shapeScene.add(
  new THREE.Mesh(new THREE.PlaneGeometry(2, 2), wgslShaderMaterial),
);
ptScene = new THREE.Scene();
ptScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ptMaterial));
simpleScene = new THREE.Scene();
simpleScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simpleMaterial));
colorScene = new THREE.Scene();
colorScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), colorMaterial));

// ── Mesh scene: imported meshes rendered with standard rasterization ──

meshScene = new THREE.Scene();
meshScene.background = null; // transparent for composite alpha detection

meshZUpWorld = new THREE.Group();
meshZUpWorld.rotation.x = -Math.PI / 2;
meshScene.add(meshZUpWorld);

// View-space lighting rig matching the raymarcher's three-light setup
// cool1Dir = normalize(-0.5, 0.6, 0.5), cool2Dir = normalize(0.5, 0.6, 0.5), warmDir = normalize(0.0, -0.4, 1.0)
const meshLightDefs = [
  { dir: new THREE.Vector3(-0.5, 0.6, 0.5), color: 0x9faeda, intensity: 2.0 },
  { dir: new THREE.Vector3(0.5, 0.6, 0.5), color: 0x9faeda, intensity: 2.0 },
  { dir: new THREE.Vector3(0.0, -0.4, 1.0), color: 0x996b33, intensity: 1.5 },
];
const meshLights = meshLightDefs.map(({ dir, color, intensity }) => {
  const light = new THREE.DirectionalLight(color, intensity);
  dir.normalize();
  meshScene.add(light);
  meshScene.add(light.target);
  return { light, dir };
});
const meshHemiLight = new THREE.HemisphereLight(0x262120, 0x10121a, 1.0);
meshScene.add(meshHemiLight);

const _meshLightDir = new THREE.Vector3();
function updateMeshLights() {
  for (const { light, dir } of meshLights) {
    _meshLightDir.copy(dir).transformDirection(camera.matrixWorld);
    light.position.copy(camera.position).addScaledVector(_meshLightDir, 10);
    light.target.position.copy(camera.position);
  }
}

// ── Compositing ──

function initComposite() {
  const w = Math.max(
    1,
    Math.floor(container.clientWidth * effectivePixelRatio()),
  );
  const h = Math.max(
    1,
    Math.floor(container.clientHeight * effectivePixelRatio()),
  );

  // shapeTarget: RGB = lit shape color, A = float(shapeIndex) + depth01
  shapeTarget = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
  });

  // draftTarget: the same encoding at DRAFT_SCALE, drawn while the view
  // moves. Nearest sampling keeps the packed shape index whole when the
  // composite upscales it.
  draftTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(w * DRAFT_SCALE)),
    Math.max(1, Math.floor(h * DRAFT_SCALE)),
    {
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    },
  );

  // accumTargets: the progressive sum, ping-ponged. RGB = summed radiance of
  // the samples that hit a shape, A = how many did.
  accumTargets = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  }));
  accumIdx = 0;
  accumN = 0;
  accumResU.value.set(w, h);
  // The progressive pass's handle on the previous sum outlives the targets,
  // so the material built from it in updateShader stays valid across resizes.
  if (!accumPrevNode) accumPrevNode = tslTexture(accumTargets[0].texture);

  // fieldTarget: RGB = field color, A = depth01 (0 = no hit)
  fieldTarget = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
  });

  // mainTarget: scene (grid, background) with depth texture
  mainTarget = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  mainTarget.depthTexture = new THREE.DepthTexture(w, h);
  mainTarget.depthTexture.format = THREE.DepthFormat;
  mainTarget.depthTexture.type = THREE.UnsignedIntType;

  // meshTarget: imported meshes with depth for compositing against raymarched SDF
  meshTarget = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  meshTarget.depthTexture = new THREE.DepthTexture(w, h);
  meshTarget.depthTexture.format = THREE.DepthFormat;
  meshTarget.depthTexture.type = THREE.UnsignedIntType;

  compositePixelSizeVec.set(1 / w, 1 / h);
  const pixelSizeU = uniform(compositePixelSizeVec);
  const selU = uniform(selectedShapeVec);
  const hovU = uniform(hoveredShapeVec);
  shapeTexNode = tslTexture(shapeTarget.texture);
  const shapeTex = shapeTexNode;
  const fieldTex = tslTexture(fieldTarget.texture);
  accumTexNode = tslTexture(accumTargets[0].texture);
  const mainTex = tslTexture(mainTarget.texture);
  const mainDepthTex = tslTexture(mainTarget.depthTexture);

  // 4-neighbor edge detection kernel
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const N = offsets.length;
  const nParams = offsets.map((_, i) => `n${i}: f32`).join(", ");
  const neighborDecodes = offsets
    .map(
      (_, i) =>
        `ns[${i}] = u32(n${i}); nax[${i}] = (ns[${i}] == 0u) && (n${i} > 0.0);`,
    )
    .join("\n");

  const compositeFn = wgslFn(`
        fn gsl_composite(
            shapeRGBA: vec4<f32>,
            fieldRGBA: vec4<f32>,
            fieldOn: f32,
            fieldUnion: f32,
            modelOpacity: f32,
            sectionOpacity: f32,
            camPosZUp: vec3<f32>,
            fieldNormal: vec3<f32>,
            fieldHeight: f32,
            bgColor: vec3<f32>,
            mainRGB: vec3<f32>,
            mainDepthRaw: f32,
            meshRGBA: vec4<f32>,
            meshDepthRaw: f32,
            selIdx: f32,
            hovIdx: f32,
            nearFar: vec2<f32>,
            camOrtho: f32,
            accumRGBA: vec4<f32>,
            accumN: f32,
            ${nParams}
        ) -> vec4<f32> {
            // ── Step 1: shapeDepth, gsl_shapeColor, planeDepth ──
            var shapeRGB   = shapeRGBA.rgb;
            let shapeAlpha = shapeRGBA.a;
            let shapeIdx   = u32(shapeAlpha);
            // Decode plane-side bit: bit is set when model surface is behind the section plane.
            // Alpha encoding: shapeIdx + 0.5 (if belowPlane) + depth in [0, 0.498]
            let raw              = shapeAlpha - f32(shapeIdx);
            // XOR with cameraIsBelow: when viewing from below the plane, the draw order flips.
            let cameraIsBelow    = dot(fieldNormal, camPosZUp) < fieldHeight;
            let shapeHit        = shapeIdx > 0u;
            let modelBelowPlane  = shapeHit && (fieldOn > 0.5) && ((raw >= 0.5) != cameraIsBelow);
            let shapeDepth01    = raw - select(0.0, 0.5, modelBelowPlane);
            let centerIsAxis    = (shapeIdx == 0u) && (shapeAlpha > 0.0);

            // Progressive tier: the running sum of path-traced samples takes
            // over from the standard frame. Its alpha counts the samples that
            // hit a shape, so accumRGBA.a / accumN is the pixel's coverage,
            // which antialiases the silhouette. The standard frame counts as
            // ${TRACE_STANDARD_WEIGHT} samples at the head of the sum, so the image starts
            // as Standard and fades into the traced one instead of opening
            // on one noisy sample. It is display-referred, so the blend is
            // in display colour.
            let ptOn = accumN > 0.5;
            let ptHits = accumRGBA.a > 0.0;
            let ptOnly = gsl_tonemapPbrNeutral(accumRGBA.rgb / max(accumRGBA.a, 1.0));
            let ptWeight = accumN / (accumN + ${TRACE_STANDARD_WEIGHT.toFixed(1)});
            let ptColor = select(select(shapeRGBA.rgb, ptOnly, ptHits),
                                 mix(shapeRGBA.rgb, ptOnly, ptWeight), shapeHit && ptHits);
            let coverage = select(0.0, mix(select(0.0, 1.0, shapeHit), accumRGBA.a / max(accumN, 1.0), ptWeight), ptOn);
            if (ptOn && shapeHit) { shapeRGB = ptColor; }

            let fieldRGB = fieldRGBA.rgb;
            let planeDepth = fieldRGBA.a;
            let fieldHit = (fieldOn > 0.5) && (planeDepth > 0.001);

            let sel = u32(selIdx + 0.5);
            let hov = u32(hovIdx + 0.5);

            // Decode all neighbor shape IDs and axis flags
            var ns: array<u32, ${N}>;
            var nax: array<bool, ${N}>;
            ${neighborDecodes}

            // Edge detection: skip axis neighbors so axes don't get outlines against shapes
            var isEdge = false;
            var neighborSelected = false;
            var neighborHovered = false;
            var centerIsSelected = (shapeIdx == sel) && (sel > 0u);
            var centerIsHovered = (shapeIdx == hov) && (hov > 0u);

            for (var i = 0u; i < ${N}u; i = i + 1u) {
                if (ns[i] != shapeIdx) {
                    if (!nax[i] && !centerIsAxis) { isEdge = true; }
                    if (sel > 0u && ns[i] == sel) { neighborSelected = true; }
                    if (hov > 0u && ns[i] == hov) { neighborHovered = true; }
                }
            }

            // Outline colors
            var outlineColor = vec3<f32>(0.0, 0.0, 0.0);
            var hasOutline = false;
            if (isEdge) {
                if (centerIsSelected || neighborSelected) {
                    hasOutline = true;
                    outlineColor = vec3(1.0, 1.0, 0.0);
                } else if (centerIsHovered || neighborHovered) {
                    hasOutline = true;
                    outlineColor = vec3(1.0, 1.0, 1.0);
                }
            }

            // Early exits: per-pixel outlines and selection edges
            if (isEdge && !shapeHit && !centerIsAxis) {
                if (neighborSelected) { return vec4(1.0, 1.0, 0.0, 1.0); }
                if (neighborHovered)  { return vec4(1.0, 1.0, 1.0, 1.0); }
            }
            if (hasOutline) { return vec4(outlineColor, 1.0); }

            // ── Step 2: depth compositing (SDF vs mesh vs grid) ──
            // Convert NDC depth from depth texture to linear depth for comparison.
            let mainDepthPerspective = nearFar.x / (nearFar.y - mainDepthRaw * (nearFar.y - nearFar.x));
            let mainDepthOrtho = mix(nearFar.x / nearFar.y, 1.0, mainDepthRaw);
            let mainLinDepth = mix(mainDepthPerspective, mainDepthOrtho, camOrtho);

            // Mesh depth: rasterized imported meshes in a separate render target
            let meshHit = meshRGBA.a > 0.01;
            let meshDepthPerspective = nearFar.x / (nearFar.y - meshDepthRaw * (nearFar.y - nearFar.x));
            let meshDepthOrtho = mix(nearFar.x / nearFar.y, 1.0, meshDepthRaw);
            let meshLinDepth = select(1e9, mix(meshDepthPerspective, meshDepthOrtho, camOrtho), meshHit);

            // Where the mesh is closer than the grid, it becomes the effective background
            // that SDF shapes composite over. This gives correct three-way occlusion.
            let meshIsBg = meshHit && meshLinDepth < mainLinDepth;
            let effectiveBgRGB = select(mainRGB, meshRGBA.rgb, meshIsBg);
            let effectiveBgDepth = select(mainLinDepth, meshLinDepth, meshIsBg);
            let effectiveBgFlat = select(bgColor, meshRGBA.rgb, meshIsBg);

            let axisOpacity         = 0.5;
            let shapeVisible        = (shapeHit || centerIsAxis) && shapeDepth01 < effectiveBgDepth;
            let shapeCompositeColor = select(effectiveBgRGB, shapeRGB, shapeVisible);

            // ── Step 3: Section plane RGBA ──
            // Gray background at sectionOpacity; contour lines (any color != gray) are opaque.
            let isLine     = saturate(length(fieldRGB - bgColor) * 8.0);
            let sectionRGBA = vec4<f32>(fieldRGB, mix(1.0 - sectionOpacity, 1.0, isLine));

            // Compute scene result before box overlay
            var result: vec4<f32>;

            // No active plane: draw model at modelOpacity (or axis at 0.5) over background
            if (!fieldHit) {
                let op = select(axisOpacity, modelOpacity, shapeHit);
                let behind = select(effectiveBgRGB, effectiveBgFlat, shapeHit);
                result = vec4(select(effectiveBgRGB, mix(behind, shapeRGB, op), shapeVisible), 1.0);
                // Over the background, blend by coverage, unless the standard
                // frame's hit is hidden behind a mesh or the grid.
                if (ptOn && !centerIsAxis && (shapeVisible || !shapeHit)) {
                    result = vec4(mix(effectiveBgRGB, ptColor, coverage * select(1.0, modelOpacity, shapeHit)), 1.0);
                }
            } else if (modelBelowPlane) {
                // Model is behind the plane — composite section over 100% opaque model
                result = vec4(mix(shapeRGB, sectionRGBA.rgb, sectionRGBA.a), 1.0);
            } else {
                // Model is in front of the plane (or no model) — composite section over background,
                // then model at modelOpacity on top
                let behindModel = mix(effectiveBgRGB, sectionRGBA.rgb, sectionRGBA.a);
                let op = select(axisOpacity, modelOpacity, shapeHit);
                let behindShape = select(behindModel, mix(effectiveBgFlat, sectionRGBA.rgb, sectionRGBA.a), shapeHit);
                result = vec4(select(behindModel, mix(behindShape, shapeRGB, op), shapeVisible), 1.0);
            }

            return result;
        }
    `, [wgslFn(GSL_SHADING_WGSL, [gsl_material])]);

  // Build TSL params
  const centerShapeSample = shapeTex.sample(viewportUV);
  const centerFieldSample = fieldTex.sample(viewportUV);
  const centerMainSample = mainTex.sample(viewportUV);
  const centerMainDepth = mainDepthTex.sample(viewportUV);
  const meshTex = tslTexture(meshTarget.texture);
  const meshDepthTex = tslTexture(meshTarget.depthTexture);
  const centerMeshSample = meshTex.sample(viewportUV);
  const centerMeshDepth = meshDepthTex.sample(viewportUV);

  const params = {
    shapeRGBA: centerShapeSample,
    fieldRGBA: centerFieldSample,
    fieldOn: fieldEnabledU,
    fieldUnion: fieldUnionU,
    modelOpacity: modelOpacityU,
    sectionOpacity: sectionOpacityU,
    camPosZUp: camPosZUpU,
    fieldNormal: fieldNormalU,
    fieldHeight: fieldHeightU,
    bgColor: bgColorU,
    mainRGB: centerMainSample.rgb,
    mainDepthRaw: centerMainDepth.r,
    meshRGBA: centerMeshSample,
    meshDepthRaw: centerMeshDepth.r,
    selIdx: selU.x,
    hovIdx: hovU.x,
    nearFar: nearFarU,
    camOrtho: camOrthoU,
    accumRGBA: accumTexNode.sample(viewportUV),
    accumN: accumNU,
  };

  offsets.forEach(([dx, dy], i) => {
    const ox = uniform(new THREE.Vector2(dx, dy));
    params[`n${i}`] = shapeTex.sample(viewportUV.add(ox.mul(pixelSizeU))).a;
  });

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: false,
    depthTest: false,
    depthWrite: false,
  });
  material.fragmentNode = compositeFn(params);

  compositeScene = new THREE.Scene();
  compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

function rebuildComposite() {
  if (shapeTarget) shapeTarget.dispose();
  if (draftTarget) draftTarget.dispose();
  for (const t of accumTargets) t.dispose();
  if (fieldTarget) fieldTarget.dispose();
  if (mainTarget) mainTarget.dispose();
  if (meshTarget) meshTarget.dispose();
  initComposite();
}

// ── Controls & interaction ──

container.appendChild(renderer.domElement);

await renderer.init();

// Re-sync renderer size after init (canvas may have reflowed when appended)
renderer.setPixelRatio(effectivePixelRatio());
renderer.setSize(container.clientWidth, container.clientHeight);
initComposite();

// Monkey-patch createShaderModule to grab underlying compilation errors
const origCreateShaderModule = renderer.backend.device.createShaderModule;
renderer.backend.device.createShaderModule = function (descriptor) {
  const module = origCreateShaderModule.apply(this, arguments);
  module.getCompilationInfo().then((info) => {
    const errors = info.messages.filter((m) => m.type === "error");
    if (errors.length > 0) {
      const fullCode = descriptor.code || "";
      const wgslCode = currentWGSL || "";
      const match = wgslCode.match(/fn\s+[a-zA-Z0-9_]+/);
      const wgslStart = match ? match[0] : "fn sdShape";
      const wgslIndex = fullCode.indexOf(wgslStart);
      let fwLines = 0;
      let genLines = 0;
      if (wgslIndex !== -1) {
        fwLines = fullCode.substring(0, wgslIndex).split("\n").length - 1;
        genLines = currentWGSL.split("\n").length;
      }
      renderErrMsg = errors
        .map((m) => {
          let msg = `Line ${m.lineNum}: ${m.message}`;
          if (wgslIndex !== -1 && m.lineNum > fwLines && m.lineNum <= fwLines + genLines) {
            msg = msg + "\n    probably line " + (m.lineNum - fwLines) + " in the WGSL code above";
          }
          return msg;
        })
        .join("\n");
    }
  });
  return module;
};

renderer.backend.device.addEventListener("uncapturederror", (event) => {
  renderDisabled = true;
  let message = event.error.message;
  if (renderErrMsg != "") {
    message = renderErrMsg;
  }
  setTimeout(() => {
    eventManager.dispatchEvent("error", {
      message: "WGSL compilation errors:\n" + message,
      // Pass currentWGSL to ensure it's treated as a renderer error and can be overwritten
      wgsl: currentWGSL,
    });
  }, 100);
});

controls = new OrbitControls(camera, renderer.domElement);
controls.minDistance = 0.1;
controls.maxDistance = Math.max(40, worldExtent * 4); // kept in step by setWorldExtent
// Anchor zoom to the cursor so the orbit pivot follows whatever the user is
// looking at. Without this the target stays at the origin, and OrbitControls
// scales both dolly step and pan speed by the camera-to-target distance — so
// exploring away from the origin makes zoom ultra-sensitive and pan ineffective.
controls.zoomToCursor = true;
controls.addEventListener("change", () => {
  // Re-anchoring the orbit pivot on a click fires "change" without moving
  // the camera; the progressive sum survives that, unless depth of field is
  // on and still focused on the pivot.
  const moved = motion.noteCamera(camera);
  scheduleRender(moved || (getAperture() > 0 && !focusPointZUp) ? undefined : { keepAccum: true });
});
cameraRig = new ViewCameraRig({
  camera,
  controls,
  domElement: renderer.domElement,
  getAspect: cameraAspect,
  scheduleRender,
  onChange: setActiveCamera,
});
gslUiControls = new GslUiControls({
  scene: uiScene,
  world: uiZUpWorld,
  camera,
  domElement: renderer.domElement,
  orbitControls: controls,
  scheduleRender,
  gridStep: () => drawnGridSpacing(worldExtent, gridSpacing),
});
orthoViewHelper = new OrthoViewHelper({
  camera,
  controls,
  domElement: renderer.domElement,
  scheduleRender,
  onView: (dir) => cameraRig.snapOrthographic(dir),
});
cameraRig.listenForRotation();

function handleResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setPixelRatio(effectivePixelRatio());
  cameraRig?.resize();
  renderer.setSize(w, h);
  rebuildComposite();
  scheduleRender();
}
new ResizeObserver(handleResize).observe(container);
matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    .addEventListener("change", handleResize);

document.querySelectorAll("[data-render-scale]").forEach((button) => {
  button.addEventListener("click", () => {
    renderScale = Number(button.dataset.renderScale);
    document.querySelectorAll("[data-render-scale]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", active);
    });
    handleResize();
  });
});

bindTierButtons(() => scheduleRender());
bindEnvironmentControls();
// The Detail slider sets the detail ladder's rungs (gsl-shading.js): what a
// part gives up as it gets smaller on screen.
// The guarded parts the program reports (currentParts, partBoxes, beside
// zUpWorld): their sizes on the Detail slider's histogram, measured every
// frame, and, when shown, their boxes over the render.
export function setParts(parts) {
  currentParts = parts || [];
  partBoxes.setParts(currentParts);
  scheduleRender();
}

function updatePartView() {
  const sizes = partSizesPx(currentParts, camPosZUpU.value, pixelScaleU.value, camOrthoU.value);
  showPartSizes(sizes);
  partBoxes.update(sizes);
}

bindDetailSlider("detail-slider", () => scheduleRender(), (show) => {
  partBoxes.object.visible = show;
  scheduleRender();
});

bindFieldOfView((deg) => {
  cameraRig.fov = deg;
  controls.maxDistance = orbitReach();
  cameraRig.applyLens();
});
const focusToolButton = bindRenderControls({
  onAperture: () => scheduleRender(),
  onFocusTool: (on) => {
    focusToolOn = on;
  },
  onRenderImage: startRenderImage,
  onShadows: (on) => {
    // Standard has no shadows to switch; its ambient occlusion is the
    // nearest thing, so it goes with them.
    traceFlagsU.value.x = on ? 1 : 0;
    renderKnobsU.value.x = on ? 1 : 0;
    scheduleRender();
  },
  onBackFaces: (dim) => {
    // Every tier draws a surface seen from behind at this brightness.
    const backDim = dim ? BACK_FACE_DIM : 1;
    renderKnobsU.value.z = backDim;
    traceFlagsU.value.y = backDim;
    scheduleRender();
  },
});

// The Focus tool takes the next click on the model before the shape picker
// does: the point under the cursor becomes the depth-of-field focus.
renderer.domElement.addEventListener("click", async (event) => {
  if (!focusToolOn) return;
  event.stopImmediatePropagation();
  const p = await pickWorldPoint(event);
  focusToolOn = false;
  focusToolButton?.classList.remove("active");
  if (!p) return;
  focusPointZUp = new THREE.Vector3(p.x, p.y, p.z);
  scheduleRender();
}, { capture: true });

// Picking helpers

function getPixelCoords(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = Math.min(
    Math.floor((event.clientX - rect.left) * shapeTarget.width / rect.width),
    shapeTarget.width - 1,
  );
  const y = Math.min(
    Math.floor((event.clientY - rect.top) * shapeTarget.height / rect.height),
    shapeTarget.height - 1,
  );
  if (x < 0 || y < 0) return null;
  return { x, y };
}

renderer.domElement.addEventListener("mousedown", (event) => {
  mouseDownPos = { x: event.clientX, y: event.clientY };
  // Anchor the orbit pivot to the surface under the cursor before a drag begins,
  // so pan/orbit sensitivity scales to what's actually being looked at rather
  // than a possibly-distant orbit target.
  reanchorOrbitTarget(event);
});

// Re-anchor on zoom too (debounced) so scrolling in toward a small object keeps
// the pivot — and thus the control sensitivity — on that object.
let _reanchorWheelTimer = null;
renderer.domElement.addEventListener("wheel", (event) => {
  if (_reanchorWheelTimer) clearTimeout(_reanchorWheelTimer);
  _reanchorWheelTimer = setTimeout(() => reanchorOrbitTarget(event), 60);
}, { passive: true });

renderer.domElement.addEventListener("click", async (event) => {
  if (mouseDownPos) {
    const dx = event.clientX - mouseDownPos.x;
    const dy = event.clientY - mouseDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      mouseDownPos = null;
      return;
    }
  }
  mouseDownPos = null;

  if (!shapeTarget) return;
  const coords = getPixelCoords(event);
  if (!coords) return;

  const pixelBuffer = await renderer.readRenderTargetPixelsAsync(
    shapeTarget,
    coords.x,
    coords.y,
    1,
    1,
  );
  const shapeIndex = Math.floor(pixelBuffer[3]);

  eventManager.dispatchEvent("shape/picked", { shapeIndex });
  scheduleRender({ keepAccum: true });
});

renderer.domElement.addEventListener("mousemove", async (event) => {
  if (hoverPending) return;
  hoverPending = true;

  if (!shapeTarget || !outlinesEnabled) {
    hoverPending = false;
    return;
  }
  const coords = getPixelCoords(event);
  if (!coords) {
    hoverPending = false;
    return;
  }

  const pixelBuffer = await renderer.readRenderTargetPixelsAsync(
    shapeTarget,
    coords.x,
    coords.y,
    1,
    1,
  );
  const shapeIndex = Math.floor(pixelBuffer[3]);

  const prevHovered = hoveredShapeVec.x;
  hoveredShapeVec.x = shapeIndex;
  eventManager.dispatchEvent("shape/hovered", { shapeIndex });
  if (shapeIndex !== prevHovered) scheduleRender({ keepAccum: true });

  hoverPending = false;
});

// ── Exports ──

export function defaultShapeColorHex(shapeIndex) {
  const t = (1 / 3 + (shapeIndex - 1) * (5 / 12)) % 1;
  const [r, g, b] = cosinePalette(t);

  const toHex = (v) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function setShapeColor(shapeIndex, r, g, b) {
  const entry = gsl_shapeColors.get(shapeIndex);
  if (!entry) return;
  entry.vec.set(r, g, b);
  entry.uniform.value.set(r, g, b);
  scheduleRender();
}

// setSlotVisible shows or hides one shader slot, and setMeshShapeVisible the
// mesh() placements of one return: a program that returns meshes numbers the
// two differently, so the Bodies panel's per-return rows drive each apart.
export function setSlotVisible(slot, visible) {
  const u = shapeVisibles.get(slot);
  if (u) u.value = visible ? 1.0 : 0.0;
  scheduleRender();
}

export function setMeshShapeVisible(shapeIndex, visible) {
  applyMeshVisibility(shapeIndex, visible);
  scheduleRender();
}

export function setShapeVisible(shapeIndex, visible) {
  const u = shapeVisibles.get(shapeIndex);
  if (u) u.value = visible ? 1.0 : 0.0;
  // A mesh() return owns a shape slot and gets its own checkbox, but it is
  // rasterized in a separate three.js scene that never reads the shader's
  // visibility uniforms — so hiding it has to happen here too, or the checkbox
  // silently does nothing for imported bodies.
  applyMeshVisibility(shapeIndex, visible);
  scheduleRender();
}

// Per-shape visibility for rasterized meshes, kept so instances created later
// (an asset arriving after the compile) adopt the current state rather than
// popping back into view.
const hiddenMeshShapes = new Set();

function applyMeshVisibility(shapeIndex, visible) {
  if (visible) hiddenMeshShapes.delete(shapeIndex);
  else hiddenMeshShapes.add(shapeIndex);
  for (const inst of meshInstances) {
    if (inst.shapeIndex === shapeIndex) inst.mesh.visible = visible;
  }
}

// Re-apply the remembered visibility to whatever instances exist now.
function refreshMeshVisibility() {
  for (const inst of meshInstances) {
    inst.mesh.visible = !hiddenMeshShapes.has(inst.shapeIndex);
  }
}

export function setSelectedShape(shapeIndex) {
  selectedShapeVec.x = shapeIndex;
  scheduleRender({ keepAccum: true });
}

export function setHoveredShape(shapeIndex) {
  hoveredShapeVec.x = shapeIndex;
}

export function setOutlinesEnabled(enabled) {
  outlinesEnabled = enabled;
  if (!enabled) {
    savedSelectedShape = selectedShapeVec.x;
    selectedShapeVec.x = 0;
    hoveredShapeVec.x = 0;
  } else {
    selectedShapeVec.x = savedSelectedShape;
  }
  scheduleRender({ keepAccum: true });
}

export function setFieldUnion(enabled) {
  fieldUnionU.value = enabled ? 1.0 : 0.0;
  scheduleRender();
}

export function setFieldExternal(enabled) {
  fieldExternalU.value = enabled ? 1.0 : 0.0;
  scheduleRender();
}

export function getWorldExtent() {
  return worldExtent;
}

// Resize the render/mesh domain (half-extent). Domain bound only.
export function setWorldExtent(extent) {
  const next = Math.min(5000, Math.max(0.5, extent));
  if (next === worldExtent) return;
  worldExtent = next;
  worldExtentU.value = next;

  rebuildGrid();

  // Zoom headroom so the user can pull back to frame the whole box. near/far are
  // handled per-frame in updateCameraUniforms (dynamic, distance-based).
  if (controls) controls.maxDistance = orbitReach();

  scheduleRender();
}

// How far the orbit may pull back: room to frame the whole box, and more for
// a lens narrower than the default, which frames it from farther away.
function orbitReach() {
  return Math.max(40, worldExtent * 4) * Math.max(1, cameraRig ? cameraRig.distanceScale() : 1);
}

// Return to the default corner-on view of the current domain. Opening a document
// applies its Scene Size, which alone would leave the camera at whatever distance
// suited the previous scene — inside a part an order of magnitude larger.
export function frameWorldExtent() {
  // Through the lens, which sets how far back that framing stands; an ortho
  // snap would keep its own framing, so this ends one.
  cameraRig.frame(framingPosition(worldExtent), new THREE.Vector3(0, 0, 0));
}

// Rebuild the grid geometry from the current extent + spacing (line positions
// are baked into geometry at construction, so a rebuild is required).
function rebuildGrid() {
  zUpWorld.remove(grid);
  grid.geometry.dispose();
  grid.material.dispose();
  grid = makeGrid(worldExtent, gridSpacing);
  zUpWorld.add(grid);
}

// Grid spacing in millimeters — the stored quantity. A Scene Size change leaves
// it alone, so a 5 mm grid stays 5 mm however the domain is resized.
export function getGridSpacing() {
  return gridSpacing;
}

export function setGridSpacing(mm) {
  const next = Math.min(5000, Math.max(0.01, mm));
  if (next === gridSpacing) return;
  gridSpacing = next;
  rebuildGrid();
  scheduleRender();
}

// Divisions across the full width — the way the grid used to be specified, kept
// for documents whose header carries a bare count. Purely derived: it reads off
// the current extent, so it moves when the scene resizes.
export function getGridDensity() {
  return (2 * worldExtent) / drawnGridSpacing(worldExtent, gridSpacing);
}

export function setGridDensity(density) {
  const next = Math.min(10000, Math.max(1, Math.round(density)));
  setGridSpacing((2 * worldExtent) / next);
}

export function setFieldEnabled(enabled) {
  fieldEnabledU.value = enabled ? 1.0 : 0.0;
  scheduleRender();
}

export function setFieldHeight(height) {
  fieldHeightU.value = height;
  scheduleRender();
}

export function setFieldNormal(x, y, z) {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-6) return;
  fieldNormalU.value.set(x / len, y / len, z / len);
  scheduleRender();
}

export function setFieldInterval(interval) {
  fieldIntervalU.value = interval;
  scheduleRender();
}

export function setFieldFade(fade) {
  fieldFadeU.value = fade;
  scheduleRender();
}

export function setSectionOpacity(opacity) {
  sectionOpacityU.value = opacity;
  scheduleRender();
}

export function setModelOpacity(opacity) {
  modelOpacityU.value = opacity;
  scheduleRender();
}

export function captureScene() {
  if (renderDisabled) return null;
  // Re-render so the canvas has current content
  // (WebGPU clears the canvas buffer after presentation)
  render();
  return renderer.domElement.toDataURL("image/png");
}

// Renders four canonical views (top, front, right, iso) from the current
// orbit target and distance, restoring the interactive camera afterwards.
// Everything happens within one JS turn, so the user never sees the
// temporary cameras. Directions are given in three.js coordinates; the
// scene sits inside zUpWorld (GSL (x,y,z) -> three (x, z, -y)), so
// three +y is GSL up. Returns { top, front, right, iso } as PNG data
// URLs, or null while rendering is disabled.
export function captureSceneViews() {
  if (renderDisabled) return null;
  const savedPos = camera.position.clone();
  const savedQuat = camera.quaternion.clone();
  const savedUp = camera.up.clone();
  const target = controls ? controls.target.clone() : new THREE.Vector3();
  const dist = Math.max(camera.position.distanceTo(target), 0.01);

  // [name, camera direction from target, camera up] in three coords.
  const views = [
    ["top",   new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)],
    ["front", new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
    ["right", new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
    ["iso",   new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0)],
  ];
  const out = {};
  for (const [name, dir, up] of views) {
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.up.copy(up);
    camera.lookAt(target);
    render(false, false);
    out[name] = renderer.domElement.toDataURL("image/png");
  }

  camera.position.copy(savedPos);
  camera.up.copy(savedUp);
  camera.quaternion.copy(savedQuat);
  render();
  return out;
}

function setShaderGrayscaleFilter(enable) {
  renderer.domElement.style.filter = enable
    ? "grayscale(100%) opacity(0.5)"
    : "";
}
function getElapsedMs() {
    if (animPaused) {
        return pauseStartMs - startTimeMs - timeOffsetMs;
    }
    return performance.now() - startTimeMs - timeOffsetMs;
}

export function setAnimDuration(seconds) {
    loopSeconds = seconds > 0 ? seconds : 0;
    scheduleRender();
}

export function getAnimTime() {
    const t = getElapsedMs() / 1000;
    // Only once past the end, so the end itself can be scrubbed to and seen.
    return loopSeconds > 0 && t > loopSeconds ? t % loopSeconds : t;
}

export function setAnimTime(t) {
    const targetMs = t * 1000;
    if (animPaused) {
        timeOffsetMs = pauseStartMs - startTimeMs - targetMs;
    } else {
        timeOffsetMs = performance.now() - startTimeMs - targetMs;
    }
    audioSystem.seek(t);
    scheduleRender();
}

export function setAnimPaused(paused) {
    if (paused && !animPaused) {
        pauseStartMs = performance.now();
        audioSystem.stop();
    } else if (!paused && animPaused) {
        timeOffsetMs += performance.now() - pauseStartMs;
        audioSystem.start();
    }
    animPaused = paused;
    if (!paused) scheduleRender();
}

// ── Audio System ──

class AudioSystem {
    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.currentTime = 0;
        this.isPlaying = false;
        this.volume = 0.5;
        this.gainNode = null;
        this.enabled = true;
        this.hasAudio = false;
        this.initPromise = null;
        this.initialized = false;
        // Mirror of the worklet's slider-value map. setSlider/setSliderMap
        // keep this in sync so a fresh updateShader can seed the worklet
        // with the current values without waiting for the next drag.
        this.sliderValues = {};
    }

    // setSlider pushes a single slider's value to the worklet without
    // triggering a recompile. The worklet's compiled audio function is
    // closed over its own sliderValues map; we mutate it via message.
    setSlider(name, value) {
        this.sliderValues[name] = value;
        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'setSlider',
                data: { name, value }
            });
        }
    }

    // setSliderMap replaces the full slider-value map (called on each
    // recompile so the worklet's view of which keys are sliders stays
    // in sync with the program). Doesn't recompile the shader code
    // itself; the patched consts already fall back to the literal RHS
    // when a name isn't in the map.
    setSliderMap(map) {
        for (const k of Object.keys(this.sliderValues)) delete this.sliderValues[k];
        Object.assign(this.sliderValues, map);
        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'setSliderMap',
                data: { values: { ...this.sliderValues } }
            });
        }
    }

    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInit();
        return this.initPromise;
    }

    async _doInit() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100,
                latencyHint: 'interactive'
            });

            // Load AudioWorklet module. The cache-buster query string
            // forces a fresh fetch on every page load — without it,
            // browsers and service workers can keep serving a stale
            // worklet even after a hard reload, which means
            // worklet-side code changes silently never run.
            await this.audioContext.audioWorklet.addModule('render/gsl-audio-processor.js?v=' + Date.now());

            // Create worklet node (stereo output)
            this.workletNode = new AudioWorkletNode(this.audioContext, 'gsl-audio-processor', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2] // Stereo
            });

            // Add gain control for volume
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.volume;

            // Connect: WorkletNode → Gain → Speakers
            this.workletNode.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);

            // Send sample rate to worklet
            this.workletNode.port.postMessage({
                type: 'setSampleRate',
                data: { sampleRate: this.audioContext.sampleRate }
            });

            // Listen for messages from worklet
            this.workletNode.port.onmessage = (event) => {
                const { type, message, success } = event.data;

                if (type === 'error') {
                    console.error('Audio worklet error:', message);
                } else if (type === 'shaderLoaded') {
                    console.log('Audio shader loaded successfully');
                }
            };

            console.log('Audio system initialized at', this.audioContext.sampleRate, 'Hz');
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize audio system:', error);
            this.initialized = false;
            throw error;
        }
    }

    async updateShader(jsCode, hasAudio) {
        // Wait for initialization to complete
        if (this.initPromise && !this.initialized) {
            try {
                await this.initPromise;
            } catch (error) {
                console.warn('Cannot update shader, audio system not initialized');
                return;
            }
        }
        if (!this.workletNode) {
            console.warn('Audio system not initialized - worklet node is null');
            console.warn('Audio would be available:', hasAudio);
            return;
        }

        console.log('Updating audio shader:', { hasAudio, codeLength: jsCode?.length, isPlaying: this.isPlaying });
        this.hasAudio = hasAudio;

        if (!hasAudio || !jsCode) {
            // No audio - send empty shader to output silence
            this.workletNode.port.postMessage({
                type: 'setEnabled',
                data: { enabled: false }
            });
            return;
        }

        // Send new audio function to worklet thread, starting at the current visual time
        // so audio stays in sync with the renderer after recompile.
        // Slider overrides ride along so a fresh shader picks them up
        // without waiting for the next drag event.
        this.workletNode.port.postMessage({
            type: 'updateShader',
            data: {
                code: jsCode,
                startTime: getElapsedMs() / 1000,
                sliderValues: { ...this.sliderValues }
            }
        });

        // Enable if we have audio
        if (this.enabled) {
            this.workletNode.port.postMessage({
                type: 'setEnabled',
                data: { enabled: true }
            });
        }

        // Send current playing state
        this.workletNode.port.postMessage({
            type: 'setPlaying',
            data: { playing: this.isPlaying }
        });
    }

    async start() {
        // Initialize audio system if not already done (deferred initialization)
        if (!this.initialized && !this.initPromise) {
            console.log('Initializing audio on first play');
            try {
                await this.init();
            } catch (error) {
                console.error('Audio initialization failed on play:', error);
                return;
            }
        }

        if (!this.audioContext || !this.hasAudio || !this.enabled) {
            return;
        }

        // Resume AudioContext (required by browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            console.log('Resuming suspended AudioContext');
            await this.audioContext.resume();
        }

        this.isPlaying = true;

        // Tell worklet to start advancing time
        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'setPlaying',
                data: { playing: true }
            });
        }
    }

    stop() {
        if (!this.audioContext) {
            return;
        }

        this.isPlaying = false;

        // Tell worklet to stop advancing time
        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'setPlaying',
                data: { playing: false }
            });
        }
    }

    seek(time) {
        this.currentTime = time;

        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'seek',
                data: { time: time }
            });
        }
    }

    setVolume(volume) {
        this.volume = volume;
        if (this.gainNode) {
            // Smooth volume changes to prevent clicks
            this.gainNode.gain.linearRampToValueAtTime(
                volume,
                this.audioContext.currentTime + 0.05
            );
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;

        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'setEnabled',
                data: { enabled: enabled && this.hasAudio }
            });
        }

        if (this.gainNode) {
            this.gainNode.gain.value = enabled ? this.volume : 0;
        }
    }

    cleanup() {
        if (this.workletNode) {
            this.workletNode.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Create global audio system instance
const audioSystem = new AudioSystem();

export { setShaderGrayscaleFilter, updateShader, audioSystem };

export function syncUiControls(controls) {
  currentUiControls = controls || [];
  gslUiControls?.sync(currentUiControls);
  mapUiMeshes();
}

export function setUiControlValues(event) {
  let changed = false;
  for (const p of event?.params || []) {
    const u = uiUniformsByParam.get(p.paramName);
    if (!u) continue;
    u.value = p.value;
    changed = true;
  }
  if (event?.kind === "transform" && Array.isArray(event.value) && event.value.length === 16) {
    for (const inst of uiMeshInstancesBySpan.get(spanKey(event.span)) || []) {
      inst.mesh.matrixAutoUpdate = false;
      inst.mesh.matrix.fromArray(event.value);
      inst.mesh.matrixWorldNeedsUpdate = true;
      if (inst.body != null) meshBodyXform.set(inst.body, inst.mesh.matrix.clone());
      changed = true;
    }
  }
  if (changed) {
    motion.note();
    scheduleRender();
  }
  return changed;
}

// setSliderValue updates the TSL uniform for a slider variable and
// schedules a frame so the new value is painted immediately. Without
// the scheduleRender() call the on-demand renderer would only repaint
// when something else (an animation tick, pointer movement) triggered
// a frame — which is why drags would otherwise feel like they only
// updated on mouseup. Returns true if the variable is currently bound
// to a slider in the active scene; false otherwise (the program may
// not have recompiled yet, or the variable lost its min/max props).
export function setSliderValue(varName, value) {
  // Push to the audio worklet first — audio doesn't require the TSL
  // uniform to exist (a slider variable may be referenced only from
  // an audioReturn), so a slider on an audio-only variable still
  // needs to reach the worklet even when the TSL uniform isn't bound.
  audioSystem.setSlider(varName, value);
  const u = sliderUniformsByVar.get(varName);
  if (!u) return false;
  u.value = value;
  motion.note();
  scheduleRender();
  return true;
}

// Move the orbit pivot onto the surface under the cursor, keeping it on the
// current view axis at the surface's depth. OrbitControls.update() then re-derives
// its radius from the (unchanged) camera position, so the camera neither moves nor
// reorients — only the pivot distance changes. Pan/dolly speed (which OrbitControls
// scales by camera-to-target distance) now matches the thing being inspected,
// instead of a far-away origin/target left behind after zooming around.
const _reanchorViewDir = new THREE.Vector3();
async function reanchorOrbitTarget(event) {
  if (!controls || !shapeTarget || camera.isOrthographicCamera) return;
  let p;
  try {
    p = await pickWorldPoint(event);
  } catch (e) {
    return;
  }

  camera.getWorldDirection(_reanchorViewDir);

  let dist;
  if (p) {
    // Distance to the surface under the cursor (Z-up space; camPosZUpVal is the camera).
    const dx = p.x - camPosZUpVal.x;
    const dy = p.y - camPosZUpVal.y;
    const dz = p.z - camPosZUpVal.z;
    dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  } else {
    // Empty space: fall back to the view ray's closest approach to the origin,
    // so the pivot stays near centered content instead of a stale far target.
    const t = -camera.position.dot(_reanchorViewDir);
    if (t <= 0) return; // origin is behind the camera — leave the pivot as-is
    dist = t;
  }

  // Clamp to the dolly range so update() only adjusts the radius (no camera move).
  dist = Math.min(Math.max(dist, controls.minDistance), controls.maxDistance);

  // Target on the current view axis at that depth, so no reorientation or jump.
  controls.target.copy(camera.position).addScaledVector(_reanchorViewDir, dist);
  controls.update();
}

export async function pickWorldPoint(event) {
  const coords = getPixelCoords(event);
  if (!coords) return null;

  // ── SDF hit ──
  let sdfPoint = null;
  let sdfDist = Infinity;
  if (shapeTarget) {
    const pixelBuffer = await renderer.readRenderTargetPixelsAsync(
      shapeTarget, coords.x, coords.y, 1, 1,
    );
    const alpha = pixelBuffer[3];
    const shapeIndex = Math.floor(alpha);
    if (shapeIndex > 0) {
      const frac = alpha - shapeIndex;
      const linDepth = frac >= 0.5 ? frac - 0.5 : frac;
      const viewZ = linDepth * camera.far;

      const ndcX = ((coords.x + 0.5) / shapeTarget.width) * 2 - 1;
      const ndcY = 1 - ((coords.y + 0.5) / shapeTarget.height) * 2;

      // Build the pick ray from the camera basis (matches the raymarch shaders),
      // avoiding the imprecise unproject-near/far subtraction at large scale.
      // camFwdZUp is the center ray direction, so it doubles as lookDir.
      const rayOffset = camRightZUpVal.clone()
        .multiplyScalar(ndcX * camTanFovVal.x)
        .addScaledVector(camUpZUpVal, ndcY * camTanFovVal.y);
      const rayOrigin = camera.isOrthographicCamera
        ? camPosZUpVal.clone().add(rayOffset)
        : camPosZUpVal;
      const rayDir = camera.isOrthographicCamera
        ? camFwdZUpVal.clone()
        : camFwdZUpVal.clone().add(rayOffset).normalize();

      const cosAngle = camera.isOrthographicCamera ? 1 : rayDir.dot(camFwdZUpVal);
      sdfDist = viewZ / Math.max(cosAngle, 0.001);
      sdfPoint = {
        x: rayOrigin.x + rayDir.x * sdfDist,
        y: rayOrigin.y + rayDir.y * sdfDist,
        z: rayOrigin.z + rayDir.z * sdfDist,
      };
    }
  }

  // ── Mesh hit (Three.js raycaster) ──
  let meshPoint = null;
  let meshDist = Infinity;
  if (meshInstances.length > 0) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
    const intersects = raycaster.intersectObjects(meshZUpWorld.children, true);
    if (intersects.length > 0) {
      meshDist = intersects[0].distance;
      // Convert Y-up world hit to Z-up coordinates
      const p = intersects[0].point.clone().applyMatrix4(zUpRotationInverse);
      meshPoint = { x: p.x, y: p.y, z: p.z };
    }
  }

  // Return the closer hit
  if (sdfPoint && meshPoint) {
    return sdfDist <= meshDist ? sdfPoint : meshPoint;
  }
  return sdfPoint || meshPoint;
}

// Like pickWorldPoint, but also returns a surface normal at the hit:
// { point:{x,y,z}, normal:{x,y,z} } in GSL (Z-up) space, or null. Backs the
// point+normal tool on a raw mesh/implicit hit (no CAD topology). A mesh hit
// uses the exact raycaster face normal; an SDF hit reconstructs a screen-space
// normal from the pick depth buffer (hit pixel + two neighbors), oriented toward
// the camera. normal is null when it can't be reconstructed (e.g. a 1px sliver).
export async function pickWorldPointNormal(event) {
  const coords = getPixelCoords(event);
  if (!coords) return null;

  // ── SDF hit + screen-space normal from the depth target ──
  let sdf = null;
  if (shapeTarget) {
    const W = shapeTarget.width, H = shapeTarget.height;
    // The Z-up world point at a shapeTarget pixel (same reconstruction as
    // pickWorldPoint), or null when the pixel holds no shape.
    const reconstruct = async (px, py) => {
      if (px < 0 || py < 0 || px >= W || py >= H) return null;
      const buf = await renderer.readRenderTargetPixelsAsync(shapeTarget, px, py, 1, 1);
      const alpha = buf[3];
      const shapeIndex = Math.floor(alpha);
      if (shapeIndex <= 0) return null;
      const frac = alpha - shapeIndex;
      const linDepth = frac >= 0.5 ? frac - 0.5 : frac;
      const viewZ = linDepth * camera.far;
      const ndcX = ((px + 0.5) / W) * 2 - 1;
      const ndcY = 1 - ((py + 0.5) / H) * 2;
      const rayDir = camFwdZUpVal.clone()
        .addScaledVector(camRightZUpVal, ndcX * camTanFovVal.x)
        .addScaledVector(camUpZUpVal, ndcY * camTanFovVal.y)
        .normalize();
      const dist = viewZ / Math.max(rayDir.dot(camFwdZUpVal), 0.001);
      return {
        p: new THREE.Vector3(
          camPosZUpVal.x + rayDir.x * dist,
          camPosZUpVal.y + rayDir.y * dist,
          camPosZUpVal.z + rayDir.z * dist,
        ),
        dist,
      };
    };
    const c = await reconstruct(coords.x, coords.y);
    if (c) {
      // Two neighbors for the cross product; fall back to the opposite side at
      // the frame edge — the camera-facing test below fixes the resulting sign.
      let r = await reconstruct(coords.x + 1, coords.y); if (!r) r = await reconstruct(coords.x - 1, coords.y);
      let u = await reconstruct(coords.x, coords.y + 1); if (!u) u = await reconstruct(coords.x, coords.y - 1);
      let normal = null;
      if (r && u) {
        const n = new THREE.Vector3().subVectors(r.p, c.p).cross(new THREE.Vector3().subVectors(u.p, c.p));
        if (n.lengthSq() > 1e-20) {
          if (n.dot(new THREE.Vector3().subVectors(camPosZUpVal, c.p)) < 0) n.negate();
          n.normalize();
          normal = { x: n.x, y: n.y, z: n.z };
        }
      }
      sdf = { point: { x: c.p.x, y: c.p.y, z: c.p.z }, normal, dist: c.dist };
    }
  }

  // ── Mesh hit + exact face normal ──
  let mesh = null;
  if (meshInstances.length > 0) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
    const intersects = raycaster.intersectObjects(meshZUpWorld.children, true);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const p = hit.point.clone().applyMatrix4(zUpRotationInverse);
      let normal = null;
      if (hit.face) {
        const nm = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
        const n = hit.face.normal.clone().applyNormalMatrix(nm).transformDirection(zUpRotationInverse).normalize();
        normal = { x: n.x, y: n.y, z: n.z };
      }
      mesh = { point: { x: p.x, y: p.y, z: p.z }, normal, dist: hit.distance };
    }
  }

  if (sdf && mesh) return sdf.dist <= mesh.dist ? sdf : mesh;
  return sdf || mesh;
}

// ── Mesh import management ──

const defaultMeshMaterial = new THREE.MeshStandardMaterial({
  color: 0xb0b0b0,
  metalness: 0.1,
  roughness: 0.6,
  side: THREE.DoubleSide,
});

export function addMesh(label, geometry, index = null) {
  geometry.computeVertexNormals();
  if (index == null) {
    index = nextMeshIndex++;
  } else {
    const existing = meshGeometries.get(index);
    if (existing) existing.geometry.dispose();
    nextMeshIndex = Math.max(nextMeshIndex, index + 1);
  }
  meshGeometries.set(index, { geometry, label });
  return index;
}

export function removeMesh(index) {
  const entry = meshGeometries.get(index);
  if (!entry) return;
  // Tear down any DISPLAYED instances of this body before freeing its geometry
  // — otherwise the next frame draws a freed index buffer (WebGPU hard-crashes
  // on a disposed GPUBuffer). Restore highlights first so we don't touch
  // materials we're about to dispose.
  clearTopoHighlights();
  for (let i = meshInstances.length - 1; i >= 0; i--) {
    const inst = meshInstances[i];
    if (inst.body !== index) continue;
    meshZUpWorld.remove(inst.mesh);
    if (inst.annotated) { for (const o of inst.objects) o.material.dispose(); }
    else { inst.material.dispose(); }
    meshInstances.splice(i, 1);
  }
  const owned = (o) => o.userData && o.userData.body === index;
  for (const arr of [displayedTopoFaces, displayedTopoEdges, displayedTopoVertices, displayedTopoCenters]) {
    for (let i = arr.length - 1; i >= 0; i--) if (owned(arr[i])) arr.splice(i, 1);
  }
  meshBodyXform.delete(index);
  if (entry.annotated) {
    for (const f of entry.faces) f.geometry.dispose();
    for (const e of entry.edges) { e.geometry.dispose(); if (e.fatGeometry) e.fatGeometry.dispose(); }
    // vertices share the module-level UNIT_SPHERE geometry; nothing to dispose
  } else {
    entry.geometry.dispose();
  }
  meshGeometries.delete(index);
  mapUiMeshes();
  scheduleRender();
}

export function clearMeshAssets() {
  for (const index of Array.from(meshGeometries.keys())) removeMesh(index);
  clearTopoHighlights();
  meshInstances.length = 0;
  displayedTopoFaces.length = 0;
  displayedTopoEdges.length = 0;
  displayedTopoVertices.length = 0;
  displayedTopoCenters.length = 0;
  meshBodyXform.clear();
  uiMeshInstancesBySpan.clear();
  gslUiControls?.setBindings([], true);
  nextMeshIndex = 0;
  scheduleRender();
}

// Replace all mesh instances in the scene based on GSL mesh() declarations.
// Multiple declarations referencing the same index create separate instances
// sharing the same geometry. An annotated (CAD topology) entry instantiates as
// a group of per-face meshes, each pickable. Returns unrecognized indices.
export function syncMeshInstances(decls) {
  // Clear all current instances. Restore highlights first so we never touch a
  // material we're about to dispose.
  clearTopoHighlights();
  for (const inst of meshInstances) {
    meshZUpWorld.remove(inst.mesh);
    if (inst.annotated) {
      for (const o of inst.objects) o.material.dispose();  // geometry owned by the registry
    } else {
      inst.material.dispose();
    }
  }
  meshInstances.length = 0;
  displayedTopoFaces.length = 0;
  displayedTopoEdges.length = 0;
  displayedTopoVertices.length = 0;
  displayedTopoCenters.length = 0;
  meshBodyXform.clear();

  const unknownIndices = [];

  const applyTransform = (obj, decl) => {
    // Placement is a 4x4 homogeneous matrix (column-major); empty = identity.
    const m = decl.matrix;
    if (Array.isArray(m) && m.length === 16) {
      obj.matrixAutoUpdate = false;
      obj.matrix.fromArray(m);
    }
  };

  for (const decl of decls) {
    const entry = meshGeometries.get(decl.index);
    if (!entry) {
      if (!unknownIndices.includes(decl.index)) unknownIndices.push(decl.index);
      continue;
    }
    const baseMatrix = matrixArray(decl.matrix);

    if (entry.annotated) {
      // CAD topology: per-face meshes (STL gray), per-edge lines (darker gray),
      // per-vertex points — all individually pickable, each carrying its B-rep
      // metadata so a click/hover can read it.
      const group = new THREE.Group();
      const objects = [];
      for (const fd of entry.faces) {
        const m = new THREE.Mesh(fd.geometry, _faceMaterial(fd.geometry));
        m.name = fd.name;
        m.userData = { topoKind: "face", body: decl.index, surface_type: fd.surface_type, surface_params: fd.surface_params, hasUv: fd.hasUv };
        group.add(m); objects.push(m); displayedTopoFaces.push(m);
      }
      for (const ed of entry.edges) {
        // Fat lines (LineSegments2 + Line2NodeMaterial) give edges a visible
        // screen-space width under WebGPU. The instanced geometry is cached on
        // the edge (owned by the registry, like ed.geometry).
        if (!ed.fatGeometry) ed.fatGeometry = _fatLineGeometry(ed.geometry);
        const l = new LineSegments2(ed.fatGeometry, new THREE.Line2NodeMaterial({ color: TOPO_EDGE_COLOR }));
        l.material.linewidth = TOPO_EDGE_WIDTH;   // pixels (worldUnits stays false)
        // Edges sit exactly on face boundaries; bias their depth toward the
        // camera (WebGPU maps polygonOffset -> depthBias) so they win the
        // z-test against coincident faces instead of z-fighting.
        l.material.polygonOffset = true;
        l.material.polygonOffsetUnits = TOPO_EDGE_DEPTH_BIAS;
        l.material.polygonOffsetFactor = TOPO_EDGE_DEPTH_BIAS;
        l.name = ed.name;
        l.userData = { topoKind: "edge", body: decl.index, curve_type: ed.curve_type, curve_params: ed.curve_params, face_ids: ed.face_ids, end_vertex_ids: ed.end_vertex_ids, tdata: ed.tdata };
        group.add(l); objects.push(l); displayedTopoEdges.push(l);
      }
      // Vertices are small sphere markers (reliable under WebGPU; Points are
      // not), drawn only while hovered or selected.
      const vradius = (entry.scale || 1) * 0.012;
      for (const vd of entry.vertices) {
        const p = new THREE.Mesh(UNIT_SPHERE, new THREE.MeshBasicMaterial({ color: TOPO_VERT_COLOR }));
        p.position.set(vd.position[0], vd.position[1], vd.position[2]);
        p.scale.setScalar(vradius);
        p.name = vd.name;
        p.visible = false;
        p.userData = { topoKind: "vertex", body: decl.index, edge_ids: entry.vertexEdges[vd.name] || [] };
        group.add(p); objects.push(p); displayedTopoVertices.push(p);
      }
      // Circle / arc centers: one marker per distinct center. Deduped by
      // position within modeling tolerance, so split components of one edge and
      // concentric circles collapse to a single marker. Shown only while the
      // point-select tool is active (topoCentersVisible), and selectable then.
      const centerPts = [];
      for (const ed of entry.edges) {
        const c = ed.curve_params && ed.curve_params.center;
        if (!c || c.length < 3) continue;
        if (_edgeArcSweepDeg(ed) < TOPO_CENTER_MIN_ARC_DEG) continue; // short arc: center is off in space, not a useful snap
        let dup = false;
        for (const q of centerPts) {
          const dx = c[0] - q[0], dy = c[1] - q[1], dz = c[2] - q[2];
          if (dx * dx + dy * dy + dz * dz <= TOPO_CENTER_TOL * TOPO_CENTER_TOL) { dup = true; break; }
        }
        if (dup) continue;
        centerPts.push([c[0], c[1], c[2]]);
        const p = new THREE.Mesh(UNIT_SPHERE, new THREE.MeshBasicMaterial({ color: TOPO_CENTER_COLOR }));
        p.position.set(c[0], c[1], c[2]);
        p.scale.setScalar(vradius);
        p.name = ed.name;                  // carries the base id for the ref
        p.visible = topoCentersVisible;
        p.userData = { topoKind: "center", body: decl.index, curve_type: ed.curve_type };
        group.add(p); objects.push(p); displayedTopoCenters.push(p);
      }
      applyTransform(group, decl);
      meshBodyXform.set(decl.index, group.matrix.clone());
      meshZUpWorld.add(group);
      meshInstances.push({ mesh: group, annotated: true, objects, body: decl.index, baseMatrix, shapeIndex: decl.shapeIndex || 0 });
    } else {
      const material = defaultMeshMaterial.clone();
      const mesh = new THREE.Mesh(entry.geometry, material);
      applyTransform(mesh, decl);
      meshZUpWorld.add(mesh);
      meshInstances.push({ mesh, material, body: decl.index, baseMatrix, shapeIndex: decl.shapeIndex || 0 });
    }
  }

  mapUiMeshes();
  refreshMeshVisibility();
  scheduleRender();
  return unknownIndices;
}

function mapUiMeshes() {
  uiMeshInstancesBySpan.clear();
  const bindings = [];
  for (const c of currentUiControls) {
    const key = spanKey(c.span);
    if (c.kind !== "transform" || !key || !Array.isArray(c.value) || c.value.length !== 16) continue;
    const matches = meshInstances.filter((inst) => matricesEqual(inst.baseMatrix, c.value));
    if (matches.length !== 1) continue;
    const inst = matches[0];
    const entry = meshGeometries.get(inst.body);
    if (!entry) continue;
    uiMeshInstancesBySpan.set(key, matches);
    const center = meshCenter(entry);
    if (center) bindings.push({ span: c.span, body: inst.body, center });
  }
  gslUiControls?.setBindings(bindings);
}

function meshCenter(entry) {
  if (entry?.bbox?.center?.length >= 3) return entry.bbox.center.slice(0, 3);
  const geometry = entry?.geometry;
  if (!geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const center = geometry.boundingBox?.getCenter(new THREE.Vector3());
  return center ? [center.x, center.y, center.z] : null;
}

function spanKey(span) {
  if (!span || !span.startLine) return "";
  return `${span.startLine}:${span.startColumn}:${span.endLine}:${span.endColumn}`;
}

function matrixArray(m) {
  return Array.isArray(m) && m.length === 16 ? m.slice() : identityMatrixArray.slice();
}

function matricesEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 16 || b.length !== 16) return false;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-8) return false;
  return true;
}

const uiTransformUnavailable = { ok: false, message: "Transform controls are unavailable." };

function pointArray(point) {
  return Array.isArray(point) ? point : [point?.x, point?.y, point?.z];
}

export function beginUiTransformAlignment() {
  return gslUiControls?.beginAlignment?.() || uiTransformUnavailable;
}

export function useUiTransformCenter() {
  return gslUiControls?.useAlignmentCenter?.() || uiTransformUnavailable;
}

export function setUiTransformPivot(point, body) {
  return gslUiControls?.setAlignmentPivot?.(pointArray(point), body) || uiTransformUnavailable;
}

export function setUiTransformDirection(point) {
  return gslUiControls?.setAlignmentDirection?.(pointArray(point)) || uiTransformUnavailable;
}

export function alignUiTransformTo(axis) {
  return gslUiControls?.alignTo?.(axis) || uiTransformUnavailable;
}

export function cancelUiTransformAlignment() {
  return gslUiControls?.cancelAlignment?.() || uiTransformUnavailable;
}

export function getMeshEntries() {
  return Array.from(meshGeometries.entries()).map(([index, { label }]) => ({ index, label }));
}

export function getMeshGeometry(index) {
  const entry = meshGeometries.get(index);
  return entry ? entry.geometry : null;
}

// ── Imported CAD topology (annotated mesh from hodge) ──
//
// An annotated STEP GLB carries the full B-rep
// topology as named nodes: face_NNNN meshes (surface_type / surface_params
// extras + UV), edge_NNNN lines (curve_type / curve_params + incidence) and
// vertex_NNNN points. addAnnotatedMesh stores it in the shared mesh registry
// with a unique index, like an STL: it is shown only when the GSL references
// `mesh(index, ...)`, at which point syncMeshInstances builds pickable per-face
// meshes (STL gray), per-edge lines (darker gray) and per-vertex points.
// Hovering previews the entity under the cursor; clicking selects it and reads
// its B-rep metadata (incl. UV at the pick point for a face, parameter t for an
// edge).

const TOPO_FACE_COLOR = 0xb0b0b0;   // matches the STL defaultMeshMaterial gray
const TOPO_EDGE_COLOR = 0x555555;   // darker gray
const TOPO_EDGE_WIDTH = 2.5;        // on-screen edge thickness (px); fat lines
const TOPO_EDGE_DEPTH_BIAS = -4;    // pull edges toward camera so they beat coincident faces
const TOPO_VERT_COLOR = 0x999999;
const TOPO_CENTER_COLOR = 0x4a90d9; // circle/arc center marker (blue, distinct)
const TOPO_VERT_SLOP = 10;          // CSS px slop for picking a vertex
const TOPO_EDGE_SLOP = 7;           // CSS px slop for picking an edge
const TOPO_VERT_PX = 2.5;           // on-screen radius (px) of a vertex / center marker
const TOPO_CENTER_TOL = 1e-3;       // merge circle centers within this distance (mm)
const TOPO_CENTER_MIN_ARC_DEG = 179; // only show a circle/arc center once the arc spans at least this much
const UNIT_SPHERE = new THREE.SphereGeometry(1, 10, 8);   // shared vertex-marker geo

// ── Thickness field ──
//
// The import may carry per-vertex wall-thickness maps (annotated_mesh.proto
// Face.medial_thickness = maximal-inscribed-ball diameter, plus the legacy
// Face.thickness closest-antipodal-wall map, which still rides in the data
// but is no longer displayed; mm, +inf where there is no measurement).
// addAnnotatedMesh bakes the medial map into per-vertex colors: a
// sequential single-hue ramp, light -> dark over the body-wide finite
// min..max (thin recedes, thick reads as heavy); vertices with no
// measurement keep the neutral face gray. The toolbar's thickness-field
// button shows it as unlit vertex colors (the lit gray material returns
// when off).
const THICKNESS_RAMP = [
  0xcde2fb, 0xb7d3f6, 0x9ec5f4, 0x86b6ef, 0x6da7ec, 0x5598e7, 0x3987e5,
  0x2a78d6, 0x256abf, 0x1c5cab, 0x184f95, 0x104281, 0x0d366b,
].map((h) => new THREE.Color(h));                       // sRGB hex -> linear
const THICKNESS_NODATA = new THREE.Color(TOPO_FACE_COLOR);

// Per-vertex linear-RGB colors for one face's thickness values against the
// body-wide finite [min, max] range.
function _thicknessFieldColors(vals, min, max) {
  const out = new Float32Array(vals.length * 3);
  const span = max - min;
  const last = THICKNESS_RAMP.length - 1;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!Number.isFinite(v)) {
      out[3 * i] = THICKNESS_NODATA.r;
      out[3 * i + 1] = THICKNESS_NODATA.g;
      out[3 * i + 2] = THICKNESS_NODATA.b;
      continue;
    }
    const x = (span > 0 ? (v - min) / span : 1) * last;
    const i0 = Math.min(Math.floor(x), last - 1);
    const f = x - i0;
    const a = THICKNESS_RAMP[i0], b = THICKNESS_RAMP[i0 + 1];
    out[3 * i] = a.r + (b.r - a.r) * f;
    out[3 * i + 1] = a.g + (b.g - a.g) * f;
    out[3 * i + 2] = a.b + (b.b - a.b) * f;
  }
  return out;
}

// Face material for the current display mode: unlit vertex colors while a
// thickness field is shown (and the face has that field baked — the active
// colors have been installed as the "color" attribute), else the standard
// lit gray.
function _faceMaterial(geo) {
  return (thicknessFieldKind && geo.getAttribute("color"))
    ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({
        color: TOPO_FACE_COLOR, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide,
      });
}

// Total angular sweep (degrees) of a circular/arc edge about its center: the sum
// of the angles between successive polyline radius vectors. ~360 for a full
// circle, ~180 for a semicircle, small for a shallow fillet. 0 if the edge has
// no center or polyline. Used to suppress center markers for short arcs, whose
// center sits far off the surface and isn't a useful snap.
function _edgeArcSweepDeg(ed) {
  const c = ed.curve_params && ed.curve_params.center;
  const pts = ed.tdata && ed.tdata.pts;
  if (!c || c.length < 3 || !pts || pts.length < 2) return 0;
  let sum = 0, prev = null;
  for (const p of pts) {
    const vx = p[0] - c[0], vy = p[1] - c[1], vz = p[2] - c[2];
    const len = Math.hypot(vx, vy, vz);
    if (len < 1e-9) { prev = null; continue; }
    const u = [vx / len, vy / len, vz / len];
    if (prev) {
      const dot = Math.max(-1, Math.min(1, prev[0] * u[0] + prev[1] * u[1] + prev[2] * u[2]));
      sum += Math.acos(dot);
    }
    prev = u;
  }
  return sum * 180 / Math.PI;
}

// World units per CSS pixel at a world point for the active camera. The one
// definition shared by everything that keeps a constant on-screen size.
function _worldPerPixel(wp) {
  const h = container.clientHeight || 1;
  return camera.isOrthographicCamera
    ? ((camera.top - camera.bottom) / camera.zoom) / h
    : (2 * Math.tan((camera.fov * Math.PI / 180) / 2) / h) * camera.position.distanceTo(wp);
}

// Build an instanced fat-line geometry from a plain LINES BufferGeometry
// (vertex pairs, possibly indexed): expand to a non-indexed flat segment array
// [ax,ay,az, bx,by,bz, ...] that LineSegmentsGeometry consumes.
function _fatLineGeometry(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index ? geo.index.array : null;
  const nseg = idx ? (idx.length >> 1) : (pos.count >> 1);
  const flat = new Float32Array(nseg * 6);
  for (let s = 0; s < nseg; s++) {
    const ia = idx ? idx[2 * s] : 2 * s, ib = idx ? idx[2 * s + 1] : 2 * s + 1;
    flat[6 * s] = pos.getX(ia); flat[6 * s + 1] = pos.getY(ia); flat[6 * s + 2] = pos.getZ(ia);
    flat[6 * s + 3] = pos.getX(ib); flat[6 * s + 4] = pos.getY(ib); flat[6 * s + 5] = pos.getZ(ib);
  }
  return new LineSegmentsGeometry().setPositions(flat);
}

// Keep visible vertex markers a roughly constant on-screen size regardless of
// zoom (they're UI handles, not world objects): scale each by its camera
// distance so it subtends ~TOPO_VERT_PX pixels. Cheap — at most a couple are
// visible (hover / selection).
function sizeTopoVertexMarkers() {
  if (!camera) return;
  for (const arr of [displayedTopoVertices, displayedTopoCenters]) {
    for (const s of arr) {
      if (!s.visible) continue;
      s.updateWorldMatrix(true, false);
      s.scale.setScalar(Math.max(1e-6, TOPO_VERT_PX * _worldPerPixel(s.getWorldPosition(_wpA))));
    }
  }
}

const topoRaycaster = new THREE.Raycaster();
const _topoV2 = new THREE.Vector2();
const _wpA = new THREE.Vector3(), _wpB = new THREE.Vector3(), _ndc = new THREE.Vector3();
const _xv = new THREE.Vector3();    // scratch for transforming resolved points
const _xn = new THREE.Vector3();    // scratch for transforming resolved normals
const _nm = new THREE.Matrix3();    // scratch normal matrix (rotation of the body xform)
const displayedTopoFaces = [];      // currently-shown pickable faces / edges / vertices
const displayedTopoEdges = [];
const displayedTopoVertices = [];
const displayedTopoCenters = [];    // circle/arc center markers, shown only while
                                    // the point-select tool is active
let topoCentersVisible = false;
let thicknessFieldKind = null;      // "thickness" | "medialThickness" | null: which
                                    // baked colormap the faces currently show
let topoHover = null;              // { obj, restore }
let topoSelect = null;             // { obj, restore }

export function hasAnnotatedMesh() {
  return displayedTopoFaces.length + displayedTopoEdges.length + displayedTopoVertices.length > 0;
}

// Reserve the next mesh index without registering anything. STEP import needs
// the index up front so it can tell the agent which asset slot to register the
// high-res tessellation under, before addAnnotatedMesh runs.
export function reserveMeshIndex() {
  return nextMeshIndex++;
}

// Show/hide circle-center markers. The point-select tool turns them on so the
// user can snap to (and select) the center of any circular edge.
export function setTopoCentersVisible(on) {
  topoCentersVisible = !!on;
  for (const s of displayedTopoCenters) s.visible = topoCentersVisible;
  scheduleRender();
}

// Select which baked thickness field the faces display: "thickness" (closest
// antipodal wall), "medialThickness" (maximal-inscribed-ball diameter), or
// null/false for the standard lit gray. The chosen map's baked colors are
// installed as each face's "color" attribute; faces lacking that map fall
// back to gray. Highlights are cleared first — their restore closures
// capture the material being replaced.
export function setThicknessField(kind) {
  thicknessFieldKind = kind || null;
  clearTopoHighlights();
  for (const m of displayedTopoFaces) {
    const geo = m.geometry;
    const colors = (thicknessFieldKind && geo.userData.fieldColors)
      ? geo.userData.fieldColors[thicknessFieldKind] : null;
    if (colors) geo.setAttribute("color", colors);
    else geo.deleteAttribute("color");
    m.material.dispose();
    m.material = _faceMaterial(geo);
  }
  scheduleRender();
}

// Decode a hodgemesh.AnnotatedMesh protobuf (ArrayBuffer / Uint8Array from the
// hodge service) and register it as an indexed mesh asset, like addMesh does for
// STL. Resolves with { index, faces, edges, vertices, types, source, bbox }.
// Display happens via the GSL mesh(index, ...) path. Coordinates are part frame
// (millimeters); the body's mesh(...) placement is applied at resolve time.
export function addAnnotatedMesh(label, arrayBuffer, forcedIndex) {
  return new Promise((resolve, reject) => {
    try {
      // const am = decodeAnnotatedMesh(arrayBuffer);
      // if (!am.faces.length) { reject(new Error("no B-rep faces in AnnotatedMesh")); return; }
      // const faces = [], edges = [], vertices = [], types = {}, vertexEdges = {};
      // const box = new THREE.Box3();

      // for (const f of am.faces) {
      //   const geo = new THREE.BufferGeometry();
      //   geo.setAttribute("position", new THREE.BufferAttribute(f.positions, 3));
      //   if (f.tris && f.tris.length) geo.setIndex(new THREE.BufferAttribute(f.tris, 1));
      //   if (f.uv) geo.setAttribute("uv", new THREE.BufferAttribute(f.uv, 2));
      //   if (f.normals) geo.setAttribute("normal", new THREE.BufferAttribute(f.normals, 3));
      //   else geo.computeVertexNormals();
      //   geo.computeBoundingBox(); box.union(geo.boundingBox);
      //   faces.push({ geometry: geo, name: f.name, surface_type: f.surfaceType,
      //                surface_params: f.surfaceParams, hasUv: !!f.uv,
      //                thickness: f.thickness, clearance: f.clearance,
      //                medialThickness: f.medialThickness });
      //   types[f.surfaceType] = (types[f.surfaceType] || 0) + 1;
      // }

      // for (const e of am.edges) {
      //   const P = e.polyline.length / 3;
      //   if (P < 2) continue;   // need a segment to draw / interpolate
      //   // LINES geometry (consecutive-point pairs) for the fat-line builder, and
      //   // the part-space polyline + per-vertex t sidecar for pick / resolve.
      //   const seg = new Float32Array(6 * (P - 1));
      //   const pts = new Array(P);
      //   for (let i = 0; i < P; i++) pts[i] = [e.polyline[3 * i], e.polyline[3 * i + 1], e.polyline[3 * i + 2]];
      //   for (let i = 0; i < P - 1; i++) {
      //     seg.set(pts[i], 6 * i); seg.set(pts[i + 1], 6 * i + 3);
      //   }
      //   const geo = new THREE.BufferGeometry();
      //   geo.setAttribute("position", new THREE.BufferAttribute(seg, 3));
      //   // t: null where the native parameter is unknown (NaN), matching the
      //   // resolver's null-handling.
      //   const t = e.t ? Array.from(e.t, (x) => (Number.isFinite(x) ? x : null)) : null;
      //   edges.push({ geometry: geo, name: e.name, curve_type: e.curveType,
      //                curve_params: e.curveParams, face_ids: e.faceIds,
      //                end_vertex_ids: e.endVertexIds, tdata: { pts, t } });
      // }

      // for (const v of am.vertices) {
      //   if (v.position.length < 3) continue;
      //   vertices.push({ name: v.name, position: [v.position[0], v.position[1], v.position[2]] });
      //   vertexEdges[v.name] = v.edgeIds || [];
      // }

      // const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
      // const ctr = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
      // const scale = size.length();
      // const bbox = { center: [ctr.x, ctr.y, ctr.z], radius: scale / 2 };
      // // Use the pre-reserved index (STEP import) so the display body and the
      // // server-side high-res asset share the same mesh() slot; else allocate.
      // let index = forcedIndex;
      // if (index == null) index = nextMeshIndex++;
      // else if (index >= nextMeshIndex) nextMeshIndex = index + 1;
      // // Bake the displayed thickness map (medial only — the legacy NCH map
      // // stays in the decoded data but gets no colors) into per-vertex
      // // colors over its body-wide finite range. The baked attributes wait
      // // in the geometry's userData; setThicknessField installs the chosen
      // // one as "color".
      // const fieldRanges = {};
      // for (const kind of ["medialThickness"]) {
      //   let tMin = Infinity, tMax = -Infinity;
      //   for (const fd of faces) {
      //     const tv = fd[kind];
      //     if (!tv) continue;
      //     for (let i = 0; i < tv.length; i++) {
      //       const v = tv[i];
      //       if (!Number.isFinite(v)) continue;
      //       if (v < tMin) tMin = v;
      //       if (v > tMax) tMax = v;
      //     }
      //   }
      //   if (tMin >= Infinity) continue;
      //   fieldRanges[kind] = [tMin, tMax];
      //   for (const fd of faces) {
      //     if (!fd[kind]) continue;
      //     const colors = new THREE.BufferAttribute(_thicknessFieldColors(fd[kind], tMin, tMax), 3);
      //     (fd.geometry.userData.fieldColors ??= {})[kind] = colors;
      //     // A field is already being shown: give this body the attribute now
      //     // so it arrives displaying the same map as everything else.
      //     if (kind === thicknessFieldKind) fd.geometry.setAttribute("color", colors);
      //   }
      // }
      // const hasThickness = !!fieldRanges.medialThickness;
      // meshGeometries.set(index, { annotated: true, label, faces, edges, vertices, vertexEdges, scale, bbox });
      // resolve({ index, faces: faces.length, edges: edges.length, vertices: vertices.length,
      //           types, source: am.source || null, bbox, hasThickness,
      //           medialThicknessRange: fieldRanges.medialThickness || null });
    } catch (err) {
      reject(err);
    }
  });
}

// Segment accessor for an edge geometry, abstracting fat (instanceStart/End
// interleaved attributes) vs plain LINES (position pairs, maybe indexed).
function _edgeSegAccess(geo) {
  const iS = geo.attributes.instanceStart, iE = geo.attributes.instanceEnd;
  if (iS && iE) {
    return { count: iS.count, start: (i, v) => v.fromBufferAttribute(iS, i), end: (i, v) => v.fromBufferAttribute(iE, i) };
  }
  const pos = geo.attributes.position;
  if (!pos || pos.count < 2) return { count: 0 };
  const idx = geo.index ? geo.index.array : null;
  const nseg = idx ? (idx.length >> 1) : (pos.count >> 1);
  return {
    count: nseg,
    start: (i, v) => v.fromBufferAttribute(pos, idx ? idx[2 * i] : 2 * i),
    end: (i, v) => v.fromBufferAttribute(pos, idx ? idx[2 * i + 1] : 2 * i + 1),
  };
}

// Project a world point to CSS pixels in the canvas, or null if off-frustum.
function _toPx(world, rect) {
  _ndc.copy(world).project(camera);
  if (_ndc.z < -1 || _ndc.z > 1) return null;   // outside near/far (incl. behind)
  return [(_ndc.x * 0.5 + 0.5) * rect.width, (-_ndc.y * 0.5 + 0.5) * rect.height];
}

// Pick the entity under the cursor in screen space with a px slop radius (thin
// targets are hard to hit exactly). Preference: vertex > edge > face. Only
// VISIBLE geometry is selectable — an edge/vertex behind the nearest face is
// occluded and skipped. Returns { obj, kind, worldPoint, t?, uv? } or null.
function pickTopo(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const cx = event.clientX - rect.left, cy = event.clientY - rect.top;

  // The face under the cursor is both the face candidate and the occluder:
  // anything farther from the camera than it (beyond a small tolerance) is
  // hidden behind it. Computed lazily — the whole-mesh raycast is the
  // expensive part of a hover, and it's skipped when nothing within slop
  // needs the occlusion check.
  topoRaycaster.setFromCamera(_topoV2.set((cx / rect.width) * 2 - 1, -(cy / rect.height) * 2 + 1), camera);
  let fHit = null, fHitDone = false;
  const faceHit = () => {
    if (!fHitDone) {
      fHitDone = true;
      fHit = displayedTopoFaces.length ? topoRaycaster.intersectObjects(displayedTopoFaces, false)[0] : null;
    }
    return fHit;
  };
  const visible = (wp) => {
    const h = faceHit();
    return !h || camera.position.distanceTo(wp) <= h.distance * 1.03;
  };

  // Vertices: nearest visible sphere center within slop.
  let vBest = null, vBestD = TOPO_VERT_SLOP * TOPO_VERT_SLOP, vWorld = null;
  for (const s of displayedTopoVertices) {
    const wp = s.getWorldPosition(_wpA);
    const px = _toPx(wp, rect); if (!px) continue;
    const d = (px[0] - cx) ** 2 + (px[1] - cy) ** 2;
    if (d < vBestD && visible(wp)) { vBestD = d; vBest = s; vWorld = wp.clone(); }
  }
  if (vBest) return { obj: vBest, kind: "vertex", worldPoint: vWorld };

  // Circle / arc centers (only while shown by the point-select tool): nearest
  // visible marker within slop.
  if (topoCentersVisible) {
    let cBest = null, cBestD = TOPO_VERT_SLOP * TOPO_VERT_SLOP, cWorld = null;
    for (const s of displayedTopoCenters) {
      const wp = s.getWorldPosition(_wpA);
      const px = _toPx(wp, rect); if (!px) continue;
      const d = (px[0] - cx) ** 2 + (px[1] - cy) ** 2;
      if (d < cBestD && visible(wp)) { cBestD = d; cBest = s; cWorld = wp.clone(); }
    }
    if (cBest) return { obj: cBest, kind: "center", worldPoint: cWorld };
  }

  // Edges: nearest visible polyline segment within slop.
  let eBest = null, eBestD = TOPO_EDGE_SLOP * TOPO_EDGE_SLOP, eWorld = null;
  for (const l of displayedTopoEdges) {
    const seg = _edgeSegAccess(l.geometry); if (!seg.count) continue;
    l.updateWorldMatrix(true, false);
    for (let s = 0; s < seg.count; s++) {
      seg.start(s, _wpA).applyMatrix4(l.matrixWorld);
      seg.end(s, _wpB).applyMatrix4(l.matrixWorld);
      const pa = _toPx(_wpA, rect), pb = _toPx(_wpB, rect);
      if (!pa || !pb) continue;
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L2 = dx * dx + dy * dy;
      let u = L2 ? ((cx - pa[0]) * dx + (cy - pa[1]) * dy) / L2 : 0;
      u = Math.max(0, Math.min(1, u));
      const qx = pa[0] + u * dx, qy = pa[1] + u * dy;
      const d = (cx - qx) ** 2 + (cy - qy) ** 2;
      if (d < eBestD) {
        const hw = _wpA.clone().lerp(_wpB, u);
        if (visible(hw)) { eBestD = d; eBest = l; eWorld = hw; }
      }
    }
  }
  if (eBest) return { obj: eBest, kind: "edge", worldPoint: eWorld, t: _edgeT(eBest, eWorld) };

  // Face fallback (the occluder itself). Recompute (u, v) from the hit point
  // against the same triangulation the resolver uses (_faceUvAtPoint), so pick
  // and re-resolve stay consistent, rather than trusting the raycaster's
  // interpolated TEXCOORD_0.
  const fh = faceHit();
  if (fh) {
    const local = fh.object.worldToLocal(fh.point.clone());
    const uv = _faceUvAtPoint(fh.object.geometry, local)
      || (fh.uv ? [fh.uv.x, fh.uv.y] : null);
    return { obj: fh.object, kind: "face", worldPoint: fh.point.clone(),
             uv: uv ? { u: uv[0], v: uv[1] } : null };
  }
  return null;
}

// On a closed periodic curve the mesher resets the final vertex's parameter to
// the period start (e.g. t: 0 -> 2pi then back to 0 at the duplicated closing
// point), so the closing segment's t-range spans the whole curve. Flag such
// "wrap" segments — a parameter reversal larger than half the t-range — so pick
// and resolve both ignore them and stay consistent. Returns a predicate over
// segment index, or null when there is no usable parameter sequence.
function _edgeWrap(ts) {
  if (!ts || ts.length < 3) return null;
  let lo = Infinity, hi = -Infinity, pos = 0, neg = 0;
  for (const v of ts) { if (v == null) continue; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i + 1 < ts.length; i++) {
    if (ts[i] == null || ts[i + 1] == null) continue;
    const d = ts[i + 1] - ts[i]; if (d > 0) pos++; else if (d < 0) neg++;
  }
  const range = hi - lo;
  if (!(range > 0)) return null;
  const half = 0.5 * range, dom = pos >= neg ? 1 : -1;
  return (i) => {
    if (ts[i] == null || ts[i + 1] == null) return false;
    const d = ts[i + 1] - ts[i];
    return Math.sign(d) !== dom && Math.abs(d) > half;
  };
}

// Native curve parameter t at a world point on an edge, from the edge_t sidecar
// (authoritative hodge polyline in part space). null when no sidecar is present.
function _edgeT(lineObj, world) {
  const td = lineObj.userData.tdata;
  if (!td || !td.pts || td.pts.length < 2) return null;
  const local = lineObj.worldToLocal(world.clone());
  const pts = td.pts, ts = td.t;
  const wrap = _edgeWrap(ts);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3();
  let best = Infinity, bestT = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    if (wrap && wrap(i)) continue;   // periodic closing segment: bogus t-range
    a.set(pts[i][0], pts[i][1], pts[i][2]); b.set(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
    ab.subVectors(b, a); ap.subVectors(local, a);
    let u = ap.dot(ab) / (ab.lengthSq() || 1); u = Math.max(0, Math.min(1, u));
    const d = ap.addScaledVector(ab, -u).lengthSq();
    if (d < best) {
      best = d;
      const ta = ts ? ts[i] : null, tb = ts ? ts[i + 1] : null;
      bestT = (ta == null || tb == null) ? (ta ?? tb ?? null) : ta + u * (tb - ta);
    }
  }
  return bestT;
}

// Apply a select/hover highlight to an entity; returns a restore closure.
function topoHighlight(obj, mode) {
  const ud = obj.userData, mat = obj.material;
  if (ud.topoKind === "face") {
    if (mat.emissive) {
      const e = mat.emissive.getHex(), i = mat.emissiveIntensity;
      mat.emissive.setHex(mode === "select" ? 0xffee00 : 0x3b6fb0);
      mat.emissiveIntensity = mode === "select" ? 0.5 : 0.35;
      return () => { mat.emissive.setHex(e); mat.emissiveIntensity = i; };
    }
    // Unlit thickness-field material has no emissive; tint its base color
    // (multiplied with the vertex colors) instead.
    const c = mat.color.getHex();
    mat.color.setHex(mode === "select" ? 0xffee00 : 0x8fb4e8);
    return () => { mat.color.setHex(c); };
  }
  if (ud.topoKind === "vertex") {
    const c = mat.color.getHex(), vis = obj.visible;
    obj.visible = true;     // vertices are drawn only while hovered / selected
    mat.color.setHex(mode === "select" ? 0xff3b30 : 0xffc107);
    return () => { mat.color.setHex(c); obj.visible = vis; };
  }
  if (ud.topoKind === "center") {         // circle-center marker (stays visible)
    const c = mat.color.getHex();
    mat.color.setHex(mode === "select" ? 0xff3b30 : 0xffc107);
    return () => { mat.color.setHex(c); };
  }
  const c = mat.color.getHex();           // edge line
  mat.color.setHex(mode === "select" ? 0x00e5ff : 0xffc107);
  return () => { mat.color.setHex(c); };
}

function clearTopoHighlights() {
  if (topoHover) { topoHover.restore(); topoHover = null; }
  if (topoSelect) { topoSelect.restore(); topoSelect = null; }
}

// Leading B-rep id from a node name: face_0007 -> 7, edge_0005_1 -> 5.
function topoIdOf(name) {
  const m = name.match(/_(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}

// Split-component index of an edge node: edge_0005_1 -> 1, edge_0007 -> null.
// hodge splits one B-rep edge into disconnected polyline components (and, due to
// id reuse, distinct physical edges can share a base id), so the base id alone
// is ambiguous — the component selects the exact one that was picked.
function _edgeComp(name) {
  const m = name.match(/^edge_\d+_(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// Build the inspector payload from a pick result (UV for a face, native t for
// an edge — both already resolved by pickTopo). `body`/`id` let the caller
// write a facePoint/edgePoint/vertexPoint reference into the GSL source.
function topoEntityInfo(r) {
  const ud = r.obj.userData;
  const wp = r.worldPoint.clone().applyMatrix4(zUpRotationInverse);
  const point = { x: wp.x, y: wp.y, z: wp.z };
  const id = topoIdOf(r.obj.name), body = ud.body;
  if (r.kind === "face") {
    return { kind: "face", name: r.obj.name, body, id, surface_type: ud.surface_type,
             surface_params: ud.surface_params, hasUv: ud.hasUv, uv: r.uv || null, point };
  }
  if (r.kind === "edge") {
    return { kind: "edge", name: r.obj.name, body, id, comp: _edgeComp(r.obj.name),
             curve_type: ud.curve_type, curve_params: ud.curve_params, face_ids: ud.face_ids,
             end_vertex_ids: ud.end_vertex_ids, t: r.t, point };
  }
  if (r.kind === "center") {
    return { kind: "center", name: r.obj.name, body, id, curve_type: ud.curve_type, point };
  }
  return { kind: "vertex", name: r.obj.name, body, id, edge_ids: ud.edge_ids, point };
}

// ── Topology-reference evaluation (client-side fold of facePoint / edgePoint /
// vertexPoint) ──
//
// Resolves a stored reference to a part-space [x,y,z] from the loaded annotated
// body, so a pre-compile pass can replace the calls with literals. Mirrors the
// Go topology evaluators (assembler/topofold); returns null if the body isn't
// loaded or the entity/param can't be resolved.
const _pad4 = (n) => String(n).padStart(4, "0");

// For an edge, p0 is the native parameter t and p1 is the optional split
// component index (null/undefined = disambiguate by t-range). The resolved
// part-frame point is transformed by the body's mesh(...) placement so it lands
// where the body is displayed (identity when the body isn't placed yet).
export function evalTopoRef(body, kind, id, p0, p1) {
  const entry = meshGeometries.get(body);
  if (!entry || !entry.annotated) return null;
  let p = null;
  if (kind === "face") p = _evalFacePoint(entry, id, p0, p1);
  else if (kind === "edge") p = _evalEdgePoint(entry, id, p0, p1);
  else if (kind === "vertex") p = _evalVertexPoint(entry, id);
  else if (kind === "center") p = _evalCircleCenter(entry, id);
  if (!p) return null;
  const x = meshBodyXform.get(body);
  if (x) { _xv.set(p[0], p[1], p[2]).applyMatrix4(x); return [_xv.x, _xv.y, _xv.z]; }
  return p;
}

// Place a part-frame { point, normal } into world frame by the body's mesh(...)
// matrix: the point by the full matrix, the normal by its normal matrix (so
// non-uniform scale is handled), renormalized. Returns pn unchanged when the
// body has no placement yet, null when pn is null.
function _placePN(body, pn) {
  if (!pn) return null;
  const x = meshBodyXform.get(body);
  if (!x) return pn;
  _xv.set(pn.point[0], pn.point[1], pn.point[2]).applyMatrix4(x);
  _nm.getNormalMatrix(x);
  _xn.set(pn.normal[0], pn.normal[1], pn.normal[2]).applyMatrix3(_nm).normalize();
  return { point: [_xv.x, _xv.y, _xv.z], normal: [_xn.x, _xn.y, _xn.z] };
}

// World-frame { point, normal } companions to evalTopoRef — each returns the
// resolved point/center plus an outward normal/axis, placed by the body's
// mesh(...) matrix. null if the body isn't loaded or the normal can't resolve.
// Back facePointNormal / edgePointNormal / vertexPointNormal / circleCenterNormal.
export function evalFacePointNormal(body, id, u, v) {
  const entry = meshGeometries.get(body);
  if (!entry || !entry.annotated) return null;
  return _placePN(body, _evalFacePointNormal(entry, id, u, v));
}
export function evalEdgePointNormal(body, id, t, comp) {
  const entry = meshGeometries.get(body);
  if (!entry || !entry.annotated) return null;
  return _placePN(body, _evalEdgePointNormal(entry, id, t, comp));
}
export function evalVertexPointNormal(body, id) {
  const entry = meshGeometries.get(body);
  if (!entry || !entry.annotated) return null;
  return _placePN(body, _evalVertexPointNormal(entry, id));
}
export function evalCircleCenterNormal(body, id) {
  const entry = meshGeometries.get(body);
  if (!entry || !entry.annotated) return null;
  return _placePN(body, _evalCircleCenterNormal(entry, id));
}

const _unit3 = (n) => { const d = Math.hypot(n[0], n[1], n[2]); return d ? [n[0] / d, n[1] / d, n[2] / d] : n; };

function _faceById(entry, id) {
  return entry.faces.find((f) => f.name === `face_${_pad4(id)}`) || null;
}

// face f's per-vertex outward normal at the geometry vertex nearest part-frame
// point p (hodge orients these outward), or null when f carries no normals.
function _faceNormalNearLocal(f, p) {
  const pos = f.geometry.attributes.position, nor = f.geometry.attributes.normal;
  if (!pos || !nor) return null;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - p[0], dy = pos.getY(i) - p[1], dz = pos.getZ(i) - p[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best < 0 ? null : [nor.getX(best), nor.getY(best), nor.getZ(best)];
}

// Average the faces' outward normals taken local to p, normalized; null if none.
function _avgFaceNormalLocal(faces, p) {
  let sx = 0, sy = 0, sz = 0, cnt = 0;
  for (const f of faces) {
    const n = _faceNormalNearLocal(f, p);
    if (n) { sx += n[0]; sy += n[1]; sz += n[2]; cnt++; }
  }
  return cnt ? _unit3([sx, sy, sz]) : null;
}

// Distinct faces adjacent to edge `id` (unioned across split components).
function _facesForEdge(entry, id) {
  const seen = new Set(), out = [];
  for (const e of entry.edges) {
    if (topoIdOf(e.name) !== id || !e.face_ids) continue;
    for (const fid of e.face_ids) {
      if (seen.has(fid)) continue;
      seen.add(fid);
      const f = _faceById(entry, fid);
      if (f) out.push(f);
    }
  }
  return out;
}

// Part-frame { point, normal } at edge param t: the edge point with the average
// of its bounding faces' outward normals, taken local to that point.
function _evalEdgePointNormal(entry, id, t, comp) {
  const p = _evalEdgePoint(entry, id, t, comp);
  if (!p) return null;
  const n = _avgFaceNormalLocal(_facesForEdge(entry, id), p);
  return n ? { point: p, normal: n } : null;
}

// Part-frame { point, normal } at a vertex: position + average of the outward
// normals of every face incident to the vertex (via its edges).
function _evalVertexPointNormal(entry, id) {
  const v = entry.vertices.find((x) => x.name === `vertex_${_pad4(id)}`);
  if (!v) return null;
  const p = [v.position[0], v.position[1], v.position[2]];
  const edgeIds = (entry.vertexEdges && entry.vertexEdges[v.name]) || [];
  const seen = new Set(), faces = [];
  for (const eid of edgeIds) {
    for (const f of _facesForEdge(entry, eid)) {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      faces.push(f);
    }
  }
  const n = _avgFaceNormalLocal(faces, p);
  return n ? { point: p, normal: n } : null;
}

// Part-frame { center, axis } for a circle: hodge orients the emitted axis_dir
// outward (toward the adjacent planar face's outward side), so we just read it.
function _evalCircleCenterNormal(entry, id) {
  const center = _evalCircleCenter(entry, id);
  if (!center) return null;
  const e = entry.edges.find((x) => topoIdOf(x.name) === id && x.curve_params && x.curve_params.axis_dir);
  if (!e) return null;
  const a = e.curve_params.axis_dir;
  return { point: center, normal: _unit3([a[0], a[1], a[2]]) };
}

// Center of a circular/arc edge, from its analytic curve_params (part frame).
function _evalCircleCenter(entry, id) {
  const e = entry.edges.find((x) => topoIdOf(x.name) === id && x.curve_params && x.curve_params.center);
  if (!e) return null;
  const c = e.curve_params.center;
  return c.length >= 3 ? [c[0], c[1], c[2]] : null;
}

function _bary(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = bx - ax, v0y = by - ay, v1x = cx - ax, v1y = cy - ay, v2x = px - ax, v2y = py - ay;
  const d00 = v0x * v0x + v0y * v0y, d01 = v0x * v1x + v0y * v1y, d11 = v1x * v1x + v1y * v1y;
  const d20 = v2x * v0x + v2y * v0y, d21 = v2x * v1x + v2y * v1y;
  const denom = d00 * d11 - d01 * d01;
  if (denom === 0) return null;
  const w1 = (d11 * d20 - d01 * d21) / denom, w2 = (d00 * d21 - d01 * d20) / denom;
  return [1 - w1 - w2, w1, w2];
}

// Surface (u, v) at a local-frame point on a face, from the nearest triangle.
// The three.js raycaster interpolates TEXCOORD_0 across whichever triangle it
// hit; recompute against the same triangulation the resolver uses so pick and
// re-resolve stay consistent. (The OCC mesher splits/consolidates periodic
// faces, so no triangle spans the parameter seam — no seam filtering needed.)
function _faceUvAtPoint(geo, p) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  if (!pos || !uv) return null;
  const idx = geo.index ? geo.index.array : null;
  const ntri = idx ? idx.length / 3 : pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = new THREE.Triangle(), cp = new THREE.Vector3(), bc = new THREE.Vector3();
  let best = null, bestD = Infinity;
  for (let t = 0; t < ntri; t++) {
    const ia = idx ? idx[3 * t] : 3 * t, ib = idx ? idx[3 * t + 1] : 3 * t + 1, ic = idx ? idx[3 * t + 2] : 3 * t + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    tri.set(a, b, c); tri.closestPointToPoint(p, cp);
    const d = cp.distanceToSquared(p);
    if (d < bestD && tri.getBarycoord(cp, bc) !== null) {
      bestD = d;
      best = [bc.x * uv.getX(ia) + bc.y * uv.getX(ib) + bc.z * uv.getX(ic),
              bc.x * uv.getY(ia) + bc.y * uv.getY(ib) + bc.z * uv.getY(ic)];
    }
  }
  return best;
}

function _evalFacePoint(entry, id, u, v) {
  const f = entry.faces.find((x) => x.name === `face_${_pad4(id)}`);
  if (!f) return null;
  const pos = f.geometry.attributes.position, uv = f.geometry.attributes.uv;
  if (!pos || !uv) return null;
  const idx = f.geometry.index ? f.geometry.index.array : null;
  const ntri = idx ? idx.length / 3 : pos.count / 3;
  let best = null, bestSlack = Infinity;
  for (let t = 0; t < ntri; t++) {
    const ia = idx ? idx[3 * t] : 3 * t, ib = idx ? idx[3 * t + 1] : 3 * t + 1, ic = idx ? idx[3 * t + 2] : 3 * t + 2;
    const w = _bary(u, v, uv.getX(ia), uv.getY(ia), uv.getX(ib), uv.getY(ib), uv.getX(ic), uv.getY(ic));
    if (!w) continue;
    const pt = [
      w[0] * pos.getX(ia) + w[1] * pos.getX(ib) + w[2] * pos.getX(ic),
      w[0] * pos.getY(ia) + w[1] * pos.getY(ib) + w[2] * pos.getY(ic),
      w[0] * pos.getZ(ia) + w[1] * pos.getZ(ib) + w[2] * pos.getZ(ic),
    ];
    const minW = Math.min(w[0], w[1], w[2]);
    if (minW >= -1e-6) return pt;
    if (-minW < bestSlack) { bestSlack = -minW; best = pt; }
  }
  return best;
}

// Part-frame { point, normal } at face uv, mirroring _evalFacePoint's triangle
// walk and additionally interpolating the per-vertex 'normal' attribute
// (normalized). Returns null when the face has no normals.
function _evalFacePointNormal(entry, id, u, v) {
  const f = entry.faces.find((x) => x.name === `face_${_pad4(id)}`);
  if (!f) return null;
  const pos = f.geometry.attributes.position, uv = f.geometry.attributes.uv, nor = f.geometry.attributes.normal;
  if (!pos || !uv || !nor) return null;
  const idx = f.geometry.index ? f.geometry.index.array : null;
  const ntri = idx ? idx.length / 3 : pos.count / 3;
  const unit = (n) => { const d = Math.hypot(n[0], n[1], n[2]); return d ? [n[0] / d, n[1] / d, n[2] / d] : n; };
  const at = (ia, ib, ic, w) => ({
    point: [
      w[0] * pos.getX(ia) + w[1] * pos.getX(ib) + w[2] * pos.getX(ic),
      w[0] * pos.getY(ia) + w[1] * pos.getY(ib) + w[2] * pos.getY(ic),
      w[0] * pos.getZ(ia) + w[1] * pos.getZ(ib) + w[2] * pos.getZ(ic),
    ],
    normal: unit([
      w[0] * nor.getX(ia) + w[1] * nor.getX(ib) + w[2] * nor.getX(ic),
      w[0] * nor.getY(ia) + w[1] * nor.getY(ib) + w[2] * nor.getY(ic),
      w[0] * nor.getZ(ia) + w[1] * nor.getZ(ib) + w[2] * nor.getZ(ic),
    ]),
  });
  let best = null, bestSlack = Infinity;
  for (let t = 0; t < ntri; t++) {
    const ia = idx ? idx[3 * t] : 3 * t, ib = idx ? idx[3 * t + 1] : 3 * t + 1, ic = idx ? idx[3 * t + 2] : 3 * t + 2;
    const w = _bary(u, v, uv.getX(ia), uv.getY(ia), uv.getX(ib), uv.getY(ib), uv.getX(ic), uv.getY(ic));
    if (!w) continue;
    const minW = Math.min(w[0], w[1], w[2]);
    if (minW >= -1e-6) return at(ia, ib, ic, w);
    if (-minW < bestSlack) { bestSlack = -minW; best = at(ia, ib, ic, w); }
  }
  return best;
}

function _evalEdgePoint(entry, id, t, comp) {
  const cands = entry.edges.filter((e) => e.name === `edge_${_pad4(id)}` || e.name.startsWith(`edge_${_pad4(id)}_`));
  if (!cands.length) return null;
  let e = cands[0];
  if (comp != null) {
    // Exact split component picked: distinct components can share both the base
    // id and the t-range, so t can't disambiguate — select by component.
    const exact = entry.edges.find((x) => x.name === `edge_${_pad4(id)}_${comp}`);
    if (exact) e = exact;
  } else if (cands.length > 1) {
    const c = cands.find((c) => c.tdata && c.tdata.t && _coversT(c.tdata.t, t));
    if (c) e = c;
  }
  const td = e.tdata;
  if (!td || !td.pts || td.pts.length < 2) return null;
  const pts = td.pts, ts = td.t;
  const wrap = _edgeWrap(ts);
  if (ts && ts.length === pts.length) {
    for (let i = 0; i + 1 < pts.length; i++) {
      if (wrap && wrap(i)) continue;   // periodic closing segment: bogus t-range
      const ta = ts[i], tb = ts[i + 1];
      if (ta == null || tb == null) continue;
      const lo = Math.min(ta, tb), hi = Math.max(ta, tb);
      if (t >= lo - 1e-9 && t <= hi + 1e-9) {
        let f = tb !== ta ? (t - ta) / (tb - ta) : 0;
        f = Math.max(0, Math.min(1, f));
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
                pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f,
                pts[i][2] + (pts[i + 1][2] - pts[i][2]) * f];
      }
    }
  }
  return pts[pts.length - 1];
}

function _coversT(ts, t) {
  let lo = Infinity, hi = -Infinity;
  for (const v of ts) { if (v == null) continue; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return t >= lo - 1e-9 && t <= hi + 1e-9;
}

function _evalVertexPoint(entry, id) {
  const v = entry.vertices.find((x) => x.name === `vertex_${_pad4(id)}`);
  return v ? [v.position[0], v.position[1], v.position[2]] : null;
}

// Click: select the entity under the cursor and return its metadata, or null.
export function pickTopologyEntity(event) {
  if (!hasAnnotatedMesh()) return null;
  const r = pickTopo(event);
  if (topoHover) { topoHover.restore(); topoHover = null; }
  if (topoSelect) { topoSelect.restore(); topoSelect = null; }
  if (!r) { scheduleRender(); return null; }
  topoSelect = { obj: r.obj, restore: topoHighlight(r.obj, "select") };
  scheduleRender();
  return topoEntityInfo(r);
}

// Hover: preview the entity under the cursor (distinct highlight). Returns
// { kind, name } of the hovered entity, or null.
export function hoverTopology(event) {
  if (!hasAnnotatedMesh()) return null;
  const r = pickTopo(event);
  if (topoHover) { topoHover.restore(); topoHover = null; }
  if (r && (!topoSelect || topoSelect.obj !== r.obj)) {
    const restores = [topoHighlight(r.obj, "hover")];
    if (r.kind === "center") {
      // Also preview the edge(s) that generate this center.
      const id = topoIdOf(r.obj.name), body = r.obj.userData.body;
      for (const l of displayedTopoEdges) {
        if (l.userData.body === body && topoIdOf(l.name) === id) restores.push(topoHighlight(l, "hover"));
      }
    }
    topoHover = { obj: r.obj, restore: () => { for (const fn of restores) fn(); } };
  }
  scheduleRender();
  return r ? { kind: r.kind, name: r.obj.name } : null;
}

// ── Bootstrap ──

const defaultWGSL = `
fn sdShape( p : vec3<f32>, time: f32 ) -> gsl_shape {

    // Empty scene: the ray marcher steps straight past a constant far distance,
    // so nothing is drawn until a document compiles.
    return gsl_shape(1e9, 1u);
}
`;
export { defaultWGSL };

updateShader(defaultWGSL, 1);
setShaderGrayscaleFilter(true);

// Initialize audio system
console.log('Starting audio system initialization...');
audioSystem.init()
    .then(() => {
        console.log('Audio system initialized successfully');
    })
    .catch(error => {
        console.error('Audio system initialization failed:', error);
        console.warn('Audio system not available:', error.message);
    });
