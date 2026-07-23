#!/usr/bin/env node
// Copyright 2019-2026 Apilium Technologies OU. All rights reserved.
// SPDX-License-Identifier: Apache-2.0 OR Commercial

/**
 * create-altretta-plugin — one command to scaffold a runnable Altretta plugin.
 *
 *   npx create-altretta-plugin my-plugin
 *
 * Writes a project you can load in Altretta -> Plugins -> Developer Mode -> Load
 * plugin folder, consent to its permissions, and see run — then hot-reload as you
 * edit `src/main.js`. Zero network access of its own (only the npm registry, when
 * the generated project runs `npm install`); pure Node built-ins.
 *
 * The generated `manifest.json` deliberately leaves `author_pubkey_hex` and
 * `author_fingerprint` EMPTY: those are injected from your signing key at
 * `akashi-plugin pack` time, never hand-written. They are present (as "") so the
 * desktop Developer-Mode loader — which parses the folder manifest into the full
 * signed-manifest shape — accepts the folder before it is ever signed.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(HERE, "template");

/**
 * Reverse-DNS id rule — mirrors `akashi_core::plugin_pack::validate_manifest`
 * (`^[a-z0-9]+(\.[a-z0-9-]+)+$`). Kept in lock-step so a scaffolded id always
 * survives `akashi-plugin pack`.
 */
const ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

/** ANSI helpers (no dependency); degrade to plain text when not a TTY. */
const color = (code, s) => (stdout.isTTY ? `[${code}m${s}[0m` : s);
const bold = (s) => color("1", s);
const cyan = (s) => color("36", s);
const green = (s) => color("32", s);
const dim = (s) => color("2", s);

/**
 * Slugify to a single reverse-DNS label / npm-name segment: lowercase, non
 * `[a-z0-9]` runs collapse to `-`, trimmed. `fallback` covers an all-punctuation
 * input so we never emit an empty segment.
 */
export function slugify(input, fallback = "plugin") {
  const s = String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : fallback;
}

/**
 * Derive a reverse-DNS id `com.<author>.<name>`. The first label MUST be
 * `[a-z0-9]+` (no dash), so `author`/`name` labels use the dash-permitting slug
 * while the fixed `com.` prefix guarantees a valid leading label.
 */
export function deriveId(name, author) {
  return `com.${slugify(author, "author")}.${slugify(name, "plugin")}`;
}

/** Parse `argv` (already sliced past node + script) into options + flags. */
export function parseArgs(argv) {
  const opts = { name: undefined, id: undefined, author: undefined, dir: undefined, yes: false, help: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes" || a === "-y") opts.yes = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--id") opts.id = argv[++i];
    else if (a === "--author") opts.author = argv[++i];
    else if (a === "--dir") opts.dir = argv[++i];
    else if (a.startsWith("--id=")) opts.id = a.slice(5);
    else if (a.startsWith("--author=")) opts.author = a.slice(9);
    else if (a.startsWith("--dir=")) opts.dir = a.slice(6);
    else if (!a.startsWith("-")) positionals.push(a);
  }
  if (positionals.length > 0 && opts.name === undefined) opts.name = positionals[0];
  return opts;
}

const HELP = `${bold("create-altretta-plugin")} — scaffold a runnable Altretta plugin

${bold("USAGE")}
  npm create @apilium/altretta-plugin <name>
  npx @apilium/create-altretta-plugin <name> [--id <reverse.dns.id>] [--author <name>] [--dir <parent>] [--yes]

${bold("OPTIONS")}
  <name>            Display name (also the folder + npm name). Prompted if omitted.
  --id <id>         Reverse-DNS plugin id (e.g. com.you.my-plugin). Derived if omitted.
  --author <name>   Your author name. Prompted if omitted.
  --dir <parent>    Parent directory to create the project in (default: cwd).
  --yes, -y         Skip prompts; use defaults for anything not passed as a flag.
  --help, -h        Show this help.
`;

/**
 * Recursively copy the template into `dest`, substituting `__TOKEN__` placeholders
 * in text files and renaming `gitignore` -> `.gitignore` (npm strips a literal
 * `.gitignore` from published packages, so the template ships it un-dotted).
 */
