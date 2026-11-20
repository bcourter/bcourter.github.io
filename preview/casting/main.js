import { showNotification, clearNotification } from "./ui/notification.js";
import { clearError, showError, startErrorTimer, stopErrorTimer, resetErrorTimer } from "./ui/error.js";
import { ProgressBar, operationKindLabels } from "./ui/progress-bar.js";
import eventManager from "./ui/event-manager.js";
import * as host from "./host.js";
import "./ui/panel-resize.js";
import "./ui/tooltip.js";
import { createCaptions } from "./ui/captions.js";
import {
    updateShader,
    setParts,
    setShapeColor,
    setSelectedShape,
    setFieldEnabled,
    setFieldHeight,
    setFieldNormal,
    setFieldInterval,
    setFieldFade,
    setModelOpacity,
    setSectionOpacity,
    setFieldUnion,
    setFieldExternal,
    setShapeVisible,
    setSlotVisible,
    setMeshShapeVisible,
    setAnimPaused,
    setAnimTime,
    setAnimDuration,
    getAnimTime,
    audioSystem,
    pickWorldPoint,
    pickWorldPointNormal,
    addMesh,
    removeMesh,
    getMeshEntries,
    getMeshGeometry,
    syncMeshInstances,
    setOutlinesEnabled,
    setWorldExtent,
    frameWorldExtent,
    getWorldExtent,
    getGridSpacing,
    setGridSpacing,
    getGridDensity,
    setSliderValue,
    setUiControlValues,
    syncUiControls,
} from "./render/viewer.js";
import {
    initEditor,
    getContent,
    setContent,
    highlightSpans,
    clearHighlights,
    insertAtCursor,
    setLineWrap,
    setReadOnly,
    replaceSourceSpan,
    refreshEditorLayout,
} from "./editor/editor.js";
import {
    errorsToEditorEntries,
    formatErrorBody,
    formatWarningsBanner,
    gslPlainTextErrorToEntry,
    warningsToEditorEntries,
} from "./editor/diagnostics.js";
import {
    currentTab,
    selectTab,
    setPendingError,
    clearPendingError,
    setPendingWarnings,
    setWarningsVisible,
    setTabNames,
} from "./editor/editor-tab.js";
import { initHelpPanel } from "./docs/help-panel.js";
import { initSliderPanel, renderSliderPanel, sliderAnimTick, previewColor } from "./panels/slider-panel.js";
import { initMeshImport } from "./panels/mesh-import.js";
import { initExportPanel } from "./panels/export-panel.js";
import { initBodyPanel, setBodies, pickBody, materialVariables, getVisibleBodies, getBodyStates } from "./panels/body-panel.js";

const clientId = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const progressBar = new ProgressBar({ targetContainer: "#canvas-container" });

let compilePending = false;
let compileSeq = 0;
let latestCompileID = "";
let debounceTimer = null;
let currentGSL = "";
let currentWGSL = "";
let gslSource = "";
let previousTab = "GSL";
let currentShapeLocations = [];
let currentExampleName = "";
let suppressDirty = false;
let isDirty = false;
let currentWarnings = [];
let hasActiveError = false;

const btnToggleCode = document.getElementById("btn-toggle-code");
const editorContainerEl = document.getElementById("editor-container");
const warningWrapperEl = document.getElementById("warning-wrapper");
const warningOutputEl = document.getElementById("warning-output");
const splitterEl = document.querySelector(".splitter");
const editorTopControlsEl = document.getElementById("editor-top-controls");
const exampleSelectEl = document.getElementById("example-select");
const btnSaveAs = document.getElementById("btn-save-as");
const saveAsPopover = document.getElementById("save-as-popover");
const saveAsInput = document.getElementById("save-as-input");
const btnSaveConfirm = document.getElementById("btn-save-confirm");
const btnSaveCancel = document.getElementById("btn-save-cancel");

// A host that compiles nothing (host-static.js, in a page `gsl export` wrote) shows the document
// as it was exported: style.css hides what would change or save it, and the editor is read-only.
document.body.classList.toggle("read-only-host", !host.editable);

// ?embed on the address is a page set into another one, as a frame in an article: it shows the one
// document its address names (?file=), so there is no menu of documents, and no top bar to hold it.
// The Code button joins the viewport's own buttons, above Fullscreen, and what stands over the code
// (Wrap, the GSL/WGSL tabs) moves to the top of the code panel, so the viewport keeps the page's height.
const embedded = new URLSearchParams(window.location.search).has("embed");
document.body.classList.toggle("embedded", embedded);
if (embedded) {
    document.getElementById("canvas-left-btns").prepend(btnToggleCode);
    editorContainerEl.prepend(editorTopControlsEl);
}

function nextCompileID() {
    latestCompileID = `compile-${Date.now()}-${++compileSeq}`;
    return latestCompileID;
}

function markCompileStarted() { compilePending = true; }
function markCompileResolved() { compilePending = false; }

function setDirty(dirty) {
    isDirty = dirty;
    btnSaveAs.disabled = !dirty;
}

function markDirty() {
    if (!suppressDirty) {
        setDirty(true);
    }
}

function defaultSaveCopyName(name) {
    const base = (name || "example.gsl").replace(/\.gsl$/i, "");
    return `${base}_copy.gsl`;
}

// ── Top Bar: Code Slide-Out Toggle ──

function isCodePanelOpen() {
    return !editorContainerEl.classList.contains("collapsed");
}

function syncWarningBanner() {
    const bannerText = (isCodePanelOpen() && !hasActiveError)
        ? formatWarningsBanner(currentWarnings)
        : "";
    if (warningWrapperEl) {
        warningWrapperEl.classList.toggle("hidden", bannerText === "");
    }
    if (warningOutputEl) {
        warningOutputEl.textContent = bannerText;
    }
}

function applyCompileWarnings(warnings) {
    currentWarnings = Array.isArray(warnings) ? warnings : [];
    setPendingWarnings("GSL", warningsToEditorEntries(currentWarnings));
    syncWarningBanner();
}

function setCodePanelOpen(open) {
    editorContainerEl.classList.toggle("collapsed", !open);
    splitterEl.classList.toggle("hidden", !open);
    editorTopControlsEl.classList.toggle("hidden", !open);
    btnToggleCode.classList.toggle("active", open);
    btnToggleCode.setAttribute("aria-pressed", String(open));
    setWarningsVisible(open);
    syncWarningBanner();
    if (open) {
        refreshEditorLayout();
    }
    window.dispatchEvent(new Event("resize"));
}

