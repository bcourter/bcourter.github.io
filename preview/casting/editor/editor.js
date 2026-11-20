// CodeMirror 6 editor for GSL. Same public API as the textarea-overlay
// version it replaced; call sites in main.js are unchanged.

import {
    EditorState, StateEffect, StateField, Compartment, RangeSet,
    EditorView, Decoration, keymap, lineNumbers, drawSelection,
    highlightActiveLine, highlightActiveLineGutter,
    rectangularSelection, crosshairCursor,
    GutterMarker, gutterLineClass,
    history, defaultKeymap, historyKeymap, indentWithTab,
    StreamLanguage, syntaxHighlighting, HighlightStyle,
    bracketMatching, indentOnInput,
    codeFolding, foldGutter, foldKeymap, foldService,
    closeBrackets, closeBracketsKeymap,
    search, searchKeymap, highlightSelectionMatches,
    linter, setDiagnostics, lintKeymap, forEachDiagnostic,
    tags as t,
} from "codemirror";
import { createGslSearchPanel, gslOpenSearchPanel } from "./search-panel.js";

let view = null;
let onChangeCallback = null;
// Set while setContent applies a change so the onChange callback doesn't
// re-fire on programmatic updates — same semantics as the old textarea code
// which bypassed the input event.
let isSettingContent = false;

// Language loads asynchronously (fetches gsl_lexicon.json). Before it lands
// the editor still works, just without syntax coloring.
const languageCompartment = new Compartment();

// Soft line-wrap is toggleable at runtime via setLineWrap(boolean) — wrapped
// in its own compartment so we can reconfigure without rebuilding the view.
const wrapCompartment = new Compartment();

// Read-only is set at runtime by setReadOnly(boolean): typing is refused, and
// so are the edits the panels and gizmos make (insertAtCursor,
// replaceSourceRange, replaceSourceSpan). setContent still shows a document.
const readOnlyCompartment = new Compartment();
let readOnly = false;

// --- Highlight spans (shape picker → editor) ---

const setHighlights = StateEffect.define();

const highlightsField = StateField.define({
    create: () => Decoration.none,
    update(decos, tr) {
        decos = decos.map(tr.changes);
        for (const eff of tr.effects) {
            if (eff.is(setHighlights)) {
                decos = Decoration.set(eff.value, /* sort */ true);
            }
        }
        return decos;
    },
    provide: f => EditorView.decorations.from(f),
});

