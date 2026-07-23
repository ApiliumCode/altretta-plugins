// Copyright 2019-2026 Apilium Technologies OU. All rights reserved.
// SPDX-License-Identifier: Apache-2.0 OR Commercial

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold, deriveId, slugify, parseArgs } from "../index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "index.mjs");

async function tmpParent() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "cap-test-"));
}

// Reverse-DNS rule mirrored from akashi_core::plugin_pack::validate_manifest.
const ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

// The permission each gated akashi.* call requires (mirrors plugin_pack's usage table).
const USAGE = [
  ["akashi.addCommand", "AddCommands"],
  ["akashi.addSlashItem", "AddSlashItems"],
  ["akashi.registerView", "RenderPanel"],
  ["akashi.views.update", "RenderPanel"],
  ["akashi.vault.read", "ReadNotes"],
  ["akashi.vault.list", "ReadNotes"],
  ["akashi.vault.write", "WriteNotes"],
  ["akashi.graph.query", "ReadGraph"],
  ["akashi.storage.get", "Storage"],
  ["akashi.storage.set", "Storage"],
  ["akashi.net.fetch", "NetworkTo"],
];

const AMBIENT_DENYLIST = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "window",
  "document",
  "importScripts",
  "require",
  "process",
  "global",
  "Node",
];

test("slugify and deriveId produce valid reverse-DNS ids", () => {
  assert.equal(slugify("My Cool Plugin"), "my-cool-plugin");
  assert.equal(slugify("!!!"), "plugin"); // fallback, never empty
  const id = deriveId("My Cool Plugin", "Jane Doe");
  assert.equal(id, "com.jane-doe.my-cool-plugin");
  assert.match(id, ID_RE);
});

test("parseArgs reads the name positional and flags", () => {
  const o = parseArgs(["my-plugin", "--id", "com.you.x", "--author=Jane", "-y"]);
  assert.equal(o.name, "my-plugin");
  assert.equal(o.id, "com.you.x");
  assert.equal(o.author, "Jane");
  assert.equal(o.yes, true);
});

test("scaffold writes every expected file", async () => {
  const parent = await tmpParent();
  const { dir } = await scaffold({ name: "Note Buddy", author: "Jane Doe", parentDir: parent });
  for (const rel of ["manifest.json", "src/main.js", "package.json", "README.md", ".gitignore"]) {
    await fs.access(path.join(dir, rel)); // throws if missing
  }
  assert.equal(path.basename(dir), "note-buddy");
});

test("manifest.json is valid and carries the fields the loaders require", async () => {
  const parent = await tmpParent();
  const { dir, id } = await scaffold({ name: "Note Buddy", author: "Jane Doe", parentDir: parent });
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));

  // Reverse-DNS id + semver, exactly as akashi-plugin validate/pack demands.
  assert.match(manifest.id, ID_RE);
  assert.equal(manifest.id, id);
  assert.equal(manifest.version, "0.1.0");
  assert.match(manifest.version, SEMVER_RE);
  assert.match(manifest.akashi_min_version, SEMVER_RE);
  assert.equal(manifest.entry, "dist/main.js");
  assert.ok(manifest.name.trim().length > 0);
  assert.ok(manifest.description.trim().length > 0);
  assert.equal(manifest.author_name, "Jane Doe");
  assert.ok(Array.isArray(manifest.permissions) && manifest.permissions.length > 0);

  // CRITICAL: present-but-empty so the desktop Developer-Mode loader (which parses
  // the folder manifest into the full signed-manifest shape) accepts it pre-signing.
  assert.equal(manifest.author_pubkey_hex, "");
  assert.equal(manifest.author_fingerprint, "");

  // Entry path must be a safe relative path (no traversal / absolute), like validate_manifest.
  assert.ok(!manifest.entry.includes(".."));
  assert.ok(!manifest.entry.startsWith("/") && !manifest.entry.includes(":"));
});

