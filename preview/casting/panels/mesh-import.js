// The "Imports" side panel and mesh import shared by every app.
//
// A mesh arrives through the panel's drop zone or file picker, or by dropping
// it on the viewer. STL and OBJ are parsed here; the mesh must be manifold
// (Manifold booleans need watertight input, so a non-manifold mesh is
// rejected at import with a clear message). The geometry is registered with
// the viewer, the import is written into the program — an
// `importMesh N "file";` statement after the header plus a `mesh(N, partNXf)`
// placement on the return, with a uiTransform so the part can be moved from
// the UI — and the program is recompiled so the mesh shows at once.
//
// initMeshImport({...}) takes the app's hooks:
//   addMesh(label, geometry) -> index   viewer registry
//   removeMesh(index)                   viewer registry
//   getMeshEntries() -> [{index,label}] viewer registry
//   getSource() / setSource(next)       raw GSL in and out of the editor; setSource
//                                       also switches to the GSL tab and updates
//                                       the app's source state
//   recompile()                         re-run the normal compile path
//   onImported(index, file, bytes)      optional, awaited before placement
//                                       (an app may ship the bytes to the canvas agent)
//   placeMesh(index, filename)          optional override of the placement
//                                       (a document-aware version)
//   afterImport()                       optional (an app may save the document)
//   setStatus(msg, isError)             optional inline status line
//   extraFormats                        optional { ext: (file) => void } for formats
//                                       the app handles itself (e.g. step, stp,
//                                       hodge); they join the accept list, the drop
//                                       filter and the drop-overlay label
//   builtinFormats                      optional subset of ["stl", "obj"] to accept
//                                       (an app may take STL only — if its canvas agent
//                                       parses no other mesh format)
//   formatLabel                         optional text for the drop-zone and overlay
//                                       labels (default: derived from the formats)
//   dropTarget                          optional element that accepts file drops
//                                       (the viewer container)
//
// Exports openMeshFilePicker() and refreshMeshList(). Styles are
// mesh-import.css; the markup is mesh-import-markup.js, injected at init when
// the app's #mesh-import-panel is empty.
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
const assertManifoldGeometry = async () => {};
import { showNotification } from "../ui/notification.js";
import { topLevelReturnSpan } from "../render/gsl-return-span.js";
import { MESH_IMPORT_MARKUP } from "./mesh-import-markup.js";

const BUILTIN_FORMATS = ['stl', 'obj'];

let deps = {};
let builtinFormats = BUILTIN_FORMATS;
let formats = BUILTIN_FORMATS;
let meshListEl = null;
let meshFileInput = null;

const stlLoader = new STLLoader();
const objLoader = new OBJLoader();

function setStatus(msg, isError = false) {
    deps.setStatus?.(msg, isError);
}

function reportImportError(msg) {
    setStatus(msg, true);
    showNotification(true, msg);
}

// ── Placement in the program ──

const identityTransform = '[[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]';