btnToggleCode.addEventListener("click", () => {
    const isCollapsed = editorContainerEl.classList.contains("collapsed");
    setCodePanelOpen(isCollapsed);
});

// ── Top Bar: Save As Popover ──

function closeSaveAsPopover() {
    saveAsPopover.classList.add("hidden");
}

btnSaveAs.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btnSaveAs.disabled) return;
    const opening = saveAsPopover.classList.contains("hidden");
    if (opening) {
        saveAsInput.value = defaultSaveCopyName(currentExampleName);
        saveAsPopover.classList.remove("hidden");
        saveAsInput.focus();
        saveAsInput.select();
    } else {
        closeSaveAsPopover();
    }
});

async function submitSaveAs() {
    let name = (saveAsInput.value || "").trim();
    if (!name) return;
    if (!name.toLowerCase().endsWith(".gsl")) {
        name += ".gsl";
    }
    const source = getGslSourceForServer();
    try {
        const data = await host.saveExample(name, source);
        const savedName = data.name || name;
        currentExampleName = savedName;
        await refreshExampleList(savedName);
        setDirty(false);
        closeSaveAsPopover();
        showNotification(false, `Saved ${savedName}`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showNotification(true, `Save failed: ${msg}`);
    }
}

btnSaveConfirm.addEventListener("click", (e) => {
    e.stopPropagation();
    submitSaveAs();
});

if (btnSaveCancel) {
    btnSaveCancel.addEventListener("click", (e) => {
        e.stopPropagation();
        closeSaveAsPopover();
    });
}

saveAsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        submitSaveAs();
    } else if (e.key === "Escape") {
        e.preventDefault();
        closeSaveAsPopover();
    }
});

document.addEventListener("click", (e) => {
    if (!saveAsPopover.classList.contains("hidden") &&
        !saveAsPopover.contains(e.target) &&
        e.target !== btnSaveAs) {
        closeSaveAsPopover();
    }
});

// ── Error Formatting & Diagnostics ──

eventManager.addListener("canvas/errors", (payload) => {
    markCompileResolved();
    stopErrorTimer();
    progressBar.reset();

    let entries = [];
    let joined = "";
    const warnings = (payload && Array.isArray(payload.warnings)) ? payload.warnings : [];
    if (typeof payload === "string") {
        joined = payload;
        entries = [{ line: 1, col: 1, length: 1, severity: "error", message: payload, actions: [] }];
    } else if (payload && Array.isArray(payload.errors)) {
        entries = errorsToEditorEntries(payload.errors);
        joined = payload.errors.map(formatErrorBody).join("\n");
    } else if (Array.isArray(payload)) {
        const chunks = [];
        for (const item of payload) {
            const s = typeof item === "string" ? item : "";
            if (s.trim() === "") continue;
            chunks.push(s.trim());
            entries.push(gslPlainTextErrorToEntry(s.trim()));
        }
        joined = chunks.join("\n\n");
    }

    hasActiveError = true;
    currentWarnings = warnings;
    setPendingWarnings("GSL", warningsToEditorEntries(warnings));
    setPendingError("GSL", entries);
    syncWarningBanner();
    showError(joined, false);
});

eventManager.addListener("error", (event) => {
    if (!event || !event.message) {
        hasActiveError = false;
        clearPendingError();
        syncWarningBanner();
        return;
    }
    hasActiveError = true;
    syncWarningBanner();
    if (!event.wgsl) return;
    const probably = event.message.match(/probably line (\d+)/);
    const line = probably ? +probably[1] : 1;
    setPendingError("WGSL", [{
        line, col: 1, length: 1,
        severity: "error",
        message: event.message,
        actions: [],
    }]);
});

// ── 3D Gizmos & Shape Picking ──

eventManager.addListener("gsl-ui/commit", (event) => {
    if (!event.span || typeof event.text !== "string") return;
    markDirty();
    replaceSourceSpan(event.span, event.text);
});

eventManager.addListener("gsl-ui/input", (event) => {
    setUiControlValues(event);
});

eventManager.addListener("shape/picked", (event) => {
    const shapeIndex = event.shapeIndex;
    setSelectedShape(shapeIndex);

    // Select the picked body in the Bodies panel, without opening it.
    pickBody(shapeIndex);

    if (shapeIndex === 0) {
        clearHighlights();
        return;
    }

    const locations = currentShapeLocations[shapeIndex - 1];
    if (locations && locations.spans && currentTab === "GSL") {
        highlightSpans(locations.spans);
    }
});

function detectShapeCount(wgslCode) {
    const matches = wgslCode.matchAll(/gsl_shape\([^,]+,\s*(\d+)u\)/g);
    let maxIndex = 0;
    for (const match of matches) {
        maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
    }
    return Math.max(maxIndex, 1);
}

const setCaptions = createCaptions(document.getElementById("canvas-container"), getAnimTime);

eventManager.addListener("canvas/update-shader", (event) => {
    if (event.wgsl) {
        currentWGSL = event.wgsl;
        currentShapeLocations = event.shapeLocations || [];
        setParts(event.parts || []);
        updateShader(
            event.wgsl,
            event.shapeCount || 1,
            event.shapeNames || [],
            event.meshSdfBindings || event.meshSdfSlots || [],
            event.sliders || [],
            event.uiControls || [],
        );
        markCompileResolved();
        hasActiveError = false;
        clearPendingError();
        clearError();
        stopErrorTimer();
        progressBar.reset();
        clearHighlights();
        setSelectedShape(0);

        // A document's @scene directive commits into the Scene panel, which
        // then also keeps the Section ranges in step; without one the scene
        // stays as the panel has it.
        if (event.scene) {
            const sizeChanged = event.scene.size > 0 && Math.abs(event.scene.size - getWorldExtent() * 2) > 1e-4;
            if (event.scene.size > 0) commitSceneBbox(event.scene.size);
            if (event.scene.grid > 0) commitGridSpacing(event.scene.grid);
            if (sizeChanged) frameWorldExtent();
        }

        // The document's @caption lines, which the clock shows and hides.
        setCaptions(event.captions || []);

        // The document's @duration, which the Time slider spans and the clock loops on.
        applyDuration(event.duration);

        const decls = event.meshDecls || [];
        const unknowns = syncMeshInstances(decls);
        if (unknowns.length > 0) {
            hasActiveError = true;
            showError(`Unknown mesh index: ${unknowns.join(", ")}. Upload in the Imports panel first.`, false);
        }
        // The scene gizmos: a handle for each @point, @direction and
        // @transform the program declares.
        syncUiControls(event.uiControls || []);

        renderSliderPanel(event.sliders || [], event.uiControls || []);

        if (currentTab === "WGSL") {
            suppressDirty = true;
            setContent(currentWGSL);
            suppressDirty = false;
        }
    }
});

