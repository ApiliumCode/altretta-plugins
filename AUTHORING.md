# Write your first Altretta plugin

The whole route, copy-paste-able: start from the reference plugin, run it live in
**Developer Mode**, declare the permissions it needs, then sign and ship it. Once Altretta
and Node are installed, the first run takes a few minutes.

An Altretta plugin is a single JavaScript entry file plus a `manifest.json`. It runs in a
hardened sandbox (a frozen [SES](https://github.com/endojs/endo) compartment inside a
worker) with **zero ambient authority**: no DOM, no direct network, no filesystem. Its
only connection to the app is one injected global, `akashi`, and every call it makes is
checked against the permissions you declared and the user consented to.

**Prerequisites**

- **Altretta** with **Developer Mode** (Plugins → Developer Mode), which ships in Altretta
  0.5.0 and later.
- **Node.js 18+** and npm.

## 1. Start a plugin

**Scaffold one (fastest):**

```bash
npm create @apilium/altretta-plugin my-plugin
cd my-plugin
```

It writes the project below with your `id` and `name` already filled in: a command, a
live side panel, least-privilege permissions, and an esbuild build.

**Or copy the reference plugin** to learn from a full, real one. `task-dashboard/` is
annotated end to end:

```bash
# any OS; on PowerShell: Copy-Item -Recurse task-dashboard my-plugin
cp -r task-dashboard my-plugin
cd my-plugin
```

If you copy it, rename three things so it does not collide with the first-party plugin:

1. `manifest.json` → `id` to your own reverse-DNS (e.g. `com.you.my-plugin`; the
   `com.apilium.*` namespace is reserved for first-party plugins), plus `name`,
   `description`, and `author_name`.
2. `src/dashboard.js` → the `VIEW_ID` constant to match your new id
   (`com.you.my-plugin:panel`). A view id must be namespaced by your plugin id.
3. Edit `src/` for what your plugin does.

Either way, the project looks like this:

```
my-plugin/
├─ manifest.json      # identity + declared permissions
├─ src/
│  └─ main.js         # entry: no top-level export; the bundler inlines the rest
├─ package.json       # esbuild build/dev scripts
├─ README.md
└─ .gitignore
```

The reference plugin adds `src/dashboard.js` (exported, testable host wiring) and
`src/tasks.js` (pure logic, unit-tested) plus a `test/` folder, showing how to split
code while keeping the entry export-free.

Build the bundle the manifest points at (`dist/main.js`):

```bash
npm install
npm run build
```

> **Bundle rule:** the entry is evaluated as a plain **script** inside the SES
> compartment, so the built `dist/main.js` must have **no top-level `export`/`import`**.
> Keep exported/testable code in a separate module and let the bundler inline it into an
> export-free entry. Break this rule and the plugin fails to load with a `SyntaxError`
> about `export` in the worker.

## 2. Run it in Developer Mode

Developer Mode loads an **unsigned** plugin folder so you can iterate without signing on
every change. It changes exactly one thing versus a real install: no signature is
required. Everything else is identical: same sandbox, same granular consent, same
per-call permission checks, same audit. A dev plugin is clearly marked `DEV`, never
counts as Verified, and never runs under strict or safe mode. **No CLI is needed for this
loop.**

1. Open **Altretta → Plugins → Developer Mode** and enable it.
2. Click **Load plugin folder** and pick your `my-plugin` directory.
3. Review the permissions in the consent dialog and **grant** them. Your plugin runs, and
   its panel appears (the reference plugin shows one titled **Tasks**).

### Hot-reload

Run the watcher and edit `src/`, and Altretta re-spawns the plugin on save:

```bash
npm run dev        # esbuild --watch, rebuilds dist/main.js on every edit
```

A pure code change reloads with the same grants (no re-consent). Change the
`permissions` in `manifest.json` and Altretta asks for consent again.

### If it didn't work

- **No Developer Mode section** in Plugins → you are on an Altretta older than 0.5.0.
- **Load fails or nothing appears** → run `npm run build` first. `dist/main.js` is
  git-ignored, so a fresh copy or clone has no bundle until you build it.
- **The plugin errors at load with a `SyntaxError` about `export`** → your bundle has a
  top-level `export`/`import`. See the bundle rule above; move exported code into a
  separate module so the entry is export-free.
- **The panel is empty** → your view's `onShow` handler must call `akashi.views.update`
  with a tree. See "Rendering a panel" below.

## 3. The `akashi` API

Everything a plugin can do goes through the injected `akashi` global. Each method is
async unless noted, and each maps to exactly one permission you must declare.

| API call | Permission | What it does |
| --- | --- | --- |
| `akashi.addCommand({id,title,run})` | `AddCommands` | Add a command to the palette |
| `akashi.addSlashItem({id,title,run})` | `AddSlashItems` | Add a `/` menu item |
| `akashi.registerView({id,title,icon,onShow,onEvent})` | `RenderPanel` | Register a side panel + its handlers |
| `akashi.views.update(viewId, tree)` | `RenderPanel` | Push a UI tree to your panel |
| `akashi.vault.read(path)` / `list(path?)` | `ReadNotes` | Read a note / list note paths |
| `akashi.vault.write(path, content)` | `WriteNotes` | Create/modify a note |
| `akashi.graph.query(query)` | `ReadGraph` | Query the knowledge graph |
| `akashi.storage.get(key)` / `set(key, value)` | `Storage` | Your plugin's private data |
| `akashi.net.fetch(url, opts?)` | `NetworkTo` (declared host) | Fetch from a host you declared |
| `akashi.on(event, cb)` | *(not gated)* | Observe lifecycle events (`note-open`, `note-save`, `note-rename`) |

### Rendering a panel

A plugin never touches the DOM. It **pushes a structured tree** and the host renders it
with real, sanitized Altretta components; interactions come back keyed by a node `id`
(never a function). The view id **must be namespaced by your plugin id** (`com.you.my-plugin:panel`).

```js
'use strict';
const VIEW_ID = 'com.you.my-plugin:panel';

akashi.registerView({
  id: VIEW_ID,
  title: 'My Panel',
  onShow: render,                 // panel became visible
  onEvent: (nodeId, event, value) => { /* a control fired */ },
});

async function render() {
  await akashi.views.update(VIEW_ID, {
    type: 'stack', direction: 'col', gap: 8,
    children: [
      { type: 'heading', level: 3, text: 'Hello' },
      { type: 'checkbox', id: 'c1', checked: false, label: 'A task' },
    ],
  });
}
```

The component set is a closed, sanitized allowlist: `text`, `heading`, `button`,
`input`, `select`, `checkbox`, `list`, `stack`, `markdown`, `divider`, `link`. Text is
escaped; markdown is sanitized and cannot load external resources; only `http(s)` links
are allowed. You cannot smuggle a `<script>`, an `<iframe>`, or an off-allowlist image.

## 4. Declare permissions

`manifest.json` lists exactly the capabilities your code uses, in `permissions`. Declare
the least you need. The consent dialog shows each one in plain language, and
`akashi-plugin pack` warns about any mismatch (a call whose permission you forgot, or a
permission you declared but never use).

```json
{
  "id": "com.you.my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "author_pubkey_hex": "",
  "author_fingerprint": "",
  "akashi_min_version": "0.5.0",
  "entry": "dist/main.js",
  "description": "What it does, in one line.",
  "author_name": "You",
  "license": "MIT",
  "permissions": ["ReadNotes", "AddCommands", "RenderPanel"]
}
```

Most permissions are bare strings. Network is the exception: it is an object naming one
allowed host, and it sits in the same `permissions` array alongside the strings:

```json
"permissions": ["ReadNotes", "WriteNotes", { "NetworkTo": "api.example.com" }]
```

Field notes:

- `id` is **reverse-DNS** (`com.you.my-plugin`): lowercase, dot-separated, dashes allowed
  after the first label. It must be globally unique; `com.apilium.*` is reserved.
- `author_pubkey_hex` and `author_fingerprint` stay **empty** while you author; they are
  injected from your signing key at `pack` time. Never write them by hand.
- `entry` is a safe relative path inside the folder (no `..`, no absolute path).
- One `NetworkTo` entry per host. Declare each host your plugin fetches from.

## 5. Sign and package

Developer Mode (step 2) already runs your plugin. To ship a signed `.akplugin` that
others can install and that can earn the Verified badge, sign it. Two ways, both
first-class, both enforcing the same strict lint and producing the same signed format.

**In the terminal (the `akashi-plugin` CLI on npm).** A scaffolded project wires it as a
dev dependency, so after `npm install` these scripts work with no global install and no
Rust:

```bash
npm run keygen     # once: writes author.key
npm run pack       # builds, then signs my-plugin.akplugin (deny-warnings)
npm run verify     # shows author_ok: true
```

You can also call it anywhere with `npx @apilium/altretta-plugin`, which is what the
scripts run under the hood:

```bash
npx @apilium/altretta-plugin keygen --out author.key
npm run build
npx @apilium/altretta-plugin pack . --key author.key --out my-plugin.akplugin --deny-warnings
npx @apilium/altretta-plugin verify my-plugin.akplugin
```

**In Altretta, no terminal.** Open **Plugins → Developer Mode → Package & sign**. Altretta
creates your author identity once, packs, verifies, and saves the `.akplugin` for you.

`pack` validates the manifest, hashes `dist/main.js`, injects your public key +
fingerprint, and signs the whole package. On success it prints the bytes written:

```
wrote 7912 bytes to my-plugin.akplugin
```

`verify` re-checks the signature against the bytes and prints the identity:

```
id:          com.you.my-plugin
author:      You (04a7-8853-b257-66f6)
author_ok:   true
verified:    false   (Apilium counter-signature, applied at review time)
revoked:     false
```

`author_ok: true` means the package is intact and signed by your key. `--deny-warnings`
makes any lint warning (ambient globals, permission/usage mismatch) fatal; keep it on.
Keep `author.key` secret and backed up: it is your identity. Losing it means you cannot
ship updates as the same author.

## 6. Publish

Share the signed `.akplugin` directly (users install it from file), or open a pull
request against this repo to add it to the catalog.

To earn the **Verified by Apilium** badge, submit your `.akplugin` for review. After
review, Apilium counter-signs the *exact* bytes you signed with its pinned key and ships
that signature alongside your package; Altretta then shows Verified. You never share your
private key, and the counter-signature does not change your plugin; it only attests that
Apilium reviewed it. A signed plugin can also be **revoked** (an author key compromise, a
malicious build): Altretta honors a signed revocation list and disables it everywhere,
with anti-downgrade protection.

## Why this matters

This is what lets a user trust the whole shelf. An Altretta plugin proves, by construction,
that it can only do what the user granted, and if it ever turns out to be bad it can be
revoked everywhere. That trust starts with your `manifest.json` declaring exactly what
your code touches. Declare the truth, keep the lint clean, and the platform carries the
rest.
