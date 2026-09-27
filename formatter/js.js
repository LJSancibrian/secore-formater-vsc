const { indentLines } = require('./core');

function formatJs(text, settings) {
    const indentSize = settings.get('indentSize');
    const maxLen = settings.get('maxLineLength');
    const inlineIfFits = settings.get('js.inlineIfFits');

    const lines = text.split('\n');

    const result = lines.map(line => {
        let trimmed = line.trim();

        if (inlineIfFits &&
            (trimmed.startsWith('if ') || trimmed.startsWith('if(')) &&
            trimmed.includes('{') &&
            trimmed.includes('}') &&
            trimmed.length <= maxLen) {
            return trimmed;
        }

        return trimmed;
    });

    return indentLines(result, indentSize).join('\n');
}

module.exports = { formatJs };
