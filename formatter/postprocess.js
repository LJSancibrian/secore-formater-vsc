'use strict';

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function normalizeEol(text, eol) {
    return String(text).replace(/\r\n|\r|\n/g, eol);
}

function hasRealHtmlOutsidePhp(text) {
    let i = 0;
    let inPhp = false;
    let quote = null;
    let lineComment = false;
    let blockComment = false;

    while (i < text.length) {
        const ch = text[i];
        const next = text[i + 1];

        if (!inPhp) {
            if (text.startsWith('<?', i)) { inPhp = true; i += 2; continue; }
            if (ch === '<' && /^<\/?[A-Za-z][A-Za-z0-9:_-]*(?:\s|>|\/)/.test(text.slice(i))) return true;
            i++;
            continue;
        }

        if (lineComment) {
            if (ch === '\n' || ch === '\r') lineComment = false;
            i++;
            continue;
        }
        if (blockComment) {
            if (ch === '*' && next === '/') { blockComment = false; i += 2; } else i++;
            continue;
        }
        if (quote) {
            if (ch === '\\') { i += 2; continue; }
            if (ch === quote) quote = null;
            i++;
            continue;
        }
        if (ch === '/' && next === '/') { lineComment = true; i += 2; continue; }
        if (ch === '#') { lineComment = true; i++; continue; }
        if (ch === '/' && next === '*') { blockComment = true; i += 2; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; i++; continue; }
        if (ch === '?' && next === '>') { inPhp = false; i += 2; continue; }
        i++;
    }
    return false;
}

/**
 * Conservative structural cleanup for real markup outside PHP blocks.
 * It only inserts/removes whitespace BETWEEN recognized top-level markup
 * tokens. It never scans inside <script>/<style> bodies or inside PHP code.
 */
function normalizeMixedPhpMarkup(text) {
    const tokens = tokenizeMixed(text);
    if (!tokens.some(t => t.type === 'tag')) return text;

    let out = '';
    let lineHasContent = false;
    let previous = null;

    const newline = () => {
        out = out.replace(/[ \t]+$/g, '');
        if (!out.endsWith('\n')) out += '\n';
        lineHasContent = false;
    };
    const append = value => {
        out += value;
        const p = Math.max(out.lastIndexOf('\n'), out.lastIndexOf('\r'));
        lineHasContent = out.slice(p + 1).trim().length > 0;
    };

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        const next = tokens[index + 1] || null;

        if (token.type === 'space') {
            // Existing whitespace between structural tokens is rebuilt below.
            if (!previous || !next || previous.type === 'text' || next.type === 'text') {
                if (/\r|\n/.test(token.value)) newline();
                else if (lineHasContent) append(' ');
            }
            continue;
        }

        if (token.type === 'raw') {
            if (lineHasContent && /^\s*<(?:script|style)\b/i.test(token.value)) newline();
            append(token.value.trim());
            if (next) newline();
            previous = token;
            continue;
        }

        if (token.type === 'php') {
            const structuralOpen = /^<\?php\s*(?:if|foreach|for|while|switch)\b[\s\S]*:\s*\?>$/i.test(token.value.trim());
            const structuralClose = /^<\?php\s*end(?:if|foreach|for|while|switch)\s*;?\s*\?>$/i.test(token.value.trim());
            if (lineHasContent && (structuralOpen || structuralClose)) newline();
            append(token.value.trim());
            if ((structuralOpen || structuralClose) && next) newline();
            previous = token;
            continue;
        }

        if (token.type === 'tag') {
            const prevIsStructural = previous && (previous.type === 'tag' || previous.type === 'php');
            const shouldStartLine = lineHasContent && prevIsStructural && (
                token.closing || token.selfClosing ||
                previous.type === 'php' ||
                (previous.type === 'tag' && (previous.closing || previous.selfClosing)) ||
                (previous.type === 'tag' && !previous.closing && !previous.selfClosing)
            );
            if (shouldStartLine) newline();
            append(token.value);

            // Child markup gets its own line; inline text/PHP may stay with tag.
            if (!token.closing && !token.selfClosing && next && next.type === 'tag') newline();
            if (token.closing && next && (next.type === 'tag' || next.type === 'php')) newline();
            previous = token;
            continue;
        }

        // Text is preserved. PHP echo text between an opening and closing tag
        // can therefore stay inline, e.g. <label><?= ... ?></label>.
        append(token.value);
        previous = token;
    }

    return out.replace(/[ \t]+(?=\n)/g, '').replace(/\n{3,}/g, '\n\n');
}