// ── Compile & Mesh, by the Host (host.js) ──

async function compileGsl(source) {
    if (!source || source.trim() === "") return;
    const reqId = nextCompileID();
    markCompileStarted();
    startErrorTimer("compiler");
    showNotification(false, "Compiling...");

    try {
        const { ok, status, data } = await host.compile({ id: reqId, clientId, source });
        if (reqId !== latestCompileID) return;

        if (!ok || (data.errors && data.errors.length > 0)) {
            // Structured diagnostics go as { errors, warnings } so the handler
            // can place each one in the editor; anything else falls back to plain text.
            const errs = data.errors && data.errors.length > 0
                ? { errors: data.errors, warnings: data.warnings }
                : [`Compile failed (HTTP ${status})`];
            eventManager.dispatchEvent("canvas/errors", errs);
            return;
        }

        clearNotification();
        if (!data.wgsl) {
            markCompileResolved();
            hasActiveError = false;
            clearPendingError();
            clearError();
            stopErrorTimer();
            progressBar.reset();
        }
        eventManager.dispatchEvent("canvas/update-shader", data);
        applyCompileWarnings(data.warnings || []);

        const audioJs = data.audio && (data.audio.jsCode || data.audio.javascript) || "";
        const hasAudio = Boolean(audioJs);
        eventManager.dispatchEvent("canvas/update-audio", {
            javascript: audioJs,
            hasAudio,
        });
    } catch (err) {
        if (reqId !== latestCompileID) return;
        const msg = err instanceof Error ? err.message : String(err);
        eventManager.dispatchEvent("canvas/errors", [msg]);
    }
}

