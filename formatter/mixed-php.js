'use strict';

const VOID = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
]);

const INLINE = new Set([
    'a',
    'abbr',
    'b',
    'bdi',
    'bdo',
    'cite',
    'code',
    'del',
    'em',
    'i',
    'kbd',
    'label',
    'mark',
    'option',
    'q',
    's',
    'samp',
    'small',
    'span',
    'strong',
    'sub',
    'sup',
    'time',
    'u',
    'var'
]);

let prettierPromise;

async function getPrettier() {
    if (!prettierPromise) {
        prettierPromise = import('prettier');
    }

    const mod = await prettierPromise;

    return mod.default || mod;
}

function findPhpEnd(text, start) {
    let quote = null;
    let lineComment = false;
    let blockComment = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (lineComment) {
            if (ch === '\n' || ch === '\r') {
                lineComment = false;
            }

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

            if (ch === quote) {
                quote = null;
            }

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

        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }

        if (ch === '?' && next === '>') {
            return i;
        }
    }

    return -1;
}

function findTagEnd(text, start) {
    let quote = null;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];

        if (quote) {
            if (ch === '\\') {
                i++;
                continue;
            }

            if (ch === quote) {
                quote = null;
            }

            continue;
        }

        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }

        if (text.startsWith('<?', i)) {
            const end = findPhpEnd(text, i + 2);

            if (end < 0) {
                return -1;
            }

            i = end + 1;
            continue;
        }

        if (ch === '>') {
            return i;
        }
    }

    return -1;
}

function findDeclarationEnd(text, start) {
    let quote = null;
    let bracketDepth = 0;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];

        if (quote) {
            if (ch === '\\') {
                i++;
                continue;
            }

            if (ch === quote) {
                quote = null;
            }

            continue;
        }

        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }

        if (ch === '[') {
            bracketDepth++;
            continue;
        }

        if (ch === ']' && bracketDepth > 0) {
            bracketDepth--;
            continue;
        }

        if (ch === '>' && bracketDepth === 0) {
            return i;
        }
    }

    return -1;
}

function compactPhpBlock(block) {
    let out = '';
    let quote = null;
    let pendingSpace = false;

    for (let i = 0; i < block.length; i++) {
        const ch = block[i];

        if (quote) {
            out += ch;

            if (ch === '\\' && i + 1 < block.length) {
                out += block[++i];
            } else if (ch === quote) {
                quote = null;
            }

            continue;
        }

        if (ch === '"' || ch === "'") {
            if (
                pendingSpace &&
                out &&
                !/[\s(]$/.test(out)
            ) {
                out += ' ';
            }

            pendingSpace = false;
            quote = ch;
            out += ch;

            continue;
        }

        if (/\s/.test(ch)) {
            pendingSpace = true;
            continue;
        }

        if (
            pendingSpace &&
            out &&
            !/[\s(]$/.test(out) &&
            ch !== ')' &&
            ch !== ',' &&
            ch !== ';' &&
            ch !== '>'
        ) {
            out += ' ';
        }

        pendingSpace = false;
        out += ch;
    }

    return out.trim();
}

function compactPhpSegments(raw) {
    let out = '';
    let cursor = 0;

    while (cursor < raw.length) {
        const start = raw.indexOf('<?', cursor);

        if (start < 0) {
            out += raw.slice(cursor);
            break;
        }

        out += raw.slice(cursor, start);

        const end = findPhpEnd(raw, start + 2);

        if (end < 0) {
            out += raw.slice(start);
            break;
        }

        out += compactPhpBlock(
            raw.slice(start, end + 2)
        );

        cursor = end + 2;
    }

    return out;
}

function collapseTag(raw) {
    let out = '';
    let quote = null;
    let inPhp = false;
    let pendingSpace = false;

    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];

        if (inPhp) {
            out += ch;

            if (
                ch === '?' &&
                raw[i + 1] === '>'
            ) {
                out += '>';
                i++;
                inPhp = false;
            }

            continue;
        }

        if (quote) {
            out += ch;

            if (
                ch === '\\' &&
                i + 1 < raw.length
            ) {
                out += raw[++i];
            } else if (ch === quote) {
                quote = null;
            }

            continue;
        }

        if (raw.startsWith('<?', i)) {
            if (
                pendingSpace &&
                out &&
                !/\s$/.test(out)
            ) {
                out += ' ';
            }

            pendingSpace = false;
            inPhp = true;
            out += '<';

            continue;
        }

        if (ch === '"' || ch === "'") {
            if (
                pendingSpace &&
                out &&
                !/\s$/.test(out)
            ) {
                out += ' ';
            }

            pendingSpace = false;
            quote = ch;
            out += ch;

            continue;
        }

        if (/\s/.test(ch)) {
            pendingSpace = true;
            continue;
        }

        if (
            pendingSpace &&
            out &&
            !/\s$/.test(out) &&
            ch !== '>'
        ) {
            out += ' ';
        }

        pendingSpace = false;
        out += ch;
    }

    return compactPhpSegments(
        out.trim()
    );
}

