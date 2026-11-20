// Custom CodeMirror 6 search panel for the GSL editor.
//
// Differs from CM6's default panel in three ways:
// 1. Four mode toggles (match case, regex, whole word, reverse direction)
//    arranged in a 2x2 cluster on the left instead of a horizontal row.
// 2. No "previous" button — direction is controlled by the reverse toggle.
//    next button calls findNext or findPrevious based on the toggle state.
// 3. Find/replace inputs are wider (grid allocates 2 fractions vs 1 each
//    to the two action groups).

import {
    findNext, findPrevious, replaceNext, replaceAll, selectMatches,
    openSearchPanel, closeSearchPanel,
    SearchQuery, getSearchQuery, setSearchQuery,
} from "codemirror";

// Cmd-F / Ctrl-F handler. CM6's default openSearchPanel command is a no-op
// when the panel is already open — that's the bug behind issue #259. This
// wrapper:
//   - opens the panel (default behavior) when it isn't open
//   - re-focuses and selects the find input when it is
//   - if the editor has a non-empty selection, replaces the search-box
//     contents with that selection (mirrors most IDE Cmd-F behavior)
export function gslOpenSearchPanel(view) {
    const findInput = view.dom.querySelector('.gsl-search input[name=search]');
    if (!findInput) return openSearchPanel(view);

    const sel = view.state.selection.main;
    if (!sel.empty) {
        const selText = view.state.sliceDoc(sel.from, sel.to);
        // Round-trip through setSearchQuery so the panel's update() handler
        // syncs findInput.value (and the highlight overlay updates).
        updateQuery(view, { search: selText });
    }
    findInput.focus();
    findInput.select();
    return true;
}

// Per-panel state (one panel active at a time per editor).
// `reverse` is local to the panel instance but captured by closures.
export function createGslSearchPanel(view) {
    let reverse = false;

    const root = document.createElement("div");
    root.className = "cm-panel cm-search gsl-search";

    // --- Toggles (2x2 cluster) ---
    const toggles = document.createElement("div");
    toggles.className = "gsl-toggles";

    const caseLabel = makeToggle("case", "Match case", "Aa", false);
    const regexLabel = makeToggle("re", "Use regular expression", ".*", false);
    const wordLabel = makeToggle("word", "Match whole word", "ab", true);
    const reverseLabel = makeToggle(
        "reverse", "Search backwards", "\u2191", false,
        /* nocheckbox */ true);

    caseLabel.addEventListener("change", () => updateQuery(view, { caseSensitive: caseLabel.input.checked }));
    regexLabel.addEventListener("change", () => updateQuery(view, { regexp: regexLabel.input.checked }));
    wordLabel.addEventListener("change", () => updateQuery(view, { wholeWord: wordLabel.input.checked }));
    reverseLabel.addEventListener("click", () => {
        reverse = !reverse;
        reverseLabel.classList.toggle("on", reverse);
    });

    toggles.append(caseLabel, regexLabel, wordLabel, reverseLabel);

    // --- Find input + actions ---
    const findInput = document.createElement("input");
    findInput.name = "search";
    findInput.placeholder = "Find";
    findInput.type = "text";
    findInput.autocomplete = "off";
    findInput.spellcheck = false;
    findInput.addEventListener("input", () => updateQuery(view, { search: findInput.value }));
    findInput.addEventListener("keydown", e => onFindKey(e, view, () => reverse));

    const findActions = document.createElement("div");
    findActions.className = "gsl-actions";
    const nextBtn = makeButton("next", () => {
        (reverse ? findPrevious : findNext)(view);
    });
    const allBtn = makeButton("all", () => selectMatches(view));
    findActions.append(nextBtn, allBtn);

    // --- Replace input + actions ---
    const replaceInput = document.createElement("input");
    replaceInput.name = "replace";
    replaceInput.placeholder = "Replace";
    replaceInput.type = "text";
    replaceInput.autocomplete = "off";
    replaceInput.spellcheck = false;
    replaceInput.addEventListener("input", () => updateQuery(view, { replace: replaceInput.value }));
    replaceInput.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            replaceNext(view);
        } else if (e.key === "Escape") {
            e.preventDefault();
            closeSearchPanel(view);
        }
    });

    const replaceActions = document.createElement("div");
    replaceActions.className = "gsl-actions";
    const replaceBtn = makeButton("replace", () => replaceNext(view));
    const replaceAllBtn = makeButton("replace all", () => replaceAll(view));
    replaceActions.append(replaceBtn, replaceAllBtn);

    // --- Close ---
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.name = "close";
    closeBtn.setAttribute("aria-label", "close");
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", () => closeSearchPanel(view));

    root.append(
        toggles,
        findInput,
        findActions,
        replaceInput,
        replaceActions,
        closeBtn,
    );

    return {
        dom: root,
        top: false,
        mount() {
            syncFromQuery(view, findInput, replaceInput, caseLabel, regexLabel, wordLabel);
            findInput.focus();
            findInput.select();
        },
        update(viewUpdate) {
            // Sync from external query edits (e.g. Cmd-D growing selection).
            const changed = viewUpdate.transactions.some(tr =>
                tr.effects.some(eff => eff.is(setSearchQuery)));
            if (changed) {
                syncFromQuery(view, findInput, replaceInput, caseLabel, regexLabel, wordLabel);
            }
        },
    };
}

function onFindKey(e, view, getReverse) {
    if (e.key === "Enter") {
        e.preventDefault();
        const reverse = e.shiftKey ? !getReverse() : getReverse();
        (reverse ? findPrevious : findNext)(view);
    } else if (e.key === "Escape") {
        e.preventDefault();
        closeSearchPanel(view);
    }
}

function makeToggle(name, tooltip, glyph, underline, noCheckbox = false) {
    const label = document.createElement("label");
    label.dataset.toggle = name;
    label.title = tooltip;
    if (underline) label.classList.add("underline-glyph");
    label.dataset.glyph = glyph;

    if (!noCheckbox) {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = name;
        label.appendChild(input);
        label.input = input;
    }

    return label;
}

function makeButton(text, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.name = text.replace(/\s+/g, "");
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
}

function updateQuery(view, patch) {
    const curr = getSearchQuery(view.state);
    const next = new SearchQuery({
        search: patch.search !== undefined ? patch.search : curr.search,
        replace: patch.replace !== undefined ? patch.replace : curr.replace,
        caseSensitive: patch.caseSensitive !== undefined ? patch.caseSensitive : curr.caseSensitive,
        regexp: patch.regexp !== undefined ? patch.regexp : curr.regexp,
        wholeWord: patch.wholeWord !== undefined ? patch.wholeWord : curr.wholeWord,
    });
    view.dispatch({ effects: setSearchQuery.of(next) });
}

function syncFromQuery(view, findInput, replaceInput, caseLabel, regexLabel, wordLabel) {
    const q = getSearchQuery(view.state);
    if (findInput.value !== q.search) findInput.value = q.search;
    if (replaceInput.value !== q.replace) replaceInput.value = q.replace;
    caseLabel.input.checked = !!q.caseSensitive;
    regexLabel.input.checked = !!q.regexp;
    wordLabel.input.checked = !!q.wholeWord;
}
