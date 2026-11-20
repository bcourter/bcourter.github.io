import * as THREE from "three";
import { Line2 } from "three/addons/lines/webgpu/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import eventManager from "../ui/event-manager.js";

const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const COLORS = { x: 0xbf2c31, y: 0x1fb53c, z: 0x358fe0, direction: 0xf0a030 };
const PLANES = {
  xy: ["x", "y", "z"],
  xz: ["x", "z", "y"],
  yz: ["y", "z", "x"],
};
const ROT_STEP = Math.PI / 36;
const ROT_PICK_RADIUS = 0.07;
const UI_PIXEL_SIZE = 72;
const UI_RENDER_ORDER = 1000000;
// A direction control is one arrow, its own colour so it is not mistaken for
// a frame's axis, and its head sweeps a sphere of this radius (in handle
// units) when dragged.
const DIRECTION_COLOR = COLORS.direction;
const DIRECTION_RADIUS = 0.9;

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpM3 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpWorld = new THREE.Vector3();
const plane = new THREE.Plane();

export class GslUiControls {
  constructor({ scene, world, camera, domElement, orbitControls, scheduleRender, gridStep }) {
    this.scene = scene;
    this.world = world;
    this.camera = camera;
    this.dom = domElement;
    this.orbit = orbitControls;
    this.scheduleRender = scheduleRender || (() => {});
    this.gridStep = gridStep || (() => 1);
    this.root = new THREE.Group();
    this.root.renderOrder = UI_RENDER_ORDER;
    this.world.add(this.root);
    this.items = [];
    this.splines = [];
    this.bindings = [];
    this.bindingStates = new Map();
    this.pickables = [];
    this.hover = null;
    this.drag = null;
    this.alignment = null;
    this.suppressClick = false;
    this.filter = null;

    this.onPointerMove = (e) => this.pointerMove(e);
    this.onPointerDown = (e) => this.pointerDown(e);
    this.onPointerUp = (e) => this.pointerUp(e);
    this.onMouseDown = (e) => this.stopIfBusy(e);
    this.onClick = (e) => this.stopClick(e);
    this.dom.addEventListener("pointermove", this.onPointerMove, true);
    this.dom.addEventListener("pointerdown", this.onPointerDown, true);
    this.dom.addEventListener("pointerup", this.onPointerUp, true);
    this.dom.addEventListener("pointercancel", this.onPointerUp, true);
    this.dom.addEventListener("mousedown", this.onMouseDown, true);
    this.dom.addEventListener("click", this.onClick, true);
  }

  sync(controls) {
    this.clear();
    const splines = (controls || []).filter((info) => info.kind === "spline");
    for (const info of [...(controls || []), ...splines.flatMap((info) => info.controls || [])]) {
      if (this.items.some((item) => sameSpan(item.span, info.span))) continue;
      const item = this.makeItem(info);
      if (!item) continue;
      this.items.push(item);
      this.root.add(item.group);
    }
    for (const info of splines) {
      const items = (info.controls || []).map((control) => this.items.find((item) => sameSpan(item.span, control.span)));
      if (items.length < 3 || items.length % 2 !== 1 || items.some((item) => item?.kind !== "transform")) continue;
      const polygon = splineLine(items.length, true);
      const curve = splineLine((items.length - 1) * 32 + 1);
      polygon.renderOrder = UI_RENDER_ORDER - 2;
      curve.renderOrder = UI_RENDER_ORDER - 1;
      const group = new THREE.Group();
      group.add(polygon, curve);
      this.splines.push({ group, items, polygon, curve });
      this.root.add(group);
    }
    this.bindItems();
    this.paint();
    this.scheduleRender();
  }

  clear() {
    if (this.drag && this.orbit) this.orbit.enabled = true;
    for (const item of [...this.items, ...this.splines]) {
      item.group.removeFromParent();
      item.group.traverse((o) => {
        if (!o.isSprite) o.geometry?.dispose?.();
        o.material?.map?.dispose?.();
        o.material?.dispose?.();
      });
    }
    this.items = [];
    this.splines = [];
    this.pickables = [];
    this.hover = null;
    this.drag = null;
    this.alignment = null;
  }

  setCamera(camera) {
    this.camera = camera;
    this.hover = null;
    this.paint();
    this.scheduleRender();
  }

  setFilter(spans) {
    this.filter = spans;
    this.hover = null;
    this.paint();
    this.scheduleRender();
  }

