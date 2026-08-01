import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import piAgentHubExtension from "../src/extension/index.js";
import { SESSION_ID_ENV, STATE_ENV } from "../src/core/names.js";
import { heartbeatPath } from "../src/core/paths.js";
import { publishThemeCommand } from "../src/core/theme-command.js";
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
  await publishThemeCommand("light", "light", { PI_AGENT_HUB_DIR: root }, { now: Date.now() + 10, revision: "subagent-command" });
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
        getTheme() { throw new Error("subagent theme command should not be read"); },
        setTheme() { throw new Error("subagent theme command should not be applied"); },
      },
    });

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

test("piAgentHubExtension does not apply theme commands in unmanaged Pi processes", async () => {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-extension-theme-command-"));
  const previousSessionId = process.env[SESSION_ID_ENV];
  const previousStateDir = process.env[STATE_ENV];
  delete process.env[SESSION_ID_ENV];
  process.env[STATE_ENV] = root;
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { handlers.set(name, handler); },
    registerTool() {},
  };
  const applied: string[] = [];
  const ctx = {
    cwd: root,
    hasUI: true,
    ui: {
      theme: { name: "dark" },
      getTheme: () => ({ name: "light" }),
      setTheme: (theme: { name: string }) => { applied.push(theme.name); },
    },
  };

  try {
    piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
    await publishThemeCommand("light", "light", { PI_AGENT_HUB_DIR: root }, { now: Date.now() + 10, revision: "unmanaged-command" });
    await handlers.get("session_start")?.({}, ctx);
    assert.deepEqual(applied, []);
  } finally {
    await handlers.get("session_shutdown")?.({}, ctx);
    if (previousSessionId === undefined) delete process.env[SESSION_ID_ENV];
    else process.env[SESSION_ID_ENV] = previousSessionId;
    if (previousStateDir === undefined) delete process.env[STATE_ENV];
    else process.env[STATE_ENV] = previousStateDir;
    delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  }
});

test("piAgentHubExtension applies one theme command created before session_start and refreshes heartbeat", async () => {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-extension-theme-command-"));
  const previousSessionId = process.env[SESSION_ID_ENV];
  const previousStateDir = process.env[STATE_ENV];
  process.env[SESSION_ID_ENV] = "session-theme-command";
  process.env[STATE_ENV] = root;
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { handlers.set(name, handler); },
    registerTool() {},
  };
  const dark = { name: "dark", getFgAnsi: () => "\u001b[38;2;1;1;1m" };
  const light = { name: "light", getFgAnsi: () => "\u001b[38;2;2;2;2m" };
  const applied: string[] = [];
  const ctx = {
    cwd: root,
    hasUI: true,
    ui: {
      theme: dark,
      getTheme(name: string) { return name === "light" ? light : undefined; },
      setTheme(theme: typeof light) { this.theme = theme; applied.push(theme.name); },
    },
  };

  try {
    piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
    await publishThemeCommand("light/dark", "light", { PI_AGENT_HUB_DIR: root }, { now: Date.now() + 10, revision: "new-command" });
    await handlers.get("session_start")?.({}, ctx);
    await handlers.get("agent_start")?.({}, ctx);
    await publishThemeCommand("missing", "missing", { PI_AGENT_HUB_DIR: root }, { now: Date.now() + 20, revision: "missing-command" });
    await handlers.get("agent_end")?.({}, ctx);

    assert.deepEqual(applied, ["light"]);
    const heartbeat = JSON.parse(await readFile(heartbeatPath("session-theme-command", { PI_AGENT_HUB_DIR: root }), "utf8")) as Heartbeat;
    assert.equal(heartbeat.activeTheme?.name, "light");
  } finally {
    await handlers.get("session_shutdown")?.({}, ctx);
    if (previousSessionId === undefined) delete process.env[SESSION_ID_ENV];
    else process.env[SESSION_ID_ENV] = previousSessionId;
    if (previousStateDir === undefined) delete process.env[STATE_ENV];
    else process.env[STATE_ENV] = previousStateDir;
    delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  }
});

