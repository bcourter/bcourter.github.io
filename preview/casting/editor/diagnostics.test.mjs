import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const codemirrorUrl = new URL('../vendor/codemirror/codemirror.js', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'codemirror') {
      return nextResolve(codemirrorUrl, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  EditorState,
  linter,
  setDiagnostics,
  forEachDiagnostic,
} = await import('../vendor/codemirror/codemirror.js');

const {
  formatErrorBody,
  formatWarningBody,
  gslPlainTextErrorToEntry,
  errorsToEditorEntries,
  warningsToEditorEntries,
  formatWarningsBanner,
} = await import('./diagnostics.js');

const {
  buildDiagnostics,
  diagnosticLineClassField,
} = await import('./editor.js');

const {
  selectTab,
  setTabNames,
  setPendingError,
  clearPendingError,
  setPendingWarnings,
  clearPendingWarnings,
  setWarningsVisible,
  activeTabDiagnostics,
} = await import('./editor-tab.js');

test('formatWarningBody formats line, caret, location, and optional package/file context', () => {
  const primaryWarn = {
    line: 'min(radius, fallback) {',
    lineNum: 2,
    column: 5,
    length: 6,
    message: 'function "min" with 2 parameters shadows implicitly imported builtin function',
  };
  assert.equal(
      formatWarningBody(primaryWarn),
      'min(radius, fallback) {\n' +
      '    ^^^^^^ 2:5: warning: function "min" with 2 parameters shadows implicitly imported builtin function',
  );

  const linelessWarn = {
    lineNum: 0,
    column: 0,
    message: 'legacy configuration detected',
  };
  assert.equal(formatWarningBody(linelessWarn), 'warning: legacy configuration detected');

  const depWarn = {
    packagePath: 'dep',
    filePath: 'dep/dep.gsl',
    line: 'import . "pkgB";',
    lineNum: 3,
    column: 1,
    length: 6,
    message: 'variable "x" declared in both import "pkgA" and "pkgB"',
  };
  assert.equal(
      formatWarningBody(depWarn),
      'import . "pkgB";\n' +
      '^^^^^^ 3:1: warning: variable "x" declared in both import "pkgA" and "pkgB"\n' +
      '  in package dep\n' +
      '  in file dep/dep.gsl',
  );
});

test('warningsToEditorEntries includes primary-package located warnings with warning severity and skips imported packages', () => {
  const warnings = [
    {
      packagePath: '',
      line: 'min(radius, fallback) {',
      lineNum: 2,
      column: 5,
      length: 6,
      message: 'shadows builtin',
    },
    {
      packagePath: 'dep',
      line: 'import . "pkgB";',
      lineNum: 3,
      column: 1,
      length: 6,
      message: 'imported package warning',
    },
    {
      packagePath: '',
      lineNum: 0,
      column: 0,
      message: 'file-level warning without line',
    },
  ];

  const entries = warningsToEditorEntries(warnings);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].severity, 'warning');
  assert.equal(entries[0].line, 2);
  assert.equal(entries[0].col, 5);
  assert.equal(entries[0].length, 6);
  assert.match(entries[0].message, /2:5: warning: shadows builtin/);

  // Banner includes all three warnings (primary, imported package, and line-less).
  const banner = formatWarningsBanner(warnings);
  assert.match(banner, /shadows builtin/);
  assert.match(banner, /in package dep/);
  assert.match(banner, /warning: file-level warning without line/);
});

test('errorsToEditorEntries preserves error severity and caret formatting', () => {
  const entries = errorsToEditorEntries([
    {
      line: 'return unknownFunc(x);',
      lineNum: 3,
      column: 8,
      length: 11,
      message: 'undefined identifier: unknownFunc',
    },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].severity, 'error');
  assert.equal(entries[0].line, 3);
  assert.equal(entries[0].col, 8);
  assert.equal(entries[0].length, 11);
  assert.equal(
      entries[0].message,
      formatErrorBody({
        line: 'return unknownFunc(x);',
        column: 8,
        length: 11,
        message: 'undefined identifier: unknownFunc',
      }),
  );
});

test('buildDiagnostics and diagnosticLineClassField distinguish warning and error gutter classes', () => {
  const docText = '@scene(40)\nmin(radius, fallback) {\n    return bad;\n}\n';
  let state = EditorState.create({
    doc: docText,
    extensions: [linter(null), diagnosticLineClassField],
  });

  const cmDiags = buildDiagnostics(state.doc, [
    { line: 2, col: 5, length: 6, severity: 'warning', message: 'warn on line 2' },
    { line: 3, col: 12, length: 3, severity: 'error', message: 'err on line 3' },
  ]);
  state = state.update(setDiagnostics(state, cmDiags)).state;

  const recorded = [];
  forEachDiagnostic(state, (d, from, to) => {
    recorded.push({ severity: d.severity, slice: state.doc.sliceString(from, to) });
  });
  assert.deepEqual(recorded, [
    { severity: 'warning', slice: 'radius' },
    { severity: 'error', slice: 'bad' },
  ]);

  const marks = [];
  const rangeSet = state.field(diagnosticLineClassField);
  const iter = rangeSet.iter();
  while (iter.value) {
    marks.push({
      line: state.doc.lineAt(iter.from).number,
      cls: iter.value.elementClass,
    });
    iter.next();
  }
  assert.deepEqual(marks, [
    { line: 2, cls: 'cm-has-warning' },
    { line: 3, cls: 'cm-has-error' },
  ]);

  // When both a warning and an error fall on the same line, cm-has-error wins.
  const sameLine = buildDiagnostics(state.doc, [
    { line: 2, col: 1, length: 3, severity: 'warning', message: 'warn' },
    { line: 2, col: 5, length: 6, severity: 'error', message: 'err' },
  ]);
  const nextState = state.update(setDiagnostics(state, sameLine)).state;
  const sameLineMarks = [];
  const iter2 = nextState.field(diagnosticLineClassField).iter();
  while (iter2.value) {
    sameLineMarks.push({
      line: nextState.doc.lineAt(iter2.from).number,
      cls: iter2.value.elementClass,
    });
    iter2.next();
  }
  assert.deepEqual(sameLineMarks, [{ line: 2, cls: 'cm-has-error' }]);
});