  makeItem(info) {
    const value = info.value || [];
    const matrix = new THREE.Matrix4();
    if (info.kind === "point" && value.length === 3) {
      matrix.setPosition(value[0], value[1], value[2]);
    } else if (info.kind === "transform" && value.length === 16) {
      matrix.fromArray(value);
    } else if (info.kind === "direction" && value.length === 3) {
      // A direction has no place of its own, only a way to point: it is the
      // z axis of a frame anchored where the document says, @direction's
      // argument, or at the origin. A zero vector points nowhere and gets no
      // arrow.
      const dir = new THREE.Vector3(value[0], value[1], value[2]);
      if (dir.lengthSq() < 1e-18) return null;
      matrix.makeBasis(...basisAround(dir.normalize())).setPosition(anchorOf(info));
    } else {
      return null;
    }
    const item = {
      kind: info.kind,
      span: info.span,
      params: info.params || [],
      matrix,
      pivotLocal: new THREE.Vector3(),
      frameBasis: new THREE.Matrix4(),
      group: new THREE.Group(),
      handles: [],
      lines: {},
      circles: {},
      valueLabel: null,
      activeHandle: null,
    };
    resetFrame(item);
    item.group.renderOrder = UI_RENDER_ORDER;
    item.group.matrixAutoUpdate = false;
    this.addHandles(item);
    this.updateGroup(item);
    return item;
  }

  setBindings(bindings, reset = false) {
    if (this.alignment?.item && this.alignment.original) restoreFrameState(this.alignment.item, this.alignment.original);
    this.alignment = null;
    this.bindings = Array.isArray(bindings) ? bindings : [];
    if (reset) this.bindingStates.clear();
    this.bindItems();
    this.paint();
    this.scheduleRender();
  }

  bindItems() {
    for (const item of this.items) {
      const binding = this.bindings.find((b) => sameSpan(item.span, b?.span) && validPoint(b?.center));
      item.binding = binding || null;
      const state = binding ? this.bindingStates.get(bindingStateKey(binding)) : null;
      if (state && sameMatrix(item.matrix, state.matrix)) applyBindingState(item, state);
      else restoreBoundFrame(item);
      this.updateGroup(item);
    }
  }

  beginAlignment() {
    if (this.alignment) this.cancelAlignment();
    const items = this.items.filter((item) => item.kind === "transform" && item.binding);
    if (!items.length) return { ok: false, message: "No mapped transforms are available." };
    const item = items.length === 1 ? items[0] : null;
    this.alignment = { items, item, original: item ? frameState(item) : null, stage: "pivot", direction: null };
    this.paint();
    this.scheduleRender();
    return { ok: true };
  }

  useAlignmentCenter() {
    const a = this.alignment;
    if (!a) return { ok: false, message: "Alignment is not active." };
    if (!a.item) return { ok: false, message: "Select a point on a mapped part first." };
    restoreBoundFrame(a.item);
    a.direction = null;
    a.stage = "direction";
    this.updateGroup(a.item);
    this.paint();
    this.scheduleRender();
    return { ok: true };
  }

  setAlignmentPivot(pointArray, body) {
    const a = this.alignment;
    if (!a) return { ok: false, message: "Alignment is not active." };
    if (!validPoint(pointArray)) return { ok: false, message: "The alignment point is invalid." };
    let item = a.item;
    if (body != null) {
      const matches = a.items.filter((candidate) => candidate.binding.body === body);
      if (matches.length !== 1) return { ok: false, message: "The selected body is not uniquely mapped." };
      if (item && item !== matches[0] && a.original) restoreFrameState(item, a.original);
      if (item !== matches[0]) {
        item = a.item = matches[0];
        a.original = frameState(item);
      }
    }
    if (!item) return { ok: false, message: "Select a point on a mapped part first." };
    const determinant = item.matrix.determinant();
    if (!Number.isFinite(determinant) || determinant === 0) {
      return { ok: false, message: "The transform cannot be inverted." };
    }
    resetFrame(item);
    item.pivotLocal.fromArray(pointArray).applyMatrix4(tmpM.copy(item.matrix).invert());
    a.direction = null;
    a.stage = "direction";
    this.updateGroup(item);
    this.paint();
    this.scheduleRender();
    return { ok: true };
  }

  setAlignmentDirection(pointArray) {
    const a = this.alignment;
    if (!a) return { ok: false, message: "Alignment is not active." };
    if (!a.item || a.stage !== "direction") {
      return { ok: false, message: "Choose the alignment pivot first." };
    }
    if (!validPoint(pointArray)) return { ok: false, message: "The alignment point is invalid." };
    const frame = this.frame(a.item);
    const direction = new THREE.Vector3().fromArray(pointArray).sub(frame.center);
    if (direction.lengthSq() < 1e-18) {
      return { ok: false, message: "The direction point must differ from the pivot." };
    }
    direction.normalize();
    tmpV.copy(frame.z);
    tmpQ.setFromUnitVectors(tmpV, direction);
    rotateFrame(a.item, tmpQ);
    a.direction = direction;
    this.updateGroup(a.item);
    this.paint();
    this.scheduleRender();
    return { ok: true };
  }

