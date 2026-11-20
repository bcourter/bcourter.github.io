// The Help menu and the two documentation overlays it opens, shared across
// viewer frontends. help-panel.js injects these at init when the host elements
// are empty, and removes the items the caller passes no handler for — the same
// arrangement export-panel.js uses for #stl-bounds-panel.

// Goes in the toolbar, conventionally right after .editor-tab-container.
export const HELP_MENU_MARKUP = `
<div id="btn-help">
    <img src="icons/help.svg" width="16" height="16" alt="Help">
</div>
<div id="help-menu-dropdown">
    <button id="btn-help-language-guide" class="omega-menu-item" type="button">Language Guide&hellip;</button>
    <div class="omega-menu-header">Libraries</div>
    <div id="help-libraries-submenu"></div>
    <button id="btn-help-i-wish" class="omega-menu-item" type="button">I wish&hellip;</button>
    <button id="btn-help-about" class="omega-menu-item" type="button">About&hellip;</button>
</div>
`;

// Goes inside a positioned ancestor — .app-panel-canvas anchors to it. In every
// app today that is the canvas container.
export const HELP_PANELS_MARKUP = `
<div id="language-guide-panel" class="app-panel app-panel-canvas" hidden>
    <div class="app-panel-header">
        <span>Language Guide</span>
        <span id="btn-language-guide-close" class="panel-close">&#x2715;</span>
    </div>
    <div class="app-panel-body">
        <div id="language-guide-content" class="doc-content">
            <div class="doc-loading">Loading&hellip;</div>
        </div>
    </div>
</div>
<div id="libraries-panel" class="app-panel app-panel-canvas" hidden>
    <div class="app-panel-header">
        <span id="libraries-panel-heading">Libraries</span>
        <span id="btn-libraries-close" class="panel-close">&#x2715;</span>
    </div>
    <div class="app-panel-body">
        <div id="libraries-content" class="doc-content">
            <div class="doc-loading">Loading&hellip;</div>
        </div>
    </div>
</div>
`;