test('editor-tab gates warnings on code panel visibility and scopes them to the GSL tab', () => {
  globalThis.document = { querySelector: () => null };
  try {
    selectTab('GSL');
    clearPendingError();
    clearPendingWarnings();
    setWarningsVisible(false);

    const warnEntries = [
      { line: 2, col: 5, length: 6, severity: 'warning', message: 'shadow warning' },
    ];
    setPendingWarnings('GSL', warnEntries);

    // Code panel closed -> warnings hidden.
    assert.deepEqual(activeTabDiagnostics(), []);

    // Open code panel -> warnings become active on GSL tab.
    setWarningsVisible(true);
    assert.deepEqual(activeTabDiagnostics(), warnEntries);

    // Switch to WGSL tab -> GSL warnings do not appear on WGSL buffer.
    selectTab('WGSL');
    assert.deepEqual(activeTabDiagnostics(), []);

    // Switch back to GSL tab -> GSL warnings reappear.
    selectTab('GSL');
    assert.deepEqual(activeTabDiagnostics(), warnEntries);

    // Error alongside warnings -> error comes first, warning preserved when open.
    const errEntries = [
      { line: 4, col: 8, length: 3, severity: 'error', message: 'undefined identifier' },
    ];
    setPendingError('GSL', errEntries);
    assert.deepEqual(activeTabDiagnostics(), [...errEntries, ...warnEntries]);

    // Clean recompile -> clears both errors and warnings.
    clearPendingError();
    clearPendingWarnings();
    assert.deepEqual(activeTabDiagnostics(), []);
  } finally {
    delete globalThis.document;
  }
});

test('editor-tab toggles has-warning and has-error classes on inactive tab buttons', () => {
  function makeClassList() {
    const set = new Set();
    return {
      add: (c) => set.add(c),
      toggle: (c, force) => {
        if (force) set.add(c);
        else set.delete(c);
      },
      contains: (c) => set.has(c),
    };
  }
  const container = {
    children: [],
    set innerHTML(_v) {
      this.children = [];
    },
    appendChild(el) {
      this.children.push(el);
    },
  };
  globalThis.document = {
    querySelector: (sel) => (sel === '.editor-tab-container' ? container : null),
    createElement: () => ({
      id: '',
      className: '',
      textContent: '',
      classList: makeClassList(),
      addEventListener: () => {},
    }),
  };

  try {
    setTabNames('GSL', 'WGSL');
    selectTab('GSL');
    clearPendingError();
    clearPendingWarnings();
    setWarningsVisible(true);

    const [gslTab, wgslTab] = container.children;
    setPendingWarnings('GSL', [
      { line: 1, col: 1, length: 3, severity: 'warning', message: 'warn' },
    ]);
    // Active tab itself does not get has-warning; switching to WGSL highlights GSL tab.
    assert.equal(gslTab.classList.contains('has-warning'), false);
    selectTab('WGSL');
    assert.equal(gslTab.classList.contains('has-warning'), true);
    assert.equal(wgslTab.classList.contains('has-warning'), false);

    // Closing the code panel hides has-warning on the tab bar too.
    setWarningsVisible(false);
    assert.equal(gslTab.classList.contains('has-warning'), false);
    setWarningsVisible(true);
    assert.equal(gslTab.classList.contains('has-warning'), true);

    // Errors supersede has-warning with has-error.
    setPendingError('GSL', [
      { line: 2, col: 1, length: 3, severity: 'error', message: 'err' },
    ]);
    assert.equal(gslTab.classList.contains('has-error'), true);
    assert.equal(gslTab.classList.contains('has-warning'), false);

    clearPendingError();
    clearPendingWarnings();
    selectTab('GSL');
    setWarningsVisible(false);
  } finally {
    delete globalThis.document;
  }
});

test('gslPlainTextErrorToEntry extracts caret coordinates when present', () => {
  const withCaret = gslPlainTextErrorToEntry('return bad;\n       ^ 4:8: undefined identifier: bad');
  assert.equal(withCaret.line, 4);
  assert.equal(withCaret.col, 8);
  assert.equal(withCaret.severity, 'error');

  const plain = gslPlainTextErrorToEntry('Compile failed (HTTP 500)');
  assert.equal(plain.line, 1);
  assert.equal(plain.col, 1);
  assert.equal(plain.severity, 'error');
});

