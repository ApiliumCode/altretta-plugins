/**
 * Task Dashboard — pure core.
 *
 * Side-effect-free helpers for finding, toggling, and presenting Markdown
 * checkbox tasks. This module imports no host API and touches no globals that
 * are absent from a SES worker, so it is fully unit-testable in isolation and
 * safe to run in the plugin sandbox, the browser, and Node.
 */

/**
 * Matches a task line: optional indentation, a `-` or `*` bullet, a checkbox
 * containing a single space / `x` / `X`, then the label.
 */
const TASK_RE = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/;

/**
 * Split text into lines while remembering each line's original trailing `\r`,
 * so CRLF sources round-trip untouched. Returns `{ lines, endings }` where
 * `lines[i]` has no trailing `\r` and `endings[i]` is `"\r"` or `""`.
 */
function splitLines(text) {
  const raw = text.split("\n");
  const lines = [];
  const endings = [];
  for (const part of raw) {
    if (part.endsWith("\r")) {
      lines.push(part.slice(0, -1));
      endings.push("\r");
    } else {
      lines.push(part);
      endings.push("");
    }
  }
  return { lines, endings };
}

/** True when a line opens or closes a fenced code block (``` or ```lang). */
function isFence(line) {
  return /^\s*```/.test(line);
}

/**
 * Parse every Markdown task in `text`.
 *
 * @param {string} text
 * @returns {Array<{ line: number, indent: string, checked: boolean, text: string }>}
 *   One entry per task line, in document order. Never throws; a non-string or
 *   empty input yields `[]`.
 */
export function parseTasks(text) {
  if (typeof text !== "string" || text.length === 0) return [];

  const { lines } = splitLines(text);
  const tasks = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFence(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = TASK_RE.exec(line);
    if (!m) continue;

    tasks.push({
      line: i,
      indent: m[1],
      checked: m[2] === "x" || m[2] === "X",
      text: m[3].replace(/\s+$/, ""),
    });
  }

  return tasks;
}

/**
 * Toggle the checkbox on a single line, returning the full text with only that
 * line changed. Checked (`[x]`/`[X]`) becomes `[ ]`; unchecked becomes `[x]`.
 * If the target line is out of range or not a task line, `text` is returned
 * unchanged — a guard against writing back to the wrong line.
 *
 * @param {string} text
 * @param {number} lineIndex 0-based line index.
 * @returns {string}
 */
export function toggleLine(text, lineIndex) {
  if (typeof text !== "string") return text;
  if (!Number.isInteger(lineIndex)) return text;

  const { lines, endings } = splitLines(text);
  if (lineIndex < 0 || lineIndex >= lines.length) return text;

  const m = TASK_RE.exec(lines[lineIndex]);
  if (!m) return text;

  const wasChecked = m[2] === "x" || m[2] === "X";
  const nextBox = wasChecked ? "[ ]" : "[x]";
  // Replace only the first `[.]` box on the line; indent, bullet, spacing, and
  // label are preserved verbatim.
  lines[lineIndex] = lines[lineIndex].replace(/\[[ xX]\]/, nextBox);

  return lines.map((line, i) => line + endings[i]).join("\n");
}

// --- base64url (self-contained, UTF-8, worker-safe) ------------------------
//
// The plugin runs in a SES worker with frozen intrinsics and no Node globals,
// so `Buffer` is unavailable and `btoa`/`atob` are not guaranteed. This is a
// lookup-table base64url encoder/decoder over UTF-8 bytes, using only plain
// arithmetic and `String.fromCharCode`/`charCodeAt`, so it behaves identically
// in the worker, the browser, and Node.

const B64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const B64URL_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64URL_ALPHABET.length; i++) {
    table[B64URL_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/** Encode a JS string to UTF-8 bytes. */
function utf8Encode(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    // Combine surrogate pairs into a single code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** Decode UTF-8 bytes back to a JS string. Throws on malformed sequences. */
function utf8Decode(bytes) {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    let code;
    if (b0 < 0x80) {
      code = b0;
    } else if ((b0 & 0xe0) === 0xc0) {
      code = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if ((b0 & 0xf0) === 0xe0) {
      code = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else if ((b0 & 0xf8) === 0xf0) {
      code =
        ((b0 & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    } else {
      throw new Error("invalid utf-8");
    }
    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/** Encode a string to base64url (no padding). */
function base64urlEncode(str) {
  const bytes = utf8Encode(str);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : -1;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : -1;

    out += B64URL_ALPHABET[b0 >> 2];
    out += B64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 >= 0 ? b1 >> 4 : 0)];
    if (b1 < 0) break;
    out += B64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 >= 0 ? b2 >> 6 : 0)];
    if (b2 < 0) break;
    out += B64URL_ALPHABET[b2 & 0x3f];
  }
  return out;
}

/** Decode a base64url string. Throws on any invalid character. */
function base64urlDecode(str) {
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    const val = c < 128 ? B64URL_LOOKUP[c] : -1;
    if (val < 0) throw new Error("invalid base64url");
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return utf8Decode(bytes);
}

const TASK_ID_PREFIX = "t:";

/**
 * Build a stable task id: `"t:" + base64url(path) + ":" + line`.
 *
 * @param {string} path Vault-relative note path.
 * @param {number} line 0-based line index of the task.
 * @returns {string}
 */
export function encodeTaskId(path, line) {
  return `${TASK_ID_PREFIX}${base64urlEncode(path)}:${line}`;
}

/**
 * Decode a task id produced by {@link encodeTaskId}.
 *
 * @param {string} id
 * @returns {{ path: string, line: number } | null} `null` for any malformed id.
 */
export function decodeTaskId(id) {
  if (typeof id !== "string" || !id.startsWith(TASK_ID_PREFIX)) return null;

  const body = id.slice(TASK_ID_PREFIX.length);
  const sep = body.lastIndexOf(":");
  if (sep < 0) return null;

  const encodedPath = body.slice(0, sep);
  const lineStr = body.slice(sep + 1);

  if (!/^\d+$/.test(lineStr)) return null;
  const line = Number(lineStr);
  if (!Number.isSafeInteger(line)) return null;

  let path;
  try {
    path = base64urlDecode(encodedPath);
  } catch {
    return null;
  }

  return { path, line };
}

/** Derive a note's display name: strip directories and a trailing `.md`. */
function basename(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.md$/i, "");
}

/**
 * Build a declarative UiNode tree for the task panel from parsed notes.
 *
 * @param {Array<{ path: string, tasks: ReturnType<typeof parseTasks> }>} notes
 * @returns {object} A structured-clone-safe UiNode. When no note has any task,
 *   returns a single muted empty-state text node.
 */
export function buildTree(notes) {
  const withTasks = (notes || []).filter(
    (note) => note && Array.isArray(note.tasks) && note.tasks.length > 0,
  );

  if (withTasks.length === 0) {
    return {
      type: "text",
      text: 'No tasks yet — add "- [ ] something" to a note.',
      variant: "muted",
    };
  }

  const children = [];
  for (const note of withTasks) {
    children.push({ type: "heading", level: 3, text: basename(note.path) });
    children.push({
      type: "list",
      children: note.tasks.map((task) => ({
        type: "checkbox",
        id: encodeTaskId(note.path, task.line),
        checked: task.checked,
        label: task.text,
      })),
    });
  }

  return { type: "stack", direction: "col", gap: 12, children };
}
