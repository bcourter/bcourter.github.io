// The "Export" side panel, shared by every app.
//
// One Detail slider drives every export: it is log2 of the cells per axis, so
// Browser MC meshes each part at 2^detail resolution in the browser
// (marching cubes on a WebGPU compute device, mc_compute.js) and the server
// path — where an app has one — sends the same number as its meshing depth.
//
// Browser MC composes the program's mesh CSG in the browser: it asks the
// canvas to slice the program into an export plan, marches one mesh per
// analytical leaf, places the imported meshes the plan references, and runs the
// booleans with Manifold (mesh_boolean.js). See runPlanExport below.
//
// The panel picks the output and the mesher apart. Format is 3MF (one file,
// each body an object in its own color, threemf.js; the default), GLB (one
// binary glTF, each body a node in its own color; the server writes it, so
// only for a server mesher with serverFormats), STL (one
// file, or a zip of one per body), Omega Tape (the implicit field itself) or
// Web page (the viewer and the document as static pages); Detail, the mesher
// and Clean do not touch the last two. Mesher is where the meshing runs: Browser MC (above),
// Browser DC (fidget-wasm on the server's tape) or Server DC.
// Clean rebuilds each body through Manifold before it is written; a body
// Manifold refuses goes out as meshed, and the notification names it. Every
// mesher hands its bodies to deliverBodies, which does both.
//
// initExportPanel({...}) takes the app's hooks:
//   getSdfContext()      viewer.getCurrentSDFContext — null until a scene
//                        renders. Omit the hook entirely in a host that cannot
//                        mesh in the browser at all and the Browser MC mesher
//                        is not offered.
//   getComputeDevice()   viewer.getComputeDevice — elevated limits; may resolve null
//   getRawGPUDevice()    viewer.getRawGPUDevice — the renderer's device, as fallback
//   getMeshGeometry(i)   viewer.getMeshGeometry — imported mesh geometry by index
//   makeSdfContext(wgsl, shapeCount)
//                        viewer.makeExportSdfContext — wraps one plan leaf's
//                        shader so the compute mesher can march it
//   send(path, data, tags)  the app's transport, for asking the canvas to slice
//                        the program into an export plan
//   getSource()          current GSL source; empty means nothing to export
//   getWorldExtent()     viewer.getWorldExtent — scales the voxel-size estimate
//   clearError()         optional; cleared after a successful union export
//   track(name, params)  optional analytics hook
//   onServerExport(detail, surfaceBbox, bodyBoxes, algo, format)  optional;
//                           server-side export. bodyBoxes maps each visible body's return
//                           index to its measured box (see measureBodyBoxes),
//                           or is null when they could not be measured. algo is
//                           the mesher picked: "mdc" (Server DC) or
//                           "marching-cubes" (Server MC). format is the
//                           format picked ("3mf", "glb" or "stl"), for an
//                           app with serverFormats.
//                           Without it the Server DC mesher is not offered,
//                           unless serverExportUnavailable is given.
//   serverMarchingCubes     optional; true when onServerExport meshes by the
//                           algo it is given, so Server MC is offered beside
//                           Server DC. Without it Server MC is not offered.
//                           surfaceBbox is the measured bound on
//                           the implicit surface as [xmin,ymin,zmin,xmax,ymax,
//                           zmax], or null when it could not be measured.
//                           Returns false when it sent nothing (and has
//                           said why).
//   serverResults           optional; true when the app hands the server's
//                           STL reply to claimServerStl first, so a server
//                           export can be cleaned or written as 3MF.
//                           Without it Server DC is STL only.
//   serverFormats           optional; true when onServerExport has the server
//                           write the format it is given (3MF, GLB, or STL: one
//                           body's, or a zip of one per body), so a server
//                           export is not STL only. The server does not clean,
//                           so Clean stays off for it (the standalone viewer).
//                           Without it GLB is not offered.
//   serverExportUnavailable optional; with no onServerExport, keeps Server
//                           DC in the list, disabled, with this as its title.
//   getVisibleShapes()      optional; the 1-based returns the viewer shows, or
//                           null for all. Exports mesh only those, and several
//                           bodies download as a zip of one STL each.
//   getExportBodies()       optional; the visible bodies as [{index, name,
//                           slots, meshDecls, color}], for the dual-contour
//                           export to mesh each apart (one tape per implicit
//                           body), and for each body's color in a 3MF (the
//                           Bodies panel's "#rrggbb"). Without it that export
//                           meshes the tape whole, and a 3MF takes the palette.
//   getDocument()           optional; the open document's name, so the
//                           Browser MC export resolves its imports.
//   onSaveTape()            optional; tape export, the Omega Tape format.
//                           Without it Omega Tape is not offered.
//   onExportPage()          optional; the Web page format: the app downloads
//                           the viewer and the open document as static web
//                           pages. Without it Web page is not offered.
//   getTape({body, box, levelSets})
//                           optional; resolves with the program's omega tape
//                           bytes (one return's alone when body is set, its
//                           bounds from box when given), for dual contouring in the browser with
//                           fidget-wasm. levelSets has it carry each vdbSdf's
//                           baked level set, which fidget-wasm samples.
//                           Without it the Browser DC mesher is not
//                           offered.
//
// Exports runClientShapeMC for apps that mesh outside the panel. Styles are
// export-panel.css; the markup is export-panel-markup.js, injected at init
// when the app's #stl-bounds-panel is empty.
const runMarchingCubes = async () => { throw new Error("Browser MC unavailable in standalone viewer"); };
const detectAutoBBox = async () => null;
const applyBooleanOp = null, applyMeshDeclTransform = null, geometryToBinaryStl = null, geometryToManifold = null, getManifoldModule = null, manifoldMeshToGeometry = null, parseStlGeometry = null;
import { showNotification } from "../ui/notification.js";
import eventManager from "../ui/event-manager.js";
import { EXPORT_PANEL_MARKUP } from "./export-panel-markup.js";
const FidgetWasm = null;
import { ProgressBar } from "../ui/progress-bar.js";
const weldStl = null, writeThreeMf = null;
import { paletteColor, rgbToHex } from "./body-palette.js";
import { unzipSync, zipSync } from "three/addons/libs/fflate.module.js";

