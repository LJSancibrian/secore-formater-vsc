const { indentLines } = require('./core');

function formatCss(text, settings) {
    const indentSize = settings.get('indentSize');
    const compactRules = settings.get('css.compactRules');

    const lines = text.split('\n');

    const result = lines.map(line => {
        let trimmed = line.trim();

        if (compactRules && trimmed.endsWith('{')) {
            return trimmed;
        }

        return trimmed;
    });

    return indentLines(result, indentSize).join('\n');
}

module.exports = { formatCss };
