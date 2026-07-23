import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseTasks,
  toggleLine,
  encodeTaskId,
  decodeTaskId,
  buildTree,
} from "../src/tasks.js";

test("parseTasks: matches the four bullet/box variants", () => {
  const text = ["- [ ] alpha", "- [x] beta", "- [X] gamma", "* [ ] delta"].join(
    "\n",
  );
  const tasks = parseTasks(text);
  assert.equal(tasks.length, 4);
  assert.deepEqual(tasks[0], { line: 0, indent: "", checked: false, text: "alpha" });
  assert.deepEqual(tasks[1], { line: 1, indent: "", checked: true, text: "beta" });
  assert.deepEqual(tasks[2], { line: 2, indent: "", checked: true, text: "gamma" });
  assert.deepEqual(tasks[3], { line: 3, indent: "", checked: false, text: "delta" });
});

test("parseTasks: preserves indentation and trims trailing whitespace from label", () => {
  const text = "\t  - [ ] nested task   ";
  const [task] = parseTasks(text);
  assert.equal(task.indent, "\t  ");
  assert.equal(task.text, "nested task");
  assert.equal(task.line, 0);
});

test("parseTasks: ignores prose and inline [ ] occurrences", () => {
  const text = [
    "This is prose with a [ ] inside a sentence.",
    "Another paragraph mentioning - [ ] but not at the start because of this prefix",
    "just words",
  ].join("\n");
  assert.deepEqual(parseTasks(text), []);
});

test("parseTasks: ignores task-looking lines inside fenced code blocks", () => {
  const text = [
    "- [ ] real task",
    "```",
    "- [ ] fake task in fence",
    "- [x] another fake",
    "```",
    "- [x] real task two",
  ].join("\n");
  const tasks = parseTasks(text);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].text, "real task");
  assert.equal(tasks[1].text, "real task two");
  assert.equal(tasks[1].line, 5);
});

test("parseTasks: handles fences with a language tag", () => {
  const text = ["```js", "- [ ] not a task", "```", "- [ ] a task"].join("\n");
  const tasks = parseTasks(text);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].text, "a task");
});

test("parseTasks: empty/whitespace text yields an empty array and never throws", () => {
  assert.deepEqual(parseTasks(""), []);
  assert.deepEqual(parseTasks("   \n\t\n  "), []);
  assert.deepEqual(parseTasks(undefined), []);
  assert.deepEqual(parseTasks(null), []);
});

test("toggleLine: flips an unchecked task to checked (lowercase x)", () => {
  const text = "- [ ] task";
  assert.equal(toggleLine(text, 0), "- [x] task");
});

test("toggleLine: flips a checked task to unchecked", () => {
  const text = "- [x] task";
  assert.equal(toggleLine(text, 0), "- [ ] task");
});

test("toggleLine: uppercase [X] toggles to unchecked", () => {
  const text = "- [X] task";
  assert.equal(toggleLine(text, 0), "- [ ] task");
});

test("toggleLine: preserves indent, bullet char, and label", () => {
  const text = ["intro", "\t* [ ] deep task with words", "outro"].join("\n");
  const out = toggleLine(text, 1);
  assert.equal(out, ["intro", "\t* [x] deep task with words", "outro"].join("\n"));
});

test("toggleLine: non-task line index returns unchanged text", () => {
  const text = ["prose line", "- [ ] task"].join("\n");
  assert.equal(toggleLine(text, 0), text);
});

test("toggleLine: out-of-range index returns unchanged text", () => {
  const text = "- [ ] task";
  assert.equal(toggleLine(text, 99), text);
  assert.equal(toggleLine(text, -1), text);
});

test("toggleLine: round-trips (unchecked)", () => {
  const text = ["- [ ] a", "- [x] b"].join("\n");
  assert.equal(toggleLine(toggleLine(text, 0), 0), text);
});

