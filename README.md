# Secore Formatter

Formateador para proyectos web con PHP/CodeIgniter, plantillas PHP + HTML, HTML, CSS/SCSS/LESS y SQL.

Para JavaScript y TypeScript, Secore deja el control al formateador nativo de VS Code (**JavaScript and TypeScript Language Features**) o al formatter que tengas configurado como predeterminado.

## Lenguajes soportados

- PHP
- PHP + HTML / vistas CodeIgniter
- `.phtml` y `.php-template`
- HTML
- CSS
- SCSS
- LESS
- SQL
- JavaScript / JSX / TypeScript / TSX mediante el formatter configurado en VS Code

## Instalación

### Desde Visual Studio Marketplace

Busca **Secore Formatter** en la vista de extensiones de VS Code e instálalo normalmente.

También puedes instalarlo desde terminal:

```bash
code --install-extension luis.secore-formater
```

> Si el identificador del publisher publicado finalmente no es `luis`, sustituye `luis` por el publisher correcto.

## Formatear un documento

Usa el comando estándar de VS Code:

```text
Format Document
```

Atajo habitual:

```text
Shift + Alt + F
```

Para PHP, PHP+HTML, HTML, CSS, SCSS, LESS y SQL puedes seleccionar **Secore Formatter** como formatter predeterminado.

Ejemplo en `settings.json`:

```json
{
    "[php]": {
        "editor.defaultFormatter": "luis.secore-formater"
    },
    "[html]": {
        "editor.defaultFormatter": "luis.secore-formater"
    },
    "[css]": {
        "editor.defaultFormatter": "luis.secore-formater"
    },
    "[scss]": {
        "editor.defaultFormatter": "luis.secore-formater"
    },
    "[less]": {
        "editor.defaultFormatter": "luis.secore-formater"
    },
    "[sql]": {
        "editor.defaultFormatter": "luis.secore-formater"
    }
}
```

## JavaScript y TypeScript

Secore no reemplaza el formatter de JavaScript/TypeScript.

Para utilizar el formateador integrado de VS Code:

```json
{
    "[javascript]": {
        "editor.defaultFormatter": "vscode.typescript-language-features"
    },
    "[javascriptreact]": {
        "editor.defaultFormatter": "vscode.typescript-language-features"
    },
    "[typescript]": {
        "editor.defaultFormatter": "vscode.typescript-language-features"
    },
    "[typescriptreact]": {
        "editor.defaultFormatter": "vscode.typescript-language-features"
    }
}
```

## Formatear una carpeta completa

Secore incluye el comando:

```text
Secore: Format Folder
```

Puedes ejecutarlo de dos maneras:

1. `Ctrl + Shift + P` → **Secore: Format Folder**.
2. Botón derecho sobre una carpeta del Explorador → **Secore: Format Folder**.

El comando recorre la carpeta y sus subcarpetas y utiliza para cada archivo el formatter configurado en VS Code para su lenguaje.

Por defecto ignora:

- `.git`
- `node_modules`
- `vendor`
- `dist`
- `build`
- `.next`
- `coverage`

Los documentos con cambios sin guardar se omiten para evitar sobrescribir trabajo pendiente.

Al terminar, Secore muestra un resumen con los archivos modificados, sin cambios, omitidos y los posibles errores.

## Configuración

### Tamaño de indentación

```json
"secore.indentSize": 4
```

### Ancho de línea preferido

```json
"secore.printWidth": 160
```

### Usar tabuladores

```json
"secore.useTabs": false
```

### Comillas simples

```json
"secore.singleQuote": true
```

### Dialecto SQL

Por defecto:

```json
"secore.sqlDialect": "mysql"
```

También se admiten, entre otros, MariaDB, PostgreSQL, SQLite, Transact-SQL, PL/SQL, BigQuery, Redshift, Spark y Snowflake.

### Mayúsculas/minúsculas de palabras clave SQL

```json
"secore.sqlKeywordCase": "upper"
```

Valores disponibles:

- `upper`
- `lower`
- `preserve`

### Carpetas excluidas del formateo masivo

```json
"secore.folderExcludeDirectories": [
    ".git",
    "node_modules",
    "vendor",
    "dist",
    "build",
    ".next",
    "coverage"
]
```

## Sincronización entre equipos

Si utilizas **Settings Sync** de VS Code y tienes activada la sincronización de extensiones, una vez publicada Secore Formatter en Visual Studio Marketplace podrás instalarla y mantenerla disponible en tus distintos equipos como cualquier otra extensión de VS Code.

## Desarrollo y empaquetado

```bash
npm install
npm test
npm run package
```

Para publicar una nueva versión en Visual Studio Marketplace:

```bash
npm run publish
```

Antes de publicar una nueva versión, incrementa el campo `version` de `package.json`.
