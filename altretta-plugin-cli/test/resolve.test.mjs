// Copyright 2019-2026 Apilium Technologies OU. All rights reserved.
// SPDX-License-Identifier: Apache-2.0 OR Commercial

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveBinary } from "../lib/resolve.mjs";

test("resolveBinary maps the four supported platforms to pkg + binName", () => {
  assert.deepEqual(resolveBinary("darwin", "arm64"), {
    pkg: "@apilium/altretta-plugin-darwin-arm64",
    binName: "akashi-plugin",
  });
  assert.deepEqual(resolveBinary("darwin", "x64"), {
    pkg: "@apilium/altretta-plugin-darwin-x64",
    binName: "akashi-plugin",
  });
  assert.deepEqual(resolveBinary("linux", "x64"), {
    pkg: "@apilium/altretta-plugin-linux-x64",
    binName: "akashi-plugin",
  });
  assert.deepEqual(resolveBinary("win32", "x64"), {
    pkg: "@apilium/altretta-plugin-win32-x64",
    binName: "akashi-plugin.exe",
  });
});

test("resolveBinary throws a clear Error naming an unsupported platform/arch", () => {
  assert.throws(
    () => resolveBinary("freebsd", "x64"),
    (err) => err instanceof Error && err.message.includes("freebsd-x64"),
  );
  assert.throws(
    () => resolveBinary("linux", "arm64"),
    (err) => err instanceof Error && err.message.includes("linux-arm64"),
  );
  assert.throws(
    () => resolveBinary("win32", "ia32"),
    (err) => err instanceof Error && err.message.includes("win32-ia32"),
  );
});