function tokenizeMixed(text) {
    const tokens = [];
    let i = 0;
    let plain = '';

    const flush = () => {
        if (!plain) return;
        const parts = plain.split(/(\s+)/);
        for (const p of parts) if (p) tokens.push({ type: /^\s+$/.test(p) ? 'space' : 'text', value: p });
        plain = '';
    };

    while (i < text.length) {
        if (text.startsWith('<?', i)) {
            flush();
            const end = findPhpEnd(text, i + 2);
            if (end < 0) { tokens.push({ type: 'php', value: text.slice(i) }); break; }
            tokens.push({ type: 'php', value: text.slice(i, end + 2) });
            i = end + 2;
            continue;
        }

        if (text[i] === '<') {
            const m = /^<\/?([A-Za-z][A-Za-z0-9:_-]*)\b/.exec(text.slice(i));
            if (m) {
                const tagEnd = findTagEnd(text, i + m[0].length);
                if (tagEnd >= 0) {
                    flush();
                    const raw = collapseTag(text.slice(i, tagEnd + 1));
                    const name = m[1].toLowerCase();
                    const closing = /^<\//.test(raw);
                    const selfClosing = /\/\s*>$/.test(raw) || VOID.has(name);

                    if (!closing && (name === 'script' || name === 'style')) {
                        const closeRe = new RegExp(`<\\/${name}\\s*>`, 'ig');
                        closeRe.lastIndex = tagEnd + 1;
                        const close = closeRe.exec(text);
                        if (close) {
                            tokens.push({ type: 'raw', value: text.slice(i, close.index + close[0].length) });
                            i = close.index + close[0].length;
                            continue;
                        }
                    }

                    tokens.push({ type: 'tag', value: raw, name, closing, selfClosing });
                    i = tagEnd + 1;
                    continue;
                }
            }
        }

        plain += text[i++];
    }
    flush();
    return tokens;
}

function findPhpEnd(text, start) {
    let quote = null, lineComment = false, blockComment = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i], next = text[i + 1];
        if (lineComment) { if (ch === '\n' || ch === '\r') lineComment = false; continue; }
        if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
        if (quote) { if (ch === '\\') { i++; continue; } if (ch === quote) quote = null; continue; }
        if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
        if (ch === '#') { lineComment = true; continue; }
        if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '?' && next === '>') return i;
    }
    return -1;
}

function findTagEnd(text, start) {
    let quote = null;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (quote) { if (ch === '\\') { i++; continue; } if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (text.startsWith('<?', i)) {
            const end = findPhpEnd(text, i + 2);
            if (end < 0) return -1;
            i = end + 1;
            continue;
        }
        if (ch === '>') return i;
    }
    return -1;
}

function collapseTag(raw) {
    let out = '', quote = null, inPhp = false, pendingSpace = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inPhp) {
            out += ch;
            if (ch === '?' && raw[i + 1] === '>') { out += '>'; i++; inPhp = false; }
            continue;
        }
        if (quote) {
            out += ch;
            if (ch === '\\' && i + 1 < raw.length) out += raw[++i];
            else if (ch === quote) quote = null;
            continue;
        }
        if (raw.startsWith('<?', i)) {
            if (pendingSpace && out && !/\s$/.test(out)) out += ' ';
            pendingSpace = false; inPhp = true; out += '<'; continue;
        }
        if (ch === '"' || ch === "'") {
            if (pendingSpace && out && !/\s$/.test(out)) out += ' ';
            pendingSpace = false; quote = ch; out += ch; continue;
        }
        if (/\s/.test(ch)) { pendingSpace = true; continue; }
        if (pendingSpace && out && !/\s$/.test(out) && ch !== '>') out += ' ';
        pendingSpace = false; out += ch;
    }
    return out.trim();
}

/**
 * Enforce the continuation style requested by the project after the PHP
 * formatter has produced syntactically safe output.
 *
 * return $this->db
 *     ->where(...)
 *     ->get(...);
 *
 * return $value
 *     ? $yes
 *     : $no;
 */
function normalizePhpContinuations(text, indentSize, useTabs) {
    const lines = text.split(/\r\n|\r|\n/);
    const unit = useTabs ? '\t' : ' '.repeat(indentSize);
    let continuation = null;

    const leading = line => (line.match(/^[\t ]*/) || [''])[0];
    const addUnit = base => base + unit;

    for (let i = 0; i < lines.length; i++) {
        const trim = lines[i].trimStart();
        if (!trim) { continuation = null; continue; }

        const chain = /^\?*->/.test(trim);
        const ternary = trim.startsWith('? ') || trim === '?' || trim.startsWith(': ');

        if (chain || ternary) {
            if (!continuation) {
                let p = i - 1;
                while (p >= 0 && !lines[p].trim()) p--;
                continuation = addUnit(p >= 0 ? leading(lines[p]) : '');
            }
            lines[i] = continuation + trim;
            continue;
        }

        continuation = null;
    }
    return lines.join('\n');
}


