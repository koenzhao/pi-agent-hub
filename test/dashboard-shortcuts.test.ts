import test from "node:test";
import assert from "node:assert/strict";
import { matchesDashboardShortcut } from "../src/tui/dashboard-shortcuts.js";

test("matchesDashboardShortcut recognizes configured modifier keys", () => {
  assert.equal(matchesDashboardShortcut("\x0e", "C-n"), true);
  assert.equal(matchesDashboardShortcut("\x1br", "M-r"), true);
  assert.equal(matchesDashboardShortcut("n", "C-n"), false);
  assert.equal(matchesDashboardShortcut("r", "M-r"), false);
});

test("matchesDashboardShortcut recognizes named navigation keys", () => {
  assert.equal(matchesDashboardShortcut("\n", "Enter"), true);
  assert.equal(matchesDashboardShortcut("\r", "Enter"), true);
  assert.equal(matchesDashboardShortcut("\x1b", "Esc"), true);
  assert.equal(matchesDashboardShortcut("\x1b[A", "Up"), true);
  assert.equal(matchesDashboardShortcut("\x1b[B", "Down"), true);
  assert.equal(matchesDashboardShortcut("\x1b[1;2A", "Shift+Up"), true);
  assert.equal(matchesDashboardShortcut("\x1b[1;2B", "Shift+Down"), true);
});

test("matchesDashboardShortcut falls back to exact printable-key matching", () => {
  assert.equal(matchesDashboardShortcut("p", "p"), true);
  assert.equal(matchesDashboardShortcut("P", "p"), false);
});
