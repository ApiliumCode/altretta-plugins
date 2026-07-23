import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The built entry (dist/main.js) is evaluated as a plain SCRIPT inside the SES
// compartment via `compartment.evaluate(code)`. A top-level `export` or `import`
// is Module grammar, not Script — it would throw a SyntaxError at load time and
// the plugin would never run. Node's own tests import the ESM source and would
// NOT catch this, so guard the shipped artifact directly.
const distPath = fileURLToPath(new URL('../dist/main.js', import.meta.url));

test('the built bundle is compartment-safe (no top-level export/import)', () => {
  assert.ok(
    existsSync(distPath),
    'dist/main.js is missing — run `npm run build` before packing',
  );
  const bundle = readFileSync(distPath, 'utf8');
  // Match an `export`/`import` statement at the start of a line (module syntax),
  // not the substrings inside identifiers/strings.
  assert.equal(
    /^\s*export[\s{]/m.test(bundle),
    false,
    'bundle has a top-level `export` — SES compartment.evaluate would reject it',
  );
  assert.equal(
    /^\s*import[\s{*]/m.test(bundle),
    false,
    'bundle has a top-level `import` — it must be inlined by the bundler',
  );
});