// requestStlExport asks the server to mesh the source by algo: "mdc" (the Export panel's Server DC) or
// "marching-cubes" (Server MC), and to write it as format ("3mf", "glb" or "stl"). Each body the Bodies panel shows
// is meshed apart, in the color it shows; an STL of several comes back as a zip of one STL each.
async function requestStlExport(detail, surfaceBbox, algo, format = "stl") {
    const source = getGslSourceForServer();
    if (!source || source.trim() === "") {
        showNotification(true, "No code to export");
        return false;
    }

    const reqId = `mesh-${Date.now()}`;
    const subdivision = detail ?? 9;
    const ext = getWorldExtent();
    const bbox = Array.isArray(surfaceBbox) && surfaceBbox.length === 6
        ? surfaceBbox
        : [-ext, -ext, -ext, ext, ext, ext];

    // The bodies shown, by 1-based return index, with their chips' colors; no list when the panel lists none.
    const visible = getVisibleBodies();
    const bodies = getBodyStates().length > 0 ? visible.map((b) => b.index) : null;
    const colors = Object.fromEntries(visible.map((b) => [b.index, b.color]));

    showNotification(false, "Generating mesh...", true);
    startErrorTimer("stl export");

    try {
        const res = await host.mesh({
            id: reqId,
            clientId,
            source,
            subdivision,
            bbox,
            algo,
            time: getAnimTime(),
            format,
            bodies,
            colors,
        });

        stopErrorTimer();
        progressBar.reset();

        if (!res.ok) {
            let errText = `HTTP ${res.status}`;
            try {
                const errJson = await res.json();
                if (errJson && errJson.error) errText = errJson.error;
            } catch (_) {
                // ignore JSON parse error on non-JSON body
            }
            showError(`Export failed: ${errText}`, false, true);
            return false;
        }

        // The reply's own type names the file: one STL, a zip of one STL per body, a 3MF or a GLB.
        const type = res.headers.get("Content-Type") || "";
        const fileExt = type.includes("zip") ? "zip" : type.includes("3mf") ? "3mf" : type.includes("gltf-binary") ? "glb" : "stl";
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const baseName = (currentExampleName || "model.gsl").replace(/\.gsl$/i, "");
        a.href = url;
        a.download = `${baseName}.${fileExt}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotification(false, `Exported ${baseName}.${fileExt}`);
        return true;
    } catch (err) {
        stopErrorTimer();
        progressBar.reset();
        const msg = err instanceof Error ? err.message : String(err);
        showError(`Export failed: ${msg}`, false, true);
        return false;
    }
}

// exportPage downloads the open document as `gsl export` writes it: this viewer and the document's
// field as static web pages, zipped. It is the Export panel's Web page format.
async function exportPage() {
    const source = getGslSourceForServer();
    if (!source || source.trim() === "") {
        showNotification(true, "Nothing to export");
        return false;
    }
    showNotification(false, "Exporting web page...", true);
    try {
        const res = await host.exportPage({ name: currentExampleName || "model.gsl", source });
        if (!res.ok) {
            let errText = `HTTP ${res.status}`;
            try {
                const errJson = await res.json();
                if (errJson && errJson.error) errText = errJson.error;
            } catch (_) {
                // ignore JSON parse error on non-JSON body
            }
            showError(`Export failed: ${errText}`, false, true);
            return false;
        }

        // The reply names the file: the document's name, -html.zip in place of .gsl.
        const named = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") || "");
        const fileName = named ? named[1] : "model-html.zip";
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        const note = res.headers.get("X-Export-Note");
        showNotification(false, note ? `Exported ${fileName}. ${note}` : `Exported ${fileName}: unzip it onto any web server`);
        return true;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showError(`Export failed: ${msg}`, false, true);
        return false;
    }
}

// ── Progress Events from the Host ──

function handleProgressEvent(ev) {
    if (!ev) return;
    resetErrorTimer();
    const stage = ev.stage || "compile";
    if (ev.done) {
        progressBar.reset();
        return;
    }
    const label = ev.label || operationKindLabels[stage] || stage;
    progressBar.startProgress(stage, label, 10000, ev.completed || 0, ev.total || 0);
}

host.connectProgress(clientId, handleProgressEvent);

// ── Surface Point & Point+Normal Picking Tools ──

const btnPointSelect = document.getElementById("btn-point-select");
const btnPointNormalSelect = document.getElementById("btn-point-normal-select");
let pointSelectMode = false;
let pointNormalSelectMode = false;

function topoToolActive() {
    return pointSelectMode || pointNormalSelectMode;
}

function enterTopoToolVisuals(msg) {
    document.getElementById("canvas-container").style.cursor = "crosshair";
    setOutlinesEnabled(false);
    showNotification(false, msg);
}

function exitTopoToolVisuals() {
    document.getElementById("canvas-container").style.cursor = "";
    setOutlinesEnabled(true);
    clearNotification();
}

function exitPointSelectMode() {
    pointSelectMode = false;
    btnPointSelect.classList.remove("active");
    exitTopoToolVisuals();
}

function enterPointSelectMode() {
    if (pointNormalSelectMode) exitPointNormalSelectMode();
    pointSelectMode = true;
    btnPointSelect.classList.add("active");
    enterTopoToolVisuals("Click on a surface to insert [x, y, z]");
}

function exitPointNormalSelectMode() {
    pointNormalSelectMode = false;
    btnPointNormalSelect.classList.remove("active");
    exitTopoToolVisuals();
}

function enterPointNormalSelectMode() {
    if (pointSelectMode) exitPointSelectMode();
    pointNormalSelectMode = true;
    btnPointNormalSelect.classList.add("active");
    enterTopoToolVisuals("Click on a surface to insert a point + normal");
}

btnPointSelect.addEventListener("click", () => {
    if (pointSelectMode) exitPointSelectMode();
    else enterPointSelectMode();
});

btnPointNormalSelect.addEventListener("click", () => {
    if (pointNormalSelectMode) exitPointNormalSelectMode();
    else enterPointNormalSelectMode();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (pointSelectMode) exitPointSelectMode();
        else if (pointNormalSelectMode) exitPointNormalSelectMode();
    }
});

let canvasMouseDownPos = null;
document.getElementById("canvas-container").addEventListener("mousedown", (event) => {
    if (document.getElementById("canvas-controls").contains(event.target)) return;
    if (document.getElementById("canvas-left-btns").contains(event.target)) return;
    canvasMouseDownPos = { x: event.clientX, y: event.clientY };
});

document.getElementById("canvas-container").addEventListener("click", async (event) => {
    if (!topoToolActive()) return;
    if (btnPointSelect.contains(event.target) || btnPointNormalSelect.contains(event.target)) return;
    if (document.getElementById("canvas-controls").contains(event.target)) return;
    if (document.getElementById("canvas-left-btns").contains(event.target)) return;

    if (canvasMouseDownPos) {
        const dx = event.clientX - canvasMouseDownPos.x;
        const dy = event.clientY - canvasMouseDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 3) {
            canvasMouseDownPos = null;
            return;
        }
    }
    canvasMouseDownPos = null;

    event.stopPropagation();
    event.preventDefault();

    if (pointNormalSelectMode) {
        const hit = await pickWorldPointNormal(event);
        if (hit) {
            const p = `[${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}, ${hit.point.z.toFixed(2)}]`;
            const n = hit.normal
                ? `[${hit.normal.x.toFixed(4)}, ${hit.normal.y.toFixed(4)}, ${hit.normal.z.toFixed(4)}]`
                : `[0, 0, 1]`;
            markDirty();
            insertAtCursor(`${p}, ${n}`);
        } else {
            showNotification(true, "No surface hit — try clicking on a shape or mesh");
        }
        return;
    }

    const point = await pickWorldPoint(event);
    if (point) {
        const text = `[${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)}]`;
        markDirty();
        insertAtCursor(text);
    } else {
        showNotification(true, "No surface hit — try clicking on a shape or mesh");
    }
}, true);

const btnFullscreen = document.getElementById("btn-fullscreen");
btnFullscreen.addEventListener("click", () => {
    // An embedded page goes full screen whole, so its code panel comes along; otherwise the viewport does.
    const container = embedded ? document.documentElement : document.getElementById("canvas-container");
    if (!document.fullscreenElement) {
        container.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

// ── CodeMirror Editor & GSL/WGSL Tabs ──

const editorHost = document.getElementById("editor");
const initialContent = `// Select an example from the dropdown above\n// or write your own GSL code here\n`;

function getGslSourceForServer() {
    if (currentTab === "GSL") {
        return getContent();
    }
    return gslSource || currentGSL || "";
}

function onEditorChange(content) {
    if (suppressDirty) return;
    markDirty();
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
        clearHighlights();
        if (currentTab === "GSL") {
            gslSource = content;
            currentGSL = content;
            compileGsl(content);
        } else if (currentTab === "WGSL") {
            currentWGSL = content;
            eventManager.dispatchEvent("canvas/update-shader", {
                wgsl: content,
                shapeCount: detectShapeCount(content),
            });
            clearError();
            stopErrorTimer();
        }
    }, 500);
}

initEditor(editorHost, initialContent.trim(), onEditorChange);
setReadOnly(!host.editable);

eventManager.addListener("tab/selected", (event) => {
    const nextTab = event.tab;
    if (previousTab === "GSL") {
        gslSource = getContent();
    } else if (previousTab === "WGSL") {
        currentWGSL = getContent();
    }

    suppressDirty = true;
    if (nextTab === "GSL") {
        setContent(gslSource);
    } else if (nextTab === "WGSL") {
        setContent(currentWGSL);
    }
    suppressDirty = false;
    previousTab = nextTab;
});

setTabNames("GSL", "WGSL");

let wrapEnabled = true;
const btnWrap = document.getElementById("btn-wrap");
btnWrap.addEventListener("click", () => {
    wrapEnabled = !wrapEnabled;
    btnWrap.classList.toggle("active", wrapEnabled);
    setLineWrap(wrapEnabled);
});

// ── Help Panel, Slider Panel, Mesh Import Panel, Export Panel ──

// The reference for writing GSL, importing meshes into the document and meshing it on the server
// are for a host that compiles.
if (host.editable) initHelpPanel({
    menuHost: document.getElementById("help-menu"),
    panelHost: document.getElementById("canvas-container"),
});

initSliderPanel({
    setSliderValue,
    materialVariables,
    getAnimTime,
    audioSystem,
    onCommit: () => {
        markDirty();
        compilePending = true;
    },
});

