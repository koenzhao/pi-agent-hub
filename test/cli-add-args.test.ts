import test from "node:test";
import assert from "node:assert/strict";
import { parseAddArgs } from "../src/cli-add-args.js";

test("parseAddArgs parses title flag forms", () => {
  assert.equal(parseAddArgs(["/tmp/repo", "-t", "Short title"]).title, "Short title");
  assert.equal(parseAddArgs(["/tmp/repo", "--title", "Long title"]).title, "Long title");
  assert.equal(parseAddArgs(["/tmp/repo", "--title=Inline title"]).title, "Inline title");
  assert.equal(parseAddArgs(["/tmp/repo", "-t", ""]).title, "");
});

test("parseAddArgs parses prompt flag forms", () => {
  assert.equal(parseAddArgs(["/tmp/repo", "--prompt", "/start-task TM-3402"]).initialPrompt, "/start-task TM-3402");
  assert.equal(parseAddArgs(["/tmp/repo", "--prompt=echo hello"]).initialPrompt, "echo hello");
});

test("parseAddArgs requires cwd", () => {
  assert.throws(() => parseAddArgs([]), /Missing cwd/);
  assert.throws(() => parseAddArgs(["--prompt", "task"]), /Missing cwd/);
});

test("parseAddArgs rejects multiline prompts", () => {
  assert.throws(() => parseAddArgs(["/tmp/repo", "--prompt", "line 1\nline 2"]), /one line/);
  assert.throws(() => parseAddArgs(["/tmp/repo", "--prompt=line 1\rline 2"]), /one line/);
});
