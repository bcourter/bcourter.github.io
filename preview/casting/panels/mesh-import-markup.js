// The inside of #mesh-import-panel: the "Imports" side panel. mesh-import.js
// injects this at init when the app's #mesh-import-panel is empty. The file
// input's accept list and the drop-zone label are filled in by initMeshImport
// from the formats the app accepts.
export const MESH_IMPORT_MARKUP = `
<div id="mesh-import-header">Imports <span class="panel-close">&#x2715;</span></div>
<div class="panel-body">
    <input type="file" id="mesh-file-input" accept=".stl,.obj" multiple hidden>
    <div id="mesh-drop-zone" class="mesh-drop-zone">
        <span class="mesh-upload-label">Drop STL/OBJ here or click to upload</span>
    </div>
    <div id="mesh-list"></div>
    <div id="mesh-hint" class="mesh-hint" style="display:none"></div>
</div>
`;
