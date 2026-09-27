'use strict';

const vscode = require('vscode');
const path = require('path');
const { formatDocument } = require('./formatter');

// JS/JSX/TS/TSX are intentionally NOT registered here.
// VS Code's built-in "JavaScript and TypeScript Language Features" formatter
// remains responsible for those languages.
const SECORE_LANGUAGES = [
    'php', 'php-template', 'html',
    'css', 'scss', 'less', 'sql'
];

const DEFAULT_FOLDER_EXTENSIONS = new Set([
    '.php', '.phtml', '.php-template', '.html', '.htm',
    '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
    '.css', '.scss', '.less', '.sql'
]);

const DEFAULT_EXCLUDED_DIRS = new Set([
    '.git', 'node_modules', 'vendor', 'dist', 'build', '.next', 'coverage'
]);

function getSecoreSettings(document, options = {}) {
    const config = vscode.workspace.getConfiguration('secore', document.uri);
    return {
        indentSize: Number(config.get('indentSize', options.tabSize || 4)),
        useTabs: Boolean(config.get('useTabs', options.insertSpaces === false)),
        printWidth: Number(config.get('printWidth', 160)),
        singleQuote: Boolean(config.get('singleQuote', true)),
        sqlDialect: String(config.get('sqlDialect', 'mysql')),
        sqlKeywordCase: String(config.get('sqlKeywordCase', 'upper'))
    };
}

function fullDocumentRange(document) {
    const lastLine = document.lineAt(document.lineCount - 1);
    return new vscode.Range(new vscode.Position(0, 0), lastLine.rangeIncludingLineBreak.end);
}

function createSecoreProvider() {
    return {
        async provideDocumentFormattingEdits(document, options) {
            const input = document.getText();
            let output;

            try {
                output = await formatDocument(input, document.languageId, getSecoreSettings(document, options));
            } catch (error) {
                vscode.window.showErrorMessage(`Secore: ${error && error.message ? error.message : String(error)}`);
                return [];
            }

            if (output === input) return [];
            return [vscode.TextEdit.replace(fullDocumentRange(document), output)];
        }
    };
}

function normalizeExtensionList(value) {
    if (!Array.isArray(value) || !value.length) return DEFAULT_FOLDER_EXTENSIONS;
    const result = new Set();
    for (const item of value) {
        if (typeof item !== 'string' || !item.trim()) continue;
        const clean = item.trim().toLowerCase();
        result.add(clean.startsWith('.') ? clean : `.${clean}`);
    }
    return result.size ? result : DEFAULT_FOLDER_EXTENSIONS;
}

function getFolderOptions(uri) {
    const config = vscode.workspace.getConfiguration('secore', uri);
    const excluded = new Set(DEFAULT_EXCLUDED_DIRS);
    const configuredExcluded = config.get('folderExcludeDirectories', []);
    if (Array.isArray(configuredExcluded)) {
        for (const item of configuredExcluded) {
            if (typeof item === 'string' && item.trim()) excluded.add(item.trim());
        }
    }

    return {
        extensions: normalizeExtensionList(config.get('folderExtensions', [])),
        excludedDirectories: excluded
    };
}

async function collectFiles(rootUri, options, token) {
    const files = [];

    async function walk(dirUri) {
        if (token && token.isCancellationRequested) return;

        let entries;
        try {
            entries = await vscode.workspace.fs.readDirectory(dirUri);
        } catch {
            return;
        }

        entries.sort((a, b) => a[0].localeCompare(b[0]));

        for (const [name, type] of entries) {
            if (token && token.isCancellationRequested) return;
            const uri = vscode.Uri.joinPath(dirUri, name);

            if (type === vscode.FileType.Directory) {
                if (!options.excludedDirectories.has(name)) await walk(uri);
                continue;
            }

            if (type !== vscode.FileType.File) continue;
            const ext = path.extname(name).toLowerCase();
            if (options.extensions.has(ext)) files.push(uri);
        }
    }

    await walk(rootUri);
    return files;
}

