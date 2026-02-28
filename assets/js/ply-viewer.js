/**
 * PLY Viewer
 * Loads and renders ASCII PLY mesh files using Three.js
 * Supports multiple PLY presets, vertex colors, orbit controls, and auto-rotation
 */

class PlyViewer {
  constructor(containerId, presets, options = {}) {
    this.containerId = containerId;
    // Accept array of {label, src, ch2} or a plain src string for backward compat
    this.presets = Array.isArray(presets)
      ? presets
      : [{ label: "Default", src: presets, ch2: "B" }];
    this.container = document.getElementById(containerId);

    if (!this.container) {
      console.error(`PlyViewer: container '${containerId}' not found`);
      return;
    }

    this.options = {
      autoRotate: options.autoRotate !== false,
      rotateSpeed: options.rotateSpeed || 0.15,
      showGui: options.showGui !== false,
      background: options.background || "#ffffff",
    };

    this.parameters = {
      rotateSpeed: this.options.rotateSpeed,
      paused: false,
      stripeWidth: 0.02,
      preset: 0,
      wireframe: false,
    };

    // Spherical camera coordinates
    this.spherical = { theta: 0.4, phi: 1.1, radius: 2.625 };
    this.isocurve1 = null;
    this.isocurve2 = null;
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.lastTime = performance.now();

    this.init();
  }

  async init() {
    this.showLoading();
    this.setupRenderer();
    this.setupCamera();
    this.setupScene();
    this.setupLights();
    this.setupEventListeners();
    if (this.options.showGui) {
      this.setupGUI();
    }
    await this.loadPlys();
    this.hideLoading();
    this.animate();
  }

  showLoading() {
    this.loadingEl = document.createElement("div");
    this.loadingEl.style.cssText =
      "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#aaa;font-family:monospace;font-size:14px;pointer-events:none;";
    this.loadingEl.textContent = "Loading mesh…";
    this.container.appendChild(this.loadingEl);
  }

  hideLoading() {
    if (this.loadingEl) {
      this.loadingEl.remove();
      this.loadingEl = null;
    }
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(this.options.background);
    this.container.appendChild(this.renderer.domElement);
  }

