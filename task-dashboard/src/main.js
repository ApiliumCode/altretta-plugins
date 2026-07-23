'use strict';

/*
 * Task Dashboard — runnable entry point.
 *
 * This is the file `manifest.json` points at (bundled to `dist/main.js`). It is
 * deliberately tiny and has NO top-level `export`: the built bundle is evaluated as
 * a plain script inside the SES compartment (`compartment.evaluate`), where a
 * top-level `export`/`import` would be a syntax error. All the real wiring lives in
 * `./dashboard.js` (exported there so it can be unit-tested with a mock host); the
 * bundler inlines it here.
 */

import { createTaskDashboard } from './dashboard.js';

// The host injects the `akashi` API onto the compartment global. Reading it via
// `globalThis` (rather than a bare free variable) keeps the factory's own `akashi`
// parameter name intact through bundling. `Promise.resolve().catch` keeps a rejected
// registration from surfacing as an unhandled rejection in the worker.
const host = globalThis.akashi;
if (host) {
  Promise.resolve()
    .then(() => createTaskDashboard(host))
    .catch(() => {});
}
