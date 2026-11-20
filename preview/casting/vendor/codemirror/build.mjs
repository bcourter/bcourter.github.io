// Re-export all CodeMirror 6 symbols we use from examples/viewer/editor/editor.js.
// Bundled into codemirror.js with esbuild; committed so runtime fetches a
// single file and contributors don't need Node just to run omega-core.
//
// To rebuild (from this directory):
//   npm install
//   npm run build
//
// See README.md.

export {
  EditorState,
  StateEffect,
  StateField,
  RangeSet,
  RangeSetBuilder,
  Compartment,
} from "@codemirror/state";

export {
  EditorView,
  Decoration,
  WidgetType,
  ViewPlugin,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
  GutterMarker,
  gutterLineClass,
} from "@codemirror/view";

export {
  history,
  defaultKeymap,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";

export {
  StreamLanguage,
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  bracketMatching,
  indentUnit,
  indentOnInput,
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
} from "@codemirror/language";

export {
  searchKeymap,
  search,
  highlightSelectionMatches,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  selectMatches,
  openSearchPanel,
  closeSearchPanel,
  SearchQuery,
  getSearchQuery,
  setSearchQuery,
} from "@codemirror/search";

export {
  lintGutter,
  linter,
  setDiagnostics,
  diagnosticCount,
  nextDiagnostic,
  forEachDiagnostic,
  lintKeymap,
} from "@codemirror/lint";

export {
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";

export { tags } from "@lezer/highlight";