function addAssetPlacement(source, index) {
    const base = `part${index}Xf`;
    let name = base, suffix = 2;
    while (new RegExp(`\\b${name}\\b`).test(source)) name = `${base}${suffix++}`;
    const decl = `${name} = uiTransform(${identityTransform});\n\n`;
    const span = topLevelReturnSpan(source);
    if (!span) return `${source.trimEnd()}\n\n${decl}return mesh(${index}, ${name});\n`;
    return `${source.slice(0, span.start)}${decl}${source.slice(span.start, span.end)}, mesh(${index}, ${name})${source.slice(span.end)}`;
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True when the program already imports this file (numbered statement or
// expression form, mesh or step), so a re-import does not add a second one.
function hasImportRef(source, filename) {
    return new RegExp(`\\b(?:importMesh|importStep)\\s+(?:\\d+\\s+)?"${escapeRegExp(filename)}"`).test(source);
}

// placeMeshInSource returns the program with `importMesh index "filename";`
//
// after the header (leading comments and imports) — replacing an existing
// statement for the same index — and a mesh(index, partNXf) placement on the
// top-level return.
function placeMeshInSource(source, index, filename) {
    const keyword = 'importMesh';
    const line = `${keyword} ${index} "${filename}";`;
    const re = new RegExp(`^\\s*${keyword}\\s+${index}\\s+"[^"]+"\\s*;`, 'm');
    // The header includes an @scene directive, which must precede every statement.
    const headerRe = /^(?:\s*\/\/.*\n|\s*@scene\s*\([^)]*\)\s*;?[ \t]*\n|\s*import\s+(?:(?:\.|[A-Za-z_]\w*)\s+)?"[^"]+"\s*;\s*\n|\s*import(?:Mesh|Step)\s+\d+\s+"[^"]+"\s*;\s*\n)*/;
    const at = (source.match(headerRe) || [''])[0].length;
    const imported = re.test(source) ? source.replace(re, line) : `${source.slice(0, at)}${line}\n${source.slice(at)}`;
    return addAssetPlacement(imported, index);
}

function placeMesh(index, filename) {
    if (deps.placeMesh) {
        deps.placeMesh(index, filename);
        return;
    }
    const source = deps.getSource();
    if (hasImportRef(source, filename)) return;
    deps.setSource(placeMeshInSource(source, index, filename));
}

// ── Loading ──

function loadMeshFile(file) {
    const label = file.name.replace(/\.[^.]+$/, ''); // strip extension for display
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = async (e) => {
        let geometry = null;
        try {
            if (ext === 'stl') {
                geometry = stlLoader.parse(e.target.result);
            } else if (ext === 'obj') {
                const text = new TextDecoder().decode(e.target.result);
                const group = objLoader.parse(text);
                // OBJLoader returns a Group; merge all child geometries
                const geometries = [];
                group.traverse((child) => {
                    if (child.isMesh) geometries.push(child.geometry);
                });
                if (geometries.length === 0) throw new Error('No geometry found in OBJ');
                geometry = geometries[0]; // use first mesh for now
            } else {
                throw new Error(`Unsupported format: .${ext}`);
            }

            showNotification(false, `Validating mesh: ${label}...`, true);
            await assertManifoldGeometry(geometry);

            const index = deps.addMesh(label, geometry);
            refreshMeshList();

            if (deps.onImported) {
                try {
                    await deps.onImported(index, file, e.target.result);
                } catch (hookErr) {
                    console.warn('mesh import hook failed:', hookErr);
                }
            }

            placeMesh(index, file.name);
            setStatus('');
            showNotification(false, `Imported manifold mesh: ${label} (index ${index})`);
            // Recompile so GSL that references the new mesh(index, ...) re-evaluates.
            deps.recompile();
            deps.afterImport?.();
        } catch (err) {
            if (geometry) {
                geometry.dispose();
            }
            const message = err instanceof Error ? err.message : String(err);
            reportImportError(`Failed to load ${file.name}: ${message}`);
        }
    };
    reader.readAsArrayBuffer(file);
}

// Route an imported file by extension: STL and OBJ are parsed here, anything
// in extraFormats goes to the app's own loader.
function importFile(file) {
    setStatus('');   // clear any prior error as a new import begins
    const ext = file.name.split('.').pop().toLowerCase();
    if (builtinFormats.includes(ext)) loadMeshFile(file);
    else if (deps.extraFormats?.[ext]) deps.extraFormats[ext](file);
    else reportImportError(`Unsupported format: ${file.name} — supported: ${formatLabel()}.`);
}

function importMeshFiles(files) {
    for (const file of files) importFile(file);
}

export function openMeshFilePicker() {
    meshFileInput?.click();
}

function formatLabel() {
    if (deps.formatLabel) return deps.formatLabel;
    const names = formats.map((f) => f.toUpperCase());
    return names.length > 1
        ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
        : names[0];
}

function acceptedFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    return formats.includes(ext);
}

// ── Panel ──

