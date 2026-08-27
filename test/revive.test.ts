import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { reviveSessions } from "../src/app/revive.js";
import { updateRegistry } from "../src/core/registry.js";
import type { CommandResult, ManagedSession } from "../src/core/types.js";
import type { TmuxExec } from "../src/core/tmux.js";

interface Call {
  command: string;
  args: string[];
}

function fakeTmux(handler: (call: Call) => CommandResult | Promise<CommandResult>): TmuxExec & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async exec(command, args) {
      const call = { command, args };
      calls.push(call);
      return handler(call);
    },
  };
}

function session(id: string, title: string, bucket?: ManagedSession["bucket"]): ManagedSession {
  return {
    id,
    title,
    cwd: `/tmp/${title}`,
    group: "default",
    tmuxSession: `pi-agent-hub-${id}`,
    status: "stopped",
    createdAt: 1,
    updatedAt: 1,
    ...(bucket ? { bucket } : {}),
  };
}

async function withStateDir<T>(action: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-revive-"));
  const oldDir = process.env.PI_AGENT_HUB_DIR;
  process.env.PI_AGENT_HUB_DIR = root;
  try {
    return await action();
  } finally {
    if (oldDir === undefined) delete process.env.PI_AGENT_HUB_DIR;
    else process.env.PI_AGENT_HUB_DIR = oldDir;
  }
}

test("revive restarts active rows, skips subagents and non-active buckets", async () => {
  await withStateDir(async () => {
    const active = session("act12345-0000", "api");
    const backlog = session("bak12345-0000", "backlog-row", "backlog");
    const subagent: ManagedSession = { ...session("sub12345-0000", "worker"), kind: "subagent", parentId: active.id };
    await updateRegistry((registry) => ({ ...registry, sessions: [active, backlog, subagent] }));

    const exec = fakeTmux((call) => {
      if (call.args[0] === "list-sessions") return { stdout: "", stderr: "" };
      if (call.args[0] === "has-session") throw new Error("no such session");
      return { stdout: "", stderr: "" };
    });
    const restartedIds: string[] = [];

    const result = await reviveSessions({ exec, restart: async (id) => { restartedIds.push(id); } });

    assert.deepEqual(restartedIds, [active.id]);
    assert.deepEqual(result.restarted, [active.id]);
    assert.deepEqual(result.skipped.sort(), [backlog.id, subagent.id].sort());
    assert.equal(result.killedStaleDashboard, false);
  });
});

test("revive kills a stale dashboard session whose panes are all shells", async () => {
  await withStateDir(async () => {
    const exec = fakeTmux((call) => {
      if (call.args[0] === "list-sessions") return { stdout: "pi-agent-hub\n", stderr: "" };
      if (call.args[0] === "list-panes") return { stdout: "bash\nbash\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });

    const result = await reviveSessions({ exec });

    assert.equal(result.killedStaleDashboard, true);
    assert.ok(exec.calls.some((call) => call.args[0] === "kill-session" && call.args.includes("pi-agent-hub")));
  });
});

test("revive leaves a live dashboard session untouched", async () => {
  await withStateDir(async () => {
    const exec = fakeTmux((call) => {
      if (call.args[0] === "list-sessions") return { stdout: "pi-agent-hub\n", stderr: "" };
      if (call.args[0] === "list-panes") return { stdout: "node\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });

    const result = await reviveSessions({ exec });

    assert.equal(result.killedStaleDashboard, false);
    assert.ok(!exec.calls.some((call) => call.args[0] === "kill-session"));
  });
});