document.getElementById("slider-panel-header").addEventListener("click", (e) => {
    const panel = document.getElementById("slider-panel");
    if (e.target.classList.contains("panel-close")) {
        panel.classList.remove("open");
    } else if (!panel.classList.contains("open")) {
        panel.classList.add("open");
    }
});

if (host.editable) initMeshImport({
    addMesh,
    removeMesh,
    getMeshEntries,
    getSource: getGslSourceForServer,
    setSource: (next) => {
        if (currentTab !== "GSL") selectTab("GSL");
        suppressDirty = true;
        setContent(next);
        suppressDirty = false;
        gslSource = next;
        currentGSL = next;
        markDirty();
    },
    recompile: () => {
        const source = getGslSourceForServer();
        if (!source || source.trim() === "") return;
        compileGsl(source);
    },
    // Send an STL to the server before the import is written into the program,
    // so bvhSdf / vdbSdf on its slot load it when the program compiles.
    onImported: async (index, file, bytes) => {
        if (!/\.stl$/i.test(file.name)) return;
        await host.uploadAsset(file.name, bytes);
    },
    dropTarget: document.getElementById("canvas-container"),
});

if (host.editable) initExportPanel({
    getMeshGeometry,
    getWorldExtent,
    getSource: getGslSourceForServer,
    clearError,
    onServerExport: (detail, surfaceBbox, _bodyBoxes, algo, format) => {
        return requestStlExport(detail, surfaceBbox, algo, format);
    },
    serverMarchingCubes: true,
    serverFormats: true,
    onExportPage: exportPage,
});

// ── Bodies Panel ──
// The body list, its colours and the swatch grid live in panels/body-panel.js;
// main.js wires the editor's source in and out, the viewer's per-body colour
// and visibility, and the body list from shapes/detected. Picking a body in
// the 3D view selects it there (see the shape/picked listener above).

initBodyPanel({
    getSource: getGslSourceForServer,
    setSource: (next) => {
        if (currentTab !== "GSL") selectTab("GSL");
        suppressDirty = true;
        setContent(next);
        suppressDirty = false;
        gslSource = next;
        currentGSL = next;
        markDirty();
    },
    recompile: () => {
        const source = getGslSourceForServer();
        if (!source || source.trim() === "") return;
        compileGsl(source);
    },
    setShapeColor,
    setShapeVisible,
    setSlotVisible,
    setMeshShapeVisible,
    setSliderValue,
    previewColor,
    selectShape: setSelectedShape,
    popupParent: document.getElementById("canvas-container"),
    readOnly: !host.editable,
});

eventManager.addListener("shapes/detected", (event) => {
    const names = event.names || [];
    setBodies(Array.from({ length: event.count || 0 }, (_, i) => names[i] || ""));
});

// ── Parameters Panel: Animation Transport & Audio ──
// The animation clock's controls sit at the bottom of the Parameters panel
// below the program's slider rows: the Time range, rewind / play-pause /
// fast-forward, and the end time. They replaced the former Animation panel.

const animTimeInput = document.getElementById("animation-time-input");
const btnPauseAnim = document.getElementById("btn-pause-anim");
const btnRewindAnim = document.getElementById("btn-rewind-anim");
const btnFastForwardAnim = document.getElementById("btn-fastforward-anim");
const timeRange = document.getElementById("time-range");
const animEndTimeInput = document.getElementById("anim-end-time");
let animPaused = true;

// One always-on ticker mirrors the animation clock into the Time row's number
// and range inputs while the clock runs. One DOM write per 50 ms is cheap
// enough that gating on panel visibility isn't worth the bookkeeping.
setInterval(() => {
    if (animPaused) return;
    const t = getAnimTime();
    animTimeInput.value = t.toFixed(2);
    timeRange.value = String(t);
}, 50);

function setAnimPausedState(paused) {
    animPaused = paused;
    setAnimPaused(animPaused);
    btnPauseAnim.innerHTML = animPaused
        ? `<span class="anim-glyph">▶</span>`
        : `<span class="anim-glyph anim-glyph-low">⏸</span>`;
    // The time inputs are editable only while the clock is paused; the
    // animation loop owns them otherwise.
    animTimeInput.readOnly = !animPaused;
    timeRange.disabled = !animPaused;
    if (animPaused) {
        const t = getAnimTime();
        animTimeInput.value = t.toFixed(2);
        timeRange.value = String(t);
    } else {
        // Re-kick the slider animation loop on unpause: while the clock was
        // frozen, sliderAnimTick exited once each row reached a stable value.
        requestAnimationFrame(sliderAnimTick);
    }
}
// Apply the initial (paused) state so the UI matches animPaused.
setAnimPausedState(animPaused);

btnPauseAnim.addEventListener("click", () => setAnimPausedState(!animPaused));

btnRewindAnim.addEventListener("click", () => {
    setAnimTime(0);
    animTimeInput.value = "0.00";
    timeRange.value = "0";
});

btnFastForwardAnim.addEventListener("click", () => {
    const end = parseFloat(animEndTimeInput.value);
    if (!isFinite(end) || end <= 0) return;
    setAnimTime(end);
    animTimeInput.value = end.toFixed(2);
    timeRange.value = String(end);
});

animTimeInput.addEventListener("change", () => {
    const t = parseFloat(animTimeInput.value);
    if (!isNaN(t) && t >= 0) {
        setAnimTime(t);
        timeRange.value = String(t);
    }
});

// A document's @duration(seconds) sets the end time and the Time slider's
// range, and the clock starts over there. A document without one leaves the
// end time as it is and lets the clock run on.
function applyDuration(duration) {
    const seconds = duration && duration.seconds > 0 ? duration.seconds : 0;
    setAnimDuration(seconds);
    if (seconds > 0) {
        animEndTimeInput.value = String(seconds);
        timeRange.max = String(seconds);
    }
}

// Scrub time with the range input (active only while paused). Stays within
// [0, endTime].
timeRange.addEventListener("input", () => {
    const t = parseFloat(timeRange.value);
    if (!isNaN(t) && t >= 0) {
        setAnimTime(t);
        animTimeInput.value = t.toFixed(2);
    }
});

// The end-time field sets the Time slider's soft upper bound; it doesn't clamp
// the animation clock itself, so the number input can still go past it.
animEndTimeInput.addEventListener("input", () => {
    const end = parseFloat(animEndTimeInput.value);
    if (!isNaN(end) && end > 0) {
        timeRange.max = String(end);
    }
});

