# __PLUGIN_NAME__

An [Altretta](https://apilium.com) plugin. It contributes a command and a live side
panel, and reads your notes. A starting point you can shape into anything.

## Prerequisites

- [Node.js](https://nodejs.org) 18+ and npm.
- Altretta 0.5.0+ with **Developer Mode** (Plugins settings).
- The `akashi-plugin` CLI, which comes in as a dev dependency on `npm install` (no
  global install, no Rust). You only need it to sign and publish; Developer Mode runs
  the plugin without it.

## Develop

```bash
npm install
npm run build      # bundles src/main.js -> dist/main.js
```

Then, in Altretta:

1. **Plugins → Developer Mode** → turn it on.
2. **Load plugin folder** → pick this folder.
3. Review the permissions and **consent**. Your plugin runs, fully sandboxed, and its
   panel appears.

To iterate, run the watcher and edit `src/main.js`, and Developer Mode hot-reloads on
save:

```bash
npm run dev        # esbuild --watch
```

A pure code change re-spawns your plugin with the same grants (no re-consent). If you
change the permissions in `manifest.json`, Altretta re-asks for consent.

> **Bundle rule:** `dist/main.js` is evaluated as a plain script in the sandbox, so it
> must have no top-level `export`/`import`. Keep this entry export-free; if you split
> code into another module for testing, let esbuild inline it.

## Permissions

Each `akashi.*` API maps to one permission you declare in `manifest.json`. This starter
declares and uses exactly:

| Permission    | API it unlocks                                  |
| ------------- | ----------------------------------------------- |
| `ReadNotes`   | `akashi.vault.read` / `akashi.vault.list`       |
| `AddCommands` | `akashi.addCommand`                             |
| `RenderPanel` | `akashi.registerView` / `akashi.views.update`   |

Other capabilities you can request: `WriteNotes` (`vault.write`), `ReadGraph`
(`graph.query`), `AddSlashItems` (`addSlashItem`), `Storage` (`storage.get/set`), and
network as an object `{ "NetworkTo": "api.example.com" }` (`net.fetch` to that host),
placed in the same `permissions` array. Declare only what you use; `akashi-plugin pack`
warns about mismatches.

> `author_pubkey_hex` and `author_fingerprint` are intentionally empty here. They are
> filled from your signing key when you `pack`. Never write them by hand.

## Package & sign

Two ways, both first-class. Pick whichever fits.

**In the terminal (npm scripts).** The `akashi-plugin` CLI installed with your dev
dependencies. Generate an author key once, then pack a signed `.akplugin`:

```bash
npm run keygen     # once: writes author.key
npm run pack       # builds, then signs into __PLUGIN_SLUG__.akplugin (deny-warnings)
npm run verify     # shows author_ok: true when the package is intact
```

Those scripts call `akashi-plugin` from `node_modules/.bin`, so no global install is
needed. You can also invoke it directly with `npx @apilium/altretta-plugin pack . --key
author.key --out __PLUGIN_SLUG__.akplugin --deny-warnings`.

`pack` validates the manifest, signs it with your key, and produces a tamper-evident
package; `verify` shows `author_ok: true` when it is intact. Keep `author.key` secret
(it is git-ignored). Losing it means you cannot ship updates under the same identity.

**In Altretta, no terminal.** Open **Plugins → Developer Mode → Package & sign**. Altretta
creates your author identity once, packs, verifies, and saves the `.akplugin` for you.
It is the same signing engine and enforces the same strict lint.

## Publish

Share the signed `.akplugin` so others can install it from file, or submit it to the
[Altretta plugins catalog](https://github.com/ApiliumCode/altretta-plugins). For the
**Verified** badge, submit it for Apilium review; a counter-signature is added after
review.

## Learn more

Full authoring guide:
<https://github.com/ApiliumCode/altretta-plugins/blob/main/AUTHORING.md>
