const { indentLines } = require('./core');

function formatPhp(text, settings) {
    const indentSize = settings.get('indentSize');
    const maxLen = settings.get('maxLineLength');
    const inlineIfFits = settings.get('php.inlineIfFits');

    const lines = text.split('\n');

    const result = lines.map(line => {
        let trimmed = line.trim();

        if (inlineIfFits &&
            trimmed.startsWith('<?php') &&
            trimmed.length <= maxLen) {
            return trimmed;
        }

        return trimmed;
    });

    return indentLines(result, indentSize).join('\n');
}

module.exports = { formatPhp };
