#!/usr/bin/env node
// Copyright 2019-2026 Apilium Technologies OU. All rights reserved.
// SPDX-License-Identifier: Apache-2.0 OR Commercial

/**
 * assemble-platform-packages — CI publish input for @apilium/altretta-plugin.
 *
 * Given the built binaries + a version, this fills each `npm/<os>-<arch>/` folder
 * with its native binary under `bin/` and stamps the version onto:
 *   - each platform package.json (`npm/<os>-<arch>/package.json`)
 *   - the wrapper package.json (`package.json`), including every
 *     `optionalDependencies` entry, so the wrapper + platform packages publish at
 *     the same version.
 *
 * After running, publish with (per package, `--access public`; the `./` matters so
 * npm treats it as a folder, not a package spec):
 *   npm publish ./npm/darwin-arm64  npm publish ./npm/darwin-x64
 *   npm publish ./npm/linux-x64     npm publish ./npm/win32-x64
 *   npm publish .                   # the wrapper, last
 *
 * USAGE
 *   node scripts/assemble-platform-packages.mjs --version 0.1.0 --artifacts <dir>
 *
 *   --version <v>     the version to stamp on every package (required).
 *   --artifacts <d>   directory holding one subfolder per platform named
 *                     `akashi-plugin-<os>-<arch>` (as produced by the CI
 *                     upload-artifact step), each containing the binary. Required
 *                     unless every platform binary already sits in its bin/ folder.
 *   --only <os-arch>  assemble only this platform (repeatable). Default: all four.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

/** The platforms we ship — must match lib/resolve.mjs and the CI matrix. */
const PLATFORMS = [
  { key: "darwin-arm64", binName: "akashi-plugin" },
  { key: "darwin-x64", binName: "akashi-plugin" },
  { key: "linux-x64", binName: "akashi-plugin" },
  { key: "win32-x64", binName: "akashi-plugin.exe" },
];

function parseArgs(argv) {
  const opts = { version: undefined, artifacts: undefined, only: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version") opts.version = argv[++i];
    else if (a === "--artifacts") opts.artifacts = argv[++i];
    else if (a === "--only") opts.only.push(argv[++i]);
    else if (a.startsWith("--version=")) opts.version = a.slice(10);
    else if (a.startsWith("--artifacts=")) opts.artifacts = a.slice(12);
    else if (a.startsWith("--only=")) opts.only.push(a.slice(7));
  }
  return opts;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2) + "\n");
}

/** Copy the binary for one platform into npm/<key>/bin and stamp its version. */
async function assemblePlatform(platform, version, artifactsDir) {
  const { key, binName } = platform;
  const pkgDir = path.join(ROOT, "npm", key);
  const binDir = path.join(pkgDir, "bin");
  await fs.mkdir(binDir, { recursive: true });

  if (artifactsDir) {
    const src = path.join(artifactsDir, `akashi-plugin-${key}`, binName);
    const dest = path.join(binDir, binName);
    await fs.copyFile(src, dest);
    if (!binName.endsWith(".exe")) await fs.chmod(dest, 0o755);
    console.log(`  ${key}: copied ${binName}`);
  } else {
    // No artifacts dir: the caller pre-placed the binary; just verify it exists.
    await fs.access(path.join(binDir, binName));
    console.log(`  ${key}: using existing ${binName}`);
  }

  const pkgFile = path.join(pkgDir, "package.json");
  const pkg = await readJson(pkgFile);
  pkg.version = version;
  await writeJson(pkgFile, pkg);
}

/** Stamp the wrapper version + every optionalDependencies entry. */
async function stampWrapper(version) {
  const pkgFile = path.join(ROOT, "package.json");
  const pkg = await readJson(pkgFile);
  pkg.version = version;
  for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
    pkg.optionalDependencies[dep] = version;
  }
  await writeJson(pkgFile, pkg);
  console.log(`  wrapper: stamped ${version}`);
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.version) {
    process.stderr.write("error: --version <x.y.z> is required\n");
    return 1;
  }
  const targets = opts.only.length
    ? PLATFORMS.filter((p) => opts.only.includes(p.key))
    : PLATFORMS;
  if (targets.length === 0) {
    process.stderr.write(`error: --only did not match any platform (${opts.only.join(", ")})\n`);
    return 1;
  }

  console.log(`Assembling @apilium/altretta-plugin ${opts.version}`);
  for (const platform of targets) {
    await assemblePlatform(platform, opts.version, opts.artifacts);
  }
  await stampWrapper(opts.version);
  console.log("Done. Publish each npm/<os-arch> package, then the wrapper.");
  return 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