export function initEditor(container, initialContent, onChange) {
    onChangeCallback = onChange;

    const onUpdate = EditorView.updateListener.of(update => {
        if (update.docChanged && !isSettingContent && onChangeCallback) {
            onChangeCallback(update.state.doc.toString());
        }
    });

    const state = EditorState.create({
        doc: initialContent,
        extensions: [
            lineNumbers(),
            // Soft-wrap long lines instead of requiring horizontal scroll.
            // Toggleable via setLineWrap().
            wrapCompartment.of(EditorView.lineWrapping),
            readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
            history(),
            drawSelection(),
            // Multi-cursor / multi-select. Required for Cmd-D (next
            // occurrence) and Alt-click / Alt-drag to add selections.
            EditorState.allowMultipleSelections.of(true),
            EditorView.clickAddsSelectionRange.of(ev => ev.altKey),
            rectangularSelection(),   // Alt-drag for rectangular selection
            crosshairCursor(),        // crosshair cursor while Alt is held
            bracketMatching(),
            closeBrackets(),
            indentOnInput(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            highlightSelectionMatches(),
            // Code folding (chevrons in the gutter next to `{...}` blocks).
            codeFolding(),
            foldGutter(),
            braceFoldService,
            // Custom search panel (4-toggle cluster, wider inputs, no "prev"
            // button — direction controlled by the reverse toggle).
            search({ createPanel: createGslSearchPanel }),
            // Lint diagnostics: red squiggle under the offending range, hover
            // tooltip with the message + our "Fix error" action.
            // setEditorDiagnostics (below) pushes entries; pass null source
            // because all diagnostics come from server / WebGPU events, not
            // client-side analysis. With a stub `() => []` source the lint
            // plugin's update() schedules run() on every docChanged and run()
            // dispatches setDiagnostics(state, []), wiping any externally-
            // pushed diagnostic in the same tick we set it. Null source is
            // filtered out of lintConfig.sources, so run() short-circuits.
            //
            // We skip lintGutter() (no separate red-dot column); instead
            // diagnosticLineClassField below tints the matching line-number
            // cell red (errors) or amber (warnings) so we reclaim a gutter
            // column's width.
            linter(null),
            diagnosticLineClassField,
            syntaxHighlighting(gslHighlightStyle),
            keymap.of([
                // Custom Cmd-F: when panel is already open, refocus the
                // find input and prefill from the editor's current
                // selection. Must come before searchKeymap so we override
                // its default Mod-f binding (which is a no-op when the
                // panel is already open).
                { key: "Mod-f", run: gslOpenSearchPanel, preventDefault: true, stopPropagation: true },
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...historyKeymap,
                // searchKeymap brings Cmd-D -> selectNextOccurrence and
                // Cmd-Shift-L -> selectSelectionMatches, plus the find/
                // replace bindings.
                ...searchKeymap,
                // Cmd-Alt-[ / Cmd-Alt-] fold / unfold, Cmd-Alt-. unfolds all.
                ...foldKeymap,
                // F8 / Shift-F8 jumps between diagnostics.
                ...lintKeymap,
                indentWithTab,
            ]),
            highlightsField,
            onUpdate,
            gslTheme,
            languageCompartment.of([]),
        ],
    });

    view = new EditorView({ state, parent: container });

    // Kick off lexicon fetch; install GSL syntax when it lands.
    fetch("editor/gsl_lexicon.json")
        .then(r => r.ok ? r.json() : null)
        .then(lex => {
            if (!lex || !view) return;
            view.dispatch({
                effects: languageCompartment.reconfigure(
                    StreamLanguage.define(buildGslStreamParser(lex))
                ),
            });
        })
        .catch(e => console.warn("gsl lexicon fetch failed:", e));
}

export function getContent() {
    return view ? view.state.doc.toString() : "";
}

export function setContent(content) {
    if (!view) return;
    isSettingContent = true;
    try {
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: content },
        });
    } finally {
        isSettingContent = false;
    }
}

export function undoEditor() {
    if (!view) return false;
    view.focus();
    return undoCommand ? undoCommand.run(view) : false;
}

export function installEditorUndoShortcut() {
    document.addEventListener("keydown", event => {
        if (!isPlainUndo(event)) return;
        if (closest(event.target, "#ai-chat textarea") || closest(event.target, ".cm-editor")) return;
        event.preventDefault();
        event.stopPropagation();
        undoEditor();
    }, true);
}

// setReadOnly makes the editor show its document without taking changes to
// it, for a host that cannot compile them (host-static.js).
export function setReadOnly(on) {
    readOnly = !!on;
    if (!view) return;
    view.dispatch({
        effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
}

export function insertAtCursor(text) {
    if (!view || readOnly) return;
    // Replace the main selection with `text` and leave the inserted text
    // selected (the point-select tool relies on this so the user can
    // immediately overwrite, copy, or see the reference it just wrote). One
    // transaction with `changes` so docChanged fires and onChange runs.
    const { from, to } = view.state.selection.main;
    view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from, head: from + text.length },
        userEvent: "input.type",
    });
}

export function replaceSourceRange(from, to, text) {
    if (!view || readOnly || from < 0 || to < from || to > view.state.doc.length) return;
    view.dispatch({
        changes: { from, to, insert: text },
        userEvent: "input",
    });
}