/**
 * Preserve explicit parentheses written around "new" expressions.
 *
 * Example:
 *
 *     (new DateTimeImmutable(...))->setTimezone(...)
 *
 * Some PHP formatter/parser versions may consider the outer parentheses
 * redundant and remove them. Secore must not do that: if the user wrote
 * those parentheses, we preserve them independently of the project's PHP
 * version.
 *
 * We replace only the OUTER parentheses with comments before formatting and
 * restore them afterwards. Comments are valid PHP and are preserved by the
 * formatter.
 */
function protectParenthesizedNewExpressions(text) {
    const source = String(text);
    const pairs = [];

    let quote = null;
    let lineComment = false;
    let blockComment = false;

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];

        if (lineComment) {
            if (ch === '\n' || ch === '\r') lineComment = false;
            continue;
        }

        if (blockComment) {
            if (ch === '*' && next === '/') {
                blockComment = false;
                i++;
            }
            continue;
        }

        if (quote) {
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }

        if (ch === '/' && next === '/') {
            lineComment = true;
            i++;
            continue;
        }
        if (ch === '#') {
            lineComment = true;
            continue;
        }
        if (ch === '/' && next === '*') {
            blockComment = true;
            i++;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            continue;
        }

        if (ch !== '(') continue;

        let p = i + 1;
        while (p < source.length && /\s/.test(source[p])) p++;

        if (!/^new\b/i.test(source.slice(p))) continue;

        const close = findMatchingParenthesis(source, i);
        if (close < 0) continue;

        pairs.push({ open: i, close, id: pairs.length });

        // Skip to the matching parenthesis so nested parentheses belonging to
        // this new-expression are not examined as separate candidates.
        i = close;
    }

    if (!pairs.length) {
        return { text: source, protected: false };
    }

    const replacements = [];
    for (const pair of pairs) {
        replacements.push({
            pos: pair.open,
            value: `/*__SECORE_NEW_OPEN_${pair.id}__*/`
        });
        replacements.push({
            pos: pair.close,
            value: `/*__SECORE_NEW_CLOSE_${pair.id}__*/`
        });
    }

    // Replace from right to left so offsets stay valid.
    replacements.sort((a, b) => b.pos - a.pos);

    let protectedText = source;
    for (const replacement of replacements) {
        protectedText =
            protectedText.slice(0, replacement.pos) +
            replacement.value +
            protectedText.slice(replacement.pos + 1);
    }

    return { text: protectedText, protected: true };
}

function findMatchingParenthesis(text, openPos) {
    let depth = 0;
    let quote = null;
    let lineComment = false;
    let blockComment = false;

    for (let i = openPos; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (lineComment) {
            if (ch === '\n' || ch === '\r') lineComment = false;
            continue;
        }

        if (blockComment) {
            if (ch === '*' && next === '/') {
                blockComment = false;
                i++;
            }
            continue;
        }

        if (quote) {
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }

        if (ch === '/' && next === '/') {
            lineComment = true;
            i++;
            continue;
        }
        if (ch === '#') {
            lineComment = true;
            continue;
        }
        if (ch === '/' && next === '*') {
            blockComment = true;
            i++;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            continue;
        }

        if (ch === '(') {
            depth++;
            continue;
        }

        if (ch === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}

function restoreParenthesizedNewExpressions(text) {
    let output = String(text);

    output = output.replace(
        /\/\*__SECORE_NEW_OPEN_\d+__\*\/[ \t]*/g,
        '('
    );

    output = output.replace(
        /[ \t]*\/\*__SECORE_NEW_CLOSE_\d+__\*\/[ \t]*/g,
        ')'
    );

    if (
        output.includes('__SECORE_NEW_OPEN_') ||
        output.includes('__SECORE_NEW_CLOSE_')
    ) {
        throw new Error('Secore could not restore protected PHP parentheses.');
    }

    return output;
}

module.exports = {
    normalizeMixedPhpMarkup,
    normalizePhpContinuations,
    hasRealHtmlOutsidePhp,
    normalizeEol,
    tokenizeMixed,
    protectParenthesizedNewExpressions,
    restoreParenthesizedNewExpressions
};