  alignTo(axis) {
    const a = this.alignment;
    if (!a) return { ok: false, message: "Alignment is not active." };
    if (!a.item || !a.direction) return { ok: false, message: "Choose an alignment direction first." };
    const target = alignmentAxis(axis);
    if (!target) return { ok: false, message: "The target axis is invalid." };
    const item = a.item;
    const center = this.frame(item).center;
    const start = item.matrix.clone();
    tmpQ.setFromUnitVectors(a.direction, target);
    rotateQuaternionAround(item.matrix, center, tmpQ, start);
    rotateFrame(item, tmpQ);
    this.updateGroup(item);
    this.input(item);
    this.commit(item);
    this.alignment = null;
    this.paint();
    this.scheduleRender();
    return { ok: true };
  }

  cancelAlignment() {
    const a = this.alignment;
    this.alignment = null;
    if (!a) return { ok: false, message: "Alignment is not active." };
    if (a.item && a.original && this.items.includes(a.item)) {
      restoreFrameState(a.item, a.original);
      this.updateGroup(a.item);
    }
    this.paint();
    this.scheduleRender();
    return { ok: true };
  }

  addHandles(item) {
    const holder = new THREE.Group();
    holder.renderOrder = UI_RENDER_ORDER;
    holder.scale.setScalar(1);
    item.group.add(holder);
    item.holder = holder;

    if (item.kind === "direction") {
      this.addHandle(item, holder, directionArrow(), "direction", "z");
      item.lines.z = axisLine("z", DIRECTION_COLOR);
      holder.add(item.lines.z);
      item.valueLabel = valueLabel();
      holder.add(item.valueLabel);
      return;
    }

    for (const axis of ["x", "y", "z"]) {
      this.addHandle(item, holder, axisArrow(axis), "axis", axis);
      item.lines[axis] = axisLine(axis);
      holder.add(item.lines[axis]);
    }
    for (const name of Object.keys(PLANES)) {
      this.addHandle(item, holder, planeSquare(name), "plane", name);
    }
    item.valueLabel = valueLabel();
    holder.add(item.valueLabel);
    if (item.kind === "transform") {
      for (const axis of ["x", "y", "z"]) {
        this.addHandle(item, holder, rotationArc(axis), "rotate", axis);
        item.circles[axis] = fullCircle(axis);
        holder.add(item.circles[axis]);
      }
    }
  }

  addHandle(item, parent, object, mode, axis) {
    object.userData.gslUi = { item, mode, axis };
    object.traverse((o) => {
      o.renderOrder = UI_RENDER_ORDER;
      o.userData.gslUi = { item, mode, axis };
      if (o.material) prepMaterial(o.material).userData.base = o.material.color?.clone?.();
    });
    item.handles.push(object);
    this.pickables.push(object);
    parent.add(object);
  }

  pointerMove(event) {
    if (this.drag) {
      this.moveDrag(event);
      stop(event);
      return;
    }
    const hit = this.pick(event);
    const next = hit ? hit.object.userData.gslUi : null;
    if (sameHit(this.hover, next)) return;
    this.hover = next;
    this.paint();
    this.scheduleRender();
  }

  pointerDown(event) {
    if (event.button !== 0) return;
    const hit = this.pick(event);
    if (!hit) return;
    const h = hit.object.userData.gslUi;
    const item = h.item;
    const frame = this.frame(item);
    this.drag = {
      ...h,
      startMatrix: item.matrix.clone(),
      startBasis: item.frameBasis.clone(),
      startFrame: frame,
      moved: false,
    };
    if (h.mode === "axis") {
      this.drag.startParam = axisParam(this.ray(event), frame.center, frame[h.axis]);
      updateValueLabel(item.valueLabel, h.axis, "0", AXES[h.axis]);
    } else if (h.mode === "plane") {
      const n = frame[PLANES[h.axis][2]];
      this.drag.startPoint = planePoint(this.ray(event), frame.center, n);
    } else if (h.mode === "direction") {
      this.drag.startDir = frame.z.clone();
      updateValueLabel(item.valueLabel, "direction", formatDirection(frame.z), null);
    } else {
      const n = frame[h.axis];
      this.drag.startPoint = planePoint(this.ray(event), frame.center, n);
      if (this.drag.startPoint) this.drag.startDir = this.drag.startPoint.sub(frame.center).normalize();
      this.drag.angle = 0;
      updateValueLabel(item.valueLabel, h.axis, `${formatDegrees(0)} deg`, null);
    }
    if (this.orbit) this.orbit.enabled = false;
    item.activeHandle = h;
    this.paint();
    this.scheduleRender();
    this.dom.setPointerCapture?.(event.pointerId);
    stop(event);
  }

