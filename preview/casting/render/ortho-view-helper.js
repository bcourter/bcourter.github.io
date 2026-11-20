import * as THREE from "three";

const COLORS = { x: 0xff5353, y: 0x5ade73, z: 0x57a5ff };
const SIZE = 124;
const MARGIN = 14;
const CUBE = 0.78;
const GSL_TO_THREE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const X = zup(1, 0, 0);
const Y = zup(0, 1, 0);
const Z = zup(0, 0, 1);
const FACE_MAT = [
  0xd7d8d9,
  0xbec0c2,
  0xaeb1b4,
  0x8f9397,
];

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const viewport = new THREE.Vector4();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const planeNormal = new THREE.Vector3(0, 0, 1);

// bindFieldOfView wires the Render panel's Field of view slider, whose
// leftmost stop, one below its narrowest lens, is orthographic:
//   onFieldOfView(deg)  the lens changed: degrees, or 0 for orthographic
export function bindFieldOfView(onFieldOfView) {
  const slider = document.getElementById("render-fov");
  const label = document.getElementById("render-fov-label");
  slider?.addEventListener("input", () => {
    const deg = Number(slider.value) <= Number(slider.min) ? 0 : Number(slider.value);
    if (label) label.textContent = deg ? `${deg}\u00b0` : "Ortho";
    onFieldOfView(deg);
  });
}

export class ViewCameraRig {
  constructor({ camera, controls, domElement, getAspect, scheduleRender, onChange }) {
    this.perspective = camera;
    this.perspectiveUp = camera.up.clone();
    this.orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.camera = camera;
    this.controls = controls;
    this.dom = domElement;
    this.getAspect = getAspect || (() => camera.aspect || 1);
    this.scheduleRender = scheduleRender || (() => {});
    this.onChange = onChange || (() => {});
    this.orthoHeight = 10;
    // The lens, from the Field of view slider: degrees, or 0 for orthographic.
    // A view-cube snap is orthographic whatever the lens; the next rotation
    // ends it and returns to the lens.
    this.defaultFov = camera.fov;
    this.fov = camera.fov;
    this.snapped = false;
    this.rotateStart = null;
    this.onPointerDown = (e) => this.pointerDown(e);
    this.onPointerMove = (e) => this.pointerMove(e);
    this.onPointerUp = () => { this.rotateStart = null; };
  }

  listenForRotation() {
    this.dom.addEventListener("pointerdown", this.onPointerDown, true);
    this.dom.addEventListener("pointermove", this.onPointerMove, true);
    this.dom.addEventListener("pointerup", this.onPointerUp, true);
    this.dom.addEventListener("pointercancel", this.onPointerUp, true);
  }

