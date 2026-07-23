#!/usr/bin/env node
/**
 * build-catalog.mjs — generate the machine-readable plugin index (`catalog.json`).
 *
 * Scans the repo root for plugin folders and emits `catalog.json` at the repo
 * root: a JSON array the Apilium hub ingests to list Altretta plugins on
 * hub.apilium.com and keep them in sync as this repo grows.
 *
 * A plugin folder is a top-level directory containing a `manifest.json` that
 * declares BOTH `permissions` and `entry`. That rule intentionally excludes the
 * dev tools (`create-altretta-plugin/`, `altretta-plugin-cli/`) — they are npm
 * packages, not end-user plugins, and carry no such manifest at their root.
 * Drop a new plugin folder at the repo root and it is discovered automatically.
 *
 * Pure Node, no dependencies, no network.
 *
 * Usage: node scripts/build-catalog.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_TREE = "https://github.com/ApiliumCode/altretta-plugins/tree/main";

/** Is this manifest an end-user plugin (declares permissions AND entry)? */
function isPluginManifest(manifest) {
  return (
    manifest != null &&
    typeof manifest === "object" &&
    Array.isArray(manifest.permissions) &&
    typeof manifest.entry === "string" &&
    manifest.entry.length > 0
  );
}

/** Discover plugin folders: top-level dirs with a plugin `manifest.json`. */
function discoverPlugins() {
  const plugins = [];
  for (const name of readdirSync(REPO_ROOT)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const dir = join(REPO_ROOT, name);
    if (!statSync(dir).isDirectory()) continue;

    const manifestPath = join(dir, "manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      continue; // no manifest.json (or unreadable) → not a plugin folder
    }
    if (!isPluginManifest(manifest)) continue;

    plugins.push({ folder: name, manifest });
  }
  return plugins;
}

/** Map a discovered plugin to its catalog entry. */
function toCatalogEntry({ folder, manifest }) {
  return {
    slug: manifest.id,
    name: manifest.name,
    description: manifest.description,
    category: manifest.category ?? null,
    permissions: manifest.permissions,
    source: "altretta",
    signed: true,
    version: manifest.version,
    repoPath: folder,
    author: manifest.author_name,
    install: {
      type: "developer-mode",
      target: `${REPO_TREE}/${folder}`,
    },
  };
}

function main() {
  const plugins = discoverPlugins();
  const entries = plugins
    .map(toCatalogEntry)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const outPath = join(REPO_ROOT, "catalog.json");
  writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n", "utf-8");

  console.log(`Wrote ${entries.length} plugin(s) to catalog.json:`);
  for (const e of entries) {
    console.log(`  - ${e.slug}  (${e.name} v${e.version})  [${e.repoPath}]`);
  }
}

main();
