<p align="center">
  <img src="assets/altretta-logo.svg" width="72" height="72" alt="Altretta" />
</p>

<h1 align="center">Task Dashboard</h1>

<p align="center">
  <b>Every checkbox in your vault, in one panel.</b><br />
  Tick it here and it writes straight back to the note. One click,
  <b>signed&nbsp;&amp;&nbsp;reversible</b> underneath.
</p>

<p align="center">
  <img alt="Built for Altretta" src="https://img.shields.io/badge/built%20for-Altretta-6366F1?style=flat-square" />
  <img alt="Scope: ReadNotes · WriteNotes · RenderPanel" src="https://img.shields.io/badge/scope-ReadNotes%20%C2%B7%20WriteNotes%20%C2%B7%20RenderPanel-475569?style=flat-square" />
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-8b949e?style=flat-square" />
</p>

---

A first-party [Altretta](https://apilium.com) plugin. No new syntax, no separate task
database. Your notes stay the source of truth: any line like `- [ ] ship the release`
or `- [x] pay invoice` (with `-` or `*` bullets, at any indent) shows up in the panel,
grouped by note, and toggling it edits exactly that line.

## What it does

- Scans every `.md` note, parses its tasks, and lists them under a heading per note.
- Skips code fences, so a `- [ ] example` inside a ``` block is never mistaken for a
  real task.
- Preserves the line verbatim on toggle: indentation, bullet character, label, and
  CRLF/LF line endings all round-trip untouched. Only the `[ ]` ⇄ `[x]` box changes.
- If a note changed under you (the target line is no longer a task), it re-reads and
  refreshes instead of writing to the wrong place.

## Install & run (Developer Mode)

Developer Mode loads an **unsigned** plugin folder so you can iterate without signing
on every change. Everything else is identical to a real install: same sandbox, same
consent, same per-call permission checks.

```bash
npm install
npm run build      # bundles src/main.js -> dist/main.js
```

Then, in Altretta:

1. **Plugins → Developer Mode** → turn it on.
2. **Load plugin folder** → pick this folder.
3. Review the permissions and **consent**. The **Tasks** panel appears, fully
   sandboxed.

To iterate, run the watcher and edit `src/main.js`, and Developer Mode hot-reloads on
save:

```bash
npm run dev        # esbuild --watch
```

Full walkthrough (the `akashi` API, permissions, the Verified path): [AUTHORING.md](../AUTHORING.md).

## Permissions

The plugin declares exactly three capabilities in `manifest.json`, and uses exactly
those, nothing more:

| Permission    | API it unlocks                              | Why this plugin needs it        |
| ------------- | ------------------------------------------- | ------------------------------- |
| `ReadNotes`   | `akashi.vault.list` / `akashi.vault.read`   | Find notes and read their tasks |
| `WriteNotes`  | `akashi.vault.write`                        | Write a toggled checkbox back   |
| `RenderPanel` | `akashi.registerView` / `akashi.views.update` | Render the Tasks panel        |

The plugin can never touch anything outside those three. Its only egress is `akashi`,
and every call is checked by the host, not trusted to the plugin.

### The Altretta difference

Every toggle this plugin makes is a signed, reversible step in Altretta's action graph.
Your task history is a verifiable record, not a pile of overwrites:

- **Provenance-tracked.** Who or what changed which line, and when, is recorded and
  signed at the moment it happens.
- **Time-travelable.** Inspect or roll back to any earlier state of a note, because each
  write is an addressable step in the graph.
- **Tamper-evident.** The signature covers the exact bytes, so silent corruption shows
  up instead of hiding.

One click to check a task. A verifiable trail underneath, at no extra effort.

## Build, sign & package

Two ways, both first-class. Generate an author key once, then pack a signed `.akplugin`.

**In the terminal (the `akashi-plugin` CLI on npm, no global install, no Rust):**

```bash
npm run build
npx @apilium/altretta-plugin keygen --out author.key
npx @apilium/altretta-plugin pack . --key author.key --out task-dashboard.akplugin --deny-warnings
npx @apilium/altretta-plugin verify task-dashboard.akplugin
```

A project scaffolded with `npm create @apilium/altretta-plugin` also gets `npm run keygen`
/ `npm run pack` / `npm run verify` wired for the same steps.

**In Altretta, no terminal:** Plugins → Developer Mode → **Package & sign** creates your
identity once, packs, verifies, and saves the `.akplugin`. Same signing engine.

`pack` validates the manifest, hashes `dist/main.js`, injects your public key +
fingerprint, and signs the whole package. `--deny-warnings` makes any lint warning
(ambient globals, permission/usage mismatch) fatal; keep it on. `author_pubkey_hex`
and `author_fingerprint` in `manifest.json` stay empty while you author; they are
filled from your key at pack time.

> Developer Mode runs the plugin without any signing step; you only need to sign to
> ship. Details in [AUTHORING.md](../AUTHORING.md) step 5.

Keep `author.key` secret and backed up (it is git-ignored). Losing it means you
cannot ship updates under the same identity.

## Tests

```bash
npm test           # node --test over the pure core and the host wiring
```

`src/tasks.js` is a side-effect-free core (parse / toggle / id-codec / tree-build)
with full unit coverage; `test/main.test.mjs` drives the host wiring against a mock
`akashi` to verify the read → toggle → write → refresh round-trip.

## License

MIT
