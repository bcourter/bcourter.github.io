// Markup for the Materials side panel, injected by material-grid.js when the
// app's #material-panel is empty, as the Bodies panel's is.

export const MATERIAL_PANEL_MARKUP = `
<div id="material-panel-header">Materials<span class="panel-close">&#x2715;</span></div>
<div class="panel-body">
    <div id="material-tabs"></div>
    <input id="material-filter" type="search" placeholder="Filter surfaces by name or description" autocomplete="off">
    <div class="material-keep">Keep
        <label title="Apply only the surface, leaving the body's color. A patterned material's color is its look, so it still sets it."><input id="material-keep-color" type="checkbox"> color</label>
    </div>
    <div id="material-readout"></div>
    <div id="material-stack"></div>
    <select id="material-substance-category" class="material-wrap"></select>
    <div id="material-grid"></div>
    <select id="material-finish-category" class="material-wrap"></select>
    <div id="material-finishes"></div>
</div>
`;
