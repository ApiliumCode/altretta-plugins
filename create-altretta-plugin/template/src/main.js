'use strict';

/*
 * __PLUGIN_NAME__ — an Altretta plugin.
 *
 * A plugin runs inside a hardened sandbox (a frozen SES compartment inside a worker).
 * It has no browser DOM, no direct network, no filesystem. Its only connection to the
 * app is the `akashi` object used below. Every `akashi.*` call is tagged with the
 * permission it needs; the host runs it only if you declared that permission in
 * `manifest.json` AND the user consented. So a plugin can never touch anything it did
 * not ask for. That is Altretta's model, and it is enforced, not trusted.
 *
 * This starter declares three permissions in manifest.json and uses exactly them:
 *   ReadNotes    -> akashi.vault.list / akashi.vault.read
 *   AddCommands  -> akashi.addCommand
 *   RenderPanel  -> akashi.registerView / akashi.views.update
 * Delete what you do not use and drop the matching permission. Least privilege is the
 * norm, and `akashi-plugin pack` warns about any mismatch.
 *
 * Bundle rule: this file is the entry, evaluated as a plain script inside the sandbox,
 * so it must have NO top-level `export`/`import`. If you split code into another module
 * for testing, keep that module's exports out of the entry and let esbuild inline it.
 */

const VIEW_ID = '__PLUGIN_ID__:panel';

// A command in the command palette. Reads your first note and returns a preview;
// the returned string is surfaced back to the user by the host.
akashi.addCommand({
  id: '__PLUGIN_ID__:read-first-note',
  title: '__PLUGIN_NAME__: Read first note',
  run: async () => {
    const notes = await akashi.vault.list(); // ReadNotes
    if (!notes || notes.length === 0) {
      return 'No notes yet. Create one, then run this command again.';
    }
    const text = await akashi.vault.read(notes[0]); // ReadNotes
    return `${notes[0]}: ${text.length} chars\n\n${text.slice(0, 140)}`;
  },
});

// A side panel. `registerView` reserves the slot and binds its handlers; `onShow`
// runs when the panel becomes visible, `onEvent` when a control in it fires.
akashi.registerView({
  id: VIEW_ID,
  title: '__PLUGIN_NAME__',
  icon: 'sparkles',
  onShow: renderPanel,
  onEvent: (nodeId, event) => {
    if (nodeId === '__PLUGIN_ID__:refresh' && event === 'click') renderPanel();
  },
});

// Push a UI tree to the panel. A plugin never touches the DOM: it sends a structured,
// sanitized tree and the host renders it. Interactions come back to `onEvent` by node id.
async function renderPanel() {
  const notes = await akashi.vault.list(); // ReadNotes
  await akashi.views.update(VIEW_ID, {     // RenderPanel
    type: 'stack',
    direction: 'col',
    gap: 8,
    children: [
      { type: 'heading', level: 3, text: '__PLUGIN_NAME__' },
      { type: 'text', variant: 'muted', text: `Your vault has ${notes.length} note(s).` },
      { type: 'button', id: '__PLUGIN_ID__:refresh', label: 'Refresh', variant: 'primary' },
    ],
  });
}

// Observe lifecycle events. `akashi.on` is not permission-gated: it only lets you
// observe events for capabilities you already hold. Refresh the panel as notes change.
akashi.on('note-save', () => {
  renderPanel();
});