let deps = {};
let meshExportInFlight = false;
// Span of the region the last export actually meshed, for the size estimate.
// Null until something has measured the surface, when the scene box is all we
// know; it goes stale if the program changes, and refreshes on the next export.
let lastMeasuredSpan = null;
let refreshEstimate = () => {};

function downloadArrayBuffer(name, arrayBuffer, type = 'model/stl') {
    const blob = new Blob([arrayBuffer], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'mesh.stl';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function runClientShapeMC({ resolution, visibleShapes, onProgress, sdfContext = null, bbox: measured = null }) {
    const sdfCtx = sdfContext || deps.getSdfContext?.();
    if (!sdfCtx) {
        throw new Error("No SDF compiled — render a scene first");
    }
    if (sdfCtx.unsupported) {
        throw new Error(`Mesh export does not support ${sdfCtx.unsupported} programs yet`);
    }
    // Prefer the dedicated compute device with elevated storage-buffer limits
    // (needed for resolutions ≥ ~448 where per-slab buffers exceed the default 128 MB).
    const device = (await deps.getComputeDevice()) || (await deps.getRawGPUDevice());
    if (!device) {
        throw new Error("WebGPU compute device unavailable");
    }

    // A body's measured box when the caller has one (measureBodyBoxes);
    // otherwise probe this field alone.
    let bbox = measured;
    if (!bbox) {
        onProgress?.({ status: "Detecting bounds..." });
        bbox = await detectAutoBBox({ device, sdfCtx, visibleShapes });
        if (!bbox) {
            throw new Error("No surface found in visible region");
        }
        // Meshing the scene would cut the part open at its edge; ask for a
        // larger scene, as the server export does.
        if (bbox.crossesEdge) throw new Error(sceneEdgeMessage([], bbox.sceneSize));
    }
    noteMeasuredBbox(bbox);

    onProgress?.({ status: "Meshing..." });
    const result = await runMarchingCubes({
        device,
        sdfCtx,
        bbox,
        resolution,
        visibleShapes,
        onProgress,
    });

    return result;
}

// ── The export region ──
//
// Every export meshes a body over the same region: that body's own surface,
// measured on the GPU from the live scene with only its shader slots visible,
// and padded once, by the probe (auto_bbox.js). Browser MC marches its
// leaves over it, Server DC meshes them over it, and Browser DC replays
// the body's tape over it, so a body's mesh does not depend on which mesher
// made it, nor on how big its neighbours are. A body without shader slots (one
// that only places imported meshes) has no measured box; its placed meshes
// bound it. A body whose surface runs past the scene edge stops every export
// with the same message, before anything is meshed.

function sceneEdgeMessage(names, sceneSize) {
    const what = names.length === 0 ? "it runs"
        : names.length === 1 ? `${names[0]} runs` : `${names.join(", ")} run`;
    return `Scene Size (${sceneSize} mm) is too small for this geometry; ${what} past the scene edge. `
        + `Please enlarge the Scene Size.`;
}

// measureBodyBoxes measures each visible body with shader slots, returning a
// Map from the body's 1-based return index to its box, or null when the app
// cannot list its bodies or the scene cannot be probed (the export then falls
// back to its old region). A body past the scene edge throws.
async function measureBodyBoxes() {
    const bodies = deps.getExportBodies?.();
    if (!bodies) return null;
    let sdfCtx, device;
    try {
        sdfCtx = deps.getSdfContext?.();
        if (!sdfCtx || sdfCtx.unsupported) return null;
        device = (await deps.getComputeDevice()) || (await deps.getRawGPUDevice());
        if (!device) return null;
    } catch (e) {
        console.warn("Body bounds probe unavailable:", e);
        return null;
    }
    const boxes = new Map();
    const crossing = [];
    for (const body of bodies) {
        if (!body.slots || body.slots.length === 0) continue;
        let bbox;
        try {
            bbox = await detectAutoBBox({ device, sdfCtx, visibleShapes: body.slots });
        } catch (e) {
            console.warn(`Bounds probe failed for ${body.name}; it falls back to the old region:`, e);
            continue;
        }
        if (!bbox) continue;
        if (bbox.crossesEdge) {
            crossing.push(body.name);
            continue;
        }
        boxes.set(body.index, bbox);
    }
    if (crossing.length > 0) throw new Error(sceneEdgeMessage(crossing, 2 * sdfCtx.worldExtent));
    return boxes;
}

// boxArray is a measured box as [xmin, ymin, zmin, xmax, ymax, zmax].
function boxArray(bbox) {
    return [...bbox.min, ...bbox.max];
}

// ── The browser-composed export ──
//
// By the time a shader reaches the browser, the program's mesh CSG has been
// flattened into something that renders: meshDifference's implicit operand
// becomes an empty field, and what is left cannot be composed. So the export
// asks the canvas for the *plan* instead — the sliced boolean tree, with one
// shader per analytical leaf (see canvas/export-plan) — and marches each leaf
// here, composing the tree with Manifold. Asset leaves need no server work:
// the geometry is already in the viewer's mesh registry.

const PLAN_TIMEOUT_MS = 120000;

// requestExportPlan asks the canvas to slice the current program. Exports are
// serialised by meshExportInFlight, so the next plan event is this request's.
function requestExportPlan(source) {
    return new Promise((resolve, reject) => {
        let timer = null;
        const done = (fn, arg) => {
            clearTimeout(timer);
            eventManager.removeListener("canvas/export-plan", onPlan);
            eventManager.removeListener("canvas/errors", onErrors);
            fn(arg);
        };
        const onPlan = (event) => {
            if (event?.error) done(reject, new Error(event.error));
            else done(resolve, event);
        };
        const onErrors = (event) => {
            const errors = Array.isArray(event) ? event : event?.errors;
            const first = errors?.[0];
            done(reject, new Error(first?.message || first || "the program failed to build"));
        };
        eventManager.addListener("canvas/export-plan", onPlan);
        eventManager.addListener("canvas/errors", onErrors);
        timer = setTimeout(() => done(reject, new Error("timed out waiting for the export plan")), PLAN_TIMEOUT_MS);

        // The document's imports (a branch's STEP part) resolve by its name.
        const docName = deps.getDocument?.() || '';
        if (!deps.send('canvas/mesh', { source, exportMode: 'plan', ...(docName ? { document: docName } : {}) }, ["canvas"])) {
            done(reject, new Error("not connected"));
        }
    });
}

// Triangle count for a log line. The Manifold bindings come from wasm, so
// treat the accessor as optional rather than let a log break an export.
function triCount(solid) {
    try { return typeof solid.numTri === "function" ? solid.numTri() : "?"; } catch (e) { return "?"; }
}

// composePlanNode turns one plan node into a Manifold solid: an analytical
// leaf by marching its shader, an asset leaf by placing an imported mesh, a
// boolean by composing its two children. The tree is walked entirely in
// Manifold space and converted back to geometry once at the root — see
// applyBooleanOp on why. The caller owns the returned object and deletes it.
async function composePlanNode(node, ctx) {
    if (!node) throw new Error("export plan has an empty node");
    switch (node.kind) {
        case 'sdf':
            return geometryToManifold(parseStlGeometry(await meshSdfLeaf(node, ctx)), ctx.manifold);
        case 'asset': {
            const geometry = deps.getMeshGeometry(node.assetIndex);
            if (!geometry) throw new Error(`imported mesh ${node.assetIndex} is not loaded`);
            const solid = geometryToManifold(
                applyMeshDeclTransform(geometry, { matrix: node.transform?.matrix }), ctx.manifold);
            console.log(`export: asset ${node.assetIndex} placed, ${triCount(solid)} tris`);
            return solid;
        }
        case 'bool': {
            const left = await composePlanNode(node.left, ctx);
            let right;
            try {
                right = await composePlanNode(node.right, ctx);
            } catch (err) {
                left.delete();
                throw err;
            }
            exportStatus(`Combining ${ctx.shown}...`);
            const started = performance.now();
            try {
                const out = applyBooleanOp(left, right, node.op, ctx.manifold);
                console.log(`export: ${node.op} ${triCount(left)} + ${triCount(right)}`
                    + ` -> ${triCount(out)} tris in ${Math.round(performance.now() - started)}ms`);
                return out;
            } finally {
                left.delete();
                right.delete();
            }
        }
        default:
            throw new Error(`export plan has an unknown node kind: ${node.kind}`);
    }
}

function countPlanNodes(node, kind) {
    if (!node) return 0;
    const here = node.kind === kind ? 1 : 0;
    if (node.kind === 'bool') return here + countPlanNodes(node.left, kind) + countPlanNodes(node.right, kind);
    return here;
}

// runPlanExport meshes the visible bodies in the browser and returns them for
// deliverBodies, with the name the canvas gave the export.
async function runPlanExport({ resolution, source, onProgress }) {
    exportStatus("Preparing...");
    const response = await requestExportPlan(source);
    const root = response?.plan?.root;
    if (!root) throw new Error("nothing to export — write some geometry or import a mesh first");

    // Only the bodies the viewer shows, each its own solid: one is an STL as
    // before, several a zip of one STL per body.
    let bodies = planBodies(response.plan);
    const visible = deps.getVisibleShapes?.();
    if (visible) {
        const keep = new Set(visible);
        bodies = bodies.filter((b) => keep.has(b.shapeIndex));
        if (bodies.length === 0) throw new Error("nothing to export — every body is hidden");
    }
    // Each body by the name the Bodies panel shows, as Browser DC names it:
    // the plan calls an unnamed return body-<n>.
    const listed = deps.getExportBodies?.();
    for (const b of bodies) b.name = listed?.find((l) => l.index === b.shapeIndex)?.name || b.name;

    const bodyBoxes = await measureBodyBoxes();
    const ctx = {
        bodyBoxes,
        shaders: new Map((response.leaves || []).map((leaf) => [leaf.subtreeID, leaf])),
        leafCount: bodies.reduce((n, b) => n + countPlanNodes(b.root, 'sdf'), 0),
        meshed: 0,
        manifold: null,
        resolution,
        onProgress,
    };

    const meshed = [];
    for (const [k, body] of bodies.entries()) {
        ctx.shown = countedName(body.name, k + 1, bodies.length);
        meshed.push({ index: body.shapeIndex, name: body.name, stl: await composeBodyStl(body.root, ctx) });
    }
    return { bodies: meshed, baseName: (response.name || 'mesh.stl').replace(/\.stl$/i, '') };
}

// meshSdfLeaf marches one analytical leaf's shader and returns its STL.
async function meshSdfLeaf(node, ctx) {
    const leaf = ctx.shaders.get(node.subtreeID);
    if (!leaf) throw new Error(`export plan is missing the shader for ${node.subtreeID}`);
    const sdfContext = deps.makeSdfContext(leaf.wgsl, leaf.shapeCount);
    if (sdfContext.unsupported) {
        throw new Error(
            `this program cannot be exported in the browser: one of its parts needs the `
            + `${sdfContext.unsupported} binding, which the browser mesher cannot provide`);
    }
    ctx.meshed += 1;
    const label = `Meshing ${ctx.shown}...`;
    exportStatus(label);
    const started = performance.now();
    // The bar fills over every part, not over each one again, under the
    // body's label (the mesher's own steps are this one).
    const onProgress = (e) => e.total && ctx.onProgress?.({
        label,
        completed: (ctx.meshed - 1) * e.total + e.completed,
        total: ctx.leafCount * e.total,
    });
    const result = await runClientShapeMC({
        resolution: ctx.resolution,
        onProgress,
        sdfContext,
        // Every node of a body carries its return index.
        bbox: ctx.bodyBoxes?.get(node.shapeIndex) || null,
    });
    // Sizes and timings per step: an export that stalls does so on one of
    // these, and the console says which and how big it was.
    const tris = new DataView(result.stlArrayBuffer).getUint32(80, true);
    console.log(`export: leaf ${node.subtreeID} meshed ${tris} tris`
        + ` in ${Math.round(performance.now() - started)}ms`);
    return result.stlArrayBuffer;
}

// composeBodyStl is one body's STL. Only a boolean needs Manifold, which
// refuses a mesh that is not watertight; a body that is one meshed leaf or
// one placed mesh is written as it is.
async function composeBodyStl(root, ctx) {
    if (root.kind === 'sdf') return meshSdfLeaf(root, ctx);
    if (root.kind === 'asset') {
        const geometry = deps.getMeshGeometry(root.assetIndex);
        if (!geometry) throw new Error(`imported mesh ${root.assetIndex} is not loaded`);
        return geometryToBinaryStl(applyMeshDeclTransform(geometry, { matrix: root.transform?.matrix }));
    }
    ctx.manifold ??= await getManifoldModule();
    const solid = await composePlanNode(root, ctx);
    let geometry;
    try {
        exportStatus(`Finishing ${ctx.shown}...`);
        geometry = manifoldMeshToGeometry(solid.getMesh());
    } finally {
        solid.delete();
    }
    return geometryToBinaryStl(geometry);
}

// planBodies splits the plan back into its top-level returns, as the Go
// MeshExportPlan.Bodies does: the unions joining returns carry no shapeIndex,
// and the first node down each that does is a body's root.
function planBodies(plan) {
    const bodies = [];
    const walk = (node) => {
        if (!node) return;
        if (!node.shapeIndex && node.kind === 'bool' && node.op === 'union') {
            walk(node.left);
            walk(node.right);
            return;
        }
        const name = plan.bodyNames?.[node.shapeIndex] || `body-${node.shapeIndex}`;
        bodies.push({ shapeIndex: node.shapeIndex, name, root: node });
    };
    walk(plan.root);
    return bodies;
}

// Measure where the implicit surface actually is, for a server export. The
// server otherwise meshes the whole scene box, so its octree depth is spent in
// proportion to how loosely the scene is sized around the part; this is the
// same GPU probe Browser MC meshes over, and it is already padded.
// Best-effort — any failure returns null and the server falls back to the
// scene box.
async function measureSurfaceBbox() {
    try {
        const sdfCtx = deps.getSdfContext?.();
        if (!sdfCtx || sdfCtx.unsupported) return null;
        const device = (await deps.getComputeDevice()) || (await deps.getRawGPUDevice());
        if (!device) return null;
        const bbox = await detectAutoBBox({ device, sdfCtx });
        // Past the scene edge there is no bound to give; the server checks it.
        if (!bbox || bbox.crossesEdge) return null;
        noteMeasuredBbox(bbox);
        return [...bbox.min, ...bbox.max];
    } catch (e) {
        console.warn("Surface bounds probe failed; the server will mesh the scene box:", e);
        return null;
    }
}

// Dual contouring in the browser: the tape the server's mesher would use,
// replayed by fidget-wasm and meshed over the measured surface box (the scene
// box when nothing could be measured) at 2^detail cells per axis. It meshes
// the implicit returns' union only: mesh booleans and imported meshes are the
// plan export's. A vdbSdf comes with the server's level set, so it meshes as
// the server's does; a bvhSdf is refused on load. The bodies go to
// deliverBodies.
async function runBrowserDualContour({ detail }) {
    // Each visible body apart; an app that cannot list its bodies exports
    // the program's tape whole, as one body.
    const bodies = deps.getExportBodies?.();
    if (!bodies) {
        exportStatus("Preparing...");
        const tape = await deps.getTape({ levelSets: true });
        exportStatus("Meshing...");
        const stl = await dualContourTape(tape, detail, '', null, (completed, total) => exportStatus("Meshing...", completed, total));
        return { bodies: [{ index: 1, name: 'mesh', stl }], baseName: 'mesh' };
    }
    if (bodies.length === 0) throw new Error("nothing to export — every body is hidden");
    const bodyBoxes = await measureBodyBoxes();
    const meshed = [];
    for (const [k, body] of bodies.entries()) {
        // Each body fills its share of the bar as fidget-wasm meshes it.
        const shown = countedName(body.name, k + 1, bodies.length);
        if (bodies.length > 1) exportStatus(`Preparing ${shown}...`, k, bodies.length);
        else exportStatus(`Preparing ${shown}...`);
        meshed.push({ index: body.index, name: body.name, stl: await bodyDualContourStl(body, detail, bodyBoxes?.get(body.index), shown, k, bodies.length) });
    }
    return { bodies: meshed, baseName: 'mesh' };
}

// ── Export status ──
//
// While an export runs its steps show on a progress bar over the canvas, the
// same bar the server's mesher drives, shown at once since the export was
// asked for. The notification carries only the outcome, after the bar is
// gone, so the two never stand together. A step that counts its work fills
// the bar; one that cannot, as fetching a tape, keeps the last count and
// paces itself toward the next.
const exportProgress = new ProgressBar({ targetContainer: "#canvas-container", delayMs: 0 });
let exportCount = { completed: 0, total: 0 };
let exportCountedAt = 0;

function exportStatus(label, completed, total) {
    if (total !== undefined) {
        // A mesher counts many times a second, and each update restarts the
        // bar's animation, which then never steps: pass on a few a second.
        const now = performance.now();
        if (completed < total && now - exportCountedAt < 250) return;
        exportCountedAt = now;
        exportCount = { completed, total };
    }
    exportProgress.startProgress('export', label, 10000, exportCount.completed, exportCount.total);
}

// countedName is a body as the export bar names it: with its place in the
// count when there are several.
function countedName(name, k, n) {
    return n > 1 ? `${name} (${k} of ${n})` : name;
}

function exportDone() {
    exportCount = { completed: 0, total: 0 };
    exportCountedAt = 0;
    exportProgress.reset();
}

// One body's STL for the dual-contour export. An implicit body is its own
// tape, dual contoured; a body that only places imported meshes is those
// meshes as placed. The tape holds no mesh booleans, so a body mixing the
// two belongs to Browser MC.
async function bodyDualContourStl(body, detail, bodyBox, shown, k = 0, n = 1) {
    const meshDecls = body.meshDecls || [];
    if (meshDecls.length > 0 && body.slots.length > 0) {
        throw new Error(`${body.name} combines meshes, which Browser DC cannot export; use Browser MC`);
    }
    if (meshDecls.length === 0) {
        const box = bodyBox ? boxArray(bodyBox) : null;
        const tape = await deps.getTape({ body: body.index, box, levelSets: true });
        exportStatus(`Meshing ${shown}...`);
        // Body k of n fills the bar's kth nth.
        const onProgress = (completed, total) => exportStatus(`Meshing ${shown}...`, k * total + completed, n * total);
        return dualContourTape(tape, detail, body.name, box, onProgress);
    }
    // The placements as they are, triangles side by side: a dual-contour
    // export composes nothing, and Manifold refuses an imported mesh that is
    // not watertight.
    const stls = meshDecls.map((decl) => {
        const geometry = deps.getMeshGeometry(decl.index);
        if (!geometry) throw new Error(`imported mesh ${decl.index} is not loaded`);
        return geometryToBinaryStl(applyMeshDeclTransform(geometry, { matrix: decl.matrix }));
    });
    return concatBinaryStl(stls);
}

// concatBinaryStl joins binary STLs into one: an 80-byte header, the summed
// triangle count, then every file's 50-byte triangle records.
function concatBinaryStl(stls) {
    if (stls.length === 1) return stls[0];
    const count = stls.reduce((n, b) => n + new DataView(b).getUint32(80, true), 0);
    const out = new Uint8Array(84 + count * 50);
    new DataView(out.buffer).setUint32(80, count, true);
    let at = 84;
    for (const b of stls) {
        const records = new Uint8Array(b, 84);
        out.set(records, at);
        at += records.length;
    }
    return out.buffer;
}

// dualContourTape replays a tape in fidget-wasm and meshes it over the
// measured surface box (the scene box when nothing could be measured) at
// 2^detail cells per axis, calling onProgress(completed, total) as it goes.
async function dualContourTape(tape, detail, label = '', bodyBox = null, onProgress = null) {
    const fw = new FidgetWasm();
    try {
        const loaded = await fw.load(tape);
        const measured = bodyBox || await measureSurfaceBbox();
        const extent = deps.getWorldExtent?.() || 10;
        const box = measured || loaded.bbox || [-extent, -extent, -extent, extent, extent, extent];
        const started = performance.now();
        const stl = await fw.meshDC({ depth: detail, box, onProgress });
        const tris = new DataView(stl).getUint32(80, true);
        console.log(`export: browser DC${label ? ' ' + label : ''}, detail ${detail}, ${tris} tris in ${Math.round(performance.now() - started)}ms`);
        if (tris === 0) throw new Error(`no surface in the meshed region${label ? ' for ' + label : ''}`);
        return stl;
    } finally {
        fw.terminate();
    }
}

// ── Delivering the bodies ──
//
// Every mesher ends with [{ index, name, stl }], one binary STL per visible
// body (index its 1-based return, 0 when unknown), and a base name for the
// download. deliverBodies cleans them when asked and writes the format.

// cleanBodies rebuilds each body through Manifold: its corners welded, its
// degenerate triangles dropped, and the result a closed 2-manifold. A body
// Manifold refuses (one that is not watertight) is kept as meshed, and its
// name is returned with the reason, for the notification.
async function cleanBodies(bodies) {
    const module = await getManifoldModule();
    const refused = [];
    const out = [];
    for (const body of bodies) {
        exportStatus(`Cleaning ${body.name}...`);
        let solid = null;
        try {
            solid = geometryToManifold(parseStlGeometry(body.stl), module);
            const m = solid.getMesh();
            const positions = new Float32Array(m.numVert * 3);
            for (let i = 0; i < m.numVert; i++) {
                positions.set(m.vertProperties.subarray(i * m.numProp, i * m.numProp + 3), i * 3);
            }
            const before = new DataView(body.stl).getUint32(80, true);
            console.log(`export: cleaned ${body.name}, ${before} -> ${m.numTri} tris`);
            out.push({
                ...body,
                stl: geometryToBinaryStl(manifoldMeshToGeometry(m)),
                mesh: { positions, indices: new Uint32Array(m.triVerts) },
            });
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.warn(`export: Manifold refused ${body.name}; it goes out as meshed:`, err);
            refused.push(`${body.name} (${reason})`);
            out.push(body);
        } finally {
            solid?.delete();
        }
    }
    return { bodies: out, refused };
}

// threeMfBody is a body as a 3MF object: named and colored as the Bodies
// panel shows it (the plan names an unnamed return body-<n>), found by return
// index and then by name, with the palette's color when the app cannot say.
function threeMfBody(body, listed) {
    const found = listed?.find((b) => body.index && b.index === body.index)
        || listed?.find((b) => b.name === body.name);
    return {
        name: found?.name || body.name,
        color: found?.color || rgbToHex(paletteColor(body.index || 1)),
        mesh: body.mesh || weldStl(body.stl),
    };
}

// zipEntryNames is each body's <name>.stl in a zip, the name made safe as a
// file name (fileSafeName) and one that comes out like an earlier one
// suffixed -2, -3, ...: the server's zips name entries the same way
// (backend/mesh/manifold).
function zipEntryNames(names) {
    const used = new Set();
    return names.map((n) => {
        const base = fileSafeName(n);
        let name = base;
        for (let k = 2; used.has(name); k++) name = `${base}-${k}`;
        used.add(name);
        return `${name}.stl`;
    });
}

// fileSafeName is a body's name as a file name. A name can be a return's
// source text, so the characters file systems refuse (a path separator would
// make a folder in the zip) become _ and runs of whitespace, newlines among
// them, one space.
function fileSafeName(name) {
    const safe = String(name || '')
        .replace(/[ \t\n\r]+/g, ' ').trim()
        .replace(/[\/\\:*?"<>|\x00-\x1f\x7f]/g, '_');
    return safe || 'body';
}

async function deliverBodies(bodies, baseName, { format, clean }) {
    // GLB is the server's to write; the panel offers it for server exports only.
    if (format === 'glb') throw new Error("GLB is written by the server: pick Server DC or Server MC");
    let refused = [];
    if (clean) ({ bodies, refused } = await cleanBodies(bodies));
    if (format === '3mf') {
        exportStatus("Writing the 3MF...");
        const listed = deps.getExportBodies?.();
        const entries = bodies.map((b) => threeMfBody(b, listed));
        downloadArrayBuffer(`${baseName}.3mf`, writeThreeMf(entries), 'model/3mf');
    } else if (bodies.length === 1) {
        downloadArrayBuffer(`${baseName}.stl`, bodies[0].stl);
    } else {
        exportStatus("Writing the zip...");
        const files = {};
        const entries = zipEntryNames(bodies.map((b) => b.name));
        bodies.forEach((b, i) => { files[entries[i]] = new Uint8Array(b.stl); });
        downloadArrayBuffer(`${baseName}.zip`, zipSync(files), 'application/zip');
    }
    deps.clearError?.();
    exportDone();
    if (refused.length > 0) {
        showNotification(true, `Exported, but Manifold could not clean ${refused.join(', ')}; exported as meshed.`);
    } else {
        showNotification(false, "Mesh exported successfully!");
    }
}

// A server export that is to be cleaned or written as 3MF waits here for the
// server's reply: its options, set when the export is sent.
let pendingServerExport = null;

// True from a server export's click to its reply, while the export bar shows
// it (apps with serverResults only).
let serverExportShown = false;

// serverExportShowsProgress tells the app to leave the server's mesh progress
// to the export bar rather than put up a second bar for it.
export function serverExportShowsProgress() {
    return serverExportShown;
}

// claimServerStl takes the server's canvas/stl reply when the panel is to
// finish it (an app with serverResults calls it first, and downloads the
// reply itself only when this returns false). The reply is one STL, or a zip
// of <name>.stl per body when several were visible.
export function claimServerStl(event) {
    if (!pendingServerExport) return false;
    const options = pendingServerExport;
    pendingServerExport = null;
    if (event?.error) {
        exportDone();
        showNotification(true, "Export failed: " + event.error);
        return true;
    }
    finishServerExport(event, options).catch((err) => {
        exportDone();
        console.error("Server export failed:", err);
        showNotification(true, "Export failed: " + (err instanceof Error ? err.message : String(err)));
    });
    return true;
}

async function finishServerExport(event, options) {
    if (!event?.url) throw new Error("no data received");
    exportStatus("Fetching the mesh...");
    const resp = await fetch(event.url);
    if (!resp.ok) throw new Error(`fetching ${event.url}: HTTP ${resp.status}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const name = event.name || event.url.split('/').pop() || 'mesh.stl';
    const baseName = name.replace(/\.(stl|zip)$/i, '');
    const listed = deps.getExportBodies?.();
    let bodies;
    if (/\.zip$/i.test(name) || /\.zip$/i.test(event.url)) {
        // The server zips the visible bodies in return order, the order the
        // app lists them, so with one entry each they line up by position.
        const files = Object.entries(unzipSync(bytes)).filter(([file]) => /\.stl$/i.test(file));
        const inOrder = listed?.length === files.length;
        bodies = files.map(([file, data], i) => ({
            index: inOrder ? listed[i].index : 0,
            name: file.replace(/\.stl$/i, ''),
            stl: data.slice().buffer,
        }));
    } else {
        // One STL: the one visible body when the app lists them.
        const only = listed?.length === 1 ? listed[0] : null;
        bodies = [{ index: only?.index || 0, name: only?.name || baseName, stl: bytes.buffer }];
    }
    await deliverBodies(bodies, baseName, options);
}

let meshStartTime = 0;
function updateMeshProgress(e) {
    if (e.status) {
        exportStatus(e.status);
        return;
    }
    const { completed, total } = e;
    if (!total || total <= 0) return;
    if (e.label) {
        exportStatus(e.label, completed, total);
        return;
    }
    const pct = Math.round((completed / total) * 100);
    let msg = `Meshing: ${pct}%`;
    if (completed > 0 && meshStartTime > 0) {
        const elapsed = (performance.now() - meshStartTime) / 1000;
        const rate = completed / elapsed;
        const remaining = (total - completed) / rate;
        if (remaining >= 60) msg += ` — ~${Math.round(remaining / 60)}m remaining`;
        else if (remaining >= 1) msg += ` — ~${Math.round(remaining)}s remaining`;
    }
    exportStatus(msg, completed, total);
}

// Both paths mesh a cube over the detected box, sized by its x span (see
// runMarchingCubes), so that span is what sets the cell size.
function noteMeasuredBbox(bbox) {
    lastMeasuredSpan = bbox.max[0] - bbox.min[0];
    refreshEstimate();
}

function abbreviate(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

// Detail is log2 of the cells per axis, the same number the server mesher runs
// at; the estimate shows the implied voxel size and triangle upper bound.
function updateExportEstimate(detail) {
    const res = 1 << detail;
    // Manifold DC cost scales with surface cells O(res²); 12·res² is a bounding-cube tri upper bound.
    const tris = 12 * res * res;
    // World-space voxel size in millimeters (the scene's units): both paths
    // mesh the detected surface box at res cells/axis, so each voxel spans that
    // box's edge/res. Before anything has measured it, the scene box (edge =
    // 2*worldExtent, as the server seeds it) is the only bound we have — an
    // over-estimate.
    const extent = deps.getWorldExtent?.();
    const span = lastMeasuredSpan !== null ? lastMeasuredSpan : (extent ? extent * 2 : null);
    const voxel = span ? parseFloat((span / res).toPrecision(3)) : null;
    // One value per line so the breaks are always in the same place (a single
    // dot-joined line wraps at inconsistent points as the numbers change width).
    document.getElementById('stl-voxel-info').innerHTML = `${res} cells/axis`
        + (voxel ? `<br>~${voxel} mm/voxel` : '')
        + `<br>up to ~${abbreviate(tris)} tris`;
}

// The title the tape choices had before setTapesAvailable disabled them.
const TAPES_UNAVAILABLE = "This server makes no tapes: it runs no fidget agent";
const tapeTitles = new Map();
let refreshControls = () => {};

// setTapesAvailable disables the Browser DC mesher and the Omega Tape format,
// which both need a tape from the server, when the server cannot make one, and
// restores them when it can.
export function setTapesAvailable(on) {
    for (const [key, selector] of [['dc', '#export-mesher option[value="dc"]'], ['tape', '#export-format option[value="tape"]']]) {
        const option = document.querySelector(selector);
        if (!option) continue;
        if (!tapeTitles.has(key)) tapeTitles.set(key, option.title);
        option.disabled = !on;
        option.title = on ? tapeTitles.get(key) : TAPES_UNAVAILABLE;
    }
    refreshControls();
}

export function initExportPanel(hooks) {
    deps = hooks || {};

    const stlBoundsPanel = document.getElementById('stl-bounds-panel');
    if (!document.getElementById('stl-bounds-header')) {
        stlBoundsPanel.innerHTML = EXPORT_PANEL_MARKUP;
    }

    const formatSelect = document.getElementById('export-format');
    const mesherSelect = document.getElementById('export-mesher');
    const cleanBox = document.getElementById('export-clean');
    const btnExport = document.getElementById('btn-export');

    document.getElementById('stl-bounds-header').addEventListener('click', (e) => {
        if (e.target.classList.contains('panel-close')) {
            stlBoundsPanel.classList.remove('open');
        } else if (!stlBoundsPanel.classList.contains('open')) {
            stlBoundsPanel.classList.add('open');
            // Opening is the one moment we know the user is reading the
            // estimate, and the scene extent it falls back to may have changed
            // since it was last drawn.
            refreshEstimate();
        }
    });

    // ── Detail slider ──
    const stlDepthSlider = document.getElementById('stl-depth');
    const stlDepthLabel = document.getElementById('stl-depth-label');
    const depthMin = parseInt(stlDepthSlider.min);
    const depthMax = parseInt(stlDepthSlider.max);

    function currentDetail() { return parseInt(stlDepthSlider.value); }

    stlDepthSlider.addEventListener('input', (e) => {
        stlDepthLabel.textContent = e.target.value;
        updateExportEstimate(parseInt(e.target.value));
    });
    stlDepthLabel.textContent = stlDepthSlider.value;
    refreshEstimate = () => updateExportEstimate(currentDetail());
    refreshEstimate();

    function commitDepth(text) {
        const value = parseInt(text);
        if (isNaN(value)) return;
        const clamped = Math.min(Math.max(value, depthMin), depthMax);
        stlDepthSlider.value = clamped;
        stlDepthLabel.textContent = clamped;
        updateExportEstimate(clamped);
    }

    stlDepthLabel.addEventListener('mousedown', () => {
        if (stlDepthSlider.disabled) return;
        stlDepthLabel.contentEditable = 'true';
    });

    stlDepthLabel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitDepth(stlDepthLabel.textContent);
            stlDepthLabel.contentEditable = 'false';
            stlDepthLabel.blur();
        } else if (e.key === 'Escape') {
            stlDepthLabel.textContent = stlDepthSlider.value;
            stlDepthLabel.contentEditable = 'false';
            stlDepthLabel.blur();
        }
    });

    stlDepthLabel.addEventListener('blur', () => {
        if (stlDepthLabel.contentEditable === 'true') {
            commitDepth(stlDepthLabel.textContent);
            stlDepthLabel.contentEditable = 'false';
        }
    });

    // ── Format, mesher and Clean ──
    // A mesher the app cannot run at all is not offered: Browser MC needs the
    // app to hand over a compiled SDF and a compute device (an app that passes
    // no getSdfContext cannot; returning null from it means "nothing rendered
    // yet", which is transient), Browser DC needs getTape, and Server DC
    // onServerExport. One the host keeps disabled via serverExportUnavailable
    // or that the server cannot run now (Browser DC without fidget) stays, disabled.
    const mesherOption = (value) => mesherSelect.querySelector(`option[value="${value}"]`);
    if (!deps.getSdfContext) mesherOption('mc').remove();
    if (!deps.getTape) mesherOption('dc').remove();
    if (!deps.onServerExport) {
        if (deps.serverExportUnavailable) {
            mesherOption('server').disabled = true;
            mesherOption('server').title = deps.serverExportUnavailable;
        } else {
            mesherOption('server').remove();
        }
    }
    if (!deps.onServerExport || !deps.serverMarchingCubes) mesherOption('server-mc').remove();
    if (!deps.onSaveTape) formatSelect.querySelector('option[value="tape"]').remove();
    if (!deps.onExportPage) formatSelect.querySelector('option[value="page"]')?.remove();
    // GLB is written by the server, so only an app whose server writes the
    // format (serverFormats) offers it, and only for a server mesher.
    const glbOption = formatSelect.querySelector('option[value="glb"]');
    if (!deps.onServerExport || !deps.serverFormats) glbOption?.remove();
    const GLB_TITLE = glbOption?.title || '';
    const GLB_SERVER_ONLY = "GLB is written by the server: pick Server DC or Server MC";
    const SERVER_STL_ONLY = "This app's server export comes back as one STL";
    const SERVER_NOT_CLEANED = "This app's server export is not cleaned";
    const TAPE_NOT_MESHED = "A tape is the implicit field itself; nothing is meshed";
    const PAGE_NOT_MESHED = "A web page draws the implicit field itself; nothing is meshed";
    // The default is dual contouring: the server's where the host has one,
    // the browser's otherwise, marching cubes only failing both.
    const pickDefaultMesher = () => {
        const best = ['server', 'dc', 'mc'].map(mesherOption).find((o) => o && !o.disabled);
        if (best) mesherSelect.value = best.value;
    };
    pickDefaultMesher();
    refreshControls = () => {
        // A mesher or format that became unavailable gives way to the default.
        if (mesherSelect.selectedOptions[0]?.disabled) pickDefaultMesher();
        const serverMesher = mesherSelect.value === 'server' || mesherSelect.value === 'server-mc';
        if (glbOption?.isConnected) {
            const serverWritesGlb = serverMesher && !deps.serverResults;
            glbOption.disabled = !serverWritesGlb;
            glbOption.title = serverWritesGlb ? GLB_TITLE : GLB_SERVER_ONLY;
        }
        if (formatSelect.selectedOptions[0]?.disabled) formatSelect.value = '3mf';
        // A tape or a web page is not meshed, so Detail, the mesher and Clean
        // have nothing to do.
        const page = formatSelect.value === 'page';
        const unmeshed = formatSelect.value === 'tape' || page;
        const NOT_MESHED = page ? PAGE_NOT_MESHED : TAPE_NOT_MESHED;
        const onServer = mesherSelect.value === 'server' || mesherSelect.value === 'server-mc';
        // A server export the app downloads itself is STL only, unless the
        // server writes the format (serverFormats); either way it is not cleaned.
        const serverDirect = !unmeshed && onServer && !deps.serverResults;
        const serverFormatted = serverDirect && !!deps.serverFormats;
        const stlOnly = serverDirect && !deps.serverFormats;
        if (stlOnly) formatSelect.value = 'stl';
        if (stlOnly || serverFormatted) cleanBox.checked = false;
        formatSelect.disabled = stlOnly;
        stlDepthSlider.disabled = unmeshed;
        stlDepthSlider.closest('.field-panel-row').classList.toggle('disabled', unmeshed);
        stlDepthSlider.closest('.field-panel-row').title = unmeshed ? NOT_MESHED : '';
        document.getElementById('stl-voxel-info').classList.toggle('disabled', unmeshed);
        mesherSelect.disabled = unmeshed;
        cleanBox.disabled = stlOnly || serverFormatted || unmeshed;
        formatSelect.title = stlOnly ? SERVER_STL_ONLY : '';
        mesherSelect.title = unmeshed ? NOT_MESHED : '';
        cleanBox.parentElement.title = stlOnly ? SERVER_STL_ONLY : serverFormatted ? SERVER_NOT_CLEANED : unmeshed ? NOT_MESHED
            : "Rebuild each body through Manifold: weld its vertices, drop degenerate triangles, close it as a 2-manifold";
        const none = unmeshed ? false : !mesherSelect.value || mesherSelect.selectedOptions[0]?.disabled;
        btnExport.classList.toggle('unavailable', none);
    };
    mesherSelect.addEventListener('change', () => refreshControls());
    formatSelect.addEventListener('change', () => refreshControls());
    refreshControls();

    // ── Export ──
    btnExport.addEventListener('click', async () => {
        if (btnExport.classList.contains('unavailable')) return;
        if (formatSelect.value === 'tape') return deps.onSaveTape();
        if (formatSelect.value === 'page') return deps.onExportPage();
        const options = { format: formatSelect.value, clean: cleanBox.checked };
        switch (mesherSelect.value) {
            case 'mc': return exportBrowserMc(options);
            case 'dc': return exportBrowserDc(options);
            case 'server': return exportServer(options, 'mdc');
            case 'server-mc': return exportServer(options, 'marching-cubes');
        }
    });

    // Browser MC: mesh the compiled SDF in the browser.
    async function exportBrowserMc(options) {
        if (meshExportInFlight) {
            showNotification(true, "Export already in progress");
            return;
        }
        // Get the current GSL source (either from editor if in GSL mode, or from stored currentGSL)
        const source = deps.getSource();
        if (!source || source.trim() === "") {
            showNotification(true, "No code to export");
            return;
        }

        const resolution = 1 << currentDetail();

        meshExportInFlight = true;
        // GA event for mesh exports.
        deps.track?.("mesh_export", { mode: 'plan', resolution });
        const onProgress = (e) => updateMeshProgress(e);

        try {
            const { bodies, baseName } = await runPlanExport({ resolution, source, onProgress });
            await deliverBodies(bodies, baseName, options);
        } catch (err) {
            exportDone();
            const message = err instanceof Error ? err.message : String(err);
            console.error("Browser MC export failed:", err);
            showNotification(true, "Export failed: " + message);
        } finally {
            meshExportInFlight = false;
        }
    }

    // Server DC and Server MC: the server meshes by algo ("mdc" or
    // "marching-cubes"), and the reply comes back on canvas/stl. The app
    // downloads an STL reply itself; one to be cleaned or written as 3MF the
    // app hands to claimServerStl.
    async function exportServer(options, algo) {
        const mode = algo === 'mdc' ? 'server-dc' : 'server-mc';
        deps.track?.("mesh_export", { mode, resolution: 1 << currentDetail() });
        // The export bar shows the export from here to the server's reply.
        if (deps.serverResults) {
            serverExportShown = true;
            exportStatus("Meshing...");
        }
        let bodyBoxes;
        try {
            bodyBoxes = await measureBodyBoxes();
        } catch (err) {
            serverExportShown = false;
            exportDone();
            showNotification(true, "Export failed: " + (err instanceof Error ? err.message : String(err)));
            return;
        }
        const boxes = bodyBoxes
            ? Object.fromEntries([...bodyBoxes].map(([index, bbox]) => [index, boxArray(bbox)]))
            : null;
        const surfaceBbox = await measureSurfaceBbox();
        pendingServerExport = deps.serverResults && (options.format !== 'stl' || options.clean) ? options : null;
        if (deps.onServerExport(currentDetail(), surfaceBbox, boxes, algo, options.format) === false) {
            // The app sent nothing, and has said why.
            pendingServerExport = null;
            serverExportShown = false;
            exportDone();
        }
    }

    // The server's progress and reply for an export the bar shows: the
    // progress moves to the bar, and the reply ends it, unless the panel is
    // to finish the export (claimServerStl), which ends it when delivered.
    if (deps.serverResults) {
        eventManager.addListener("canvas/operation-progress", (event) => {
            if (!serverExportShown || event?.kind !== 'mesh') return;
            const phase = event.phase || "running";
            if (phase === "started" || phase === "running") {
                exportStatus(event.label || "Meshing...", event.completed || 0, event.total || 0);
            } else if (phase === "error") {
                // The app reports the error; the bar only goes.
                serverExportShown = false;
                pendingServerExport = null;
                exportDone();
            }
        });
        eventManager.addListener("canvas/stl", (event) => {
            if (!serverExportShown) return;
            serverExportShown = false;
            if (!pendingServerExport) exportDone();
        });
    }

    // Browser DC: fidget-wasm replays the server's tape.
    async function exportBrowserDc(options) {
        if (meshExportInFlight) {
            showNotification(true, "Export already in progress");
            return;
        }
        meshExportInFlight = true;
        deps.track?.("mesh_export", { mode: 'browser-dc', resolution: 1 << currentDetail() });
        try {
            const { bodies, baseName } = await runBrowserDualContour({ detail: currentDetail() });
            await deliverBodies(bodies, baseName, options);
        } catch (err) {
            exportDone();
            const message = err instanceof Error ? err.message : String(err);
            console.error("Browser DC export failed:", err);
            showNotification(true, "Export failed: " + message);
        } finally {
            meshExportInFlight = false;
        }
    }
}
