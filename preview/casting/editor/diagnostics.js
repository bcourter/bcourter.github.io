/**
 * Formats a structured compiler error with optional source line and caret.
 * @param {!Object} err
 * @return {string}
 */
function formatErrorBody(err) {
  const parts = [];
  if (err.line) {
    parts.push(err.line);
    if (err.column >= 1 && err.length >= 1) {
      parts.push(
          ' '.repeat(err.column - 1) + '^'.repeat(err.length) +
          ' ' + err.message);
    } else {
      parts.push(err.message);
    }
  } else {
    parts.push(err.message);
  }
  return parts.join('\n');
}

/**
 * Formats a structured compiler warning with location, caret, and package path.
 * @param {!Object} warn
 * @return {string}
 */
function formatWarningBody(warn) {
  const loc = warn.lineNum >= 1
      ? `${warn.lineNum}:${Math.max(1, warn.column || 1)}: `
      : '';
  const headline = `${loc}warning: ${warn.message || ''}`;
  const lines = [];
  if (warn.line) {
    lines.push(warn.line);
    if (warn.column >= 1) {
      const underline = ' '.repeat(warn.column - 1) +
          '^'.repeat(Math.max(1, warn.length || 1));
      lines.push(`${underline} ${headline}`);
    } else {
      lines.push(headline);
    }
  } else {
    lines.push(headline);
  }
  if (warn.packagePath) {
    lines.push(`  in package ${warn.packagePath}`);
  }
  if (warn.filePath) {
    lines.push(`  in file ${warn.filePath}`);
  }
  return lines.join('\n');
}

/**
 * Converts a plain-text compiler error string into an editor diagnostic entry.
 * @param {string} text
 * @return {!Object}
 */
function gslPlainTextErrorToEntry(text) {
  const trimmed = (typeof text === 'string' ? text : String(text || '')).trim();
  const caretMatch = trimmed.match(/\n\s*\^\s*(\d+):(\d+):\s*([^\n]*)/) ||
      trimmed.match(/^\s*\^\s*(\d+):(\d+):\s*(.*)$/m);
  if (caretMatch) {
    return {
      line: +caretMatch[1],
      col: +caretMatch[2],
      length: 1,
      severity: 'error',
      message: trimmed,
      actions: [],
    };
  }
  return {
    line: 1,
    col: 1,
    length: 1,
    severity: 'error',
    message: trimmed,
    actions: [],
  };
}

/**
 * Maps structured program.Error items into CodeMirror diagnostic entries.
 * @param {?Array<!Object>} errors
 * @return {!Array<!Object>}
 */
function errorsToEditorEntries(errors) {
  const entries = [];
  if (!Array.isArray(errors)) {
    return entries;
  }
  for (const err of errors) {
    entries.push({
      line: err.lineNum || 1,
      col: err.column || 1,
      length: Math.max(1, err.length || 1),
      severity: 'error',
      message: formatErrorBody(err),
      actions: [],
    });
  }
  return entries;
}

/**
 * Maps primary-package located warnings into inline CodeMirror warning entries.
 * @param {?Array<!Object>} warnings
 * @return {!Array<!Object>}
 */
function warningsToEditorEntries(warnings) {
  const entries = [];
  if (!Array.isArray(warnings)) {
    return entries;
  }
  for (const warn of warnings) {
    if (!warn || warn.packagePath || !(warn.lineNum >= 1)) {
      continue;
    }
    entries.push({
      line: warn.lineNum,
      col: Math.max(1, warn.column || 1),
      length: Math.max(1, warn.length || 1),
      severity: 'warning',
      message: formatWarningBody(warn),
      actions: [],
    });
  }
  return entries;
}

/**
 * Formats all active compiler warnings for the non-blocking code-panel banner.
 * @param {?Array<!Object>} warnings
 * @return {string}
 */
function formatWarningsBanner(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) {
    return '';
  }
  return warnings.map(formatWarningBody).join('\n\n');
}

export {
  errorsToEditorEntries,
  formatErrorBody,
  formatWarningBody,
  formatWarningsBanner,
  gslPlainTextErrorToEntry,
  warningsToEditorEntries,
};
