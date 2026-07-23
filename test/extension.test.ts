import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import piAgentHubExtension from "../src/extension/index.js";
import { SESSION_ID_ENV, STATE_ENV } from "../src/core/names.js";
import { heartbeatPath } from "../src/core/paths.js";
import type { Heartbeat } from "../src/core/types.js";

const EXTENSION_KEY = Symbol.for("pi-agent-hub.extension.loaded");

test("piAgentHubExtension registers handlers once per active process", async () => {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const events: string[] = [];
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
      events.push(name);
      handlers.set(name, handler);
    },
  };

  piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
  piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);

  assert.deepEqual(events, ["session_start", "agent_start", "agent_end", "session_shutdown"]);

  await handlers.get("session_shutdown")?.({}, { cwd: "/repo" });
  piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);

  assert.deepEqual(events, [
    "session_start", "agent_start", "agent_end", "session_shutdown",
    "session_start", "agent_start", "agent_end", "session_shutdown",
  ]);
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
});

test("piAgentHubExtension leaves tmux subagent heartbeats to child bootstrap", async () => {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-extension-"));
  const previousSessionId = process.env[SESSION_ID_ENV];
  const previousStateDir = process.env[STATE_ENV];
  const previousSubagentJobId = process.env.PI_TMUX_SUBAGENTS_JOB_ID;
  process.env[SESSION_ID_ENV] = "subagent-1";
  process.env[STATE_ENV] = root;
  process.env.PI_TMUX_SUBAGENTS_JOB_ID = "subagent-1";
  const file = heartbeatPath("subagent-1", { PI_AGENT_HUB_DIR: root });
  const childHeartbeat = `${JSON.stringify({ owner: "child-bootstrap" })}\n`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, childHeartbeat, "utf8");
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
      handlers.set(name, handler);
    },
    registerTool() {},
  };

  try {
    piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
    await handlers.get("session_start")?.({}, { cwd: root, hasUI: false });

    assert.equal(await readFile(file, "utf8"), childHeartbeat);
  } finally {
    await handlers.get("session_shutdown")?.({}, { cwd: root, hasUI: false });
    if (previousSessionId === undefined) delete process.env[SESSION_ID_ENV];
    else process.env[SESSION_ID_ENV] = previousSessionId;
    if (previousStateDir === undefined) delete process.env[STATE_ENV];
    else process.env[STATE_ENV] = previousStateDir;
    if (previousSubagentJobId === undefined) delete process.env.PI_TMUX_SUBAGENTS_JOB_ID;
    else process.env.PI_TMUX_SUBAGENTS_JOB_ID = previousSubagentJobId;
    delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  }
});

test("piAgentHubExtension refreshes active theme shortly after session start", async () => {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-extension-"));
  const previousSessionId = process.env[SESSION_ID_ENV];
  const previousStateDir = process.env[STATE_ENV];
  process.env[SESSION_ID_ENV] = "session-startup-theme";
  process.env[STATE_ENV] = root;
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
      handlers.set(name, handler);
    },
    registerTool() {},
  };
  const ctx = {
    cwd: root,
    hasUI: true,
    ui: {
      theme: {
        name: "startup-theme",
        getFgAnsi() { return "\u001b[38;2;1;1;1m"; },
      },
    },
  };

  try {
    piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
    await handlers.get("session_start")?.({}, ctx);
    ctx.ui.theme.name = "solarized-dark";
    ctx.ui.theme.getFgAnsi = () => "\u001b[38;2;2;3;4m";

    const heartbeat = await waitForHeartbeat(root, "session-startup-theme", (item) => item.activeTheme?.name === "solarized-dark");

    assert.equal(heartbeat.activeTheme?.tokens?.accent, "#020304");
  } finally {
    await handlers.get("session_shutdown")?.({}, { cwd: root });
    if (previousSessionId === undefined) delete process.env[SESSION_ID_ENV];
    else process.env[SESSION_ID_ENV] = previousSessionId;
    if (previousStateDir === undefined) delete process.env[STATE_ENV];
    else process.env[STATE_ENV] = previousStateDir;
    delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  }
});

