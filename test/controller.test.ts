import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionsController } from "../src/app/controller.js";
import { heartbeatPath, multiRepoWorkspacePath, sessionMetadataPath } from "../src/core/paths.js";
import { HEARTBEAT_STALE_MS } from "../src/core/status.js";
import type { ManagedSession } from "../src/core/types.js";
import type { TmuxPresence } from "../src/core/tmux.js";

function session(status: ManagedSession["status"], overrides: Partial<ManagedSession> = {}): ManagedSession {
  const id = overrides.id ?? "s1";
  const title = overrides.title ?? "api";
  return {
    id,
    title,
    cwd: `/tmp/${title}`,
    group: overrides.group ?? "default",
    tmuxSession: `pi-agent-hub-${id}`,
    status,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test("refreshPreview skips sessions with error status", async () => {
  const controller = new SessionsController({ version: 1, sessions: [session("error")] });

  await controller.refreshPreview();

  assert.equal(controller.snapshot().preview, "");
});

test("selection changes clear stale preview and ignore late captures", async () => {
  let resolveCapture!: (preview: string) => void;
  const capture = new Promise<string>((resolve) => { resolveCapture = resolve; });
  let captures = 0;
  const controller = new SessionsController({
    version: 1,
    sessions: [session("idle", { id: "api" }), session("idle", { id: "docs" })],
  }, async () => ++captures === 1 ? "api preview" : capture);

  await controller.refreshPreview();
  assert.equal(controller.snapshot().preview, "api preview");
  const refreshing = controller.refreshPreview();
  controller.move(1);

  assert.equal(controller.snapshot().selectedId, "docs");
  assert.equal(controller.snapshot().preview, "");
  resolveCapture("late api preview");
  await refreshing;
  assert.equal(controller.snapshot().preview, "");
});

test("movement keeps errors ahead of the activity-sorted tier", () => {
  const controller = new SessionsController({
    version: 1,
    sessions: [
      session("idle", { id: "work", title: "work", group: "work" }),
      session("idle", { id: "b", title: "b", group: "default" }),
      session("error", { id: "a", title: "a", group: "default" }),
    ],
  });

  assert.equal(controller.snapshot().selectedId, "a");
  controller.move(1);
  assert.equal(controller.snapshot().selectedId, "b");
  controller.move(1);
  assert.equal(controller.snapshot().selectedId, "work");
  controller.move(-1);
  assert.equal(controller.snapshot().selectedId, "b");
});

test("movement follows newest waiting or idle activity across groups", () => {
  const controller = new SessionsController({
    version: 1,
    sessions: [
      session("idle", { id: "default", title: "default", group: "default", lastActivityAt: 100 }),
      session("idle", { id: "work-idle", title: "work-idle", group: "work", lastActivityAt: 200 }),
      session("waiting", { id: "work-waiting", title: "work-waiting", group: "work", lastActivityAt: 300 }),
      session("waiting", { id: "z-waiting", title: "z-waiting", group: "z", lastActivityAt: 400 }),
      session("idle", { id: "z-idle", title: "z-idle", group: "z", lastActivityAt: 50 }),
    ],
  });

  assert.equal(controller.snapshot().selectedId, "z-waiting");
  controller.move(1);
  assert.equal(controller.snapshot().selectedId, "z-idle");
  controller.move(1);
  assert.equal(controller.snapshot().selectedId, "work-waiting");
  controller.move(1);
  assert.equal(controller.snapshot().selectedId, "work-idle");
  controller.move(1);
  assert.equal(controller.snapshot().selectedId, "default");
});

test("group priority includes nested subagent status", () => {
  const controller = new SessionsController({
    version: 1,
    sessions: [
      session("idle", { id: "default", title: "default", group: "default" }),
      session("idle", { id: "work", title: "work", group: "work" }),
      session("error", { id: "worker", title: "worker", group: "work", kind: "subagent", parentId: "work" }),
    ],
  });

  assert.equal(controller.snapshot().selectedId, "work");
  controller.move(1);
  assert.equal(controller.snapshot().selectedId, "worker");
  controller.move(1);
  assert.equal(controller.snapshot().selectedId, "default");
});

test("filter matches additional repo basenames", () => {
  const controller = new SessionsController({
    version: 1,
    sessions: [
      session("idle", { id: "api", title: "api", cwd: "/repo/api", additionalCwds: ["/repo/web-client"] }),
      session("idle", { id: "docs", title: "docs", cwd: "/repo/docs" }),
    ],
  });

  controller.setFilter("web-client");

  assert.equal(controller.snapshot().selectedId, "api");
});

test("moveSessionToGroup appends only when changing groups", async () => {
  await withTempSessionsDir(async () => {
    const controller = new SessionsController({
      version: 1,
      sessions: [
        session("idle", { id: "a", title: "a", group: "default", order: 0 }),
        session("idle", { id: "b", title: "b", group: "default", order: 1 }),
        session("idle", { id: "work", title: "work", group: "work", order: 0 }),
      ],
    });

    await controller.moveSessionToGroup("a", "default");
    assert.deepEqual(controller.snapshot().registry.sessions.find((item) => item.id === "a")?.order, 0);

    await controller.moveSessionToGroup("a", "work");
    assert.deepEqual(controller.snapshot().registry.sessions.find((item) => item.id === "a")?.order, 1);
  });
});

test("reorderSelected swaps selected session within its group and clamps at borders", async () => {
  await withTempSessionsDir(async () => {
    const controller = new SessionsController({
      version: 1,
      sessions: [
        session("idle", { id: "a", title: "a", order: 0 }),
        session("idle", { id: "b", title: "b", order: 1 }),
        session("idle", { id: "c", title: "c", order: 2 }),
        session("idle", { id: "work", title: "work", group: "work", order: 0 }),
      ],
    });

    controller.move(1);
    assert.equal(controller.snapshot().selectedId, "b");

    await controller.reorderSelected(-1);
    assert.deepEqual(controller.snapshot().registry.sessions.filter((item) => item.group === "default").map((item) => [item.id, item.order]), [["a", 1], ["b", 0], ["c", 2]]);
    assert.equal(controller.snapshot().selectedId, "b");

    await controller.reorderSelected(-1);
    assert.deepEqual(controller.snapshot().registry.sessions.filter((item) => item.group === "default").map((item) => [item.id, item.order]), [["a", 1], ["b", 0], ["c", 2]]);

    await controller.reorderSelected(1);
    await controller.reorderSelected(1);
    assert.deepEqual(controller.snapshot().registry.sessions.filter((item) => item.group === "default").map((item) => [item.id, item.order]), [["a", 0], ["b", 2], ["c", 1]]);
    assert.deepEqual(controller.snapshot().registry.sessions.filter((item) => item.group === "work").map((item) => [item.id, item.order]), [["work", 0]]);
  });
});

test("reorderSelected stays within the selected priority and activity tie", async () => {
  await withTempSessionsDir(async () => {
    const controller = new SessionsController({
      version: 1,
      sessions: [
        session("error", { id: "error", title: "error", order: 0 }),
        session("idle", { id: "idle-a", title: "idle-a", order: 1, lastActivityAt: 200 }),
        session("waiting", { id: "idle-b", title: "idle-b", order: 2, lastActivityAt: 100 }),
      ],
    });

    controller.move(1);
    assert.equal(controller.snapshot().selectedId, "idle-a");
    await controller.reorderSelected(-1);
    await controller.reorderSelected(1);
    assert.deepEqual(controller.snapshot().registry.sessions.map((item) => [item.id, item.order]), [["error", 0], ["idle-a", 1], ["idle-b", 2]]);
  });
});

test("reorderSelected ignores archived sessions", async () => {
  await withTempSessionsDir(async () => {
    const controller = new SessionsController({
      version: 1,
      sessions: [
        session("idle", { id: "new", title: "new", bucket: "archived", bucketChangedAt: 200, order: 1 }),
        session("idle", { id: "old", title: "old", bucket: "archived", bucketChangedAt: 100, order: 0 }),
      ],
    });

    await controller.reorderSelected(1);

    assert.deepEqual(controller.snapshot().registry.sessions.map((item) => [item.id, item.order]), [["new", 1], ["old", 0]]);
  });
});

async function withTempSessionsDir(fn: () => Promise<void>): Promise<void> {
  const oldDir = process.env.PI_AGENT_HUB_DIR;
  process.env.PI_AGENT_HUB_DIR = await mkdtemp(join(tmpdir(), "pi-agent-hub-controller-"));
  try {
    await fn();
  } finally {
    if (oldDir === undefined) delete process.env.PI_AGENT_HUB_DIR;
    else process.env.PI_AGENT_HUB_DIR = oldDir;
  }
}

async function assertPathMissing(path: string): Promise<void> {
  await assert.rejects(() => access(path), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT");
}

test("removeSession removes child rows with their parent", () => {
  const controller = new SessionsController({
    version: 1,
    sessions: [
      session("idle", { id: "parent", title: "parent", order: 0 }),
      session("running", { id: "child", title: "child", kind: "subagent", parentId: "parent", agentName: "scout" }),
      session("idle", { id: "sibling", title: "sibling", order: 1 }),
    ],
  });

  controller.removeSession("parent");

  assert.deepEqual(controller.snapshot().registry.sessions.map((item) => item.id), ["sibling"]);
  assert.equal(controller.snapshot().selectedId, "sibling");
});

test("refresh prunes subagent rows whose tmux sessions are gone", async () => {
  await withTempSessionsDir(async () => {
    const registry = {
      version: 1 as const,
      sessions: [
        session("idle", { id: "parent", title: "parent", order: 0 }),
        session("waiting", { id: "child", title: "child", kind: "subagent" as const, parentId: "parent", agentName: "scout" }),
      ],
    };
    await writeFile(join(process.env.PI_AGENT_HUB_DIR!, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    const controller = new SessionsController(registry);

    await controller.refresh(10);

    assert.deepEqual(controller.snapshot().registry.sessions.map((item) => item.id), ["parent"]);
  });
});

test("refresh reads optional session metadata without changing liveness", async () => {
  await withTempSessionsDir(async () => {
    const registry = { version: 1 as const, sessions: [session("running", { id: "api", title: "Hub title" })] };
    await writeFile(join(process.env.PI_AGENT_HUB_DIR!, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    await mkdir(join(process.env.PI_AGENT_HUB_DIR!, "session-metadata"), { recursive: true });
    await writeFile(join(process.env.PI_AGENT_HUB_DIR!, "session-metadata", "api.json"), `${JSON.stringify({
      source: "any-extension",
      goal: "Expose semantic dashboard metadata.",
      status: "Metadata file detected.",
      nextStep: "Render it carefully.",
      stage: "waiting",
      confidence: 0.9,
      attention: { kind: "question", text: "Choose the render order" },
    })}\n`, "utf8");
    const controller = new SessionsController(registry);

    await controller.refresh(10);

    const updated = controller.snapshot().registry.sessions[0];
    const runtime = controller.snapshot().sessions[0];
    assert.equal(updated?.status, "error");
    assert.equal(updated?.title, "Hub title");
    assert.equal("sessionMetadata" in (updated ?? {}), false);
    assert.equal(runtime?.sessionMetadata?.status, "Metadata file detected.");
    assert.deepEqual(runtime?.sessionMetadata?.attention, { kind: "question", text: "Choose the render order" });

    await unlink(sessionMetadataPath("api"));
    await controller.refresh(20);

    assert.equal(controller.snapshot().sessions[0]?.sessionMetadata, undefined);
    assert.equal("sessionMetadata" in (controller.snapshot().registry.sessions[0] ?? {}), false);
  });
});

test("refresh projects active workflow mode only from a fresh heartbeat with confirmed tmux presence", async () => {
  await withTempSessionsDir(async () => {
    const now = 1_000_000;
    const workflow = {
      steps: [{ id: "plan-md", short: "PL", label: "Plan" }, { id: "execute", short: "EX", label: "Execute" }],
      activeIndex: 1,
      ticketId: "workflow-board-002",
      updatedAt: now,
    };
    const activeMode = { id: "focus", short: "FOC", label: "Focus", detail: "turn 4" };
    const registry = { version: 1 as const, sessions: [session("running", { id: "api" })] };
    await writeFile(join(process.env.PI_AGENT_HUB_DIR!, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    await mkdir(join(process.env.PI_AGENT_HUB_DIR!, "heartbeats"), { recursive: true });
    let presence: TmuxPresence = "present";
    const controller = new SessionsController(registry, async () => "", async () => presence);
    const writeHeartbeat = async (overrides: Record<string, unknown> = {}) => {
      await writeFile(heartbeatPath("api"), `${JSON.stringify({
        managedSessionId: "api",
        cwd: "/tmp/api",
        state: "waiting",
        stateSince: now - 1_000,
        updatedAt: now,
        workflow: { ...workflow, activeMode },
        ...overrides,
      })}\n`, "utf8");
    };

    await writeHeartbeat();
    await controller.refresh(now);
    assert.deepEqual(controller.snapshot().sessions[0]?.workflow?.activeMode, activeMode);
    assert.deepEqual(controller.snapshot().registry.sessions[0]?.workflow, workflow);
    const persisted = JSON.parse(await readFile(join(process.env.PI_AGENT_HUB_DIR!, "registry.json"), "utf8"));
    assert.equal(persisted.sessions[0].workflow.activeMode, undefined);

    await writeHeartbeat({ state: "error", message: "provider paused" });
    await controller.refresh(now);
    assert.deepEqual(controller.snapshot().sessions[0]?.workflow?.activeMode, activeMode);

    await writeHeartbeat({ workflow });
    await controller.refresh(now + 1);
    assert.equal(controller.snapshot().sessions[0]?.workflow?.activeMode, undefined);

    await writeHeartbeat({ updatedAt: now - HEARTBEAT_STALE_MS - 1 });
    await controller.refresh(now);
    assert.equal(controller.snapshot().sessions[0]?.workflow?.activeMode, undefined);

    await writeHeartbeat({ state: "shutdown" });
    await controller.refresh(now);
    assert.equal(controller.snapshot().sessions[0]?.workflow?.activeMode, undefined);

    for (presence of ["missing", "unknown"] as const) {
      await writeHeartbeat();
      await controller.refresh(now);
      assert.equal(controller.snapshot().sessions[0]?.workflow?.activeMode, undefined, presence);
    }
  });
});

test("moving parent bucket moves child rows too", async () => {
  await withTempSessionsDir(async () => {
    const controller = new SessionsController({
      version: 1,
      sessions: [
        session("idle", { id: "parent", title: "parent", order: 0 }),
        session("running", { id: "child", title: "child", kind: "subagent", parentId: "parent", agentName: "scout" }),
      ],
    });

    await controller.moveSessionToBucket("parent", "archived", 100);

    assert.equal(controller.snapshot().registry.sessions.find((item) => item.id === "parent")?.bucket, "archived");
    assert.equal(controller.snapshot().registry.sessions.find((item) => item.id === "parent")?.bucketChangedAt, 100);
    assert.equal(controller.snapshot().registry.sessions.find((item) => item.id === "child")?.bucket, "archived");

    await controller.restoreSessionBucket("parent", 200);

    assert.equal(controller.snapshot().registry.sessions.find((item) => item.id === "parent")?.bucket, undefined);
    assert.equal(controller.snapshot().registry.sessions.find((item) => item.id === "parent")?.bucketChangedAt, undefined);
    assert.equal(controller.snapshot().registry.sessions.find((item) => item.id === "child")?.bucket, undefined);
  });
});

test("archiving selected row keeps selection in non-archived rows above its old position", async () => {
  await withTempSessionsDir(async () => {
    const controller = new SessionsController({
      version: 1,
      sessions: [
        session("idle", { id: "a", title: "a", order: 0 }),
        session("idle", { id: "b", title: "b", order: 1 }),
        session("idle", { id: "c", title: "c", order: 2 }),
      ],
    });
    controller.move(1);

    await controller.moveSessionToBucket("b", "archived", 100);

    assert.equal(controller.snapshot().selectedId, "a");
  });
});

test("archive pruning removes expired archived rows only when tmux is missing", async () => {
  await withTempSessionsDir(async () => {
    const registry = {
      version: 1 as const,
      sessions: [
        session("idle", { id: "active", title: "active" }),
        session("idle", { id: "backlog", title: "backlog", bucket: "backlog", bucketChangedAt: 1 }),
        session("idle", { id: "archived", title: "archived", bucket: "archived", bucketChangedAt: 1, workspaceCwd: multiRepoWorkspacePath("archived") }),
      ],
    };
    await writeFile(join(process.env.PI_AGENT_HUB_DIR!, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    await mkdir(multiRepoWorkspacePath("archived"), { recursive: true });
    await mkdir(join(process.env.PI_AGENT_HUB_DIR!, "heartbeats"), { recursive: true });
    await mkdir(join(process.env.PI_AGENT_HUB_DIR!, "session-metadata"), { recursive: true });
    await writeFile(heartbeatPath("archived"), `${JSON.stringify({ state: "shutdown", updatedAt: 1, stateSince: 1 })}\n`, "utf8");
    await writeFile(sessionMetadataPath("archived"), `${JSON.stringify({ source: "test", status: "old" })}\n`, "utf8");
    const controller = new SessionsController(registry);

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    await controller.refresh(1 + sevenDays - 1);
    assert.deepEqual(controller.snapshot().registry.sessions.map((item) => item.id), ["active", "backlog", "archived"]);

    await controller.refresh(1 + sevenDays);

    assert.deepEqual(controller.snapshot().registry.sessions.map((item) => item.id), ["active", "backlog"]);
    await assertPathMissing(multiRepoWorkspacePath("archived"));
    await assertPathMissing(heartbeatPath("archived"));
    await assertPathMissing(sessionMetadataPath("archived"));
  });
});

test("refresh reuses the main presence snapshot for expired archive pruning", async () => {
  await withTempSessionsDir(async () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const registry = {
      version: 1 as const,
      sessions: [
        session("idle", { id: "active", title: "active" }),
        session("idle", { id: "archived-present", title: "present", bucket: "archived", bucketChangedAt: 1 }),
        session("idle", { id: "child-present", title: "present child", kind: "subagent", parentId: "archived-present", bucket: "archived", bucketChangedAt: 1 }),
        session("idle", { id: "archived-missing", title: "missing", bucket: "archived", bucketChangedAt: 1 }),
        session("idle", { id: "child-missing", title: "missing child", kind: "subagent", parentId: "archived-missing", bucket: "archived", bucketChangedAt: 1 }),
      ],
    };
    await writeFile(join(process.env.PI_AGENT_HUB_DIR!, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    let calls = 0;
    const controller = new SessionsController(registry, async () => "", async (tmuxSession) => {
      calls += 1;
      return tmuxSession.includes("present") ? "present" : "missing";
    });

    await controller.refresh(1 + sevenDays);

    assert.deepEqual(controller.snapshot().registry.sessions.map((item) => item.id), ["active", "archived-present", "child-present"]);
    assert.equal(calls, 5);
  });
});

test("moving parent group moves direct child rows too", async () => {
  await withTempSessionsDir(async () => {
    const controller = new SessionsController({
      version: 1,
      sessions: [
        session("idle", { id: "parent", title: "parent", group: "default", order: 0 }),
        session("running", { id: "child", title: "child", group: "default", kind: "subagent", parentId: "parent", agentName: "scout" }),
      ],
    });

    await controller.moveSessionToGroup("parent", "work");

    assert.equal(controller.snapshot().registry.sessions.find((item) => item.id === "parent")?.group, "work");
    assert.equal(controller.snapshot().registry.sessions.find((item) => item.id === "child")?.group, "work");
  });
});

test("reorderSelected ignores subagent rows", async () => {
  await withTempSessionsDir(async () => {
    const controller = new SessionsController({
      version: 1,
      sessions: [
        session("idle", { id: "parent", title: "parent", order: 0 }),
        session("running", { id: "child", title: "child", kind: "subagent", parentId: "parent", agentName: "scout" }),
        session("idle", { id: "sibling", title: "sibling", order: 1 }),
      ],
    });

    controller.move(1);
    assert.equal(controller.snapshot().selectedId, "child");
    await controller.reorderSelected(1);

    assert.deepEqual(controller.snapshot().registry.sessions.filter((item) => item.kind !== "subagent").map((item) => [item.id, item.order]), [["parent", 0], ["sibling", 1]]);
  });
});

test("syncPiName renames a session from latest Pi session_info", async () => {
  await withTempSessionsDir(async () => {
    const file = join(process.env.PI_AGENT_HUB_DIR!, "session.jsonl");
    await writeFile(file, `${JSON.stringify({ type: "session_info", name: " Old " })}\n${JSON.stringify({ type: "session_info", name: "Pi Name" })}\n`, "utf8");
    const controller = new SessionsController({ version: 1, sessions: [session("idle", { id: "api", title: "hub", sessionFile: file })] });

    const result = await controller.syncPiName("api");

    assert.deepEqual(result, { status: "synced", name: "Pi Name" });
    assert.equal(controller.snapshot().registry.sessions[0]?.title, "Pi Name");
  });
});

test("syncPiName reports unavailable and unnamed sessions without renaming", async () => {
  await withTempSessionsDir(async () => {
    const file = join(process.env.PI_AGENT_HUB_DIR!, "session.jsonl");
    await writeFile(file, `${JSON.stringify({ type: "session_info", name: "" })}\n`, "utf8");
    const controller = new SessionsController({
      version: 1,
      sessions: [
        session("idle", { id: "missing", title: "missing" }),
        session("idle", { id: "unnamed", title: "unnamed", sessionFile: file }),
      ],
    });

    assert.deepEqual(await controller.syncPiName("missing"), { status: "unavailable" });
    assert.deepEqual(await controller.syncPiName("unnamed"), { status: "unnamed" });
    assert.deepEqual(controller.snapshot().registry.sessions.map((item) => item.title), ["missing", "unnamed"]);
  });
});
