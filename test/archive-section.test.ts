import test from "node:test";
import assert from "node:assert/strict";
import { orderedSessionRows } from "../src/core/session-tree.js";
import { archiveSectionRows, effectiveSessionLifecycle } from "../src/tui/archive-section.js";
import type { RuntimeSession } from "../src/core/types.js";

function session(id: string, overrides: Partial<RuntimeSession> = {}): RuntimeSession {
  return {
    id,
    title: id,
    cwd: `/tmp/${id}`,
    group: "default",
    tmuxSession: `pi-agent-hub-${id}`,
    status: "stopped",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function archived(id: string, changedAt: number): RuntimeSession {
  return session(id, { bucket: "archived", bucketChangedAt: changedAt });
}

test("archiveSectionRows shows five parent cascades and counts hidden parents", () => {
  const rows = [
    session("active"),
    archived("a", 700), session("a-child", { kind: "subagent", parentId: "a", agentName: "scout", bucket: "archived", bucketChangedAt: 700 }),
    archived("b", 600), archived("c", 500), archived("d", 400), archived("e", 300),
    archived("f", 200), session("f-child", { kind: "subagent", parentId: "f", agentName: "worker", bucket: "archived", bucketChangedAt: 200 }),
    archived("g", 100),
  ];

  const result = archiveSectionRows(rows, { expanded: false, filterActive: false });

  assert.deepEqual(result.rows.map((row) => row.id), ["active", "a", "a-child", "b", "c", "d", "e"]);
  assert.equal(result.hiddenParents, 2);
  assert.equal(result.showDisclosure, true);
});

test("archiveSectionRows expands all cascades and filtering bypasses disclosure", () => {
  const rows = Array.from({ length: 7 }, (_, index) => archived(String(index), 7 - index));

  const expanded = archiveSectionRows(rows, { expanded: true, filterActive: false });
  assert.deepEqual(expanded.rows.map((row) => row.id), rows.map((row) => row.id));
  assert.equal(expanded.hiddenParents, 2);
  assert.equal(expanded.showDisclosure, true);

  const filtered = archiveSectionRows(rows, { expanded: false, filterActive: true });
  assert.deepEqual(filtered.rows.map((row) => row.id), rows.map((row) => row.id));
  assert.equal(filtered.showDisclosure, false);
});

test("late-created descendants inherit top-level parent lifecycle and timestamp", () => {
  const parent = archived("parent", 100);
  const child = session("child", { kind: "subagent", parentId: "parent", agentName: "worker" });
  const grandchild = session("grandchild", { kind: "subagent", parentId: "child", agentName: "scout" });

  assert.deepEqual(effectiveSessionLifecycle(child, [parent, child, grandchild]), { section: "archived", bucketChangedAt: 100 });
  assert.deepEqual(effectiveSessionLifecycle(grandchild, [parent, child, grandchild]), { section: "archived", bucketChangedAt: 100 });
});

test("chronological parent ordering keeps nested archived cascades contiguous", () => {
  const old = archived("old", 100);
  const recent = archived("recent", 200);
  const child = session("child", { kind: "subagent", parentId: "recent", agentName: "worker" });
  const grandchild = session("grandchild", { kind: "subagent", parentId: "child", agentName: "scout" });

  assert.deepEqual(orderedSessionRows([old, grandchild, child, recent]).map((row) => row.id), ["recent", "child", "grandchild", "old"]);
});

test("orphan subagents retain their own lifecycle without consuming a parent slot", () => {
  const orphan = session("orphan", { kind: "subagent", parentId: "missing", agentName: "scout", bucket: "archived", bucketChangedAt: 50 });
  const rows = [...Array.from({ length: 6 }, (_, index) => archived(String(index), 100 - index)), orphan];

  const result = archiveSectionRows(rows, { expanded: false, filterActive: false });

  assert.equal(result.hiddenParents, 1);
  assert.ok(result.rows.some((row) => row.id === "orphan"));
});
