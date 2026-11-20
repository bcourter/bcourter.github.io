// The Help menu, the Language Guide overlay, and the per-library reference
// pages — shared across viewer frontends.
//
// Both pages are built from markdown generated from `program/preamble`, so the
// library list and its contents stay in sync with each library's .gsl source.
//
// Callers may either fetch static `/docs/*.md` files (the default) or supply
// custom `loadLibraries` / `loadLanguage` hooks when documentation is served
// dynamically per project; everything else — the menu, the panels, the parse,
// the submenu, and the per-page render — lives here once.
//
// initHelpPanel({...}) takes the app's hooks:
//   menuHost      element to fill with the Help menu; skipped if not empty.
//                 Conventionally a #help-menu right after .editor-tab-container.
//   panelHost     element to append the two overlays to. Must be a positioned
//                 ancestor — .app-panel-canvas anchors to it.
//   loadLibraries()   optional; resolves to the libraries markdown. Defaults to
//                 fetching /docs/gsl_libraries.md.
//   loadLanguage()    optional; resolves to the language-guide markdown.
//                 Defaults to fetching /docs/gsl_description.md.
//   onIWish()     optional; without it the "I wish…" item is removed.
//   onAbout()     optional; without it the "About…" item is removed.
//
// Styles: docs.css for the rendered markdown, plus the panel chrome — see
// help-panel.css for an app that does not already carry it.
import { renderMarkdown, stripFrontmatter, escapeHtml } from "./markdown.js";
import { HELP_MENU_MARKUP, HELP_PANELS_MARKUP } from "./help-panel-markup.js";

async function fetchDoc(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText);
    return await resp.text();
}