function classifyPhp(value) {
    const trimmed = value.trim();

    if (/^<\?=/.test(trimmed)) {
        return {
            kind: 'echo'
        };
    }

    const code = trimmed
        .replace(/^<\?php\s*/i, '')
        .replace(/\?>\s*$/i, '')
        .trim();

    let m;

    if (
        (m = /^(if|foreach|for|while|switch)\b[\s\S]*:\s*$/i.exec(code))
    ) {
        return {
            kind: 'open',
            family: m[1].toLowerCase()
        };
    }

    if (
        /^(?:else|elseif)\b[\s\S]*:\s*$/i.test(code)
    ) {
        return {
            kind: 'branch'
        };
    }

    if (
        (m = /^end(if|foreach|for|while|switch)\s*;?\s*$/i.exec(code))
    ) {
        return {
            kind: 'close',
            family: m[1].toLowerCase()
        };
    }

    return {
        kind: 'statement'
    };
}

function tokenize(text) {
    const tokens = [];

    let i = 0;

    while (i < text.length) {
        // PHP
        if (text.startsWith('<?', i)) {
            const end = findPhpEnd(
                text,
                i + 2
            );

            if (end < 0) {
                tokens.push({
                    type: 'text',
                    value: text.slice(i)
                });

                break;
            }

            const value = text.slice(
                i,
                end + 2
            );

            tokens.push({
                type: 'php',
                value,
                info: classifyPhp(value)
            });

            i = end + 2;

            continue;
        }

        // HTML comments
        if (text.startsWith('<!--', i)) {
            const end = text.indexOf(
                '-->',
                i + 4
            );

            if (end < 0) {
                tokens.push({
                    type: 'comment',
                    value: text.slice(i)
                });

                break;
            }

            tokens.push({
                type: 'comment',
                value: text.slice(
                    i,
                    end + 3
                )
            });

            i = end + 3;

            continue;
        }

        // CDATA
        if (text.startsWith('<![CDATA[', i)) {
            const end = text.indexOf(
                ']]>',
                i + 9
            );

            if (end < 0) {
                tokens.push({
                    type: 'declaration',
                    value: text.slice(i)
                });

                break;
            }

            tokens.push({
                type: 'declaration',
                value: text.slice(
                    i,
                    end + 3
                )
            });

            i = end + 3;

            continue;
        }

        // <!doctype html> and any other <! ... > declaration
        if (
            text[i] === '<' &&
            text[i + 1] === '!'
        ) {
            const end = findDeclarationEnd(
                text,
                i + 2
            );

            if (end >= 0) {
                tokens.push({
                    type: 'declaration',
                    value: text
                        .slice(i, end + 1)
                        .replace(/\s+/g, ' ')
                        .trim()
                });

                i = end + 1;

                continue;
            }
        }

        // Normal HTML tags
        if (text[i] === '<') {
            const m =
                /^<\/?([A-Za-z][A-Za-z0-9:_-]*)\b/.exec(
                    text.slice(i)
                );

            if (m) {
                const end = findTagEnd(
                    text,
                    i + m[0].length
                );

                if (end >= 0) {
                    const raw = collapseTag(
                        text.slice(
                            i,
                            end + 1
                        )
                    );

                    const name =
                        m[1].toLowerCase();

                    tokens.push({
                        type: 'tag',
                        value: raw,
                        name,
                        closing:
                            /^<\//.test(raw),

                        selfClosing:
                            /\/\s*>$/.test(raw) ||
                            VOID.has(name)
                    });

                    i = end + 1;

                    if (
                        !/^<\//.test(raw) &&
                        !/\/\s*>$/.test(raw) &&
                        (
                            name === 'script' ||
                            name === 'style'
                        )
                    ) {
                        const re = new RegExp(
                            `<\\/${name}\\s*>`,
                            'ig'
                        );

                        re.lastIndex = i;

                        const close = re.exec(text);

                        if (close) {
                            tokens.push({
                                type: 'raw',
                                language: name,
                                value: text.slice(
                                    i,
                                    close.index
                                )
                            });

                            tokens.push({
                                type: 'tag',
                                value: close[0],
                                name,
                                closing: true,
                                selfClosing: false
                            });

                            i =
                                close.index +
                                close[0].length;
                        }
                    }

                    continue;
                }
            }
        }

        const start = i;

        while (
            i < text.length &&
            !text.startsWith('<?', i) &&
            !text.startsWith('<!--', i) &&
            !text.startsWith('<![CDATA[', i) &&
            text[i] !== '<'
        ) {
            i++;
        }

        if (i === start) {
            i++;
        }

        tokens.push({
            type: 'text',
            value: text.slice(
                start,
                i
            )
        });
    }

    return tokens;
}

