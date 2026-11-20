// Markup for the Bodies side panel, injected by body-panel.js when the app's
// #body-panel is empty. Kept out of each app's index.html so the panel's
// structure lives with the code that drives it, as the Imports and Export
// panels do.

export const BODY_PANEL_MARKUP = `
<div id="body-panel-header">Bodies<span class="panel-close">&#x2715;</span></div>
<div class="panel-body">
    <div id="palette-strip" title="The viewer's palette colours the bodies the document gives no colour. Click to change it."></div>
    <div id="body-rows"></div>
</div>
`;
