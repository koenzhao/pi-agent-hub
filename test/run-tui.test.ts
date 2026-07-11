import test from "node:test";
import assert from "node:assert/strict";
import { buildNewFormContext, createRegistryMutator, loadDashboardTheme, resolveDashboardThemeSessionId, restartAllTargets, startSidePanePresenceRefreshLoop } from "../src/app/run-tui.js";
import type { ManagedSession } from "../src/core/types.js";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function session(id: string, cwd: string, group: string, additionalCwds?: string[]): ManagedSession {
  return {
    id,
    title: id,
    cwd,
    group,
    ...(additionalCwds?.length ? { additionalCwds } : {}),
    tmuxSession: `pi-agent-hub-${id}`,
    status: "idle",
    createdAt: 1,
    updatedAt: 1,
  };
}

test("restartAllTargets includes only active parent sessions", () => {
  const active = session("active", "/repo/active", "one");
  const backlog = { ...session("backlog", "/repo/backlog", "one"), bucket: "backlog" as const };
  const archived = { ...session("archived", "/repo/archived", "one"), bucket: "archived" as const };
  const subagent = { ...session("subagent", "/repo/active", "one"), kind: "subagent" as const, parentId: active.id };

  assert.deepEqual(restartAllTargets([active, backlog, archived, subagent]), [active]);
});

test("resolveDashboardThemeSessionId prefers persisted existing session", () => {
  const first = session("first", "/repo/first", "one");
  const second = session("second", "/repo/second", "two");

  assert.equal(resolveDashboardThemeSessionId([first, second], "second", "first"), "second");
  assert.equal(resolveDashboardThemeSessionId([first, second], "missing", "first"), "first");
});

test("loadDashboardTheme follows the pinned session instead of selection movement", async () => {
  const first = { ...session("first", "/repo/first", "one"), activeTheme: { tokens: { accent: "#111111" } } };
  const second = { ...session("second", "/repo/second", "two"), activeTheme: { tokens: { accent: "#222222" } } };

  const theme = await loadDashboardTheme("/dashboard", [first, second], "first");

  assert.equal(theme.accent, "#111111");
});

test("registry mutator pauses runs refreshes renders and resumes in order", async () => {
  const events: string[] = [];
  const mutate = createRegistryMutator({
    pause: async () => { events.push("pause"); },
    resume: () => { events.push("resume"); },
    refresh: async () => { events.push("refresh"); },
    render: () => { events.push("render"); },
  });

  await mutate(async () => { events.push("action"); });

  assert.deepEqual(events, ["pause", "action", "refresh", "render", "resume"]);
});

test("registry mutator serializes overlapping mutations", async () => {
  const firstAction = deferred();
  const events: string[] = [];
  const mutate = createRegistryMutator({
    pause: async () => { events.push("pause"); },
    resume: () => { events.push("resume"); },
    refresh: async () => { events.push("refresh"); },
    render: () => { events.push("render"); },
  });

  const first = mutate(async () => {
    events.push("first-action");
    await firstAction.promise;
  });
  const second = mutate(async () => { events.push("second-action"); });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(events, ["pause", "first-action"]);
  firstAction.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(events, [
    "pause", "first-action", "refresh", "render", "resume",
    "pause", "second-action", "refresh", "render", "resume",
  ]);
});

test("registry mutator resumes and propagates action failures", async () => {
  const events: string[] = [];
  const mutate = createRegistryMutator({
    pause: async () => { events.push("pause"); },
    resume: () => { events.push("resume"); },
    refresh: async () => { events.push("refresh"); },
    render: () => { events.push("render"); },
  });

  await assert.rejects(() => mutate(async () => {
    events.push("action");
    throw new Error("boom");
  }), /boom/);

  assert.deepEqual(events, ["pause", "action", "resume"]);
});