document.getElementById("audio-volume").addEventListener("input", (e) => {
    const pct = parseInt(e.target.value, 10);
    const volume = pct / 100;
    audioSystem.setEnabled(pct > 0);
    audioSystem.setVolume(volume);
});

eventManager.addListener("canvas/update-audio", (event) => {
    const { javascript, hasAudio } = event;
    const audioVolumeRow = document.getElementById("audio-volume-row");
    audioVolumeRow.style.display = hasAudio ? "" : "none";
    audioSystem.updateShader(javascript, hasAudio);
});

// ── Section Panel ──

const fieldPanel = document.getElementById("field-panel");
const fieldHeightSlider = document.getElementById("field-height");
const fieldHeightLabel = document.getElementById("field-height-label");
const fieldModelSlider = document.getElementById("field-model");
const fieldModelLabel = document.getElementById("field-model-label");

document.getElementById("field-panel-header").addEventListener("click", (e) => {
    if (e.target.classList.contains("panel-close")) {
        fieldPanel.classList.remove("open");
        setFieldEnabled(false);
        setModelOpacity(1.0);
    } else if (!fieldPanel.classList.contains("open")) {
        fieldPanel.classList.add("open");
        setFieldEnabled(true);
        setModelOpacity(parseFloat(fieldModelSlider.value));
    }
});

fieldHeightSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    fieldHeightLabel.textContent = value.toFixed(2);
    setFieldHeight(value);
});

function commitFieldHeight(text) {
    const value = parseFloat(text);
    if (isNaN(value)) return;
    // Read the live bounds: the Scene panel resizes this range with the box.
    const fieldMin = parseFloat(fieldHeightSlider.min);
    const fieldMax = parseFloat(fieldHeightSlider.max);
    const clamped = Math.min(Math.max(value, fieldMin), fieldMax);
    fieldHeightSlider.value = clamped;
    fieldHeightLabel.textContent = clamped.toFixed(2);
    setFieldHeight(clamped);
}

fieldHeightLabel.addEventListener("mousedown", () => { fieldHeightLabel.contentEditable = "true"; });
fieldHeightLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        commitFieldHeight(fieldHeightLabel.textContent);
        fieldHeightLabel.contentEditable = "false";
        fieldHeightLabel.blur();
    } else if (e.key === "Escape") {
        fieldHeightLabel.textContent = parseFloat(fieldHeightSlider.value).toFixed(2);
        fieldHeightLabel.contentEditable = "false";
        fieldHeightLabel.blur();
    }
});
fieldHeightLabel.addEventListener("blur", () => {
    if (fieldHeightLabel.contentEditable === "true") {
        commitFieldHeight(fieldHeightLabel.textContent);
        fieldHeightLabel.contentEditable = "false";
    }
});

const fieldIntervalSlider = document.getElementById("field-interval");
const fieldIntervalLabel = document.getElementById("field-interval-label");

fieldIntervalSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    fieldIntervalLabel.textContent = value.toFixed(2);
    if (value > 0) setFieldInterval(value);
});

function commitFieldInterval(text) {
    const value = parseFloat(text);
    if (isNaN(value)) return;
    // Live bounds: the max scales with the scene size (syncCrossSectionRange).
    const fieldIntervalMin = parseFloat(fieldIntervalSlider.min);
    const fieldIntervalMax = parseFloat(fieldIntervalSlider.max);
    const clamped = Math.min(Math.max(value, fieldIntervalMin), fieldIntervalMax);
    fieldIntervalSlider.value = clamped;
    fieldIntervalLabel.textContent = clamped.toFixed(2);
    if (clamped > 0) setFieldInterval(clamped);
}

fieldIntervalLabel.addEventListener("mousedown", () => { fieldIntervalLabel.contentEditable = "true"; });
fieldIntervalLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        commitFieldInterval(fieldIntervalLabel.textContent);
        fieldIntervalLabel.contentEditable = "false";
        fieldIntervalLabel.blur();
    } else if (e.key === "Escape") {
        fieldIntervalLabel.textContent = parseFloat(fieldIntervalSlider.value).toFixed(2);
        fieldIntervalLabel.contentEditable = "false";
        fieldIntervalLabel.blur();
    }
});
fieldIntervalLabel.addEventListener("blur", () => {
    if (fieldIntervalLabel.contentEditable === "true") {
        commitFieldInterval(fieldIntervalLabel.textContent);
        fieldIntervalLabel.contentEditable = "false";
    }
});

const fieldFadeSlider = document.getElementById("field-fade");
const fieldFadeLabel = document.getElementById("field-fade-label");
const fieldFadeMin = parseFloat(fieldFadeSlider.min);

// The top of the slider always maps to infinity in the shader. The max scales
// with the scene size (syncCrossSectionRange), so it is read live everywhere.
function fadeSliderToUniform(v) { return v >= parseFloat(fieldFadeSlider.max) ? 1e9 : v; }

fieldFadeSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    fieldFadeLabel.textContent = value >= parseFloat(fieldFadeSlider.max) ? "∞" : value.toFixed(1);
    setFieldFade(fadeSliderToUniform(value));
});

function commitFieldFade(text) {
    const value = parseFloat(text);
    if (isNaN(value)) return;
    const fieldFadeMax = parseFloat(fieldFadeSlider.max);
    const clamped = Math.min(Math.max(value, fieldFadeMin), fieldFadeMax);
    fieldFadeSlider.value = clamped;
    fieldFadeLabel.textContent = clamped >= fieldFadeMax ? "∞" : clamped.toFixed(1);
    setFieldFade(fadeSliderToUniform(clamped));
}

fieldFadeLabel.addEventListener("mousedown", () => { fieldFadeLabel.contentEditable = "true"; });
fieldFadeLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        commitFieldFade(fieldFadeLabel.textContent);
        fieldFadeLabel.contentEditable = "false";
        fieldFadeLabel.blur();
    } else if (e.key === "Escape") {
        const v = parseFloat(fieldFadeSlider.value);
        fieldFadeLabel.textContent = v >= parseFloat(fieldFadeSlider.max) ? "∞" : v.toFixed(1);
        fieldFadeLabel.contentEditable = "false";
        fieldFadeLabel.blur();
    }
});
fieldFadeLabel.addEventListener("blur", () => {
    if (fieldFadeLabel.contentEditable === "true") {
        commitFieldFade(fieldFadeLabel.textContent);
        fieldFadeLabel.contentEditable = "false";
    }
});

fieldModelSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    fieldModelLabel.textContent = value.toFixed(2);
    setModelOpacity(value);
});

function commitFieldModel(text) {
    const value = parseFloat(text);
    if (isNaN(value)) return;
    const clamped = Math.min(Math.max(value, 0), 1);
    fieldModelSlider.value = clamped;
    fieldModelLabel.textContent = clamped.toFixed(2);
    setModelOpacity(clamped);
}

fieldModelLabel.addEventListener("mousedown", () => { fieldModelLabel.contentEditable = "true"; });
fieldModelLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        commitFieldModel(fieldModelLabel.textContent);
        fieldModelLabel.contentEditable = "false";
        fieldModelLabel.blur();
    } else if (e.key === "Escape") {
        fieldModelLabel.textContent = parseFloat(fieldModelSlider.value).toFixed(2);
        fieldModelLabel.contentEditable = "false";
        fieldModelLabel.blur();
    }
});
fieldModelLabel.addEventListener("blur", () => {
    if (fieldModelLabel.contentEditable === "true") {
        commitFieldModel(fieldModelLabel.textContent);
        fieldModelLabel.contentEditable = "false";
    }
});

const fieldSectionSlider = document.getElementById("field-section");
const fieldSectionLabel = document.getElementById("field-section-label");

fieldSectionSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    fieldSectionLabel.textContent = value.toFixed(2);
    setSectionOpacity(value);
});

function commitFieldSection(text) {
    const value = parseFloat(text);
    if (isNaN(value)) return;
    const clamped = Math.min(Math.max(value, 0), 1);
    fieldSectionSlider.value = clamped;
    fieldSectionLabel.textContent = clamped.toFixed(2);
    setSectionOpacity(clamped);
}

fieldSectionLabel.addEventListener("mousedown", () => { fieldSectionLabel.contentEditable = "true"; });
fieldSectionLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        commitFieldSection(fieldSectionLabel.textContent);
        fieldSectionLabel.contentEditable = "false";
        fieldSectionLabel.blur();
    } else if (e.key === "Escape") {
        fieldSectionLabel.textContent = parseFloat(fieldSectionSlider.value).toFixed(2);
        fieldSectionLabel.contentEditable = "false";
        fieldSectionLabel.blur();
    }
});
fieldSectionLabel.addEventListener("blur", () => {
    if (fieldSectionLabel.contentEditable === "true") {
        commitFieldSection(fieldSectionLabel.textContent);
        fieldSectionLabel.contentEditable = "false";
    }
});

document.getElementById("field-union").addEventListener("change", (e) => {
    setFieldUnion(e.target.checked);
});

document.getElementById("field-external").addEventListener("change", (e) => {
    setFieldExternal(e.target.checked);
});

function updateFieldNormal() {
    const x = parseFloat(document.getElementById("field-normal-x").value) || 0;
    const y = parseFloat(document.getElementById("field-normal-y").value) || 0;
    const z = parseFloat(document.getElementById("field-normal-z").value) || 0;
    setFieldNormal(x, y, z);
}
document.getElementById("field-normal-x").addEventListener("input", updateFieldNormal);
document.getElementById("field-normal-y").addEventListener("input", updateFieldNormal);
document.getElementById("field-normal-z").addEventListener("input", updateFieldNormal);

// ── Scene Panel: Size ──
// The slider value is the full edge length (twice the half-extent), so it
// reads "400" for the default 400 mm cube. A document's @scene directive
// commits into the same controls (see the canvas/update-shader listener).

const scenePanel = document.getElementById("scene-panel");
const sceneBboxSlider = document.getElementById("scene-bbox");
const sceneBboxLabel = document.getElementById("scene-bbox-label");
const sceneBboxInfo = document.getElementById("scene-bbox-info");
const sceneBboxMin = parseFloat(sceneBboxSlider.min);
const sceneBboxMax = parseFloat(sceneBboxSlider.max);

function updateSceneBboxInfo(edge) {
    sceneBboxInfo.textContent = `${edge} mm cube`;
}

// Keep the Section controls in step with the domain: the Offset can sweep the
// whole box, and the Interval (a world-unit spacing) scales with the scene
// size (half-extent 200 -> 0..40, so a 10x scene -> 0..400).
function syncCrossSectionRange(half) {
    fieldHeightSlider.min = -half;
    fieldHeightSlider.max = half;
    const cur = parseFloat(fieldHeightSlider.value);
    const clamped = Math.min(Math.max(cur, -half), half);
    if (clamped !== cur) {
        fieldHeightSlider.value = clamped;
        fieldHeightLabel.textContent = clamped.toFixed(2);
        setFieldHeight(clamped);
    }

    const intervalMax = half / 5;
    fieldIntervalSlider.max = intervalMax;
    fieldIntervalSlider.step = intervalMax / 200;
    const curInt = parseFloat(fieldIntervalSlider.value);
    if (curInt > intervalMax) {
        fieldIntervalSlider.value = intervalMax;
        fieldIntervalLabel.textContent = intervalMax.toFixed(2);
        if (intervalMax > 0) setFieldInterval(intervalMax);
    }

    // The Fade range scales too (half-extent 200 -> 0..200).
    const fadeMax = half;
    const fadeWasInf = parseFloat(fieldFadeSlider.value) >= parseFloat(fieldFadeSlider.max);
    fieldFadeSlider.max = fadeMax;
    fieldFadeSlider.step = fadeMax / 100;
    if (fadeWasInf || parseFloat(fieldFadeSlider.value) > fadeMax) {
        fieldFadeSlider.value = fadeMax;
        fieldFadeLabel.textContent = "∞";
        setFieldFade(1e9);
    }
}

function applySceneBbox(edge) {
    const half = edge / 2;
    setWorldExtent(half);
    syncCrossSectionRange(half);
    updateSceneBboxInfo(edge);
    updateGridInfo(); // the spacing holds; the division count across it changes
}

// Initialize from the renderer's current extent (default 400 x 400 x 400).
sceneBboxSlider.value = getWorldExtent() * 2;
sceneBboxLabel.textContent = sceneBboxSlider.value;
updateSceneBboxInfo(parseInt(sceneBboxSlider.value, 10));

