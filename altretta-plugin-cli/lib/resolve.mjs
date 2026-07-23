// Copyright 2019-2026 Apilium Technologies OU. All rights reserved.
// SPDX-License-Identifier: Apache-2.0 OR Commercial

/**
 * Pure platform -> package resolver for the @apilium/altretta-plugin wrapper.
 *
 * The wrapper ships no binary itself. Each supported platform has an optional
 * dependency `@apilium/altretta-plugin-<os>-<arch>` that carries the matching
 * prebuilt `akashi-plugin` binary under `bin/`. `resolveBinary` maps Node's
 * `process.platform` + `process.arch` to that package name and the binary's
 * filename (`.exe` on Windows) so the shim can `require.resolve` it.
 *
 * This is the esbuild / @biomejs distribution model: no postinstall, resolution
 * happens at run time, and npm installs only the platform package that matches.
 */

/** The four platforms we build in CI (.github/workflows/altretta-plugin-cli.yml). */
const SUPPORTED = {
  "darwin-arm64": "@apilium/altretta-plugin-darwin-arm64",
  "darwin-x64": "@apilium/altretta-plugin-darwin-x64",
  "linux-x64": "@apilium/altretta-plugin-linux-x64",
  "win32-x64": "@apilium/altretta-plugin-win32-x64",
};

/**
 * Resolve the platform package + binary filename for a given platform/arch.
 * Pure: no filesystem, no `require.resolve` (the shim does that with the result).
 *
 * @param {string} platform - e.g. `process.platform` ("darwin"|"linux"|"win32").
 * @param {string} arch - e.g. `process.arch` ("arm64"|"x64").
 * @returns {{ pkg: string, binName: string }}
 * @throws {Error} naming the `${platform}-${arch}` combo when unsupported.
 */
export function resolveBinary(platform, arch) {
  const key = `${platform}-${arch}`;
  const pkg = SUPPORTED[key];
  if (!pkg) {
    const known = Object.keys(SUPPORTED).join(", ");
    throw new Error(
      `akashi-plugin: unsupported platform "${key}". ` +
        `Prebuilt binaries exist for: ${known}. ` +
        `Please file an issue at https://github.com/ApiliumCode/altretta-plugins/issues ` +
        `so we can add ${key}.`,
    );
  }
  const binName = platform === "win32" ? "akashi-plugin.exe" : "akashi-plugin";
  return { pkg, binName };
}
