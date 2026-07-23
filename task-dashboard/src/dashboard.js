'use strict';

/*
 * Task Dashboard — the plugin's host wiring (factory).
 *
 * Aggregates every Markdown checkbox task across the vault into one panel. Check a
 * box in the panel and the change is written back to the exact source line of the
 * note it came from.
 *
 * A plugin runs inside a hardened sandbox (a frozen SES compartment inside a
 * worker): no DOM, no direct network, no filesystem. Its only connection to the app
 * is the injected `akashi` object. Every `akashi.*` call is tagged with the
 * permission it needs, and the host runs it only if that permission is declared in
 * manifest.json AND the user consented. This plugin declares and uses exactly:
 *   ReadNotes    -> akashi.vault.list / akashi.vault.read
 *   WriteNotes   -> akashi.vault.write
 *   RenderPanel  -> akashi.registerView / akashi.views.update
 *
 * All parsing/toggling/tree-building lives in the side-effect-free `./tasks.js`
 * core, which is fully unit-tested. This factory is only the thin host wiring; it is
 * exported so tests can drive it with a mock `akashi`. The runnable entry point is
 * `main.js`, which bundles this in and calls it with the ambient host global — that
 * entry has no `export`, so the built bundle is a plain script the SES compartment
 * can `evaluate()` (a top-level `export`/`import` would be a syntax error there).
 */

import { parseTasks, toggleLine, decodeTaskId, buildTree } from './tasks.js';

// The view id MUST be namespaced by the plugin id — the host rejects any id that is
// neither the plugin id nor a `pluginId:...` child of it.
export const VIEW_ID = 'com.apilium.task-dashboard:panel';

/**
 * Wire the plugin to a host `akashi` object and return its handlers. Kept as a
 * factory so the wiring can be driven by a mock in tests; production calls it once
 * with the ambient global (see `main.js`).
 *
 * @param {object} akashi The injected host API.
 * @returns {{ refresh: () => Promise<void>,
 *             onToggle: (nodeId: string, event: string, value: unknown) => Promise<void>,
 *             VIEW_ID: string }}
 */
export function createTaskDashboard(akashi) {
  /**
   * Rebuild the panel from the current vault contents: list notes, read each
   * Markdown file, parse its tasks, and push the resulting tree to the view.
   */
  async function refresh() {
    const paths = await akashi.vault.list(); // ReadNotes
    const mdPaths = (paths || []).filter(
      (path) => typeof path === 'string' && path.toLowerCase().endsWith('.md'),
    );

    const notes = [];
    for (const path of mdPaths) {
      let text;
      try {
        text = await akashi.vault.read(path); // ReadNotes
      } catch {
        // A note that vanished or is unreadable is simply skipped — one bad file
        // must never blank the whole dashboard.
        continue;
      }
      notes.push({ path, tasks: parseTasks(text) });
    }

    await akashi.views.update(VIEW_ID, buildTree(notes)); // RenderPanel
  }

  /**
   * Handle a checkbox event from the panel. Only `change` events mutate a note;
   * anything else (clicks, focus, ...) is ignored. On any stale/invalid target we
   * refresh rather than write, so the panel resyncs with the real note.
   */
  async function onToggle(nodeId, event, value) {
    void value;
    if (event !== 'change') return;

    const loc = decodeTaskId(nodeId);
    if (loc === null) {
      // Unrecognizable id (older tree, corruption) — resync and bail.
      await refresh();
      return;
    }

    const text = await akashi.vault.read(loc.path); // ReadNotes
    const next = toggleLine(text, loc.line);
    if (next === text) {
      // The line is no longer a task (the note changed under us) — don't write a
      // no-op; just resync so the panel reflects reality.
      await refresh();
      return;
    }

    await akashi.vault.write(loc.path, next); // WriteNotes
    await refresh();
  }

  // Reserve the panel slot and bind its lifecycle: onShow rebuilds the tree,
  // onEvent handles checkbox toggles.
  akashi.registerView({
    id: VIEW_ID,
    title: 'Tasks',
    icon: 'check',
    onShow: refresh,
    onEvent: onToggle,
  }); // RenderPanel

  return { refresh, onToggle, VIEW_ID };
}