  resize() {
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = this.getAspect();
      this.camera.updateProjectionMatrix();
      return;
    }
    this.updateOrthoProjection();
  }

  snapOrthographic(dir) {
    const source = this.camera;
    const target = this.controls.target;
    const dist = Math.max(0.01, source.position.distanceTo(target));
    this.orthoHeight = source.isOrthographicCamera
      ? (source.top - source.bottom) / source.zoom
      : 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov) / 2);
    this.camera = this.orthographic;
    this.camera.zoom = 1;
    this.camera.up.copy(Math.abs(dir.dot(Z)) > 0.95 ? Y : Z);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    this.updateOrthoProjection();
    this.snapped = true;
    this.controls.object = this.camera;
    this.controls.update();
    this.onChange(this.camera);
    this.scheduleRender();
  }

  // distanceScale is how much farther from the pivot the lens stands than
  // the default lens does to frame the same view; 1 when orthographic.
  distanceScale() {
    if (!this.fov) return 1;
    return Math.tan(THREE.MathUtils.degToRad(this.defaultFov) / 2) / Math.tan(THREE.MathUtils.degToRad(this.fov) / 2);
  }

  // applyLens puts the camera on the lens, keeping the view direction and the
  // height of the view at the orbit pivot, so a narrower lens backs the camera
  // away. It ends a view-cube snap.
  applyLens() {
    const target = this.controls.target;
    const dist = Math.max(0.01, this.camera.position.distanceTo(target));
    const height = this.camera.isOrthographicCamera
      ? (this.camera.top - this.camera.bottom) / this.camera.zoom
      : 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    this.camera.getWorldDirection(tmpV);
    this.place(tmpV, height, dist);
  }

  // frame looks at target from position, as much of the view as the default
  // lens would see from there, through the lens.
  frame(position, target) {
    this.controls.target.copy(target);
    tmpV.copy(target).sub(position);
    const dist = Math.max(0.01, tmpV.length());
    tmpV.normalize();
    this.place(tmpV, 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.defaultFov) / 2), dist);
  }

  // place looks along dir at the orbit pivot through the lens, with a view
  // `height` high at the pivot. An orthographic camera stands `orthoDist` back.
  place(dir, height, orthoDist) {
    const target = this.controls.target;
    tmpV2.copy(this.perspectiveUp);
    if (Math.abs(dir.dot(tmpV2)) > 0.98) dir.addScaledVector(this.camera.up, 0.03).normalize();
    const next = this.fov ? this.perspective : this.orthographic;
    const dist = this.fov ? height / (2 * Math.tan(THREE.MathUtils.degToRad(this.fov) / 2)) : orthoDist;
    next.up.copy(tmpV2);
    next.position.copy(target).addScaledVector(dir, -dist);
    next.lookAt(target);
    next.near = this.camera.near;
    next.far = this.camera.far;
    this.camera = next;
    this.snapped = false;
    if (this.fov) {
      next.fov = this.fov;
      next.aspect = this.getAspect();
      next.updateProjectionMatrix();
    } else {
      this.orthoHeight = height;
      next.zoom = 1;
      this.updateOrthoProjection();
    }
    this.controls.object = next;
    this.controls.update();
    this.onChange(next);
    this.scheduleRender();
  }

  pointerDown(event) {
    if (!this.snapped || event.defaultPrevented) return;
    if (event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.rotateStart = { x: event.clientX, y: event.clientY };
    }
  }

  pointerMove(event) {
    if (!this.rotateStart || !this.snapped || !(event.buttons & 1)) return;
    const dx = event.clientX - this.rotateStart.x;
    const dy = event.clientY - this.rotateStart.y;
    if (dx * dx + dy * dy > 9) {
      this.rotateStart = null;
      this.applyLens();
    }
  }

  updateOrthoProjection() {
    const aspect = this.getAspect();
    const w = this.orthoHeight * aspect / 2;
    const h = this.orthoHeight / 2;
    this.camera.left = -w;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }
}

export class OrthoViewHelper {
  constructor({ camera, controls, domElement, scheduleRender, onView }) {
    this.camera = camera;
    this.controls = controls;
    this.dom = domElement;
    this.scheduleRender = scheduleRender || (() => {});
    this.onView = onView || ((dir) => this.snap(dir));
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.helperCamera = new THREE.OrthographicCamera(-1.55, 1.55, 1.55, -1.55, 0.1, 10);
    this.helperCamera.position.set(0, 0, 4);
    this.scene.add(this.root);
    this.pickables = [];
    this.hover = null;
    this.down = false;

    this.build();
    this.onPointerMove = (e) => this.pointerMove(e);
    this.onPointerDown = (e) => this.pointerDown(e);
    this.onPointerUp = (e) => this.pointerUp(e);
    this.onMouseDown = (e) => this.mouseDown(e);
    this.onClick = (e) => this.click(e);
    this.onWheel = (e) => this.wheel(e);
    this.dom.addEventListener("pointermove", this.onPointerMove, true);
    this.dom.addEventListener("pointerdown", this.onPointerDown, true);
    this.dom.addEventListener("pointerup", this.onPointerUp, true);
    this.dom.addEventListener("pointercancel", this.onPointerUp, true);
    this.dom.addEventListener("mousedown", this.onMouseDown, true);
    this.dom.addEventListener("click", this.onClick, true);
    this.dom.addEventListener("wheel", this.onWheel, true);
  }

  build() {
    this.addFace(X, FACE_MAT[1]);
    this.addFace(X.clone().negate(), FACE_MAT[3]);
    this.addFace(Y, FACE_MAT[2]);
    this.addFace(Y.clone().negate(), FACE_MAT[3]);
    this.addFace(Z, FACE_MAT[0]);
    this.addFace(Z.clone().negate(), FACE_MAT[2]);
    this.addEdges();
    this.addLabel("X", X, COLORS.x);
    this.addLabel("Y", Y, COLORS.y);
    this.addLabel("Z", Z, COLORS.z);
  }

