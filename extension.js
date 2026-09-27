const vscode = require('vscode');
const { formatHtml } = require('./formatter/html');
const { formatPhp } = require('./formatter/php');
const { formatJs } = require('./formatter/js');
const { formatCss } = require('./formatter/css');

function activate(context) {
    const config = () => vscode.workspace.getConfiguration('secore');

    function register(languageId, formatterFn) {
        const provider = {
            provideDocumentFormattingEdits(document) {
                const text = document.getText();
                const settings = config();
                const formatted = formatterFn(text, settings);
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(text.length)
                );
                return [vscode.TextEdit.replace(fullRange, formatted)];
            }
        };
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider(languageId, provider)
        );
    }

    register('html', formatHtml);
    register('php', formatPhp);
    register('javascript', formatJs);
    register('css', formatCss);
}

function deactivate() {}

module.exports = { activate, deactivate };
