'use strict';

const {
    normalizePhpContinuations,
    hasRealHtmlOutsidePhp,
    normalizeEol
} = require('./postprocess');
const { formatMixedPhp } = require('./mixed-php');

let prettierPromise;
let phpPluginPromise;
let sqlFormatterPromise;

async function getPrettier() {
    if (!prettierPromise) prettierPromise = import('prettier');
    return prettierPromise;
}

async function getPhpPlugin() {
    if (!phpPluginPromise) phpPluginPromise = import('@prettier/plugin-php');
    return phpPluginPromise;
}

async function getSqlFormatter() {
    if (!sqlFormatterPromise) sqlFormatterPromise = import('sql-formatter');
    return sqlFormatterPromise;
}

function prettierOptions(parser, settings) {
    return {
        parser,
        tabWidth: settings.indentSize || 4,
        useTabs: Boolean(settings.useTabs),
        printWidth: settings.printWidth || 160,
        singleQuote: settings.singleQuote !== false,
        htmlWhitespaceSensitivity: 'ignore',
        bracketSameLine: false,
        endOfLine: 'lf'
    };
}

async function formatWithPrettier(text, parser, settings, plugins) {
    const prettierModule = await getPrettier();
    const prettier = prettierModule.default || prettierModule;
    const options = prettierOptions(parser, settings);
    if (plugins) options.plugins = plugins;
    return prettier.format(text, options);
}

async function formatPhp(text, settings) {
    if (hasRealHtmlOutsidePhp(text)) {
        return formatMixedPhp(text, settings);
    }

    const pluginModule = await getPhpPlugin();
    const plugin = pluginModule.default || pluginModule;
    let formatted = await formatWithPrettier(text, 'php', settings, [plugin]);
    formatted = normalizePhpContinuations(formatted, settings.indentSize || 4, Boolean(settings.useTabs));
    return formatted;
}

async function formatSql(text, settings) {
    const module = await getSqlFormatter();
    const format = module.format || (module.default && module.default.format);
    if (typeof format !== 'function') throw new Error('sql-formatter could not be loaded.');

    const dialect = mapSqlDialect(settings.sqlDialect || 'mysql');
    return format(text, {
        language: dialect,
        tabWidth: settings.indentSize || 4,
        keywordCase: settings.sqlKeywordCase || 'upper',
        linesBetweenQueries: 1
    });
}

function mapSqlDialect(value) {
    const map = {
        sql: 'sql', mysql: 'mysql', mariadb: 'mariadb', postgresql: 'postgresql',
        sqlite: 'sqlite', transactsql: 'transactsql', plsql: 'plsql', bigquery: 'bigquery',
        redshift: 'redshift', spark: 'spark', snowflake: 'snowflake'
    };
    return map[String(value).toLowerCase()] || 'mysql';
}

async function formatDocument(text, languageId, settings = {}) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    let output;

    switch (languageId) {
        case 'php':
        case 'php-template':
            output = await formatPhp(text, settings);
            break;
        case 'javascript':
        case 'javascriptreact':
            output = await formatWithPrettier(text, languageId === 'javascriptreact' ? 'babel' : 'babel', settings);
            break;
        case 'typescript':
        case 'typescriptreact':
            output = await formatWithPrettier(text, 'typescript', settings);
            break;
        case 'html':
            output = await formatWithPrettier(text, 'html', settings);
            break;
        case 'css':
            output = await formatWithPrettier(text, 'css', settings);
            break;
        case 'scss':
            output = await formatWithPrettier(text, 'scss', settings);
            break;
        case 'less':
            output = await formatWithPrettier(text, 'less', settings);
            break;
        case 'sql':
            output = await formatSql(text, settings);
            break;
        default:
            return text;
    }

    return normalizeEol(output, eol);
}

module.exports = { formatDocument, formatPhp, formatSql };