  addFace(dir, color) {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(CUBE, CUBE), m);
    face.position.copy(dir).multiplyScalar(CUBE / 2);
    face.quaternion.setFromUnitVectors(planeNormal, dir);
    face.userData.viewDir = dir.clone();
    face.userData.base = m.color.clone();
    this.root.add(face);
    this.pickables.push(face);
  }

  addLabel(text, dir, color) {
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture(text, color),
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }));
    label.position.copy(dir).multiplyScalar(0.72);
    label.scale.setScalar(0.63);
    label.userData.viewDir = dir.clone();
    this.root.add(label);
    this.pickables.push(label);
  }

  addEdges() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4f5f6 });
    const half = CUBE / 2;
    for (const axis of [X, Y, Z]) {
      const others = [X, Y, Z].filter((a) => a !== axis);
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, CUBE, 6), mat);
        edge.position.copy(others[0]).multiplyScalar(sa * half).addScaledVector(others[1], sb * half);
        edge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
        this.root.add(edge);
      }
    }
  }

  render(renderer) {
    if (!this.dom.offsetWidth || !this.dom.offsetHeight) return;
    this.root.quaternion.copy(this.camera.quaternion).invert();
    this.root.updateMatrixWorld(true);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.getViewport(viewport);
    const y = renderer.isWebGPURenderer ? this.dom.offsetHeight - SIZE - MARGIN : MARGIN;
    renderer.setViewport(MARGIN, y, SIZE, SIZE);
    renderer.render(this.scene, this.helperCamera);
    renderer.setViewport(viewport.x, viewport.y, viewport.z, viewport.w);
    renderer.autoClear = autoClear;
  }

  pointerMove(event) {
    const hit = this.pick(event)?.object || null;
    if (hit === this.hover) return;
    this.setHover(hit);
    this.dom.style.cursor = hit ? "pointer" : "";
    this.scheduleRender();
  }

  pointerDown(event) {
    if (!this.inBounds(event)) return;
    this.down = true;
    stop(event);
  }

  pointerUp(event) {
    if (!this.down) return;
    this.down = false;
    stop(event);
  }

  click(event) {
    if (!this.inBounds(event)) return;
    const hit = this.pick(event);
    if (hit?.object.userData.viewDir) this.onView(hit.object.userData.viewDir);
    stop(event);
  }

  mouseDown(event) {
    if (this.inBounds(event)) stop(event);
  }

  wheel(event) {
    if (this.inBounds(event)) stop(event);
  }

  pick(event) {
    const b = this.bounds();
    const x = event.clientX - b.left;
    const y = event.clientY - b.top;
    if (x < 0 || y < 0 || x > SIZE || y > SIZE) return null;
    mouse.x = (x / SIZE) * 2 - 1;
    mouse.y = -(y / SIZE) * 2 + 1;
    raycaster.setFromCamera(mouse, this.helperCamera);
    return raycaster.intersectObjects(this.pickables, false)[0] || null;
  }

  snap(dir) {
    const target = this.controls?.target || tmpV.set(0, 0, 0);
    const dist = Math.max(0.01, this.camera.position.distanceTo(target));
    const up = tmpV2.copy(Math.abs(dir.dot(Z)) > 0.95 ? Y : Z);
    this.camera.up.copy(up);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.controls?.update();
    this.scheduleRender();
  }

  setHover(object) {
    for (const p of this.pickables) {
      if (p.material?.color && p.userData.base) p.material.color.copy(p.userData.base);
    }
    if (object?.material?.color && object.userData.base) {
      object.material.color.copy(object.userData.base).lerp(new THREE.Color(0xffffff), 0.22);
    }
    this.hover = object;
  }

  inBounds(event) {
    const b = this.bounds();
    return event.clientX >= b.left && event.clientX <= b.right && event.clientY >= b.top && event.clientY <= b.bottom;
  }

  bounds() {
    const r = this.dom.getBoundingClientRect();
    return {
      left: r.left + MARGIN,
      right: r.left + MARGIN + SIZE,
      top: r.bottom - MARGIN - SIZE,
      bottom: r.bottom - MARGIN,
    };
  }
}

function zup(x, y, z) {
  return new THREE.Vector3(x, y, z).applyQuaternion(GSL_TO_THREE).normalize();
}

function labelTexture(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.beginPath();
  ctx.arc(48, 48, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(8, 10, 12, 0.92)";
  ctx.font = "700 42px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 48, 49);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function stop(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}
