import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTaskDashboard } from '../src/dashboard.js';
import { decodeTaskId, encodeTaskId } from '../src/tasks.js';

/**
 * Build a mock `akashi` host over an in-memory file map, recording every call so a
 * test can assert on reads, writes, and the trees pushed to the view.
 */
function makeMock(files) {
  const store = { ...files };
  const reads = [];
  const writes = [];
  const updates = [];
  let descriptor = null;

  const akashi = {
    vault: {
      list: async () => Object.keys(store),
      read: async (path) => {
        reads.push(path);
        if (!(path in store)) throw new Error(`no such file: ${path}`);
        return store[path];
      },
      write: async (path, content) => {
        writes.push({ path, content });
        store[path] = content;
      },
    },
    views: {
      update: async (id, tree) => {
        updates.push({ id, tree });
      },
    },
    registerView: (desc) => {
      descriptor = desc;
    },
  };

  return {
    akashi,
    reads,
    writes,
    updates,
    getDescriptor: () => descriptor,
  };
}

/** Collect every checkbox node in a UiNode tree, depth-first. */
function collectCheckboxes(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'checkbox') out.push(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectCheckboxes(child, out);
  }
  return out;
}

const FIXTURE = {
  'Notes/a.md': '- [ ] alpha\n- [x] beta',
  'Notes/b.md': 'intro\n- [ ] gamma',
  'img.png': 'binary-not-markdown',
};

test('registerView: descriptor is namespaced and wires onShow/onEvent', () => {
  const mock = makeMock(FIXTURE);
  const app = createTaskDashboard(mock.akashi);
  const desc = mock.getDescriptor();

  assert.equal(desc.id, 'com.apilium.task-dashboard:panel');
  assert.equal(desc.id, app.VIEW_ID);
  assert.equal(desc.title, 'Tasks');
  assert.equal(typeof desc.onShow, 'function');
  assert.equal(typeof desc.onEvent, 'function');
});

test('refresh: pushes a tree with tasks from both .md notes and skips non-md', async () => {
  const mock = makeMock(FIXTURE);
  const app = createTaskDashboard(mock.akashi);

  await app.refresh();

  assert.equal(mock.updates.length, 1);
  assert.equal(mock.updates[0].id, app.VIEW_ID);

  const boxes = collectCheckboxes(mock.updates[0].tree);
  const decoded = boxes.map((b) => decodeTaskId(b.id));

  // a.md contributes lines 0 and 1; b.md contributes line 1. img.png contributes none.
  assert.deepEqual(
    decoded.sort((x, y) =>
      `${x.path}:${x.line}`.localeCompare(`${y.path}:${y.line}`),
    ),
    [
      { path: 'Notes/a.md', line: 0 },
      { path: 'Notes/a.md', line: 1 },
      { path: 'Notes/b.md', line: 1 },
    ],
  );

  // The non-markdown file must never be read.
  assert.ok(!mock.reads.includes('img.png'), 'img.png should not be read');
});

test('onToggle(change): reads the right note, writes the toggled line, and refreshes', async () => {
  const mock = makeMock(FIXTURE);
  const app = createTaskDashboard(mock.akashi);

  await app.refresh();
  const before = mock.updates.length;

  // Toggle "alpha" (Notes/a.md, line 0, currently unchecked).
  const boxes = collectCheckboxes(mock.updates[0].tree);
  const alpha = boxes.find((b) => b.label === 'alpha');
  assert.ok(alpha, 'alpha checkbox present');

  await app.onToggle(alpha.id, 'change', true);

  assert.equal(mock.writes.length, 1);
  assert.equal(mock.writes[0].path, 'Notes/a.md');
  assert.equal(mock.writes[0].content, '- [x] alpha\n- [x] beta');
  // A write is followed by a refresh (a second view push).
  assert.ok(mock.updates.length > before, 'panel refreshed after write');
});

test('onToggle(change): stale id (line no longer a task) writes nothing but refreshes', async () => {
  const mock = makeMock(FIXTURE);
  const app = createTaskDashboard(mock.akashi);

  const before = mock.updates.length;
  // Notes/b.md line 0 is "intro" — a valid id, but not a task line.
  const staleId = encodeTaskId('Notes/b.md', 0);

  await app.onToggle(staleId, 'change', true);

  assert.equal(mock.writes.length, 0, 'no write for a stale target');
  assert.ok(mock.updates.length > before, 'still refreshed to resync');
});

test('onToggle(change): malformed id writes nothing but refreshes', async () => {
  const mock = makeMock(FIXTURE);
  const app = createTaskDashboard(mock.akashi);

  const before = mock.updates.length;
  await app.onToggle('not-a-valid-id', 'change', true);

  assert.equal(mock.writes.length, 0, 'no write for a malformed id');
  assert.ok(mock.updates.length > before, 'refreshed to resync');
});

test('onToggle: non-change events are ignored (no write, no refresh)', async () => {
  const mock = makeMock(FIXTURE);
  const app = createTaskDashboard(mock.akashi);

  const validId = encodeTaskId('Notes/a.md', 0);
  await app.onToggle(validId, 'click', true);

  assert.equal(mock.writes.length, 0, 'click must not write');
  assert.equal(mock.updates.length, 0, 'click must not refresh');
});