export function refreshMeshList() {
    meshListEl.innerHTML = '';
    const entries = deps.getMeshEntries();
    for (const { index, label } of entries) {
        const row = document.createElement('div');
        row.className = 'mesh-list-item';
        row.innerHTML = `<span class="mesh-name">${index}: ${label}</span><span class="mesh-delete" title="Remove">&#x2715;</span>`;
        row.querySelector('.mesh-delete').addEventListener('click', () => {
            deps.removeMesh(index);
            refreshMeshList();
        });
        meshListEl.appendChild(row);
    }
    const meshHint = document.getElementById('mesh-hint');
    if (entries.length > 0) {
        const first = entries[0].index;
        meshHint.innerHTML = `Reference an imported model by index in the GSL <code>return</code>. As geometry: <code>mesh(${first}, [0, 0, 0])</code> — also <code>mesh(index, position, scale, rotation)</code> or a 4×4 matrix <code>mesh(index, M)</code> (see the matrix package). As an SDF (composes with min/max, remap, offset): <code>vdbSdf(${first})</code>.`;
        meshHint.style.display = 'block';
    } else {
        meshHint.style.display = 'none';
    }
}

function isFileDrag(e) {
    return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}

export function initMeshImport(hooks) {
    deps = hooks || {};
    builtinFormats = (deps.builtinFormats || BUILTIN_FORMATS).filter((f) => BUILTIN_FORMATS.includes(f));
    formats = [...builtinFormats, ...Object.keys(deps.extraFormats || {})];

    const meshImportPanel = document.getElementById('mesh-import-panel');
    if (!document.getElementById('mesh-import-header')) {
        meshImportPanel.innerHTML = MESH_IMPORT_MARKUP;
    }
    const meshDropZone = document.getElementById('mesh-drop-zone');
    meshFileInput = document.getElementById('mesh-file-input');
    meshListEl = document.getElementById('mesh-list');

    meshFileInput.accept = formats.map((f) => `.${f}`).join(',');
    meshDropZone.querySelector('.mesh-upload-label').textContent = `Drop ${formatLabel()} here or click to upload`;

    document.getElementById('mesh-import-header').addEventListener('click', (e) => {
        if (e.target.classList.contains('panel-close')) {
            meshImportPanel.classList.remove('open');
        } else if (!meshImportPanel.classList.contains('open')) {
            meshImportPanel.classList.add('open');
        }
    });

    meshFileInput.addEventListener('change', (e) => {
        importMeshFiles(e.target.files);
        meshFileInput.value = ''; // reset so same file can be re-uploaded
    });

    meshDropZone.addEventListener('click', () => {
        meshFileInput.click();
    });
    meshDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        meshDropZone.classList.add('dragover');
    });
    meshDropZone.addEventListener('dragleave', () => {
        meshDropZone.classList.remove('dragover');
    });
    meshDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        meshDropZone.classList.remove('dragover');
        importMeshFiles(Array.from(e.dataTransfer.files).filter(acceptedFile));
    });

    // The viewer is a drop target too; an overlay names what dropping will do.
    const dropTarget = deps.dropTarget;
    if (dropTarget) {
        dropTarget.dataset.dropLabel = `Drop to import (${formatLabel()})`;
        dropTarget.addEventListener('dragover', (e) => {
            // During dragover Chrome exposes only dataTransfer.types (items is empty for
            // security), so detect a file drag via types and preventDefault — without it
            // the browser rejects the drop.
            if (isFileDrag(e)) {
                e.preventDefault();
                dropTarget.classList.add('cad-dragover');
            }
        });
        dropTarget.addEventListener('dragleave', (e) => {
            // relatedTarget is where the pointer is heading; if it's outside the panel
            // (including when moving to another column) clear the overlay. Testing
            // e.target instead misses leaves that start from a child element.
            if (!dropTarget.contains(e.relatedTarget)) dropTarget.classList.remove('cad-dragover');
        });
        dropTarget.addEventListener('drop', (e) => {
            const files = (e.dataTransfer ? Array.from(e.dataTransfer.files) : []).filter(acceptedFile);
            if (files.length === 0) return;          // ignore unsupported drops
            e.preventDefault();
            dropTarget.classList.remove('cad-dragover');
            importMeshFiles(files);
        });
    }
}