  setupCamera() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.001, 1000);
    this.updateCamera();
  }

  updateCamera() {
    const { theta, phi, radius } = this.spherical;
    const sinPhi = Math.sin(phi);
    this.camera.position.set(
      radius * sinPhi * Math.sin(theta),
      radius * Math.cos(phi),
      radius * sinPhi * Math.cos(theta),
    );
    this.camera.lookAt(0, -1 / 6, 0);
  }

  setupScene() {
    this.scene = new THREE.Scene();
  }

  setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(2, 3, 4);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8899ff, 0.3);
    fill.position.set(-3, -1, -2);
    this.scene.add(fill);
  }

  async loadPlys() {
    const uniqueSrcs = [...new Set(this.presets.map((p) => p.src))];
    this.geometries = new Map();

    try {
      await Promise.all(
        uniqueSrcs.map(async (src) => {
          const response = await fetch(src);
          if (!response.ok)
            throw new Error(`HTTP ${response.status} loading ${src}`);
          const text = await response.text();
          const geo = this.parsePly(text);
          this.normalizeGeometry(geo);
          this.geometries.set(src, geo);
        }),
      );
    } catch (err) {
      console.error("PlyViewer:", err);
      if (this.loadingEl) this.loadingEl.textContent = "Failed to load mesh.";
      return;
    }

    const firstPreset = this.presets[0];
    if (this.geometries.has(firstPreset.src)) {
      this.buildMesh(this.geometries.get(firstPreset.src));
      this.applyPreset(0);
    }
  }

  normalizeGeometry(geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2 / maxDim;
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
  }

  parsePly(text) {
    const lines = text.split("\n");
    let lineIdx = 0;

    // --- Parse header ---
    const elements = [];
    let currentElement = null;

    while (lineIdx < lines.length) {
      const line = lines[lineIdx++].trim();
      if (line === "end_header") break;
      const parts = line.split(/\s+/);
      if (parts[0] === "element") {
        currentElement = {
          name: parts[1],
          count: parseInt(parts[2]),
          properties: [],
        };
        elements.push(currentElement);
      } else if (parts[0] === "property" && currentElement) {
        if (parts[1] === "list") {
          currentElement.properties.push({ isList: true, name: parts[4] });
        } else {
          currentElement.properties.push({
            isList: false,
            type: parts[1],
            name: parts[2],
          });
        }
      }
    }

    const vertEl = elements.find((e) => e.name === "vertex");
    const faceEl = elements.find((e) => e.name === "face");
    if (!vertEl) throw new Error("PLY has no vertex element");

    // Precompute property indices
    const propNames = vertEl.properties.map((p) => p.name);
    const xi = propNames.indexOf("x"),
      yi = propNames.indexOf("y"),
      zi = propNames.indexOf("z");
    const nxi = propNames.indexOf("nx"),
      nyi = propNames.indexOf("ny"),
      nzi = propNames.indexOf("nz");
    const ri = propNames.indexOf("red"),
      gi = propNames.indexOf("green"),
      bi = propNames.indexOf("blue");
    const ali = propNames.indexOf("alpha");
    const hasNormals = nxi >= 0;
    const hasColors = ri >= 0;
    const hasAlpha = ali >= 0;
    const colorScale =
      hasColors && vertEl.properties[ri].type === "uchar" ? 1 / 255 : 1;

    const vertCount = vertEl.count;
    const positions = new Float32Array(vertCount * 3);
    const normals = hasNormals ? new Float32Array(vertCount * 3) : null;
    const colors = hasColors ? new Float32Array(vertCount * 3) : null;
    const alphaData = new Float32Array(vertCount); // zero-filled if no alpha in PLY

    // --- Parse vertices ---
    for (let v = 0; v < vertCount; v++) {
      const vals = lines[lineIdx++].trim().split(/\s+/);
      positions[v * 3] = parseFloat(vals[xi]);
      positions[v * 3 + 1] = parseFloat(vals[yi]);
      positions[v * 3 + 2] = parseFloat(vals[zi]);
      if (hasNormals) {
        normals[v * 3] = parseFloat(vals[nxi]);
        normals[v * 3 + 1] = parseFloat(vals[nyi]);
        normals[v * 3 + 2] = parseFloat(vals[nzi]);
      }
      if (hasColors) {
        colors[v * 3] = parseFloat(vals[ri]) * colorScale;
        colors[v * 3 + 1] = parseFloat(vals[gi]) * colorScale;
        colors[v * 3 + 2] = parseFloat(vals[bi]) * colorScale;
      }
      if (hasAlpha) alphaData[v] = parseFloat(vals[ali]) * colorScale;
    }

    // --- Parse faces ---
    const faceCount = faceEl ? faceEl.count : 0;
    const indexData = [];
    const edgeSet = new Set();
    const edgeIndices = [];
    for (let f = 0; f < faceCount; f++) {
      const vals = lines[lineIdx++].trim().split(/\s+/);
      const n = parseInt(vals[0]);
      const fv = [];
      for (let i = 0; i < n; i++) fv.push(parseInt(vals[1 + i]));
      // Fan triangulation
      for (let t = 1; t < n - 1; t++) {
        indexData.push(fv[0], fv[t], fv[t + 1]);
      }
      // Collect original polygon edges (excludes triangulation diagonals)
      for (let i = 0; i < n; i++) {
        const a = fv[i], b = fv[(i + 1) % n];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edgeIndices.push(a, b);
        }
      }
    }

    // --- Build BufferGeometry ---
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (hasNormals)
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    if (hasColors)
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aChannel", new THREE.BufferAttribute(alphaData, 1));
    if (indexData.length > 0) geometry.setIndex(indexData);
    if (!hasNormals) geometry.computeVertexNormals();

    // Attach edge geometry (shares position buffer; no triangulation diagonals)
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", geometry.getAttribute("position"));
    if (edgeIndices.length > 0) edgeGeo.setIndex(edgeIndices);
    geometry.userData.edgeGeo = edgeGeo;

    return geometry;
  }

  buildMesh(geometry) {
    this.meshUniforms = {
      uValue: { value: this.parameters.stripeWidth },
      uCh1: { value: 0.0 },
      uCh2: { value: 2.0 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.meshUniforms,
      vertexShader: `
                attribute float aChannel;
                varying vec3 vColor;
                varying vec3 vNormal;
                varying float vAlpha;
                void main() {
                    vColor = color;
                    vAlpha = aChannel;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
      fragmentShader: `
                uniform float uValue;
                uniform float uCh1;
                uniform float uCh2;
                varying vec3 vColor;
                varying vec3 vNormal;
                varying float vAlpha;
                const vec3 light1 = normalize(vec3(2.0, 3.0, 4.0));
                const vec3 light2 = normalize(vec3(-3.0, -1.0, -2.0));
                float stripeT(float v) {
                    float fw = fwidth(v);
                    float av = abs(v);
                    float p  = mod(av + uValue * 0.25, uValue);
                    float hv = uValue * 0.5;
                    float t = smoothstep(hv - fw, hv + fw, p)
                            - smoothstep(uValue - fw, uValue + fw, p);
                    return mix(t, 0.5, clamp(fw / hv, 0.0, 1.0));
                }
                float getChannel(float sel) {
                    if (sel < 0.5) return vColor.r;
                    if (sel < 1.5) return vColor.g;
                    if (sel < 2.5) return vColor.b;
                    if (sel < 3.5) return vAlpha;
                    if (sel < 4.5) return (vAlpha - vColor.b) * 0.5;  // midsurface
                    if (sel < 5.5) return vAlpha + vColor.b;  // clearance
                    return (vAlpha - vColor.b)/(vAlpha + vColor.b) * 0.5;  // two body
                }
                void main() {
                    float t_r = stripeT(getChannel(uCh1));
                    float t2  = stripeT(getChannel(uCh2));
                    vec3 col = vec3(1.0);
                    col -= vec3(0.0, 0.5, 0.5) * t_r;
                    col -= vec3(0.5, 0.5, 0.0) * t2;
                    col = clamp(col, 0.0, 1.0);
                    vec3 n = normalize(vNormal);
                    if (!gl_FrontFacing) n = -n;
                    float diff = max(dot(n, light1), 0.0) * 0.65
                               + max(dot(n, light2), 0.0) * 0.20;
                    gl_FragColor = vec4(col * (0.35 + diff), 1.0);
                }
            `,
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    // PLY uses Z-up convention; rotate to match Three.js Y-up
    this.mesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.mesh);

    this.wireMesh = new THREE.LineSegments(
      geometry.userData.edgeGeo || new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    this.wireMesh.rotation.x = -Math.PI / 2;
    this.wireMesh.visible = false;
    this.scene.add(this.wireMesh);
  }

  applyPreset(index) {
    const preset = this.presets[index];
    if (!preset || !this.geometries || !this.mesh) return;
    const geo = this.geometries.get(preset.src);
    if (geo) {
      this.mesh.geometry = geo;
      if (this.wireMesh && geo.userData.edgeGeo) {
        this.wireMesh.geometry = geo.userData.edgeGeo;
      }
    }
    if (this.captionEl) {
      const cap = preset.caption || "";
      this.captionEl.textContent = cap;
      this.captionEl.style.display = cap ? "" : "none";
    }

    if (this.meshUniforms) {
      const CH = {
        R: 0,
        G: 1,
        B: 2,
        A: 3,
        "A-B": 4,
        "A+B": 5,
        Midsurface: 4,
        Clearance: 5,
        TwoBody: 6,
      };
      this.meshUniforms.uCh1.value = CH[preset.ch1 || "R"] ?? 0;
      this.meshUniforms.uCh2.value = CH[preset.ch2 || "B"] ?? 2;
      if (geo) this.updateZeroIsocurves(geo);
    }
  }

  getVertexFieldValue(geometry, vi, ch) {
    const col = geometry.getAttribute('color');
    const alp = geometry.getAttribute('aChannel');
    const r = col ? col.getX(vi) : 0;
    const g = col ? col.getY(vi) : 0;
    const b = col ? col.getZ(vi) : 0;
    const a = alp ? alp.getX(vi) : 0;
    const idx = Math.round(ch);
    if (idx === 0) return r;
    if (idx === 1) return g;
    if (idx === 2) return b;
    if (idx === 3) return a;
    if (idx === 4) return (a - b) * 0.5;                             // Midsurface
    if (idx === 5) return a + b;                                     // Clearance
    return (a - b) / (Math.abs(a + b) + 1e-10) * 0.5;              // TwoBody
  }

  buildZeroIsocurveGeometry(geometry, ch) {
    if (!geometry.index) return null;
    const indices = geometry.index.array;
    const pos = geometry.getAttribute('position');
    const pts = [];

    for (let f = 0; f < indices.length; f += 3) {
      const i0 = indices[f], i1 = indices[f + 1], i2 = indices[f + 2];
      const v0 = this.getVertexFieldValue(geometry, i0, ch);
      const v1 = this.getVertexFieldValue(geometry, i1, ch);
      const v2 = this.getVertexFieldValue(geometry, i2, ch);

      const cross = [];
      const lerp = (ia, ib, va, vb) => {
        const t = va / (va - vb);
        cross.push(
          pos.getX(ia) + t * (pos.getX(ib) - pos.getX(ia)),
          pos.getY(ia) + t * (pos.getY(ib) - pos.getY(ia)),
          pos.getZ(ia) + t * (pos.getZ(ib) - pos.getZ(ia)),
        );
      };

      if ((v0 < 0) !== (v1 < 0)) lerp(i0, i1, v0, v1);
      if ((v1 < 0) !== (v2 < 0)) lerp(i1, i2, v1, v2);
      if ((v2 < 0) !== (v0 < 0)) lerp(i2, i0, v2, v0);

      if (cross.length === 6) pts.push(...cross);
    }

    if (pts.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    return geo;
  }

  updateZeroIsocurves(geometry) {
    const remove = (obj) => {
      if (obj) { this.scene.remove(obj); obj.geometry.dispose(); obj.material.dispose(); }
    };
    remove(this.isocurve1);
    remove(this.isocurve2);
    this.isocurve1 = null;
    this.isocurve2 = null;

    if (!this.meshUniforms) return;
    const ch1 = this.meshUniforms.uCh1.value;
    const ch2 = this.meshUniforms.uCh2.value;

    const make = (ch, color) => {
      const g = this.buildZeroIsocurveGeometry(geometry, ch);
      if (!g) return null;
      const line = new THREE.LineSegments(g,
        new THREE.LineBasicMaterial({ color, linewidth: 3 }));
      line.rotation.x = -Math.PI / 2;
      this.scene.add(line);
      return line;
    };

    this.isocurve1 = make(ch1, 0x880000);          // dark red  → ch1 field
    if (ch2 !== ch1) {
      this.isocurve2 = make(ch2, 0x000088);        // dark blue → ch2 field
    }
  }

  setupEventListeners() {
    const canvas = this.renderer.domElement;

    // Mouse orbit
    canvas.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mouseup", () => {
      this.isDragging = false;
    });
    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.spherical.theta -= dx * 0.006;
      this.spherical.phi = Math.max(
        0.05,
        Math.min(Math.PI - 0.05, this.spherical.phi - dy * 0.006),
      );
      this.updateCamera();
    });

    // Pause auto-rotation while cursor is inside the canvas
    canvas.addEventListener("mouseenter", () => {
      this.isHovering = true;
    });
    canvas.addEventListener("mouseleave", () => {
      this.isHovering = false;
    });

    // Scroll zoom
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.spherical.radius *= 1 - e.deltaY * 0.001;
        this.spherical.radius = Math.max(
          0.3,
          Math.min(50, this.spherical.radius),
        );
        this.updateCamera();
      },
      { passive: false },
    );

    // Touch orbit
    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          this.isDragging = true;
          this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      },
      { passive: true },
    );
    canvas.addEventListener("touchend", () => {
      this.isDragging = false;
    });
    canvas.addEventListener(
      "touchmove",
      (e) => {
        if (!this.isDragging || e.touches.length !== 1) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - this.lastMouse.x;
        const dy = e.touches[0].clientY - this.lastMouse.y;
        this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.spherical.theta -= dx * 0.006;
        this.spherical.phi = Math.max(
          0.05,
          Math.min(Math.PI - 0.05, this.spherical.phi - dy * 0.006),
        );
        this.updateCamera();
      },
      { passive: false },
    );

    window.addEventListener("resize", () => this.onResize());
  }

  setupGUI() {
    if (typeof lil === "undefined") {
      console.warn("PlyViewer: lil-gui not found, skipping GUI");
      return;
    }

    this.gui = new lil.GUI({
      container: this.container,
      autoPlace: false,
      width: 220,
      title: "",
    });

    Object.assign(this.gui.domElement.style, {
      position: "absolute",
      bottom: "10px",
      left: "10px",
      top: "auto",
      right: "auto",
      zIndex: "1000",
      opacity: "0.75",
    });
    this.gui.domElement.style.setProperty("--font-family", "inherit");
    this.gui.domElement.style.setProperty("--font-size", "0.7rem");
    const titleEl = this.gui.domElement.querySelector(".title");
    if (titleEl) titleEl.style.display = "none";
    this.gui.domElement.style.height = "auto";
    const childrenEl = this.gui.domElement.querySelector(".children");
    if (childrenEl) {
      childrenEl.style.maxHeight = "none";
      childrenEl.style.overflow = "visible";
    }
    this.container.appendChild(this.gui.domElement);

    // Stop spinning when hovering over the control panel
    this.gui.domElement.addEventListener("mouseenter", () => {
      this.isHoveringGui = true;
    });
    this.gui.domElement.addEventListener("mouseleave", () => {
      this.isHoveringGui = false;
    });

    // Caption overlay — appears to the right of the GUI panel, same bottom alignment
    this.captionEl = document.createElement("div");
    Object.assign(this.captionEl.style, {
      position: "absolute",
      bottom: "10px",
      left: "240px",   // 10px margin + 220px GUI width + 10px gap
      right: "10px",
      color: "#808080",
      backgroundColor: "rgba(255, 255, 255, 0.75)",
      fontFamily: "inherit",
      fontSize: "1rem",
      padding: "4px 8px",
      pointerEvents: "none",
      zIndex: "999",
      lineHeight: "1.4",
      display: "none",
    });
    this.container.appendChild(this.captionEl);

    // Preset dropdown from the presets array
    const presetOptions = {};
    this.presets.forEach((p, i) => {
      presetOptions[p.label] = i;
    });
    this.gui
      .add(this.parameters, "preset", presetOptions)
      .name("View")
      .onChange((i) => {
        this.applyPreset(parseInt(i));
      });

    this.gui
      .add(this.parameters, "stripeWidth", 0.001, 0.1, 0.001)
      .name("Stripe")
      .onChange((v) => {
        if (this.meshUniforms) this.meshUniforms.uValue.value = v;
      });
    this.gui
      .add(this.parameters, "wireframe")
      .name("Wireframe")
      .onChange((v) => {
        if (this.wireMesh) this.wireMesh.visible = v;
      });
    // Speed slider centered on default (0.15 = midpoint of 0–0.3)
    this.gui.add(this.parameters, "rotateSpeed", 0, 0.3, 0.005).name("Speed");
    this.gui.add(this.parameters, "paused").name("⏸ Pause");
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (
      !this.parameters.paused &&
      this.options.autoRotate &&
      !this.isDragging &&
      !this.isHovering &&
      !this.isHoveringGui
    ) {
      this.spherical.theta += this.parameters.rotateSpeed * delta;
      this.updateCamera();
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.gui) this.gui.destroy();
    [this.isocurve1, this.isocurve2].forEach((obj) => {
      if (obj) { this.scene.remove(obj); obj.geometry.dispose(); obj.material.dispose(); }
    });
    if (this.renderer) {
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

window.PlyViewer = PlyViewer;
