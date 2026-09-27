const { indentLines } = require('./core');

function formatHtml(text, settings) {
    const indentSize = settings.get('indentSize');
    const maxLen = settings.get('maxLineLength');
    const attributesInline = settings.get('html.attributesInline');

    const lines = text.split('\n');

    const result = lines.map(line => {
        let trimmed = line.trim();

        if (attributesInline && trimmed.startsWith('<') && trimmed.includes(' ')) {
            return trimmed;
        }

        if (trimmed.length > maxLen) {
            return trimmed;
        }

        return trimmed;
    });

    return indentLines(result, indentSize).join('\n');
}

module.exports = { formatHtml };
