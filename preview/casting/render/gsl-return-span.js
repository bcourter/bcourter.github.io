// topLevelReturnSpan finds the program's top-level `return` statement: the
// character span from the `return` keyword to its terminating `;`, skipping
// strings, comments and anything inside braces. Returns null when there is
// no top-level return. Shared by the mesh import (which appends a mesh()
// placement to the return) and an app's document tooling.
export function topLevelReturnSpan(source) {
    let braces = 0, quote = false, lineComment = false, blockComment = false;
    let start = -1;
    for (let i = 0; i < source.length; i++) {
        const c = source[i], next = source[i + 1];
        if (lineComment) { if (c === '\n') lineComment = false; continue; }
        if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
        if (quote) { if (c === '\\') i++; else if (c === '"') quote = false; continue; }
        if (c === '/' && next === '/') { lineComment = true; i++; continue; }
        if (c === '/' && next === '*') { blockComment = true; i++; continue; }
        if (c === '"') { quote = true; continue; }
        if (c === '{') braces++;
        else if (c === '}') braces--;
        else if (start < 0 && braces === 0 && source.startsWith('return', i) && !/\w/.test(source[i - 1] || '') && !/\w/.test(source[i + 6] || '')) {
            start = i;
            i += 5;
        } else if (start >= 0 && braces === 0 && c === ';') {
            return { start, end: i };
        }
    }
    return null;
}
