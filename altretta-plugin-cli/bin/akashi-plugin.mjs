#!/usr/bin/env node
// Copyright 2019-2026 Apilium Technologies OU. All rights reserved.
// SPDX-License-Identifier: Apache-2.0 OR Commercial

/**
 * @apilium/altretta-plugin — thin cross-platform launcher for the `akashi-plugin`
 * author CLI (sign + package Altretta plugins).
 *
 * This package ships no binary. It declares each `@apilium/altretta-plugin-<os>-<arch>`
 * platform package as an optional dependency; npm installs only the one that matches
 * the host. At run time we resolve that package's prebuilt binary and exec it,
 * passing our argv straight through and exiting with its status. No postinstall,
 * no network, no Rust toolchain (the esbuild / @biomejs model).
 */

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { resolveBinary } from "../lib/resolve.mjs";

const require = createRequire(import.meta.url);

function main() {
  let pkg, binName;
  try {
    ({ pkg, binName } = resolveBinary(process.platform, process.arch));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  let binPath;
  try {
    // The platform package ships the binary at `<pkg>/bin/<binName>`.
    binPath = require.resolve(`${pkg}/bin/${binName}`);
  } catch {
    process.stderr.write(
      `akashi-plugin: the platform binary was not found.\n` +
        `Expected optional dependency "${pkg}" to be installed for ` +
        `${process.platform}-${process.arch}.\n` +
        `Try reinstalling (npm install) so the matching platform package is fetched. ` +
        `If it persists, file an issue at ` +
        `https://github.com/ApiliumCode/altretta-plugins/issues.\n`,
    );
    process.exit(1);
  }

  try {
    execFileSync(binPath, process.argv.slice(2), { stdio: "inherit" });
  } catch (err) {
    // The child ran but exited non-zero: mirror its status, no extra noise.
    if (typeof err.status === "number") process.exit(err.status);
    // Could not spawn the binary at all (e.g. not executable): report + fail.
    process.stderr.write(
      `akashi-plugin: failed to run the platform binary at ${binPath}: ` +
        `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}

main();
