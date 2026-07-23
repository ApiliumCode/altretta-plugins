<p align="center">
  <img src="assets/altretta-logo.svg" width="72" height="72" alt="Altretta" />
</p>

<h1 align="center">Altretta Plugins</h1>

<p align="center">
  <b>Plugins that can't betray you.</b><br />
  The official catalog of first-party and community plugins for
  <a href="https://apilium.com">Altretta</a>. Every one is <b>signed, sandboxed, and
  permission-scoped</b>. Grant a plugin <code>ReadNotes</code> and it cannot phone
  home, read a second vault, or touch anything you didn't approve.
</p>

<p align="center">
  <img alt="Ecosystem: Altretta" src="https://img.shields.io/badge/ecosystem-Altretta-6366F1?style=flat-square" />
  <img alt="Every plugin: signed · sandboxed · scoped" src="https://img.shields.io/badge/every%20plugin-signed%20%C2%B7%20sandboxed%20%C2%B7%20scoped-475569?style=flat-square" />
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-8b949e?style=flat-square" />
</p>

---

## Safe by construction

You grant a plugin exactly what you see, and it cannot do more. Not by policy. By design.

Every plugin runs in a hardened sandbox: a frozen [SES](https://github.com/endojs/endo)
compartment inside a worker, with no DOM, no network, and no filesystem. Its only way to
reach the app is one injected `akashi` object, and every call goes through a permission
check the host enforces and the native layer re-checks. A plugin has no path to anything
you did not grant.

That is four guarantees, not a promise:

- **Signed.** Every plugin carries an author signature over its exact code and manifest.
  Change one byte and it stops verifying.
- **Verifiable.** Apilium reviews a plugin and counter-signs the same bytes for the
  Verified badge, without ever seeing the author's private key.
- **Revocable.** A compromised or malicious plugin is disabled everywhere through a
  signed revocation list, with anti-downgrade protection.
- **Scoped.** Grant a note formatter `ReadNotes` and `WriteNotes` and it can never open a
  socket. The permissions you see are the whole contract.

And plugins run on a substrate that remembers: every write is a signed step in Altretta's
action graph, so what a plugin changed is provenance-tracked, reversible, and
tamper-evident. Automation you can audit after the fact.

## Build your own plugin

A plugin is one JavaScript file plus a `manifest.json`. Once Altretta and Node are
installed, you can have your own plugin running live in a few minutes.

**Prerequisites**

- **Altretta** with **Developer Mode** (Plugins → Developer Mode). Developer Mode ships in
  Altretta 0.5.0 and later.
- **Node.js 18+** and npm (to bundle the plugin).

**Scaffold one (fastest):**

```bash
npm create @apilium/altretta-plugin my-plugin
cd my-plugin
npm install
npm run build
```

This writes a project with your `id` and `name` already set: a command, a live side
panel, least-privilege permissions, and an esbuild build.

**Or copy the reference plugin** to learn from a full, real one. `task-dashboard/` is
annotated end to end:

```bash
# any OS; on PowerShell: Copy-Item -Recurse task-dashboard my-plugin
cp -r task-dashboard my-plugin
cd my-plugin && npm install && npm run build
```

If you copy it, rename three things so it does not collide with the first-party plugin:
`manifest.json` `id` (your own reverse-DNS; `com.apilium.*` is reserved), `name`, and the
`VIEW_ID` constant in `src/dashboard.js`. Then `npm run build` again.

Then, in Altretta:

1. **Plugins → Developer Mode** → turn it on.
2. **Load plugin folder** → pick `my-plugin`. Review the permissions and consent.
3. Your plugin runs, fully sandboxed. You should see its panel (the reference plugin
   shows one titled **Tasks**). Edit `src/` and it hot-reloads.

Developer Mode loads your **unsigned** folder so you can iterate without signing on
every change. It changes exactly one thing versus a real install: no signature is
required. Same sandbox, same consent, same per-call permission checks. No CLI needed for
this loop.

When it works, sign it two ways, both first-class (see [AUTHORING.md](AUTHORING.md)
step 5): `npm run pack` / `npx @apilium/altretta-plugin` in the terminal (no global
install, no Rust), or **Package & sign** in Altretta Developer Mode with no terminal at
all.

**Full walkthrough (the `akashi` API surface, the permission model, troubleshooting, and
the Verified path) is in [AUTHORING.md](AUTHORING.md).**

## The `akashi` API in one glance

| You call | Permission | It does |
| --- | --- | --- |
| `akashi.addCommand(...)` | `AddCommands` | Add a command to the palette |
| `akashi.addSlashItem(...)` | `AddSlashItems` | Add a `/` menu item |
| `akashi.registerView(...)` + `akashi.views.update(...)` | `RenderPanel` | Render a side panel |
| `akashi.vault.read` / `list` | `ReadNotes` | Read notes |
| `akashi.vault.write` | `WriteNotes` | Create/modify a note |
| `akashi.graph.query` | `ReadGraph` | Query the knowledge graph |
| `akashi.storage.get` / `set` | `Storage` | Your plugin's private storage |
| `akashi.net.fetch(url)` | `NetworkTo` (declared host) | Fetch from a host you declared |
| `akashi.on(event, cb)` | *(not gated)* | Observe lifecycle events (`note-open`, `note-save`, `note-rename`) |

## Catalog

| Plugin | What it does | Permissions |
| --- | --- | --- |
| [**Task Dashboard**](task-dashboard/) | Every `- [ ]` in your vault, in one panel. Tick it, it writes back to the note. **The annotated reference: copy it to start your own.** | `ReadNotes` `WriteNotes` `RenderPanel` |

More first-party plugins land here as the ecosystem grows. Community submissions are
welcome; see below.

Catalog index: `catalog.json` is generated by `scripts/build-catalog.mjs`; the hub ingests it.

## Contributing

1. Build your plugin (start from `task-dashboard/`).
2. Make sure `npx @apilium/altretta-plugin pack . --deny-warnings` (or `npm run pack` in a
   scaffolded project, or Package & sign in Developer Mode) is clean and `verify` shows
   `author_ok: true`.
3. Open a pull request adding your plugin folder and a catalog row.
4. To earn the **Verified by Apilium** badge, submit it for review. Apilium
   counter-signs the exact bytes you signed, without ever seeing your private key.

Every plugin here is expected to declare the least permissions it needs and to pass a
clean lint. That is the deal that lets a user trust the whole shelf.

## License

MIT. See [LICENSE](LICENSE). Individual plugins may carry their own license; check
each plugin folder.