test("toggleLine: round-trips (checked)", () => {
  const text = ["- [x] a", "- [ ] b"].join("\n");
  assert.equal(toggleLine(toggleLine(text, 0), 0), text);
});

test("toggleLine: preserves CRLF line endings", () => {
  const text = "intro\r\n- [ ] task\r\ntail\r\n";
  const out = toggleLine(text, 1);
  assert.equal(out, "intro\r\n- [x] task\r\ntail\r\n");
});

test("encode/decode: round-trips path with spaces, unicode, and slashes", () => {
  const paths = [
    "folder/sub folder/My Note.md",
    "notas/proyecto ñandú/día 1 — café.md",
    "a/b/c/d.md",
    "日本語/メモ.md",
  ];
  for (const p of paths) {
    for (const line of [0, 1, 42, 9999]) {
      const id = encodeTaskId(p, line);
      const decoded = decodeTaskId(id);
      assert.deepEqual(decoded, { path: p, line });
    }
  }
});

test("decode: malformed ids return null", () => {
  assert.equal(decodeTaskId("nope"), null);
  assert.equal(decodeTaskId("t:@@@:x"), null);
  assert.equal(decodeTaskId("t:aGVsbG8:notint"), null);
  assert.equal(decodeTaskId(""), null);
  assert.equal(decodeTaskId(null), null);
  assert.equal(decodeTaskId("t:aGVsbG8"), null);
});

test("buildTree: two notes with tasks produce a stack with headings and lists", () => {
  const notes = [
    { path: "work/Project A.md", tasks: parseTasks("- [ ] one\n- [x] two") },
    { path: "Personal.md", tasks: parseTasks("- [ ] three") },
  ];
  const tree = buildTree(notes);
  assert.equal(tree.type, "stack");
  assert.equal(tree.direction, "col");
  const headings = tree.children.filter((c) => c.type === "heading");
  const lists = tree.children.filter((c) => c.type === "list");
  assert.equal(headings.length, 2);
  assert.equal(lists.length, 2);
  assert.deepEqual(
    headings.map((h) => h.text),
    ["Project A", "Personal"],
  );
  assert.equal(headings[0].level, 3);
  assert.equal(lists[0].children.length, 2);
  assert.equal(lists[1].children.length, 1);
});

test("buildTree: notes with zero tasks are omitted", () => {
  const notes = [
    { path: "Empty.md", tasks: [] },
    { path: "Full.md", tasks: parseTasks("- [ ] a") },
  ];
  const tree = buildTree(notes);
  const headings = tree.children.filter((c) => c.type === "heading");
  assert.equal(headings.length, 1);
  assert.equal(headings[0].text, "Full");
});

test("buildTree: every checkbox id decodes back to the note path and line", () => {
  const notes = [
    { path: "dir/Note One.md", tasks: parseTasks("- [ ] a\n\n- [x] b") },
  ];
  const tree = buildTree(notes);
  const list = tree.children.find((c) => c.type === "list");
  const checkboxes = list.children;
  assert.equal(checkboxes.length, 2);
  assert.equal(checkboxes[0].type, "checkbox");
  assert.deepEqual(decodeTaskId(checkboxes[0].id), { path: "dir/Note One.md", line: 0 });
  assert.deepEqual(decodeTaskId(checkboxes[1].id), { path: "dir/Note One.md", line: 2 });
  assert.equal(checkboxes[0].checked, false);
  assert.equal(checkboxes[1].checked, true);
  assert.equal(checkboxes[0].label, "a");
});

test("buildTree: all-empty input yields the muted empty-state text node", () => {
  const tree = buildTree([
    { path: "A.md", tasks: [] },
    { path: "B.md", tasks: [] },
  ]);
  assert.deepEqual(tree, {
    type: "text",
    text: 'No tasks yet — add "- [ ] something" to a note.',
    variant: "muted",
  });
  assert.deepEqual(buildTree([]), tree);
});
