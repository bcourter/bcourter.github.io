// Minimal markdown renderer tuned for our authored docs. Supports YAML
// frontmatter, headings, paragraphs, bullet lists with nesting and lazy
// continuation, fenced code blocks, horizontal rules, and inline code/bold.

export function stripFrontmatter(md) {
    return md.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

export function escapeHtml(s) {
    return s.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderInline(text) {
    let s = escapeHtml(text);
    // Hard line break: a line ending in two-or-more spaces becomes <br>.
    // Any remaining intra-paragraph newlines collapse to a single space, so
    // soft-wrapped source still flows. Both rules run before code/links so
    // their replacements can safely include their own newlines (none do).
    s = s.replace(/ {2,}\n/g, '<br>\n');
    s = s.replace(/\n/g, ' ');
    // Images first so the leading ! is consumed and the link regex below
    // doesn't strip it. URL is restricted to a safe character set to keep
    // the regex simple and the injected output unambiguous.
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) =>
        '<img src="' + url + '" alt="' + alt + '">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) =>
        '<a href="' + url + '" target="_blank" rel="noopener">' + txt + '</a>');
    s = s.replace(/`([^`]+)`/g, (_, c) => '<code>' + c + '</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s;
}

export function renderMarkdown(md) {
    const lines = md.split('\n');
    const out = [];
    let i = 0;

    const isBlank = l => l.trim() === '';
    const isFence = l => /^\s*```/.test(l);
    const isHr = l => /^---\s*$/.test(l);
    const getHeading = l => {
        const m = /^(#{1,6})\s+(.*)$/.exec(l);
        return m ? { level: m[1].length, text: m[2] } : null;
    };
    const getBullet = l => {
        const m = /^(\s*)[*-]\s+(.*)$/.exec(l);
        return m ? { indent: m[1].length, text: m[2] } : null;
    };

    while (i < lines.length) {
        const line = lines[i];

        if (isBlank(line)) { i++; continue; }

        if (isFence(line)) {
            const lang = line.replace(/^\s*```\s*/, '').trim();
            i++;
            const codeLines = [];
            while (i < lines.length && !isFence(lines[i])) {
                codeLines.push(lines[i]);
                i++;
            }
            i++;
            out.push('<pre><code'
                + (lang ? ' class="lang-' + escapeHtml(lang) + '"' : '')
                + '>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
            continue;
        }

        if (isHr(line)) { out.push('<hr>'); i++; continue; }

        const h = getHeading(line);
        if (h) {
            out.push('<h' + h.level + '>' + renderInline(h.text) + '</h' + h.level + '>');
            i++;
            continue;
        }

        if (getBullet(line)) {
            const result = parseList(lines, i, getBullet(line).indent);
            out.push(result.html);
            i = result.next;
            continue;
        }

        const paraLines = [];
        while (i < lines.length && !isBlank(lines[i])
                && !getBullet(lines[i]) && !getHeading(lines[i])
                && !isFence(lines[i]) && !isHr(lines[i])) {
            paraLines.push(lines[i]);
            i++;
        }
        out.push('<p>' + renderInline(paraLines.join('\n')) + '</p>');
    }

    return out.join('\n');

    function parseList(lines, start, baseIndent) {
        const items = [];
        let i = start;

        while (i < lines.length) {
            const line = lines[i];
            const b = getBullet(line);

            if (!b) {
                if (isBlank(line)) {
                    let j = i + 1;
                    while (j < lines.length && isBlank(lines[j])) j++;
                    const nb = j < lines.length ? getBullet(lines[j]) : null;
                    if (nb && nb.indent === baseIndent) { i = j; continue; }
                    break;
                }
                break;
            }

            if (b.indent < baseIndent) break;
            if (b.indent > baseIndent) {
                const nested = parseList(lines, i, b.indent);
                if (items.length) items[items.length - 1].extra.push(nested.html);
                i = nested.next;
                continue;
            }

            const itemLines = [b.text];
            const extra = [];
            i++;
            while (i < lines.length) {
                const cur = lines[i];
                if (isBlank(cur)) break;
                const cb = getBullet(cur);
                if (cb) {
                    if (cb.indent > baseIndent) {
                        const nested = parseList(lines, i, cb.indent);
                        extra.push(nested.html);
                        i = nested.next;
                        continue;
                    }
                    break;
                }
                if (getHeading(cur) || isFence(cur) || isHr(cur)) break;
                itemLines.push(cur.trim());
                i++;
            }
            items.push({ text: itemLines.join(' '), extra });
        }

        const html = '<ul>'
            + items.map(it => '<li>' + renderInline(it.text) + it.extra.join('') + '</li>').join('')
            + '</ul>';
        return { html, next: i };
    }
}