  pointerUp(event) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    if (this.orbit) this.orbit.enabled = true;
    drag.item.activeHandle = null;
    this.paint();
    if (drag.moved) this.commit(drag.item);
    this.suppressClick = true;
    this.dom.releasePointerCapture?.(event.pointerId);
    stop(event);
    this.scheduleRender();
  }

  moveDrag(event) {
    const d = this.drag;
    const ray = this.ray(event);
    const item = d.item;
    item.matrix.copy(d.startMatrix);
    item.frameBasis.copy(d.startBasis);
    if (d.mode === "axis") {
      const p = axisParam(ray, d.startFrame.center, d.startFrame[d.axis]);
      if (p == null || d.startParam == null) return;
      tmpV.copy(d.startFrame[d.axis]).multiplyScalar(p - d.startParam);
      translate(item.matrix, tmpV);
    } else if (d.mode === "plane") {
      const n = d.startFrame[PLANES[d.axis][2]];
      const p = planePoint(ray, d.startFrame.center, n);
      if (!p || !d.startPoint) return;
      tmpV.copy(p).sub(d.startPoint);
      translate(item.matrix, tmpV);
    } else if (d.mode === "direction") {
      // The arrow's head rides the sphere its length sweeps: the ray's near
      // hit on it, or where the ray crosses the anchor's view plane when it
      // misses, so a drag past the rim keeps turning the arrow. Pointing
      // away from the camera means orbiting first, as with any arcball.
      const center = d.startFrame.center;
      const dir = sphereHit(ray, center, item.holder.scale.x * DIRECTION_RADIUS) || planePoint(ray, center, this.viewDirection());
      if (!dir) return;
      dir.sub(center);
      if (dir.lengthSq() < 1e-12) return;
      dir.normalize();
      if (event.shiftKey) snapDirection(dir);
      tmpQ.setFromUnitVectors(d.startDir, dir);
      rotateQuaternionAround(item.matrix, center, tmpQ, d.startMatrix);
      rotateFrame(item, tmpQ);
      updateValueLabel(item.valueLabel, "direction", formatDirection(dir), null);
    } else {
      const p = planePoint(ray, d.startFrame.center, d.startFrame[d.axis]);
      if (!p || !d.startDir) return;
      const dir = p.sub(d.startFrame.center).normalize();
      let a = signedAngle(d.startDir, dir, d.startFrame[d.axis]);
      if (event.shiftKey) a = Math.round(a / ROT_STEP) * ROT_STEP;
      rotateAround(item.matrix, d.startFrame.center, d.startFrame[d.axis], a, d.startMatrix);
      rotateFrame(item, tmpQ.setFromAxisAngle(d.startFrame[d.axis], a));
      d.angle = a;
      updateValueLabel(item.valueLabel, d.axis, `${formatDegrees(THREE.MathUtils.radToDeg(a))} deg`, null);
    }
    if (event.shiftKey && (d.mode === "axis" || d.mode === "plane")) snapTranslation(item.matrix, this.gridStep() / 10);
    if (d.mode === "axis") updateValueLabel(item.valueLabel, d.axis, formatDistance(axisMove(item, d)), AXES[d.axis]);
    this.updateGroup(item);
    d.moved = true;
    this.input(item);
    this.scheduleRender();
  }

  commit(item) {
    const span = item.span || {};
    if (!span.startLine) return;
    saveBindingState(this.bindingStates, item);
    eventManager.dispatchEvent("gsl-ui/commit", {
      span,
      text: item.kind === "transform" ? formatMatrix(item.matrix.elements) : formatVec(itemValue(item)),
    });
  }

  input(item) {
    const value = itemValue(item);
    eventManager.dispatchEvent("gsl-ui/input", {
      kind: item.kind,
      span: item.span,
      value,
      params: item.params.map((p, i) => ({ paramName: p.paramName, value: value[i] })),
    });
  }

  pick(event) {
    if (!this.pickables.length) return null;
    this.updateScale();
    const rect = this.dom.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.root.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, this.camera);
    return raycaster.intersectObjects(this.pickables.filter((o) => o.visible && o.userData.gslUi.item.group.visible), true)[0] || null;
  }

  ray(event) {
    const rect = this.dom.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, this.camera);
    this.world.updateWorldMatrix(true, false);
    const inv = tmpM.copy(this.world.matrixWorld).invert();
    return raycaster.ray.clone().applyMatrix4(inv);
  }

  frame(item) {
    const e = item.frameBasis.elements;
    return {
      center: item.pivotLocal.clone().applyMatrix4(item.matrix),
      x: new THREE.Vector3(e[0], e[1], e[2]),
      y: new THREE.Vector3(e[4], e[5], e[6]),
      z: new THREE.Vector3(e[8], e[9], e[10]),
    };
  }

  updateGroup(item) {
    const f = this.frame(item);
    tmpM.makeBasis(f.x, f.y, f.z);
    tmpM.setPosition(f.center);
    item.group.matrix.copy(tmpM);
    item.group.matrixWorldNeedsUpdate = true;
    for (const spline of this.splines) {
      if (!spline.items.includes(item)) continue;
      const points = spline.items.map((control) => new THREE.Vector3().setFromMatrixPosition(control.matrix));
      points.forEach((point, i) => setLinePoint(spline.polygon.geometry, i, point));
      spline.polygon.computeLineDistances();
      for (let section = 0; section < points.length - 2; section += 2) {
        const bezier = new THREE.QuadraticBezierCurve3(points[section], points[section + 1], points[section + 2]);
        for (let i = 0; i <= 64; i++) {
          bezier.getPoint(i / 64, tmpV);
          setLinePoint(spline.curve.geometry, section * 32 + i, tmpV);
        }
      }
      for (const line of [spline.polygon, spline.curve]) {
        line.geometry.computeBoundingBox();
        line.geometry.computeBoundingSphere();
      }
    }
  }

  updateScale() {
    const h = this.dom.clientHeight || this.dom.getBoundingClientRect().height || 1;
    this.world.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    for (const item of this.items) {
      tmpWorld.copy(this.frame(item).center);
      this.world.localToWorld(tmpWorld);
      item.holder.scale.setScalar(screenScale(this.camera, tmpWorld, h));
    }
    for (const spline of this.splines) {
      const scale = spline.items[0].holder.scale.x / UI_PIXEL_SIZE;
      spline.polygon.material.dashSize = scale;
      spline.polygon.material.gapSize = scale * 3;
    }
  }

  render(renderer) {
    if (!this.scene || this.items.length === 0) return;
    this.updateScale();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  paint() {
    const orthoView = this.orthoViewDirection();
    for (const item of this.items) {
      const frame = orthoView ? this.frame(item) : null;
      item.group.visible = !this.filter || this.filter.some((span) => span.startLine === item.span.startLine && span.startColumn === item.span.startColumn);
      for (const h of item.handles) {
        const control = h.userData.gslUi;
        setVisible(h, control.mode !== "rotate" || !orthoView || Math.abs(frame[control.axis].dot(orthoView)) > 1e-5);
      }
      for (const l of Object.values(item.lines)) l.visible = false;
      for (const c of Object.values(item.circles)) c.visible = false;
      if (item.valueLabel) item.valueLabel.visible = false;
      for (const h of item.handles) setHover(h, false);
    }
    for (const spline of this.splines) spline.group.visible = spline.items.every((item) => item.group.visible);
    if (this.hover?.mode === "rotate" && !this.findHandle(this.hover.item, "rotate", this.hover.axis)?.visible) {
      this.hover = null;
    }
    if (this.drag) {
      for (const item of this.items) for (const h of item.handles) setVisible(h, false);
      const { item, mode, axis } = this.drag;
      if (mode === "axis") {
        item.lines[axis].visible = true;
        if (item.valueLabel) item.valueLabel.visible = true;
        setVisible(this.findHandle(item, mode, axis), true);
        setHover(this.findHandle(item, mode, axis), true);
      }
      if (mode === "plane") {
        setVisible(this.findHandle(item, mode, axis), true);
        setHover(this.findHandle(item, mode, axis), true);
        for (const a of PLANES[axis].slice(0, 2)) setVisible(this.findHandle(item, "axis", a), true);
      }
      if (mode === "rotate") {
        item.circles[axis].visible = true;
        if (item.valueLabel) item.valueLabel.visible = true;
        setVisible(this.findHandle(item, mode, axis), true);
        setHover(this.findHandle(item, mode, axis), true);
      }
      if (mode === "direction") {
        item.lines.z.visible = true;
        if (item.valueLabel) item.valueLabel.visible = true;
        setVisible(this.findHandle(item, mode, axis), true);
        setHover(this.findHandle(item, mode, axis), true);
      }
      return;
    }
    if (this.hover?.mode === "rotate") {
      for (const item of this.items) for (const h of item.handles) setVisible(h, false);
      setVisible(this.findHandle(this.hover.item, "rotate", this.hover.axis), true);
      this.hover.item.circles[this.hover.axis].visible = true;
      setHover(this.findHandle(this.hover.item, "rotate", this.hover.axis), true);
      this.paintAlignment();
      return;
    }
    if (this.hover) setHover(this.findHandle(this.hover.item, this.hover.mode, this.hover.axis), true);
    this.paintAlignment();
  }

  orthoViewDirection() {
    if (!this.camera.isOrthographicCamera) return null;
    return this.viewDirection();
  }

  // viewDirection is the camera's forward direction in the world group's
  // coordinates, the ones the controls' matrices are in.
  viewDirection() {
    this.world.updateWorldMatrix(true, false);
    return this.camera.getWorldDirection(new THREE.Vector3())
      .transformDirection(new THREE.Matrix4().copy(this.world.matrixWorld).invert());
  }

  paintAlignment() {
    const a = this.alignment;
    if (!a?.item || a.stage !== "direction") return;
    a.item.lines.z.visible = true;
    const handle = this.findHandle(a.item, "axis", "z");
    setVisible(handle, true);
    setHover(handle, true);
  }

  findHandle(item, mode, axis) {
    return item.handles.find((h) => h.userData.gslUi.mode === mode && h.userData.gslUi.axis === axis);
  }

  stopIfBusy(event) {
    if (this.drag) stop(event);
  }

  stopClick(event) {
    if (!this.suppressClick) return;
    this.suppressClick = false;
    stop(event);
  }
}

