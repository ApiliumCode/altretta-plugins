#!/usr/bin/env node
// Copyright 2019-2026 Apilium Technologies OU. All rights reserved.
// SPDX-License-Identifier: Apache-2.0 OR Commercial

/**
 * fetch-and-assemble — one command to turn a published `cli-v<version>` GitHub
 * Release into ready-to-publish npm platform packages.
 *
 * It downloads the per-platform archives the CI attached to the Release
 * (`akashi-plugin-<os>-<arch>.tar.gz` / `.zip`), unpacks each into the layout
 * `assemble-platform-packages.mjs` expects (`<work>/akashi-plugin-<os>-<arch>/<bin>`),
 * runs the assembler to fill `npm/<os>-<arch>/bin/` + stamp the version everywhere,
 * and prints the exact ordered `npm publish` sequence (which needs your npm OTP).
 *
 * USAGE
 *   node scripts/fetch-and-assemble.mjs [--version 0.1.0] [--repo ApiliumCode/akashi] [--work <dir>]
 *
 *   --version <v>   CLI version; the Release tag is `cli-v<version>`. Default 0.1.0.
 *   --repo <o/r>    GitHub repo holding the Release. Default ApiliumCode/akashi.
 *   --work <dir>    Scratch dir for downloads + unpacked binaries. Default a temp dir.
 *
 * Requires the `gh` CLI (authenticated) and `tar` on PATH; `.zip` is unpacked via
 * `unzip`, falling back to PowerShell `Expand-Archive` (Windows) or `tar -xf`.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.join(HERE, "..");

/** Platforms + the Release asset that carries each one. Mirrors the CI + assembler. */
const PLATFORMS = [
  { key: "darwin-arm64", asset: "akashi-plugin-darwin-arm64.tar.gz", kind: "tar" },
  { key: "darwin-x64", asset: "akashi-plugin-darwin-x64.tar.gz", kind: "tar" },
  { key: "linux-x64", asset: "akashi-plugin-linux-x64.tar.gz", kind: "tar" },
  { key: "win32-x64", asset: "akashi-plugin-win32-x64.zip", kind: "zip" },
];

function parseArgs(argv) {
  const opts = { version: "0.1.0", repo: "ApiliumCode/akashi", work: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version") opts.version = argv[++i];
    else if (a === "--repo") opts.repo = argv[++i];
    else if (a === "--work") opts.work = argv[++i];
    else if (a.startsWith("--version=")) opts.version = a.slice(10);
    else if (a.startsWith("--repo=")) opts.repo = a.slice(7);
    else if (a.startsWith("--work=")) opts.work = a.slice(7);
  }
  return opts;
}

/** Run a command, inheriting stdio; return true on exit 0. */
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd });
  return r.status === 0;
}

/** Unpack a downloaded archive into destDir (created). Returns true on success. */
function unpack(archive, kind, destDir) {
  if (kind === "tar") return run("tar", ["-xzf", archive, "-C", destDir]);
  // zip: prefer unzip, then Windows Expand-Archive, then bsdtar (`tar -xf`).
  if (run("unzip", ["-o", archive, "-d", destDir])) return true;
  if (process.platform === "win32") {
    return run("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Force -LiteralPath '${archive}' -DestinationPath '${destDir}'`,
    ]);
  }
  return run("tar", ["-xf", archive, "-C", destDir]);
}

async function main(argv) {
  const opts = parseArgs(argv);
  const tag = `cli-v${opts.version}`;
  const work = opts.work
    ? path.resolve(opts.work)
    : await fs.mkdtemp(path.join(os.tmpdir(), "akcli-"));
  const dl = path.join(work, "dl");
  const artifacts = path.join(work, "artifacts");
  await fs.mkdir(dl, { recursive: true });
  await fs.mkdir(artifacts, { recursive: true });

  console.log(`Fetching Release ${tag} from ${opts.repo} into ${dl}`);
  if (!run("gh", ["release", "download", tag, "--repo", opts.repo, "--dir", dl, "--clobber"])) {
    console.error(`error: gh release download failed for ${tag}. Is the CI build done + the Release published?`);
    return 1;
  }

  for (const p of PLATFORMS) {
    const archive = path.join(dl, p.asset);
    try {
      await fs.access(archive);
    } catch {
      console.error(`error: missing Release asset ${p.asset} — the ${p.key} build may have failed.`);
      return 1;
    }
    const dest = path.join(artifacts, `akashi-plugin-${p.key}`);
    await fs.mkdir(dest, { recursive: true });
    if (!unpack(archive, p.kind, dest)) {
      console.error(`error: could not unpack ${p.asset}`);
      return 1;
    }
    console.log(`  unpacked ${p.key}`);
  }

  console.log("Assembling platform packages + stamping version...");
  if (
    !run(
      process.execPath,
      [path.join(CLI_ROOT, "scripts", "assemble-platform-packages.mjs"), "--version", opts.version, "--artifacts", artifacts],
      CLI_ROOT,
    )
  ) {
    console.error("error: assemble step failed");
    return 1;
  }

  const rel = path.relative(process.cwd(), CLI_ROOT) || ".";
  console.log(`
Ready to publish. From ${rel} run, in this order (each needs your npm OTP):

  npm publish ./npm/darwin-arm64 --access public --otp <code>
  npm publish ./npm/darwin-x64   --access public --otp <code>
  npm publish ./npm/linux-x64    --access public --otp <code>
  npm publish ./npm/win32-x64    --access public --otp <code>
  npm publish .                  --access public --otp <code>   # the wrapper, LAST

Then bump + republish the scaffold so new plugins pull the CLI:
  (in tools/create-altretta-plugin) bump version, npm publish --access public --otp <code>

Binaries are gitignored (npm/*/bin/); nothing here is committed.
`);
  return 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