// readSourceSpan returns the text currently in the editor between the
// 1-based (line, column) start (inclusive) and end (exclusive). When
// the span runs off the end of a line or off the document it returns
// what it can — callers use this for defensive lookups around a
// slider literal, so a short read is fine.
export function readSourceSpan(span) {
    if (!view) return '';
    const doc = view.state.doc;
    if (span.startLine < 1 || span.startLine > doc.lines) return '';
    const fromLine = doc.line(span.startLine);
    const endLine = (span.endLine >= 1 && span.endLine <= doc.lines) ? doc.line(span.endLine) : fromLine;
    const from = fromLine.from + Math.max(0, span.startColumn - 1);
    const to = endLine.from + Math.max(0, span.endColumn - 1);
    if (to <= from || to > doc.length) return '';
    return doc.sliceString(from, to);
}

// replaceSourceSpan replaces the text at the given 1-based (line, column)
// span with newText. Used by the slider panel to scrub a literal in place.
// Tagged with userEvent: "input.scrub" so any downstream change listener
// can debounce / coalesce scrub edits separately from normal typing.
export function replaceSourceSpan(span, newText) {
    if (!view || readOnly) return;
    const doc = view.state.doc;
    if (span.startLine < 1 || span.startLine > doc.lines) return;
    if (span.endLine < 1 || span.endLine > doc.lines) return;
    const from = doc.line(span.startLine).from + Math.max(0, span.startColumn - 1);
    const to = doc.line(span.endLine).from + Math.max(0, span.endColumn - 1);
    if (to < from || to > doc.length) return;
    view.dispatch({
        changes: { from, to, insert: newText },
        userEvent: "input.scrub",
    });
}

function isPlainUndo(event) {
    return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z";
}

function closest(target, selector) {
    return target && typeof target.closest === "function" && target.closest(selector);
}

const undoCommand = historyKeymap.find(binding => binding.key === "Mod-z");

export function setLineWrap(enabled) {
    if (!view) return;
    view.dispatch({
        effects: wrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : []),
    });
}

export function clearHighlights() {
    if (!view) return;
    view.dispatch({ effects: setHighlights.of([]) });
}

// Push inline diagnostics. entries is an array of
//   { line, col, length, severity?, message, actions? }
// where line/col are 1-based and severity defaults to "error" ("warning" for
// non-blocking compiler/parser warnings). `actions` is an optional array of
// { name, apply: (view, from, to) => void } that shows up as clickable
// links inside the hover tooltip. Pass [] to clear.
export function buildDiagnostics(doc, entries) {
    const diags = [];
    for (const e of entries || []) {
        if (!e.message) continue;
        let from, to;
        if (e.line && e.line >= 1 && e.line <= doc.lines) {
            const ln = doc.line(e.line);
            const col = Math.max(1, e.col || 1);
            from = Math.min(ln.to, ln.from + col - 1);
            to = Math.min(ln.to, from + Math.max(1, e.length || 1));
            if (to <= from) to = Math.min(ln.to, from + 1);
        } else {
            // No location — pin to first line.
            from = 0;
            to = Math.min(doc.length, 1);
        }
        diags.push({
            from, to,
            severity: e.severity === "warning" ? "warning" : "error",
            message: e.message,
            actions: e.actions,
        });
    }
    return diags;
}

export function setEditorDiagnostics(entries) {
    if (!view) return;
    view.dispatch(setDiagnostics(view.state, buildDiagnostics(view.state.doc, entries)));
}

export function refreshEditorLayout() {
    if (!view) return;
    view.requestMeasure();
}

// spans: [{startLine, startColumn, endLine, endColumn}] with 1-based lines/cols.
export function highlightSpans(spans) {
    if (!view) return;
    if (!spans || !spans.length) {
        clearHighlights();
        return;
    }

    const doc = view.state.doc;
    const decos = [];
    for (const s of spans) {
        if (s.startLine < 1 || s.startLine > doc.lines) continue;
        if (s.endLine < 1 || s.endLine > doc.lines) continue;
        const from = doc.line(s.startLine).from + Math.max(0, s.startColumn - 1);
        const to = doc.line(s.endLine).from + Math.max(0, s.endColumn - 1);
        if (to > from && to <= doc.length) {
            decos.push(Decoration.mark({ class: "editor-highlight" }).range(from, to));
        }
    }
    view.dispatch({ effects: setHighlights.of(decos) });
}

