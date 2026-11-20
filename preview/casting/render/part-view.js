// The parts the codegen guards, as the viewer sees them: their sizes on
// screen, for the Detail slider's histogram (detail-slider.js), and their
// boxes, drawn as lines over the render, each in the colour of the rung it is
// past. A part is its box, [lo, hi], Z up, as the compiled program reports it
// (api.Part); one whose box moves is not reported.

import * as THREE from "three";
import { detailKnobsU } from "./gsl-shading.js";

// partSizesPx is each part's size on screen, in pixels: its box's shortest
// edge over the size of a pixel at the box's nearest point, as the shader
// measures it (gsl_vanish, backend/wgsl/internal/codegen/vanish.go). eye is the
// camera's position, Z up; pixelScale the world size of a pixel at distance 1,
// or at any distance when ortho is 1.
export function partSizesPx(parts, eye, pixelScale, ortho) {
  return parts.map(({ lo, hi }) => {
    const dx = eye.x - Math.min(Math.max(eye.x, lo[0]), hi[0]);
    const dy = eye.y - Math.min(Math.max(eye.y, lo[1]), hi[1]);
    const dz = eye.z - Math.min(Math.max(eye.z, lo[2]), hi[2]);
    const dist = Math.hypot(dx, dy, dz);
    const pixel = pixelScale * (Math.max(dist, 1) * (1 - ortho) + ortho);
    const edge = Math.min(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    return pixel > 0 ? edge / pixel : Infinity;
  });
}

// The rungs a part can be past, from the most it gives up to the least, each
// with its handle's colour (detail-slider.css), and the colour of a part
// past none.
const RUNG_COLORS = [
  { px: () => detailKnobsU.value.w, color: new THREE.Color(0xe0726b) }, // gone
  { px: () => detailKnobsU.value.y, color: new THREE.Color(0xe2b64c) }, // textures
  { px: () => detailKnobsU.value.z, color: new THREE.Color(0x9a9a9a) }, // simple
  { px: () => detailKnobsU.value.x, color: new THREE.Color(0x6cc0e3) }, // relief
];
const WHOLE_COLOR = new THREE.Color(0xd1d1d1);

// The twelve edges of a box, as pairs of its corners, a corner's bits picking
// hi over lo in x, y and z.
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

// createPartBoxes makes the box overlay, hidden until shown: object is added
// to the viewer's Z-up group, setParts gives it the program's parts, and
// update colours each box by the rung its size is past.
export function createPartBoxes() {
  const geometry = new THREE.BufferGeometry();
  // depthWrite, so the composite (viewer.js, gsl_composite) sees each line's
  // depth in the main target and draws the model over a line only where the
  // model is nearer.
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: true });
  const object = new THREE.LineSegments(geometry, material);
  object.visible = false;
  object.frustumCulled = false;
  let count = 0;

  const setParts = (parts) => {
    count = parts.length;
    const positions = new Float32Array(count * EDGES.length * 2 * 3);
    let k = 0;
    for (const { lo, hi } of parts) {
      const corner = (c) => [c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]];
      for (const [a, b] of EDGES) {
        positions.set(corner(a), k);
        positions.set(corner(b), k + 3);
        k += 6;
      }
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.length), 3));
    geometry.computeBoundingSphere();
  };

  const update = (sizes) => {
    const colors = geometry.getAttribute("color");
    if (!colors || !object.visible) return;
    const rungs = RUNG_COLORS.map((r) => r.px());
    for (let i = 0; i < count; i++) {
      const at = rungs.findIndex((px) => sizes[i] < px);
      const c = at < 0 ? WHOLE_COLOR : RUNG_COLORS[at].color;
      for (let v = 0; v < EDGES.length * 2; v++) {
        colors.setXYZ(i * EDGES.length * 2 + v, c.r, c.g, c.b);
      }
    }
    colors.needsUpdate = true;
  };

  return { object, setParts, update };
}
