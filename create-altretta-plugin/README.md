# @apilium/create-altretta-plugin

Scaffold a new [Altretta](https://apilium.com) plugin in one command.

```bash
npm create @apilium/altretta-plugin my-plugin
```

You get a runnable project: a `manifest.json` that declares its permissions, a
commented `src/main.js` that adds a command and renders a live side panel, and an
esbuild build. Load it in **Altretta → Plugins → Developer Mode → Load plugin folder**,
consent to its permissions, and it runs, fully sandboxed. Edit `src/main.js` and it
hot-reloads.

## Usage

```bash
# interactive (prompts for name, author, id)
npm create @apilium/altretta-plugin my-plugin

# non-interactive / with flags (npx passes flags straight through)
npx @apilium/create-altretta-plugin my-plugin --id com.you.my-plugin --author "You" --yes
```

| Flag | Meaning |
| --- | --- |
| `<name>` | Display name, folder, and npm name. Prompted if omitted. |
| `--id` | Reverse-DNS plugin id (e.g. `com.you.my-plugin`). Derived from name + author if omitted. |
| `--author` | Your author name. Prompted if omitted. |
| `--dir` | Parent directory to create the project in (default: current directory). |
| `--yes`, `-y` | Skip prompts; use defaults for anything not passed as a flag. |

The scaffolder is pure Node (no dependencies) and touches only the filesystem. The
generated project's only dependency is esbuild, installed with `npm install`.

## What next

`cd` into the project, `npm install`, `npm run build`, then load it in Altretta
Developer Mode. When it works, sign it two ways, both first-class:

- **In the terminal:** `npm run keygen` once, then `npm run pack` and `npm run verify`.
  The scaffold wires the `@apilium/altretta-plugin` CLI as a dev dependency, so these
  work with no global install and no Rust (or call `npx @apilium/altretta-plugin`
  directly).
- **In Altretta, no terminal:** Plugins → Developer Mode → **Package & sign**. Same
  signing engine, same strict lint, saves the `.akplugin` for you.

Then share the `.akplugin`.

Full authoring guide:
<https://github.com/ApiliumCode/altretta-plugins/blob/main/AUTHORING.md>

## Why Altretta plugins

Every Altretta plugin is signed, sandboxed, and permission-scoped: it runs in a frozen
SES compartment with no ambient authority, and its only egress is the `akashi` API,
checked against the permissions the user granted. A plugin cannot touch anything it did
not declare and the user did not approve.

## License

Apache-2.0 OR Commercial.