// --- Diagnostic line classes ---
//
// A diagnostic on a given line tags every gutter cell for that line with
// .cm-has-error or .cm-has-warning (errors win when both share a line).
// CSS tints the line number accordingly (see editor.css).
// This replaces lintGutter() so we don't need a separate marker column.

const errorLineMarker = new (class extends GutterMarker {
    elementClass = "cm-has-error";
})();

const warningLineMarker = new (class extends GutterMarker {
    elementClass = "cm-has-warning";
})();

export const diagnosticLineClassField = StateField.define({
    create: () => RangeSet.empty,
    update(val, tr) {
        const lineSeverity = new Map();
        forEachDiagnostic(tr.state, (d, from) => {
            const line = tr.state.doc.lineAt(from);
            const prev = lineSeverity.get(line.from);
            if (d.severity === "error" || !prev) {
                lineSeverity.set(line.from, d.severity === "warning" ? "warning" : "error");
            }
        });
        const marks = [];
        for (const [lineFrom, sev] of lineSeverity) {
            marks.push((sev === "warning" ? warningLineMarker : errorLineMarker).range(lineFrom));
        }
        marks.sort((a, b) => a.from - b.from);
        return RangeSet.of(marks, true);
    },
    provide: f => gutterLineClass.from(f),
});

// --- Code folding ---
//
// StreamLanguage has no syntax tree, so CM6's tree-based folders don't
// apply. This fold service finds any line ending in `{` (optionally followed
// by a `// comment`) and treats everything up to the matching `}` as the
// foldable range. Good enough for GSL which only has line comments and no
// string literals.

const braceFoldService = foldService.of((state, lineStart /*, lineEnd */) => {
    const line = state.doc.lineAt(lineStart);
    const m = /\{\s*(?:\/\/.*)?$/.exec(line.text);
    if (!m) return null;

    const openAbs = line.from + m.index;
    let depth = 1;
    for (let pos = openAbs + 1; pos < state.doc.length; pos++) {
        const ch = state.sliceDoc(pos, pos + 1);
        if (ch === "{") {
            depth++;
        } else if (ch === "}") {
            depth--;
            if (depth === 0) {
                return { from: openAbs + 1, to: pos };
            }
        } else if (ch === "/" && state.sliceDoc(pos, pos + 2) === "//") {
            // Skip to end of line; // starts a line comment.
            const nl = state.doc.lineAt(pos);
            pos = nl.to;
        }
    }
    return null;
});

// --- GSL StreamLanguage ---

function buildGslStreamParser(lex) {
    const keywords = new Set([...(lex.keywords || []), ...(lex.implicits || [])]);
    const functions = new Set([
        ...(lex.primitives || []),
        ...(lex.builtins || []),
        ...(lex.libraryFunctions || []),
    ]);

    return {
        name: "gsl",
        startState: () => ({}),
        token(stream) {
            if (stream.eatSpace()) return null;

            // Line comment.
            if (stream.match("//")) {
                stream.skipToEnd();
                return "comment";
            }

            // Number — integer, decimal, or leading-dot decimal, optional exponent.
            if (stream.match(/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/) ||
                stream.match(/^\.\d+(?:[eE][+-]?\d+)?/)) {
                return "number";
            }

            // Identifier.
            if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
                const word = stream.current();
                if (keywords.has(word)) return "keyword";
                if (functions.has(word)) return "builtin";
                return "variableName";
            }

            // Operators and punctuation.
            if (stream.match(/^(?:<=>|<=|>=|==|!=|&&|\|\||[+\-*/%<>!?:,.;=])/)) {
                return "operator";
            }
            if (stream.match(/^[()[\]{}]/)) return "bracket";

            stream.next();
            return null;
        },
        languageData: {
            commentTokens: { line: "//" },
            closeBrackets: { brackets: ["(", "[", "{"] },
        },
    };
}