test("src/main.js parses as JS and uses the akashi API", async () => {
  const parent = await tmpParent();
  const { dir } = await scaffold({ name: "Note Buddy", author: "Jane Doe", parentDir: parent });
  const code = await fs.readFile(path.join(dir, "src", "main.js"), "utf8");

  // Parses cleanly (no syntax errors).
  assert.doesNotThrow(() => new vm.Script(code, { filename: "main.js" }));

  // Actually drives the host API, and the exact calls the starter promises.
  assert.match(code, /akashi\./);
  assert.match(code, /akashi\.addCommand/);
  assert.match(code, /akashi\.registerView/);
  assert.match(code, /akashi\.views\.update/); // the panel actually renders (P2b)
  assert.match(code, /akashi\.vault\.(read|list)/);

  // The built entry must stay export-free (evaluated as a script in the sandbox).
  assert.doesNotMatch(code, /^\s*export[\s{]/m);
  assert.doesNotMatch(code, /^\s*import[\s{*]/m);
});

test("every gated akashi call has its permission declared (no UsedButNotDeclared)", async () => {
  const parent = await tmpParent();
  const { dir } = await scaffold({ name: "Note Buddy", author: "Jane Doe", parentDir: parent });
  const code = await fs.readFile(path.join(dir, "src", "main.js"), "utf8");
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
  const declared = new Set(
    manifest.permissions.map((p) => (typeof p === "string" ? p : Object.keys(p)[0])),
  );
  for (const [needle, cap] of USAGE) {
    if (code.includes(needle)) {
      assert.ok(declared.has(cap), `${needle} used but ${cap} not declared in permissions`);
    }
  }
});

test("src/main.js references no SES-forbidden ambient globals", async () => {
  const parent = await tmpParent();
  const { dir } = await scaffold({ name: "Note Buddy", author: "Jane Doe", parentDir: parent });
  const code = await fs.readFile(path.join(dir, "src", "main.js"), "utf8");
  for (const g of AMBIENT_DENYLIST) {
    // Bare identifier not preceded by `.` or a word char — mirrors plugin_pack's lint.
    const re = new RegExp(`(^|[^.\\w])(${g})\\b`, "m");
    assert.ok(!re.test(code), `main.js must not reference the ambient global "${g}"`);
  }
});

test("package.json has a build script and no leftover template tokens", async () => {
  const parent = await tmpParent();
  const { dir, slug } = await scaffold({ name: "Note Buddy", author: "Jane Doe", parentDir: parent });
  const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
  assert.equal(pkg.name, slug);
  assert.match(pkg.scripts.build, /esbuild/);
  assert.ok(pkg.scripts.dev.includes("--watch"));

  // No `__TOKEN__` placeholder survives in any generated text file.
  for (const rel of ["manifest.json", "package.json", "README.md", "src/main.js"]) {
    const text = await fs.readFile(path.join(dir, rel), "utf8");
    assert.ok(!/__[A-Z0-9_]+__/.test(text), `unsubstituted token left in ${rel}`);
  }
});

test("package.json wires the akashi-plugin CLI as a devDependency + signing scripts", async () => {
  const parent = await tmpParent();
  const { dir, slug } = await scaffold({ name: "Note Buddy", author: "Jane Doe", parentDir: parent });
  const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));

  // The CLI is a real dependency now (resolves to node_modules/.bin after install),
  // so `npm run pack` works with no global install.
  assert.ok(
    pkg.devDependencies && pkg.devDependencies["@apilium/altretta-plugin"],
    "@apilium/altretta-plugin devDependency missing",
  );
  assert.match(pkg.devDependencies["@apilium/altretta-plugin"], /^\^?\d+\.\d+\.\d+$/);

  // keygen / pack / verify all drive the CLI; pack builds first and denies warnings.
  assert.match(pkg.scripts.keygen, /akashi-plugin keygen/);
  assert.match(pkg.scripts.pack, /npm run build/);
  assert.match(pkg.scripts.pack, /akashi-plugin pack \./);
  assert.match(pkg.scripts.pack, /--deny-warnings/);
  assert.match(pkg.scripts.verify, /akashi-plugin verify/);

  // The slug token must be substituted inside the pack/verify output filename.
  assert.ok(pkg.scripts.pack.includes(`${slug}.akplugin`), "pack output slug not substituted");
  assert.ok(pkg.scripts.verify.includes(`${slug}.akplugin`), "verify slug not substituted");
  assert.ok(!/__[A-Z0-9_]+__/.test(JSON.stringify(pkg)), "unsubstituted token in package.json");
});

test("--id override is honored and validated", async () => {
  const parent = await tmpParent();
  const { id } = await scaffold({ name: "X", author: "Y", id: "io.example.custom", parentDir: parent });
  assert.equal(id, "io.example.custom");
  await assert.rejects(
    () => scaffold({ name: "X", author: "Y", id: "NotReverseDNS", parentDir: parent }),
    /Invalid plugin id/,
  );
});

test("refuses to scaffold into a non-empty directory", async () => {
  const parent = await tmpParent();
  await scaffold({ name: "Dup", author: "Y", parentDir: parent });
  await assert.rejects(() => scaffold({ name: "Dup", author: "Y", parentDir: parent }), /already exists/);
});

test("CLI runs end-to-end and prints next steps", async () => {
  const parent = await tmpParent();
  const res = spawnSync(process.execPath, [CLI, "Cli Plugin", "--author", "Jane", "--yes", "--dir", parent], {
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Next steps/);
  const manifest = JSON.parse(await fs.readFile(path.join(parent, "cli-plugin", "manifest.json"), "utf8"));
  assert.equal(manifest.id, "com.jane.cli-plugin");
});