async function copyTemplate(srcDir, destDir, tokens) {
  await fs.mkdir(destDir, { recursive: true });
  for (const entry of await fs.readdir(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const outName = entry.name === "gitignore" ? ".gitignore" : entry.name;
    const destPath = path.join(destDir, outName);
    if (entry.isDirectory()) {
      await copyTemplate(srcPath, destPath, tokens);
    } else {
      const raw = await fs.readFile(srcPath, "utf8");
      const rendered = raw.replace(/__([A-Z0-9_]+)__/g, (m, key) =>
        Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : m,
      );
      await fs.writeFile(destPath, rendered);
    }
  }
}

/** True if `dir` exists and contains at least one entry. */
async function dirNonEmpty(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * Scaffold a plugin project. Pure-ish: touches only the filesystem under
 * `parentDir`. Returns `{ dir, id, name, slug, author }`. Throws on an invalid id
 * or a non-empty target directory.
 */
export async function scaffold({ name, id, author, parentDir }) {
  const displayName = (name ?? "my-plugin").trim() || "my-plugin";
  const authorName = (author ?? "Your Name").trim() || "Your Name";
  const slug = slugify(displayName, "my-plugin");
  const pluginId = (id ?? deriveId(displayName, authorName)).trim();

  if (!ID_RE.test(pluginId)) {
    throw new Error(
      `Invalid plugin id "${pluginId}". Must be reverse-DNS, e.g. com.you.my-plugin ` +
        `(lowercase letters/digits, dot-separated, dashes allowed after the first label).`,
    );
  }

  const dir = path.resolve(parentDir ?? process.cwd(), slug);
  if (await dirNonEmpty(dir)) {
    throw new Error(`Target directory "${dir}" already exists and is not empty.`);
  }

  await copyTemplate(TEMPLATE_DIR, dir, {
    PLUGIN_ID: pluginId,
    PLUGIN_NAME: displayName,
    PLUGIN_SLUG: slug,
    AUTHOR_NAME: authorName,
  });

  return { dir, id: pluginId, name: displayName, slug, author: authorName };
}

function nextSteps({ dir, slug, id }) {
  const rel = path.relative(process.cwd(), dir) || slug;
  return `
${green("Created")} ${bold(slug)} ${dim(`(${id})`)}
  ${dim(dir)}

${bold("Next steps")}
  ${cyan(`cd ${rel}`)}
  ${cyan("npm install")}
  ${cyan("npm run build")}        ${dim("# bundles src/main.js -> dist/main.js")}

${bold("Run it in Altretta")}
  1. Open ${bold("Altretta")} -> ${bold("Plugins")} -> ${bold("Developer Mode")} -> enable it.
  2. Click ${bold("Load plugin folder")} and pick ${dim(rel)}.
  3. Review the permissions it asks for and ${bold("consent")} — it runs, sandboxed.

${bold("Iterate")}
  ${cyan("npm run dev")}          ${dim("# esbuild --watch: edit src/main.js -> it hot-reloads")}

${bold("Sign it")} ${dim("(when you are ready — no global install, no Rust)")}
  ${cyan("npm run keygen")}       ${dim("# once: writes author.key")}
  ${cyan("npm run pack")}         ${dim(`# builds, then signs ${slug}.akplugin (deny-warnings)`)}
  ${cyan("npm run verify")}       ${dim("# shows author_ok: true")}
  ${dim("Or, no terminal: Altretta -> Plugins -> Developer Mode -> Package & sign.")}

${dim("Full guide: https://github.com/ApiliumCode/altretta-plugins/blob/main/AUTHORING.md")}
`;
}

/** CLI entry: parse args, prompt for anything missing, scaffold, print next steps. */
export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    stdout.write(HELP);
    return 0;
  }

  let { name, id, author } = opts;
  const interactive = !opts.yes && stdin.isTTY;

  if (interactive) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      if (!name) name = (await rl.question(`${bold("Plugin name")} ${dim("(my-plugin)")}: `)).trim() || undefined;
      if (!author) author = (await rl.question(`${bold("Author name")} ${dim("(Your Name)")}: `)).trim() || undefined;
      const derived = deriveId(name ?? "my-plugin", author ?? "Your Name");
      if (!id) id = (await rl.question(`${bold("Plugin id")} ${dim(`(${derived})`)}: `)).trim() || undefined;
    } finally {
      rl.close();
    }
  }

  try {
    const result = await scaffold({ name, id, author, parentDir: opts.dir });
    stdout.write(nextSteps(result));
    return 0;
  } catch (err) {
    stdout.write(`\n${color("31", "Error")}: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

// Run only when invoked directly (not when imported by a test).
const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