test("piAgentHubExtension records the active Pi theme in heartbeat", async () => {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-extension-"));
  const previousSessionId = process.env[SESSION_ID_ENV];
  const previousStateDir = process.env[STATE_ENV];
  process.env[SESSION_ID_ENV] = "session-1";
  process.env[STATE_ENV] = root;
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
      handlers.set(name, handler);
    },
    registerTool() {},
  };

  try {
    piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
    await handlers.get("session_start")?.({}, {
      cwd: root,
      hasUI: true,
      ui: {
        theme: {
          name: "active-theme",
          sourcePath: "/themes/active-theme.json",
          getFgAnsi(token: string) {
            if (token === "accent") return "\u001b[38;2;1;2;3m";
            if (token === "muted") return "\u001b[38;5;244m";
            if (token === "text") return "\u001b[39m";
            return "\u001b[38;2;4;5;6m";
          },
        },
      },
    });

    const heartbeat = JSON.parse(await readFile(heartbeatPath("session-1", { PI_AGENT_HUB_DIR: root }), "utf8")) as Heartbeat;

    assert.deepEqual(heartbeat.activeTheme, {
      name: "active-theme",
      sourcePath: "/themes/active-theme.json",
      tokens: {
        accent: "#010203",
        border: "#040506",
        dim: "#040506",
        error: "#040506",
        muted: 244,
        success: "#040506",
        text: "",
        warning: "#040506",
      },
    });
    await handlers.get("session_shutdown")?.({}, { cwd: root });
  } finally {
    if (previousSessionId === undefined) delete process.env[SESSION_ID_ENV];
    else process.env[SESSION_ID_ENV] = previousSessionId;
    if (previousStateDir === undefined) delete process.env[STATE_ENV];
    else process.env[STATE_ENV] = previousStateDir;
    delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  }
});

test("piAgentHubExtension bridges workflow-runtime entries into heartbeat", async () => {
  const branches: Record<string, unknown[]> = {
    "latest wins": [
      { type: "custom", customType: "workflow-runtime", data: { activeStep: "prime", ticketId: "auth-001" } },
      { type: "message" },
      { type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", ticketId: "auth-002" } },
    ],
    cleared: [
      { type: "custom", customType: "workflow-runtime", data: { activeStep: "execute" } },
      { type: "custom", customType: "workflow-runtime", data: {} },
    ],
    malformed: [{ type: "custom", customType: "workflow-runtime", data: { activeStep: "unknown-step" } }],
    "no entries": [{ type: "message" }],
  };
  const expected: Record<string, { activeIndex: number; ticketId?: string } | undefined> = {
    "latest wins": { activeIndex: 3, ticketId: "auth-002" },
    cleared: undefined,
    malformed: undefined,
    "no entries": undefined,
  };

  for (const [name, entries] of Object.entries(branches)) {
    const heartbeat = await heartbeatWithSessionManager({ getBranch: () => entries });
    if (expected[name] === undefined) {
      assert.equal(heartbeat.workflow, undefined, name);
    } else {
      assert.equal(heartbeat.workflow?.activeIndex, expected[name]?.activeIndex, name);
      assert.equal(heartbeat.workflow?.ticketId, expected[name]?.ticketId, name);
      assert.equal(heartbeat.workflow?.steps.length, 7, name);
      assert.equal(heartbeat.workflow?.steps[3]?.short, "EX", name);
    }
  }
});

test("piAgentHubExtension omits workflow when getBranch is unavailable or throws", async () => {
  assert.equal((await heartbeatWithSessionManager({})).workflow, undefined);
  assert.equal((await heartbeatWithSessionManager({ getBranch: () => { throw new Error("boom"); } })).workflow, undefined);
});

async function heartbeatWithSessionManager(sessionManager: Record<string, unknown>): Promise<Heartbeat> {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-extension-"));
  const previousSessionId = process.env[SESSION_ID_ENV];
  const previousStateDir = process.env[STATE_ENV];
  process.env[SESSION_ID_ENV] = "session-wf";
  process.env[STATE_ENV] = root;
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) {
      handlers.set(name, handler);
    },
    registerTool() {},
  };

  try {
    piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
    await handlers.get("session_start")?.({}, { cwd: root, hasUI: false, sessionManager });
    return JSON.parse(await readFile(heartbeatPath("session-wf", { PI_AGENT_HUB_DIR: root }), "utf8")) as Heartbeat;
  } finally {
    await handlers.get("session_shutdown")?.({}, { cwd: root, sessionManager });
    if (previousSessionId === undefined) delete process.env[SESSION_ID_ENV];
    else process.env[SESSION_ID_ENV] = previousSessionId;
    if (previousStateDir === undefined) delete process.env[STATE_ENV];
    else process.env[STATE_ENV] = previousStateDir;
    delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  }
}

async function waitForHeartbeat(root: string, sessionId: string, predicate: (heartbeat: Heartbeat) => boolean): Promise<Heartbeat> {
  const started = Date.now();
  let last: Heartbeat | undefined;
  while (Date.now() - started < 1_000) {
    try {
      last = JSON.parse(await readFile(heartbeatPath(sessionId, { PI_AGENT_HUB_DIR: root }), "utf8")) as Heartbeat;
      if (predicate(last)) return last;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for heartbeat; last=${JSON.stringify(last)}`);
}