test("piAgentHubExtension polls a new theme command while the session is idle", async () => {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-extension-theme-command-"));
  const previousSessionId = process.env[SESSION_ID_ENV];
  const previousStateDir = process.env[STATE_ENV];
  process.env[SESSION_ID_ENV] = "session-idle-theme-command";
  process.env[STATE_ENV] = root;
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { handlers.set(name, handler); },
    registerTool() {},
  };
  const applied: string[] = [];
  const ctx = {
    cwd: root,
    hasUI: true,
    ui: {
      theme: { name: "dark" },
      getTheme: (name: string) => ({ name }),
      setTheme(theme: { name: string }) { this.theme = theme; applied.push(theme.name); },
    },
  };

  try {
    piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
    await handlers.get("session_start")?.({}, ctx);
    await publishThemeCommand("light", "light", { PI_AGENT_HUB_DIR: root }, { now: Date.now() + 10, revision: "idle-command" });
    const heartbeat = await waitForHeartbeat(root, "session-idle-theme-command", (item) => item.activeTheme?.name === "light");
    assert.deepEqual(applied, ["light"]);
    assert.equal(heartbeat.activeTheme?.name, "light");
  } finally {
    await handlers.get("session_shutdown")?.({}, ctx);
    if (previousSessionId === undefined) delete process.env[SESSION_ID_ENV];
    else process.env[SESSION_ID_ENV] = previousSessionId;
    if (previousStateDir === undefined) delete process.env[STATE_ENV];
    else process.env[STATE_ENV] = previousStateDir;
    delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  }
});

test("piAgentHubExtension ignores a theme command created exactly at process start", async () => {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-extension-theme-command-"));
  const previousSessionId = process.env[SESSION_ID_ENV];
  const previousStateDir = process.env[STATE_ENV];
  process.env[SESSION_ID_ENV] = "session-equal-theme-command";
  process.env[STATE_ENV] = root;
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const applied: string[] = [];
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { handlers.set(name, handler); },
    registerTool() {},
  };
  const ctx = {
    cwd: root,
    hasUI: true,
    ui: {
      theme: { name: "dark" },
      getTheme: () => ({ name: "light" }),
      setTheme: (theme: { name: string }) => { applied.push(theme.name); },
    },
  };

  try {
    const originalNow = Date.now;
    Date.now = () => 1_000;
    try {
      piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
    } finally {
      Date.now = originalNow;
    }
    await publishThemeCommand("light", "light", { PI_AGENT_HUB_DIR: root }, { now: 1_000, revision: "equal-command" });
    await handlers.get("session_start")?.({}, ctx);
    assert.deepEqual(applied, []);
  } finally {
    await handlers.get("session_shutdown")?.({}, ctx);
    if (previousSessionId === undefined) delete process.env[SESSION_ID_ENV];
    else process.env[SESSION_ID_ENV] = previousSessionId;
    if (previousStateDir === undefined) delete process.env[STATE_ENV];
    else process.env[STATE_ENV] = previousStateDir;
    delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  }
});