function nextNonWhitespace(tokens, index) {
    for (
        let i = index;
        i < tokens.length;
        i++
    ) {
        if (
            tokens[i].type === 'text' &&
            !tokens[i].value.trim()
        ) {
            continue;
        }

        return i;
    }

    return -1;
}

function inlineGroupEnd(tokens, start) {
    const open = tokens[start];

    if (
        !open ||
        open.type !== 'tag' ||
        open.closing ||
        open.selfClosing ||
        open.name === 'script' ||
        open.name === 'style'
    ) {
        return -1;
    }

    let depth = 0;

    for (
        let i = start + 1;
        i < tokens.length;
        i++
    ) {
        const t = tokens[i];

        if (t.type === 'tag') {
            if (
                t.name === open.name &&
                !t.closing &&
                !t.selfClosing
            ) {
                depth++;
            } else if (
                t.name === open.name &&
                t.closing
            ) {
                if (depth === 0) {
                    return i;
                }

                depth--;
            } else {
                // Any nested HTML makes the group structural.
                return -1;
            }
        } else if (
            t.type === 'raw' ||
            t.type === 'comment' ||
            t.type === 'declaration'
        ) {
            return -1;
        } else if (
            t.type === 'php' &&
            t.info.kind !== 'echo'
        ) {
            return -1;
        }
    }

    return -1;
}

function compactInline(
    tokens,
    start,
    end
) {
    let s = '';

    for (
        let i = start;
        i <= end;
        i++
    ) {
        const t = tokens[i];

        if (t.type === 'text') {
            const v = t.value.replace(
                /\s+/g,
                ' '
            );

            if (v.trim()) {
                s += v;
            }
        } else {
            s += t.value.trim();
        }
    }

    return s.trim();
}