function axisArrow(axis) {
  const g = new THREE.Group();
  const color = COLORS[axis];
  const dir = AXES[axis];
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.65, 12), mat(color));
  shaft.position.copy(dir).multiplyScalar(0.38);
  shaft.quaternion.setFromUnitVectors(AXES.y, dir);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 18), mat(color));
  head.position.copy(dir).multiplyScalar(0.78);
  head.quaternion.setFromUnitVectors(AXES.y, dir);
  g.add(shaft, head);
  return g;
}

// directionArrow is a direction control's one handle: a single arrow along
// +z, thicker than a frame's axis arrows so it is easy to catch.
function directionArrow() {
  const g = new THREE.Group();
  const dir = AXES.z;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 12), mat(DIRECTION_COLOR));
  shaft.position.copy(dir).multiplyScalar(0.31);
  shaft.quaternion.setFromUnitVectors(AXES.y, dir);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 18), mat(DIRECTION_COLOR));
  head.position.copy(dir).multiplyScalar(0.76);
  head.quaternion.setFromUnitVectors(AXES.y, dir);
  // An unseen, wider cylinder is what the pointer actually hits, as the
  // rotation arcs have: the drawn arrow is a few pixels across.
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(ROT_PICK_RADIUS, ROT_PICK_RADIUS, DIRECTION_RADIUS, 12), mat(DIRECTION_COLOR));
  pick.material.opacity = 0;
  pick.material.colorWrite = false;
  pick.position.copy(dir).multiplyScalar(DIRECTION_RADIUS / 2);
  pick.quaternion.setFromUnitVectors(AXES.y, dir);
  g.add(shaft, head, pick);
  return g;
}