document.getElementById("scene-panel-header").addEventListener("click", (e) => {
    if (e.target.classList.contains("panel-close")) {
        scenePanel.classList.remove("open");
    } else if (!scenePanel.classList.contains("open")) {
        scenePanel.classList.add("open");
    }
});

sceneBboxSlider.addEventListener("input", () => {
    const edge = parseInt(sceneBboxSlider.value, 10);
    sceneBboxLabel.textContent = edge;
    applySceneBbox(edge);
});

function commitSceneBbox(text) {
    const value = parseInt(text, 10);
    if (isNaN(value)) return;
    const clamped = Math.min(Math.max(value, sceneBboxMin), sceneBboxMax);
    sceneBboxSlider.value = clamped;
    sceneBboxLabel.textContent = clamped;
    applySceneBbox(clamped);
}

sceneBboxLabel.addEventListener("mousedown", () => { sceneBboxLabel.contentEditable = "true"; });
sceneBboxLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        commitSceneBbox(sceneBboxLabel.textContent);
        sceneBboxLabel.contentEditable = "false";
        sceneBboxLabel.blur();
    } else if (e.key === "Escape") {
        sceneBboxLabel.textContent = sceneBboxSlider.value;
        sceneBboxLabel.contentEditable = "false";
        sceneBboxLabel.blur();
    }
});
sceneBboxLabel.addEventListener("blur", () => {
    if (sceneBboxLabel.contentEditable === "true") {
        commitSceneBbox(sceneBboxLabel.textContent);
        sceneBboxLabel.contentEditable = "false";
    }
});

// ── Scene Panel: Grid ──
// The slider indexes a 1-2-5 ladder, the way a CAD grid steps, so every detent
// is a round spacing in millimeters; the editable label takes any value.

const GRID_SPACING_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const GRID_SPACING_MIN = 0.01;   // matches the viewer's own clamp
const GRID_SPACING_MAX = 5000;
const gridSpacingSlider = document.getElementById("scene-grid-spacing");
const gridSpacingLabel = document.getElementById("scene-grid-spacing-label");
const gridSpacingInfo = document.getElementById("scene-grid-info");

// The ladder index nearest a spacing, compared in log space since the ladder
// is geometric, so a typed off-detent value still parks the handle sensibly.
function gridStepIndex(mm) {
    let best = 0;
    for (let i = 1; i < GRID_SPACING_STEPS.length; i++) {
        if (Math.abs(Math.log(GRID_SPACING_STEPS[i] / mm))
            < Math.abs(Math.log(GRID_SPACING_STEPS[best] / mm))) best = i;
    }
    return best;
}

function formatSpacing(mm) {
    return String(parseFloat(mm.toPrecision(4)));
}

// The spacing is absolute, so what moves with the scene size is how many
// divisions it makes. A very large scene hits the viewer's line-count ceiling,
// which draws a coarser grid than asked for; say so rather than report a
// division count the grid doesn't have.
function updateGridInfo() {
    const divisions = Math.round(getGridDensity());
    const drawn = (getWorldExtent() * 2) / divisions;
    const coarsened = drawn > getGridSpacing() * 1.01
        ? ` — drawn at ${formatSpacing(drawn)} mm` : "";
    gridSpacingInfo.textContent = `${divisions} divisions across${coarsened}`;
}

function applyGridSpacing(mm) {
    setGridSpacing(mm);
    gridSpacingSlider.value = gridStepIndex(mm);
    gridSpacingLabel.textContent = formatSpacing(mm);
    updateGridInfo();
}

gridSpacingSlider.max = GRID_SPACING_STEPS.length - 1;
applyGridSpacing(getGridSpacing());

gridSpacingSlider.addEventListener("input", () => {
    applyGridSpacing(GRID_SPACING_STEPS[parseInt(gridSpacingSlider.value, 10)]);
});

function commitGridSpacing(text) {
    const value = parseFloat(text);
    if (isNaN(value) || value <= 0) return;
    applyGridSpacing(Math.min(Math.max(value, GRID_SPACING_MIN), GRID_SPACING_MAX));
}

gridSpacingLabel.addEventListener("mousedown", () => { gridSpacingLabel.contentEditable = "true"; });
gridSpacingLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        commitGridSpacing(gridSpacingLabel.textContent);
        gridSpacingLabel.contentEditable = "false";
        gridSpacingLabel.blur();
    } else if (e.key === "Escape") {
        gridSpacingLabel.textContent = formatSpacing(getGridSpacing());
        gridSpacingLabel.contentEditable = "false";
        gridSpacingLabel.blur();
    }
});
gridSpacingLabel.addEventListener("blur", () => {
    if (gridSpacingLabel.contentEditable === "true") {
        commitGridSpacing(gridSpacingLabel.textContent);
        gridSpacingLabel.contentEditable = "false";
    }
});

// ── Top Bar: Example Dropdown & Initial Load ──

async function loadExample(name) {
    if (!name) return;
    try {
        const data = await host.loadExample(name);
        currentExampleName = data.name || name;
        exampleSelectEl.value = currentExampleName;
        selectTab("GSL");
        const code = (data.source || "").trim();
        suppressDirty = true;
        setContent(code);
        suppressDirty = false;
        gslSource = code;
        currentGSL = code;
        setDirty(false);
        await compileGsl(code);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showNotification(true, `Failed to load ${name}: ${msg}`);
    }
}

async function refreshExampleList(selectedName = "") {
    try {
        const examples = await host.listExamples();
        exampleSelectEl.innerHTML = "";
        for (const ex of examples) {
            const opt = document.createElement("option");
            opt.value = ex.name;
            opt.textContent = ex.name;
            exampleSelectEl.appendChild(opt);
        }
        if (selectedName && examples.some((e) => e.name === selectedName)) {
            exampleSelectEl.value = selectedName;
        }
        return examples;
    } catch (err) {
        console.error("Failed to list the examples:", err);
        return [];
    }
}

exampleSelectEl.addEventListener("change", () => {
    const selected = exampleSelectEl.value;
    if (selected) {
        loadExample(selected);
    }
});

(async function initExamples() {
    const examples = await refreshExampleList();
    if (examples.length > 0) {
        // `gsl viewer part.gsl` opens the page with ?file=part.gsl.
        const requested = new URLSearchParams(window.location.search).get("file");
        const defaultEx = examples.find((e) => e.name === requested)
            || examples.find((e) => e.name === "gears.gsl") || examples[0];
        await loadExample(defaultEx.name);
    }
})();