async function formatRaw(
    token,
    settings
) {
    const body = token.value.trim();

    if (!body) {
        return [];
    }

    try {
        const prettier =
            await getPrettier();

        const parser =
            token.language === 'style'
                ? 'css'
                : 'babel';

        const formatted =
            await prettier.format(
                body,
                {
                    parser,
                    tabWidth:
                        settings.indentSize ||
                        4,

                    useTabs:
                        Boolean(
                            settings.useTabs
                        ),

                    printWidth:
                        settings.printWidth ||
                        160,

                    singleQuote:
                        settings.singleQuote !==
                        false,

                    endOfLine: 'lf'
                }
            );

        return formatted
            .trim()
            .split(/\r\n|\r|\n/);
    } catch (_) {
        return body
            .split(/\r\n|\r|\n/)
            .map(
                line =>
                    line.trim()
            )
            .filter(Boolean);
    }
}

async function formatMixedPhp(
    text,
    settings = {}
) {
    const tokens = tokenize(text);

    const unit =
        settings.useTabs
            ? '\t'
            : ' '.repeat(
                  settings.indentSize || 4
              );

    const lines = [];
    const htmlStack = [];
    const phpStack = [];

    const level = () =>
        htmlStack.length +
        phpStack.length;

    const emit = (
        value,
        at = level()
    ) => {
        const clean =
            String(value).trim();

        if (!clean) {
            return;
        }

        for (const part of clean.split(
            /\r\n|\r|\n/
        )) {
            lines.push(
                unit.repeat(
                    Math.max(
                        0,
                        at
                    )
                ) +
                    part.trim()
            );
        }
    };

    for (
        let i = 0;
        i < tokens.length;
        i++
    ) {
        const t = tokens[i];

        if (t.type === 'text') {
            const value = t.value
                .replace(/\s+/g, ' ')
                .trim();

            if (value) {
                emit(value);
            }

            continue;
        }

        if (t.type === 'comment') {
            emit(t.value);
            continue;
        }

        if (t.type === 'declaration') {
            emit(t.value, level());
            continue;
        }

        if (t.type === 'raw') {
            const rawLines =
                await formatRaw(
                    t,
                    settings
                );

            for (
                const line of rawLines
            ) {
                lines.push(
                    unit.repeat(
                        level()
                    ) + line
                );
            }

            continue;
        }

        if (t.type === 'php') {
            const info = t.info;

            if (
                info.kind === 'open'
            ) {
                emit(t.value);

                phpStack.push(
                    info.family
                );
            } else if (
                info.kind === 'branch'
            ) {
                emit(
                    t.value,
                    Math.max(
                        0,
                        level() - 1
                    )
                );
            } else if (
                info.kind === 'close'
            ) {
                if (
                    phpStack.length
                ) {
                    phpStack.pop();
                }

                emit(t.value);
            } else {
                emit(t.value);
            }

            continue;
        }

        if (t.type === 'tag') {
            if (t.closing) {
                let idx = -1;

                for (
                    let s =
                        htmlStack.length -
                        1;
                    s >= 0;
                    s--
                ) {
                    if (
                        htmlStack[s] ===
                        t.name
                    ) {
                        idx = s;
                        break;
                    }
                }

                if (idx >= 0) {
                    htmlStack.length =
                        idx;
                }

                emit(t.value);

                continue;
            }

            if (t.selfClosing) {
                emit(t.value);
                continue;
            }

            const end =
                inlineGroupEnd(
                    tokens,
                    i
                );

            if (end >= 0) {
                emit(
                    compactInline(
                        tokens,
                        i,
                        end
                    )
                );

                i = end;

                continue;
            }

            emit(t.value);

            htmlStack.push(
                t.name
            );
        }
    }

    return (
        lines.join('\n') +
        (
            text.endsWith('\n')
                ? '\n'
                : ''
        )
    );
}

module.exports = {
    formatMixedPhp,
    tokenize,
    classifyPhp,
    findPhpEnd
};