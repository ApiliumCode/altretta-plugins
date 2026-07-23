# @apilium/altretta-plugin

The `akashi-plugin` author CLI on npm: generate a signing key, pack a plugin folder
into a signed `.akplugin`, and verify it. No Rust toolchain, no global install.

```bash
npx @apilium/altretta-plugin keygen --out author.key
npx @apilium/altretta-plugin pack . --key author.key --out my-plugin.akplugin --deny-warnings
npx @apilium/altretta-plugin verify my-plugin.akplugin
```

## What it is

This is a thin launcher. It ships **no** binary itself. Each supported platform has a
companion package (`@apilium/altretta-plugin-<os>-<arch>`) that carries a prebuilt native
`akashi-plugin` binary. They are declared as `optionalDependencies`, so `npm install`
fetches only the one that matches your machine. At run time the launcher resolves that
binary and execs it, passing your arguments straight through and exiting with its status.

This is the same distribution model esbuild and Biome use: no `postinstall` script, no
network at run time, resolution happens when you invoke the command.

Supported platforms:

| Platform | Package |
| --- | --- |
| macOS (Apple Silicon) | `@apilium/altretta-plugin-darwin-arm64` |
| macOS (Intel) | `@apilium/altretta-plugin-darwin-x64` |
| Linux (x64) | `@apilium/altretta-plugin-linux-x64` |
| Windows (x64) | `@apilium/altretta-plugin-win32-x64` |

On an unsupported platform the launcher prints a clear message naming the
`<platform>-<arch>` combo and how to request it.

## In a scaffolded plugin

`@apilium/create-altretta-plugin` adds this package as a `devDependency` and wires the
`keygen` / `pack` / `verify` scripts, so in a fresh plugin project you can just run:

```bash
npm install
npm run keygen     # once: creates author.key
npm run pack       # builds, then signs into <slug>.akplugin (deny-warnings)
npm run verify     # confirms author_ok: true
```

The CLI resolves from `node_modules/.bin/akashi-plugin` after `npm install`. No global
install is required.

## Also built into Altretta

The same signing engine is built into the Altretta desktop app. If you prefer no terminal,
use **Package & sign** in Altretta Developer Mode: it creates your author identity once,
packs, verifies, and saves a `.akplugin` for you.

## License

Apache-2.0 OR Commercial.