test("piAgentHubExtension ignores theme commands older than the extension process", async () => {
  delete (globalThis as Record<symbol, unknown>)[EXTENSION_KEY];
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-extension-theme-command-"));
  const previousSessionId = process.env[SESSION_ID_ENV];
  const previousStateDir = process.env[STATE_ENV];
  process.env[SESSION_ID_ENV] = "session-old-theme-command";
  process.env[STATE_ENV] = root;
  await publishThemeCommand("light", "light", { PI_AGENT_HUB_DIR: root }, { now: 1, revision: "old-command" });
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<void>>();
  const applied: string[] = [];
  const pi = {
    on(name: string, handler: (event: unknown, ctx: unknown) => Promise<void>) { handlers.set(name, handler); },
    registerTool() {},
  };
  const ctx = {
    cwd: root,
    hasUI: true,
    ui: {
      theme: { name: "dark" },
      getTheme: () => ({ name: "light" }),
      setTheme: (theme: { name: string }) => { applied.push(theme.name); },
    },
  };

  try {
    piAgentHubExtension(pi as unknown as Parameters<typeof piAgentHubExtension>[0]);
    await handlers.get("session_start")?.({}, ctx);
    assert.deepEqual(applied, []);
  } finally {
    await handlers.get("session_shutdown")?.({}, ctx);
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

const WORKFLOW_STEPS = [
  { id: "plan-md", short: "PL", label: "Plan" },
  { id: "execute", short: "EX", label: "Execute" },
  { id: "review", short: "RV", label: "Review" },
  { id: "reflect", short: "RF", label: "Reflect" },
  { id: "commit", short: "CM", label: "Commit" },
];

const FOCUS_MODE = {
  id: "focus",
  short: "FOC",
  label: "Focus",
  detail: "turn 4",
};

const WORKFLOW_ENTRY = {
  type: "custom",
  customType: "workflow-runtime",
  data: {
    activeStep: "execute",
    ticketId: "workflow-board-001",
    updatedAt: 1_784_772_000_000,
    steps: WORKFLOW_STEPS,
  },
};

test("piAgentHubExtension bridges the producer-owned workflow definition into heartbeat", async () => {
  const heartbeat = await heartbeatWithSessionManager({
    getBranch: () => [
      { ...WORKFLOW_ENTRY, data: { ...WORKFLOW_ENTRY.data, activeStep: "review", updatedAt: 1_784_771_000_000 } },
      { type: "message" },
      WORKFLOW_ENTRY,
    ],
  });

  assert.deepEqual(heartbeat.workflow, {
    steps: WORKFLOW_STEPS,
    activeIndex: 1,
    ticketId: "workflow-board-001",
    updatedAt: 1_784_772_000_000,
  });
});

test("piAgentHubExtension bridges optional producer mode display into heartbeat", async () => {
  const heartbeat = await heartbeatWithSessionManager({
    getBranch: () => [{
      ...WORKFLOW_ENTRY,
      data: { ...WORKFLOW_ENTRY.data, activeMode: { ...FOCUS_MODE, ignored: "producer-private" } },
    }],
  });

  assert.deepEqual(heartbeat.workflow, {
    steps: WORKFLOW_STEPS,
    activeIndex: 1,
    activeMode: FOCUS_MODE,
    ticketId: "workflow-board-001",
    updatedAt: 1_784_772_000_000,
  });
});

test("piAgentHubExtension drops malformed optional mode without dropping workflow", async () => {
  const invalidModes = [
    {},
    { id: "", short: "FOC" },
    { id: "focus", short: "" },
    { id: "focus", short: "FOC", label: "" },
    { id: "focus", short: "FOC", detail: "" },
  ];

  for (const [index, activeMode] of invalidModes.entries()) {
    const heartbeat = await heartbeatWithSessionManager({
      getBranch: () => [{ ...WORKFLOW_ENTRY, data: { ...WORKFLOW_ENTRY.data, activeMode } }],
    });
    assert.deepEqual(heartbeat.workflow, {
      steps: WORKFLOW_STEPS,
      activeIndex: 1,
      ticketId: "workflow-board-001",
      updatedAt: 1_784_772_000_000,
    }, `invalid mode ${index}`);
  }
});

test("piAgentHubExtension keeps producer workflow time stable across heartbeat cadence", async () => {
  const first = await heartbeatWithSessionManager({ getBranch: () => [WORKFLOW_ENTRY] });
  await new Promise((resolve) => setTimeout(resolve, 2));
  const second = await heartbeatWithSessionManager({ getBranch: () => [WORKFLOW_ENTRY] });

  assert.equal(first.workflow?.updatedAt, WORKFLOW_ENTRY.data.updatedAt);
  assert.equal(second.workflow?.updatedAt, WORKFLOW_ENTRY.data.updatedAt);
});

test("piAgentHubExtension rejects invalid producer workflow definitions", async () => {
  const invalidData: Record<string, unknown>[] = [
    {},
    { activeStep: "execute", updatedAt: WORKFLOW_ENTRY.data.updatedAt },
    { activeStep: "execute", updatedAt: Number.NaN, steps: WORKFLOW_STEPS },
    { activeStep: "unknown", updatedAt: WORKFLOW_ENTRY.data.updatedAt, steps: WORKFLOW_STEPS },
    { activeStep: "execute", updatedAt: WORKFLOW_ENTRY.data.updatedAt, steps: [] },
    { activeStep: "execute", updatedAt: WORKFLOW_ENTRY.data.updatedAt, steps: [{ id: "execute", short: "" }] },
    { activeStep: "execute", updatedAt: WORKFLOW_ENTRY.data.updatedAt, steps: [{ id: "execute", short: "EX" }, { id: "execute", short: "E2" }] },
    { activeStep: "execute", updatedAt: WORKFLOW_ENTRY.data.updatedAt, steps: [{ id: "execute", short: "EX", label: "" }] },
  ];

  for (const [index, data] of invalidData.entries()) {
    const heartbeat = await heartbeatWithSessionManager({
      getBranch: () => [{ type: "custom", customType: "workflow-runtime", data }],
    });
    assert.equal(heartbeat.workflow, undefined, `invalid definition ${index}`);
  }

  const cleared = await heartbeatWithSessionManager({ getBranch: () => [WORKFLOW_ENTRY, { type: "custom", customType: "workflow-runtime", data: {} }] });
  assert.equal(cleared.workflow, undefined);
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
  while (Date.now() - started < 1_500) {
    try {
      last = JSON.parse(await readFile(heartbeatPath(sessionId, { PI_AGENT_HUB_DIR: root }), "utf8")) as Heartbeat;
      if (predicate(last)) return last;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out waiting for heartbeat; last=${JSON.stringify(last)}`);
}