function planeSquare(name) {
  const [a, b] = PLANES[name];
  const g = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), mat(planeColor(a, b), 0.7));
  g.position.add(AXES[a].clone().multiplyScalar(0.25)).add(AXES[b].clone().multiplyScalar(0.25));
  if (name === "xz") g.rotation.x = Math.PI / 2;
  if (name === "yz") g.rotation.y = Math.PI / 2;
  return g;
}

function rotationArc(axis) {
  const g = new THREE.Group();
  const pts = arcPoints(axis, Math.PI / 2);
  const pick = tube(pts, COLORS[axis], ROT_PICK_RADIUS);
  pick.material.opacity = 0;
  pick.material.colorWrite = false;
  g.add(tube(pts, COLORS[axis], 0.012), pick);
  return g;
}

function fullCircle(axis) {
  const c = overlay(tube(arcPoints(axis, Math.PI * 2), COLORS[axis], 0.007));
  c.visible = false;
  return c;
}

function axisLine(axis, color = COLORS[axis]) {
  const d = AXES[axis];
  const geo = new THREE.BufferGeometry().setFromPoints([
    d.clone().multiplyScalar(-1000),
    d.clone().multiplyScalar(1000),
  ]);
  const l = overlay(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })));
  l.visible = false;
  return l;
}

function arcPoints(axis, end) {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const a = (end * i) / 64;
    const c = Math.cos(a) * 0.95;
    const s = Math.sin(a) * 0.95;
    if (axis === "x") pts.push(new THREE.Vector3(0, c, s));
    if (axis === "y") pts.push(new THREE.Vector3(c, 0, s));
    if (axis === "z") pts.push(new THREE.Vector3(c, s, 0));
  }
  return pts;
}

function tube(points, color, radius) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, radius, 8), mat(color));
}

function valueLabel() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  label.renderOrder = UI_RENDER_ORDER;
  label.scale.set(0.88, 0.33, 1);
  label.visible = false;
  label.userData.valueLabel = { canvas, texture, text: "", axis: "" };
  return label;
}

function updateValueLabel(label, axis, text, offset) {
  if (!label) return;
  if (offset) label.position.copy(offset).multiplyScalar(1.08);
  else label.position.set(0, 0, 0);
  const state = label.userData.valueLabel;
  if (state.text === text && state.axis === axis) return;
  state.text = text;
  state.axis = axis;
  drawValueLabel(state, COLORS[axis]);
}

function drawValueLabel({ canvas, texture, text }, color) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  roundRect(ctx, 24, 20, 208, 56, 18);
  ctx.fillStyle = "rgba(12, 14, 16, 0.78)";
  ctx.fill();
  ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.font = "600 34px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 49);
  texture.needsUpdate = true;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatDegrees(v) {
  const n = Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  if (Math.abs(n) < 0.05) return "0";
  return `${n > 0 ? "+" : ""}${n}`;
}

