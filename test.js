'use strict';
const assert = require('assert');
const { normalizeMixedPhpMarkup, normalizePhpContinuations, hasRealHtmlOutsidePhp } = require('./formatter/postprocess');

const html = `<?php if ($ok): ?><div class="col-md-6"><label class="form-label"><?= e('X'); ?></label><input type="text"></div><?php endif; ?>`;
const normalized = normalizeMixedPhpMarkup(html);
assert(normalized.includes(`<?php if ($ok): ?>\n<div class="col-md-6">`));
assert(normalized.includes(`</label>\n<input type="text">`));
assert(normalized.includes(`</div>\n<?php endif; ?>`));

const chain = `    public function x()\n    {\n        return $this->db\n        ->where('id', 1)\n        ->get();\n    }`;
assert.strictEqual(normalizePhpContinuations(chain, 4, false), `    public function x()\n    {\n        return $this->db\n            ->where('id', 1)\n            ->get();\n    }`);

const ternary = `        return $ok\n        ? 1\n        : 0;`;
assert.strictEqual(normalizePhpContinuations(ternary, 4, false), `        return $ok\n            ? 1\n            : 0;`);

assert.strictEqual(hasRealHtmlOutsidePhp(`<?php $x = '<div>'; ?>`), false);
assert.strictEqual(hasRealHtmlOutsidePhp(`<?php $x = 1; ?><div></div>`), true);

console.log('Secore structural tests: OK');