async function selectFolder(resourceUri) {
    if (resourceUri && resourceUri.scheme === 'file') {
        try {
            const stat = await vscode.workspace.fs.stat(resourceUri);
            if (stat.type === vscode.FileType.Directory) return resourceUri;
            return vscode.Uri.file(path.dirname(resourceUri.fsPath));
        } catch {
            // Fall through to picker.
        }
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Format this folder'
    });

    return picked && picked[0] ? picked[0] : undefined;
}

async function formatUsingConfiguredFormatter(uri) {
    const document = await vscode.workspace.openTextDocument(uri);

    // Never overwrite a file that the user already has modified but unsaved.
    if (document.isDirty) return { status: 'dirty' };

    // editor.action.formatDocument is important here: unlike directly calling
    // a provider, it honours editor.defaultFormatter / language-specific settings.
    const editor = await vscode.window.showTextDocument(document, {
        preview: true,
        preserveFocus: false
    });

    const before = document.getText();
    await vscode.commands.executeCommand('editor.action.formatDocument');
    const changed = document.getText() !== before;

    if (changed) {
        const saved = await document.save();
        if (!saved) throw new Error(`Could not save ${uri.fsPath}`);
    }

    // Keep a reference so VS Code doesn't optimise away the active editor before
    // the command completes on slower formatters.
    void editor;
    return { status: changed ? 'formatted' : 'unchanged' };
}

async function formatFolder(resourceUri) {
    const rootUri = await selectFolder(resourceUri);
    if (!rootUri) return;

    const options = getFolderOptions(rootUri);
    const originalEditor = vscode.window.activeTextEditor;
    const originalUri = originalEditor && originalEditor.document.uri;
    const originalColumn = originalEditor && originalEditor.viewColumn;

    const summary = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Secore: formatting ${path.basename(rootUri.fsPath) || rootUri.fsPath}`,
        cancellable: true
    }, async (progress, token) => {
        const files = await collectFiles(rootUri, options, token);
        const result = { total: files.length, formatted: 0, unchanged: 0, dirty: 0, failed: 0, cancelled: false };

        for (let i = 0; i < files.length; i++) {
            if (token.isCancellationRequested) {
                result.cancelled = true;
                break;
            }

            const uri = files[i];
            progress.report({
                message: `${i + 1}/${files.length} ${path.relative(rootUri.fsPath, uri.fsPath)}`,
                increment: files.length ? 100 / files.length : 100
            });

            try {
                const item = await formatUsingConfiguredFormatter(uri);
                if (item.status === 'formatted') result.formatted++;
                else if (item.status === 'dirty') result.dirty++;
                else result.unchanged++;
            } catch (error) {
                result.failed++;
                console.error('[Secore] Format Folder failed:', uri.fsPath, error);
            }
        }

        return result;
    });

    if (originalUri) {
        try {
            const originalDoc = await vscode.workspace.openTextDocument(originalUri);
            await vscode.window.showTextDocument(originalDoc, {
                viewColumn: originalColumn,
                preview: false,
                preserveFocus: false
            });
        } catch {
            // Restoring the old editor is best-effort only.
        }
    }

    const parts = [
        `${summary.formatted} formatted`,
        `${summary.unchanged} unchanged`
    ];
    if (summary.dirty) parts.push(`${summary.dirty} skipped (unsaved)`);
    if (summary.failed) parts.push(`${summary.failed} failed`);
    if (summary.cancelled) parts.push('cancelled');

    const message = `Secore: ${parts.join(', ')}.`;
    if (summary.failed) vscode.window.showWarningMessage(message);
    else vscode.window.showInformationMessage(message);
}

function activate(context) {
    const provider = createSecoreProvider();

    for (const language of SECORE_LANGUAGES) {
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider({ language }, provider)
        );
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('secore.formatFolder', formatFolder)
    );
}

function deactivate() {}

module.exports = { activate, deactivate, collectFiles, normalizeExtensionList };