function formatDistance(v) {
  const n = Math.abs(v) < 10 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
  if (Math.abs(n) < 0.005) return "0";
  return `${n > 0 ? "+" : ""}${n}`;
}

function mat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function splineLine(count, dashed = false) {
  return new Line2(new LineGeometry().setFromPoints(Array.from({ length: count }, () => new THREE.Vector3())), new THREE.Line2NodeMaterial({ color: COLORS.z, linewidth: 6, dashed, depthTest: false, depthWrite: false }));
}

function setLinePoint(geometry, index, point) {
  const { instanceStart, instanceEnd } = geometry.attributes;
  if (index < instanceStart.count) instanceStart.setXYZ(index, point.x, point.y, point.z);
  if (index > 0) instanceEnd.setXYZ(index - 1, point.x, point.y, point.z);
  instanceStart.needsUpdate = true;
}

function overlay(object) {
  object.traverse((o) => {
    o.renderOrder = UI_RENDER_ORDER;
    if (o.material) prepMaterial(o.material);
  });
  return object;
}

function prepMaterial(material) {
  material.depthTest = false;
  material.depthWrite = false;
  material.transparent = true;
  return material;
}

function planeColor(a, b) {
  return new THREE.Color(COLORS[a]).lerp(new THREE.Color(COLORS[b]), 0.5).getHex();
}

function setHover(object, hover) {
  if (!object) return;
  object.traverse((o) => {
    if (!o.material?.color || !o.material.userData.base) return;
    o.material.color.copy(o.material.userData.base);
    if (hover) o.material.color.lerp(new THREE.Color(0xffffff), 0.45);
  });
}

function setVisible(object, visible) {
  if (object) object.visible = visible;
}

function sameHit(a, b) {
  return (!a && !b) || (a && b && a.item === b.item && a.mode === b.mode && a.axis === b.axis);
}

function sameSpan(a, b) {
  return !!a && !!b && a.startLine === b.startLine && a.startColumn === b.startColumn &&
    a.endLine === b.endLine && a.endColumn === b.endColumn;
}

function validPoint(point) {
  return Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
}

function alignmentAxis(name) {
  if (typeof name !== "string") return null;
  const negative = name.startsWith("-");
  const axis = negative ? name.slice(1) : name;
  if (!["x", "y", "z"].includes(axis)) return null;
  return AXES[axis].clone().multiplyScalar(negative ? -1 : 1);
}

function resetFrame(item) {
  item.frameBasis.copy(normalizedBasis(item.matrix));
}

function restoreBoundFrame(item) {
  if (validPoint(item.binding?.center)) item.pivotLocal.fromArray(item.binding.center);
  else item.pivotLocal.set(0, 0, 0);
  resetFrame(item);
}

function bindingStateKey(binding) {
  const span = binding?.span;
  if (binding?.body == null || !span?.startLine) return "";
  return `${binding.body}:${span.startLine}:${span.startColumn}`;
}

function normalizedBasis(matrix) {
  const e = matrix.elements;
  return new THREE.Matrix4().makeBasis(
    new THREE.Vector3(e[0], e[1], e[2]).normalize(),
    new THREE.Vector3(e[4], e[5], e[6]).normalize(),
    new THREE.Vector3(e[8], e[9], e[10]).normalize(),
  );
}

function objectLinear(item) {
  return item.matrix.clone().setPosition(0, 0, 0);
}

function rotateFrame(item, quaternion) {
  item.frameBasis.premultiply(tmpM2.makeRotationFromQuaternion(quaternion));
}

function frameState(item) {
  return { pivotLocal: item.pivotLocal.clone(), frameBasis: item.frameBasis.clone() };
}

function restoreFrameState(item, state) {
  item.pivotLocal.copy(state.pivotLocal);
  item.frameBasis.copy(state.frameBasis);
}

function applyBindingState(item, state) {
  item.pivotLocal.copy(state.pivotLocal);
  item.frameBasis.copy(normalizedBasis(objectLinear(item).multiply(state.frameLocal)));
}

function saveBindingState(states, item) {
  const key = bindingStateKey(item.binding);
  if (!key) return;
  const frameLocal = objectLinear(item).invert().multiply(item.frameBasis);
  states.set(key, { matrix: item.matrix.clone(), pivotLocal: item.pivotLocal.clone(), frameLocal });
}

function sameMatrix(a, b) {
  if (!a?.elements || !b?.elements) return false;
  return a.elements.every((v, i) => Math.abs(v - b.elements[i]) < 1e-5);
}

