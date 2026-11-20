// The inside of #stl-bounds-panel: the "Export" side panel. export-panel.js
// injects this at init when the host's #stl-bounds-panel is empty, and drops
// the meshers and the Omega Tape format the host passes no handler for (or
// disables Server DC when `serverExportUnavailable` is set). 3MF is the default
// format: it is a fifth to a sixth the size of the same triangles as binary STL.
// GLB is the server's to write, so it is dropped without `serverFormats` and
// disabled while a browser mesher is picked.
export const EXPORT_PANEL_MARKUP = `
<div id="stl-bounds-header">Export <span class="panel-close">&#x2715;</span></div>
<div class="panel-body">
    <div class="field-panel-row export-choice">
        <label for="export-format">Format</label>
        <select id="export-format">
            <option value="3mf" title="One file, each body an object in its own color" selected>3MF (color)</option>
            <option value="glb" title="One binary glTF, each body a node in its own color">GLB (color)</option>
            <option value="stl">STL</option>
            <option value="tape" title="The program's implicit field as an omega tape, for fidget; not meshed">Omega Tape</option>
            <option value="page" title="This viewer and the document as a folder of static web pages, zipped, for any web server; not meshed">Web page (.zip)</option>
        </select>
    </div>
    <div class="field-panel-row export-detail">
        <label>Detail</label>
        <input type="range" id="stl-depth" min="3" max="12" value="9" step="1">
        <span id="stl-depth-label">9</span>
    </div>
    <div id="stl-voxel-info"></div>
    <div class="field-panel-row export-choice">
        <label for="export-mesher">Mesher</label>
        <select id="export-mesher">
            <option value="mc" title="Marching cubes in this browser, with the program's mesh booleans composed by Manifold">Browser MC</option>
            <option value="dc" title="Dual contouring in this browser with fidget: the implicit returns as the server's mesher sees them, without mesh booleans or imported meshes">Browser DC</option>
            <option value="server" title="Dual contouring on the server">Server DC</option>
            <option value="server-mc" title="Marching cubes on the server">Server MC</option>
        </select>
    </div>
    <div class="field-panel-row">
        <label class="export-clean"><input type="checkbox" id="export-clean"> Clean (Manifold)</label>
    </div>
    <div class="stl-export-buttons">
        <div id="btn-export" class="btn-light">Export</div>
    </div>
</div>
`;
