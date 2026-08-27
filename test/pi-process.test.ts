import test from "node:test";
import assert from "node:assert/strict";
import { buildPiArgs } from "../src/core/pi-process.js";

test("builds new session args", () => {
  assert.deepEqual(buildPiArgs({ extensionPath: "/ext.js" }), ["--extension", "/ext.js"]);
});

test("builds resume session args", () => {
  assert.deepEqual(buildPiArgs({ extensionPath: "/ext.js", sessionFile: "/s.jsonl" }), ["--extension", "/ext.js", "--session", "/s.jsonl"]);
});

test("builds fork args", () => {
  assert.deepEqual(buildPiArgs({ extensionPath: "/ext.js", forkFrom: "/s.jsonl" }), ["--extension", "/ext.js", "--fork", "/s.jsonl"]);
});

test("builds args with name", () => {
  assert.deepEqual(buildPiArgs({ extensionPath: "/ext.js", name: "api" }), ["--extension", "/ext.js", "--name", "api"]);
});

test("builds fork args with name before initial prompt", () => {
  assert.deepEqual(buildPiArgs({ extensionPath: "/ext.js", forkFrom: "/s.jsonl", name: "api", initialPrompt: "go" }), ["--extension", "/ext.js", "--fork", "/s.jsonl", "--name", "api", "go"]);
});

test("rejects resume and fork together", () => {
  assert.throws(() => buildPiArgs({ extensionPath: "/ext.js", sessionFile: "/s.jsonl", forkFrom: "/s.jsonl" }), /either/);
});