function stop(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function axisParam(ray, center, axis) {
  const b = axis.dot(ray.direction);
  const w = tmpV.copy(ray.origin).sub(center);
  const d = axis.dot(w);
  const e = ray.direction.dot(w);
  const denom = 1 - b * b;
  if (Math.abs(denom) < 1e-6) return null;
  return (d - b * e) / denom;
}

function planePoint(ray, center, normal) {
  plane.setFromNormalAndCoplanarPoint(normal, center);
  return ray.intersectPlane(plane, new THREE.Vector3());
}

function signedAngle(a, b, axis) {
  tmpV.crossVectors(a, b);
  return Math.atan2(tmpV.dot(axis), a.dot(b));
}

function axisMove(item, drag) {
  const e = item.matrix.elements;
  const s = drag.startMatrix.elements;
  const a = drag.startFrame[drag.axis];
  return (e[12] - s[12]) * a.x + (e[13] - s[13]) * a.y + (e[14] - s[14]) * a.z;
}

function translate(matrix, delta) {
  const e = matrix.elements;
  e[12] += delta.x;
  e[13] += delta.y;
  e[14] += delta.z;
}

function rotateAround(out, center, axis, angle, start) {
  tmpQ.setFromAxisAngle(axis, angle);
  rotateQuaternionAround(out, center, tmpQ, start);
}

function rotateQuaternionAround(out, center, quaternion, start) {
  tmpM.makeTranslation(center.x, center.y, center.z);
  tmpM2.makeRotationFromQuaternion(quaternion);
  tmpM3.makeTranslation(-center.x, -center.y, -center.z);
  out.copy(tmpM).multiply(tmpM2).multiply(tmpM3).multiply(start);
}

function snapTranslation(matrix, step) {
  if (!Number.isFinite(step) || step <= 0) return;
  const e = matrix.elements;
  e[12] = Math.round(e[12] / step) * step;
  e[13] = Math.round(e[13] / step) * step;
  e[14] = Math.round(e[14] / step) * step;
}

function translation(matrix) {
  const e = matrix.elements;
  return [e[12], e[13], e[14]];
}

// directionOf is a direction item's value: its frame's z axis, unit length.
function directionOf(item) {
  const e = item.matrix.elements;
  return new THREE.Vector3(e[8], e[9], e[10]).normalize().toArray();
}

function itemValue(item) {
  if (item.kind === "point") return translation(item.matrix);
  if (item.kind === "direction") return directionOf(item);
  return item.matrix.elements.slice();
}

// basisAround completes a unit z into a right-handed [x, y, z], steadied
// against whichever world axis z is furthest from.
function basisAround(z) {
  const helper = Math.abs(z.z) < 0.9 ? AXES.z : AXES.x;
  const x = new THREE.Vector3().crossVectors(helper, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return [x, y, z.clone()];
}

function anchorOf(info) {
  return validPoint(info.anchor) ? new THREE.Vector3().fromArray(info.anchor) : new THREE.Vector3();
}

// sphereHit is the ray's near intersection with the sphere, or null.
function sphereHit(ray, center, radius) {
  const oc = tmpV.copy(ray.origin).sub(center);
  const b = oc.dot(ray.direction);
  const c = oc.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return null;
  return ray.at(t, new THREE.Vector3());
}

// snapDirection turns a unit vector to the nearest of the 26 directions with
// components in {-1, 0, 1}: the axes, the face diagonals and the corners.
const SNAP_DIRECTIONS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
  if (x || y || z) SNAP_DIRECTIONS.push(new THREE.Vector3(x, y, z).normalize());
}
function snapDirection(dir) {
  let best = SNAP_DIRECTIONS[0];
  for (const candidate of SNAP_DIRECTIONS) if (candidate.dot(dir) > best.dot(dir)) best = candidate;
  dir.copy(best);
}

function formatDirection(v) {
  return `[${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}]`;
}

function formatVec(v) {
  return `[${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])}]`;
}

function formatMatrix(e) {
  const cols = [];
  for (let i = 0; i < 4; i++) {
    cols.push(`[${fmt(e[i * 4])}, ${fmt(e[i * 4 + 1])}, ${fmt(e[i * 4 + 2])}, ${fmt(e[i * 4 + 3])}]`);
  }
  return `[${cols.join(", ")}]`;
}

function fmt(v) {
  if (Math.abs(v) < 1e-9) v = 0;
  return String(Math.round(v * 1e6) / 1e6);
}

function screenScale(camera, point, height) {
  tmpWorld.copy(point).applyMatrix4(camera.matrixWorldInverse);
  if (camera.isOrthographicCamera) {
    return ((camera.top - camera.bottom) / camera.zoom / height) * UI_PIXEL_SIZE;
  }
  const depth = Math.max(0.01, Math.abs(tmpWorld.z));
  const fov = THREE.MathUtils.degToRad(camera.fov);
  return (2 * depth * Math.tan(fov / 2) / height) * UI_PIXEL_SIZE;
}
