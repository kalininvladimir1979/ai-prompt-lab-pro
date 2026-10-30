import test from "node:test";
import assert from "node:assert/strict";
import { comparePromptLines } from "../client/prompt-diff.js";

test("prompt diff leaves equal lines unchanged", () => {
  assert.deepEqual(comparePromptLines("one\ntwo", "one\ntwo"), { rows: [{ type: "same", value: "one" }, { type: "same", value: "two" }], added: 0, removed: 0 });
});

test("prompt diff detects an added line", () => {
  const result = comparePromptLines("one", "one\ntwo");
  assert.equal(result.added, 1); assert.equal(result.removed, 0);
});

test("prompt diff detects a removed line", () => {
  const result = comparePromptLines("one\ntwo", "one");
  assert.equal(result.added, 0); assert.equal(result.removed, 1);
});

test("prompt diff marks a changed line as removal and addition", () => {
  const result = comparePromptLines("one\ntwo", "one\nthree");
  assert.equal(result.added, 1); assert.equal(result.removed, 1);
  assert.deepEqual(result.rows.map((row) => row.type), ["same", "removed", "added"]);
});