// --- Highlight style ---

const gslHighlightStyle = HighlightStyle.define([
    { tag: t.keyword,                       color: "#c586c0" },
    { tag: t.controlKeyword,                color: "#c586c0" },
    { tag: t.function(t.variableName),      color: "#4ec9b0" },
    { tag: [t.standard(t.variableName), t.atom, t.special(t.variableName)], color: "#4ec9b0" },
    { tag: t.variableName,                  color: "#9cdcfe" },
    { tag: t.number,                        color: "#b5cea8" },
    { tag: t.comment,                       color: "#6a9955", fontStyle: "italic" },
    { tag: t.operator,                      color: "#d4d4d4" },
    { tag: t.bracket,                       color: "#d4d4d4" },
]);

const gslTheme = EditorView.theme({
    "&": {
        height: "100%",
        fontSize: "13px",
        color: "#d1d1d1",
        background: "transparent",
    },
    ".cm-scroller": {
        fontFamily: "'IBM Plex Mono', monospace",
        lineHeight: "1.5",
        overflow: "auto",
    },
    ".cm-content": {
        padding: "14px 0",
        caretColor: "#d1d1d1",
    },
    // CM6's base theme gives each line 6px of left padding between the
    // gutter and the first character; trim to 2px to reclaim the width.
    ".cm-line": {
        padding: "0 2px 0 2px",
    },
    ".cm-gutters": {
        background: "transparent",
        color: "#585858",
        border: "none",
        paddingRight: "0",
    },
    // Tighten line-number and fold cells aggressively — CM6 defaults have
    // generous horizontal padding that eats into editable width. The fold
    // chevron still has enough hover target at 0 padding because the glyph
    // itself is ~10px wide.
    ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 2px 0 4px",
    },
    ".cm-foldGutter .cm-gutterElement": {
        padding: "0",
        cursor: "pointer",
        // Invisible at rest; reveal when the user moves the cursor into the
        // fold column. Still occupies its slot so line layout doesn't shift.
        opacity: "0",
        transition: "opacity 0.12s",
    },
    ".cm-gutters:hover .cm-foldGutter .cm-gutterElement": {
        opacity: "0.4",
    },
    ".cm-foldGutter .cm-gutterElement:hover": {
        opacity: "1",
        color: "#d1d1d1",
    },
    ".cm-foldPlaceholder": {
        background: "#2d2d2d",
        color: "#888",
        border: "1px solid #555",
        borderRadius: "3px",
        padding: "0 4px",
    },
    ".cm-activeLine": {
        background: "transparent",
    },
    ".cm-activeLineGutter": {
        background: "transparent",
        color: "#a8a8a8",
    },
    "&.cm-focused": {
        outline: "none",
    },
    ".cm-cursor": {
        borderLeftColor: "#d1d1d1",
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
        background: "#3b6ea8",
    },
    ".cm-selectionBackground": {
        background: "#3a3d41",
    },
    // CM6's default .cm-selectionMatch is a saturated green at 50% alpha
    // (#99ff7780) — louder than our actual selection. Drop both hits to a
    // subtle wash instead so the active selection reads as the focal point.
    ".cm-selectionMatch": {
        background: "rgba(255, 255, 255, 0.07)",
    },
    ".cm-searchMatch": {
        background: "rgba(255, 255, 255, 0.07)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
        background: "rgba(59, 110, 168, 0.6)",
    },
    ".cm-matchingBracket": {
        outline: "1px solid #888",
        background: "transparent",
    },
    ".editor-highlight": {
        background: "rgba(255, 255, 0, 0.2)",
    },
    // Search panel styling lives in style.css (moved so it can share the
    // palette custom properties and use CSS-native syntax). The theme here
    // only covers editor-internal chrome that genuinely needs per-instance
    // scoping.
}, { dark: true });
