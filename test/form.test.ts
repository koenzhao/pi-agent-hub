import test from "node:test";
import assert from "node:assert/strict";
import { createForm, editField, moveFocus, validateRequired, value } from "../src/tui/form.js";

const RIGHT = "\u001b[C";

test("generic form edits focused field and clears field errors", () => {
  const form = createForm([
    { key: "title", label: "title", value: "api", error: "title is required" },
  ]);

  const edited = editField(form, "x")!;

  assert.equal(value(edited, "title"), "apix");
  assert.equal(edited.fields.title.error, undefined);
});

test("editField clears errors for edits but preserves them for cursor moves", () => {
  const form = createForm([
    { key: "title", label: "title", value: "api", cursor: 1, error: "title is required" },
  ]);

  const moved = editField(form, RIGHT)!;
  assert.equal(moved.fields.title.cursor, 2);
  assert.equal(moved.fields.title.error, "title is required");

  const edited = editField(form, "x")!;
  assert.equal(value(edited, "title"), "axpi");
  assert.equal(edited.fields.title.error, undefined);
});

test("generic form cycles focus and backspaces selected field", () => {
  const form = createForm([
    { key: "group", label: "group", value: "default" },
    { key: "title", label: "title", value: "api fork" },
  ]);

  const edited = editField(moveFocus(form, 1), "\u007f")!;

  assert.equal(edited.focus, "title");
  assert.equal(value(edited, "group"), "default");
  assert.equal(value(edited, "title"), "api for");
});

test("validateRequired trims values and focuses first missing field", () => {
  const form = createForm<"group" | "title">([
    { key: "group", label: "group", value: "   " },
    { key: "title", label: "title", value: "  api fork  " },
  ], "title");

  const result = validateRequired(form, ["group", "title"]);

  assert.equal(result.ok, false);
  assert.equal(result.state.focus, "group");
  assert.equal(result.state.fields.group.error, "group is required");
  assert.equal(value(result.state, "title"), "api fork");
});