export function initHelpPanel(hooks = {}) {
    const {
        menuHost,
        panelHost,
        loadLibraries = () => fetchDoc('/docs/gsl_libraries.md'),
        loadLanguage = () => fetchDoc('/docs/gsl_description.md'),
        onIWish = null,
        onAbout = null,
    } = hooks;

    if (!menuHost || !panelHost) {
        console.error('initHelpPanel: menuHost and panelHost are required');
        return;
    }

    if (!menuHost.innerHTML.trim()) menuHost.innerHTML = HELP_MENU_MARKUP;
    if (!panelHost.querySelector('#language-guide-panel')) {
        panelHost.insertAdjacentHTML('beforeend', HELP_PANELS_MARKUP);
    }

    // ── Help menu ──
    const btnHelp = menuHost.querySelector('#btn-help');
    const helpMenuDropdown = menuHost.querySelector('#help-menu-dropdown');
    const btnHelpLanguageGuide = menuHost.querySelector('#btn-help-language-guide');
    const btnHelpIWish = menuHost.querySelector('#btn-help-i-wish');
    const btnHelpAbout = menuHost.querySelector('#btn-help-about');
    const helpLibrariesSubmenu = menuHost.querySelector('#help-libraries-submenu');
    let helpMenuOpen = false;

    // An app that passes no handler does not get the item at all.
    if (!onIWish && btnHelpIWish) btnHelpIWish.remove();
    if (!onAbout && btnHelpAbout) btnHelpAbout.remove();

    function closeHelpMenu() {
        helpMenuOpen = false;
        helpMenuDropdown.classList.remove('open');
    }

    function openHelpMenu() {
        const rect = btnHelp.getBoundingClientRect();
        helpMenuDropdown.style.top = (rect.bottom + 4) + 'px';
        // Right-align the dropdown with the button so it doesn't run off-screen.
        helpMenuDropdown.style.left = '';
        helpMenuDropdown.style.right = (window.innerWidth - rect.right) + 'px';
        helpMenuOpen = true;
        helpMenuDropdown.classList.add('open');
    }

    btnHelp.addEventListener('click', (e) => {
        e.stopPropagation();
        if (helpMenuOpen) closeHelpMenu(); else openHelpMenu();
    });

    btnHelpLanguageGuide.addEventListener('click', (e) => {
        e.stopPropagation();
        closeHelpMenu();
        toggleLanguageGuide();
    });

    if (onIWish && btnHelpIWish) {
        btnHelpIWish.addEventListener('click', (e) => {
            e.stopPropagation();
            closeHelpMenu();
            onIWish();
        });
    }

    if (onAbout && btnHelpAbout) {
        btnHelpAbout.addEventListener('click', (e) => {
            e.stopPropagation();
            closeHelpMenu();
            onAbout();
        });
    }

    document.addEventListener('click', (e) => {
        if (helpMenuOpen && !menuHost.contains(e.target)) closeHelpMenu();
    });

    // ── Language Guide panel ──
    // Modeless overlay anchored to the canvas. Markdown is fetched on first
    // open and cached in the DOM thereafter.
    const languageGuidePanel = panelHost.querySelector('#language-guide-panel');
    const languageGuideContent = panelHost.querySelector('#language-guide-content');
    const btnLanguageGuideClose = panelHost.querySelector('#btn-language-guide-close');
    let languageGuideLoaded = false;

    async function loadLanguageGuide() {
        if (languageGuideLoaded) return;
        try {
            const text = await loadLanguage();
            languageGuideContent.innerHTML = renderMarkdown(stripFrontmatter(text));
            languageGuideLoaded = true;
        } catch (err) {
            languageGuideContent.innerHTML =
                `<div class="doc-error">Failed to load language guide: ${escapeHtml(String(err))}</div>`;
        }
    }

    function openLanguageGuide() {
        languageGuidePanel.hidden = false;
        loadLanguageGuide();
    }

    function closeLanguageGuide() {
        languageGuidePanel.hidden = true;
    }

    function toggleLanguageGuide() {
        if (languageGuidePanel.hidden) openLanguageGuide(); else closeLanguageGuide();
    }

    btnLanguageGuideClose.addEventListener('click', closeLanguageGuide);

    // ── Libraries panel ──
    // One page per library, opened from the Libraries submenu under Help.
    const librariesPanel = panelHost.querySelector('#libraries-panel');
    const librariesPanelHeading = panelHost.querySelector('#libraries-panel-heading');
    const librariesContent = panelHost.querySelector('#libraries-content');
    const btnLibrariesClose = panelHost.querySelector('#btn-libraries-close');

    // intro is the generic preface (call these, importing forms, …); sections
    // keeps the per-library markdown bodies, keyed by import path. Rendered
    // HTML is memoized so switching libraries is instant.
    const librariesPages = { intro: '', sections: new Map(), rendered: new Map() };
    let librariesIndexLoaded = false;
    let librariesPending = null;

    async function ensureLibrariesIndex() {
        if (librariesIndexLoaded) return;
        // Coalesce concurrent callers — the submenu is populated eagerly at
        // init and a fast click can ask again before that has resolved.
        if (librariesPending) return librariesPending;
        librariesPending = (async () => {
            try {
                const md = stripFrontmatter(await loadLibraries());
                parseLibrariesMarkdown(md, librariesPages);
                populateLibrariesSubmenu();
                librariesIndexLoaded = true;
            } catch (err) {
                // Leave the submenu empty; openLibrary() surfaces the error if
                // the user clicks anything populated before the failure.
                console.error('Failed to load the libraries reference:', err);
            }
        })().finally(() => { librariesPending = null; });
        return librariesPending;
    }

    function populateLibrariesSubmenu() {
        helpLibrariesSubmenu.innerHTML = '';
        for (const name of librariesPages.sections.keys()) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'omega-menu-item omega-menu-submenu-item';
            btn.textContent = name;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeHelpMenu();
                openLibrary(name);
            });
            helpLibrariesSubmenu.appendChild(btn);
        }
    }

    function renderLibraryPage(name) {
        const cached = librariesPages.rendered.get(name);
        if (cached) return cached;
        const sec = librariesPages.sections.get(name);
        if (!sec) {
            return `<div class="doc-error">Unknown library: ${escapeHtml(name)}</div>`;
        }
        // The library's own ### heading is shown in the panel header bar, so
        // drop it from the body to avoid duplication.
        const html = renderMarkdown(librariesPages.intro + '\n' + sec.lines.join('\n'));
        librariesPages.rendered.set(name, html);
        return html;
    }

    async function openLibrary(name) {
        await ensureLibrariesIndex();
        librariesPanelHeading.textContent = name;
        librariesContent.innerHTML = renderLibraryPage(name);
        librariesPanel.hidden = false;
    }

    function closeLibraries() {
        librariesPanel.hidden = true;
    }

    btnLibrariesClose.addEventListener('click', closeLibraries);

    // Populate the submenu as soon as the app initializes so the Help dropdown
    // is ready on first open; failure leaves the submenu empty rather than the
    // page broken.
    ensureLibrariesIndex();

    return { openLibrary, toggleLanguageGuide, closeHelpMenu };
}

// Split the docs into: everything before the first `### `name`` (intro) and one
// entry per library section. The Importing-a-library subsection (### Importing
// a library — no backticks) stays inside the intro.
export function parseLibrariesMarkdown(md, out) {
    const libHeader = /^### `([^`]+)`\s*$/;
    const lines = md.split('\n');
    const introLines = [];
    let cur = null;
    for (const line of lines) {
        const m = libHeader.exec(line);
        if (m) {
            cur = { name: m[1], lines: [] };
            out.sections.set(m[1], cur);
            continue;
        }
        if (cur) cur.lines.push(line);
        else introLines.push(line);
    }
    out.intro = introLines.join('\n');
}