test("side pane presence loop stop drains an in-flight refresh", async () => {
  let finishLoad: ((changed: boolean) => void) | undefined;
  let rendered = false;
  const stop = startSidePanePresenceRefreshLoop({
    ownPane: "%1",
    load: () => new Promise<boolean>((resolve) => { finishLoad = resolve; }),
    render: () => { rendered = true; },
  }, 10_000);
  await new Promise((resolve) => setImmediate(resolve));

  let drained = false;
  const stopping = stop().then(() => { drained = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(drained, false);

  finishLoad?.(true);
  await stopping;

  assert.equal(drained, true);
  assert.equal(rendered, false);
});

test("registry mutator queue survives rejections", async () => {
  const events: string[] = [];
  const mutate = createRegistryMutator({
    pause: async () => { events.push("pause"); },
    resume: () => { events.push("resume"); },
    refresh: async () => { events.push("refresh"); },
    render: () => { events.push("render"); },
  });

  await assert.rejects(() => mutate(async () => { throw new Error("boom"); }), /boom/);
  await mutate(async () => { events.push("action"); });

  assert.deepEqual(events, ["pause", "resume", "pause", "action", "refresh", "render", "resume"]);
});

test("buildNewFormContext defaults to selected session cwd, group, and additional repos", () => {
  const selected = session("api", "/repo/api", "backend", ["/repo/web", "/repo/shared", "/repo/docs"]);
  const context = buildNewFormContext({
    cwd: "/dashboard",
    sessions: [session("docs", "/repo/docs", "docs"), selected],
    selected,
  });

  assert.deepEqual(context, {
    cwd: "/repo/api",
    group: "backend",
    knownCwds: ["/repo/api", "/dashboard", "/repo/web", "/repo/shared", "/repo/docs"],
    additionalCwds: ["/repo/web", "/repo/shared", "/repo/docs"],
  });
});

test("buildNewFormContext falls back to dashboard cwd without selection", () => {
  const context = buildNewFormContext({
    cwd: "/dashboard",
    sessions: [session("api", "/repo/api", "backend")],
  });

  assert.deepEqual(context, {
    cwd: "/dashboard",
    group: undefined,
    knownCwds: ["/dashboard", "/repo/api"],
  });
});

test("buildNewFormContext excludes hub-owned worktree paths from cwd suggestions", () => {
  const worktree = {
    ...session("feature", "/hub/worktrees/api/feature-api", "backend"),
    worktreePath: "/hub/worktrees/api/feature-api",
    worktreeRepoRoot: "/repo/api",
    worktreeBranch: "feature/api",
    worktreeBaseBranch: "main",
    worktreeOwnedByHub: true,
  };
  const context = buildNewFormContext({
    cwd: "/dashboard",
    sessions: [worktree, session("docs", "/repo/docs", "docs")],
    selected: worktree,
    historyCwds: ["/hub/worktrees/api/feature-api", "/repo/web"],
  });

  assert.deepEqual(context, {
    cwd: "/repo/api",
    group: "backend",
    knownCwds: ["/repo/api", "/dashboard", "/repo/docs", "/repo/web"],
  });
});

test("buildNewFormContext uses source roots for multi-repo worktree sessions", () => {
  const worktree = {
    ...session("feature", "/hub/worktrees/api/feature-api", "backend", ["/hub/worktrees/web/feature-api"]),
    worktreeOwnedByHub: true,
    worktrees: [
      { path: "/hub/worktrees/api/feature-api", repoRoot: "/repo/api", branch: "feature/api", baseBranch: "main", role: "primary" as const },
      { path: "/hub/worktrees/web/feature-api", repoRoot: "/repo/web", branch: "feature/api", baseBranch: "main", role: "additional" as const },
    ],
  };
  const context = buildNewFormContext({
    cwd: "/dashboard",
    sessions: [worktree, session("docs", "/repo/docs", "docs")],
    selected: worktree,
    historyCwds: ["/hub/worktrees/web/feature-api", "/repo/cli"],
  });

  assert.deepEqual(context, {
    cwd: "/repo/api",
    group: "backend",
    knownCwds: ["/repo/api", "/dashboard", "/repo/web", "/repo/docs", "/repo/cli"],
    additionalCwds: ["/repo/web"],
  });
});

test("buildNewFormContext includes history paths without sessions", () => {
  const context = buildNewFormContext({
    cwd: "/dashboard",
    sessions: [],
    historyCwds: ["/repo/api", "/repo/web"],
  });

  assert.deepEqual(context.knownCwds, ["/dashboard", "/repo/api", "/repo/web"]);
});

test("buildNewFormContext dedupes selected registry and history paths by rank", () => {
  const selected = session("api", "/repo/api", "backend", ["/repo/web"]);
  const context = buildNewFormContext({
    cwd: "/dashboard",
    sessions: [selected, session("docs", "/repo/docs", "docs")],
    selected,
    historyCwds: ["/repo/docs", "/repo/api", "/repo/cli"],
  });

  assert.deepEqual(context.knownCwds, ["/repo/api", "/dashboard", "/repo/web", "/repo/docs", "/repo/cli"]);
});
