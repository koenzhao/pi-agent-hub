import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { buildRenderModel, retainSelectionAfterRefresh } from "../src/tui/render-model.js";
import { renderSessions } from "../src/tui/layout.js";
import { darkTheme, stripAnsi } from "../src/tui/theme.js";
import type { ManagedSession, SessionStatus } from "../src/core/types.js";

function session(id: string, group: string, status: SessionStatus, title = id): ManagedSession {
  return {
    id,
    title,
    cwd: `/tmp/${title}`,
    group,
    tmuxSession: `pi-agent-hub-${id}`,
    status,
    createdAt: 1,
    updatedAt: 1,
  };
}

const WORKFLOW = {
  steps: [
    { id: "plan-md", short: "PL", label: "Plan" },
    { id: "execute", short: "EX", label: "Execute" },
    { id: "review", short: "RV", label: "Review" },
    { id: "reflect", short: "RF", label: "Reflect" },
    { id: "commit", short: "CM", label: "Commit" },
  ],
  activeIndex: 1,
  ticketId: "auth-003",
  updatedAt: 1,
};

const FOCUSED_WORKFLOW = {
  ...WORKFLOW,
  activeMode: { id: "focus", short: "FOC", label: "Focus", detail: "turn 4" },
};

test("active workflow mode replaces the Execute short and adds expanded detail", () => {
  const focused = { ...session("focus", "agents", "waiting"), workflow: FOCUSED_WORKFLOW };
  const compact = buildRenderModel({ sessions: [focused], selectedId: "focus", width: 110, now: 1_000 });
  assert.equal(compact.selected?.workflow?.activeMode?.short, "FOC");
  const compactText = renderSessions(compact).lines.map(stripAnsi).join("\n");
  const compactRow = compactText.split("\n").find((line) => /^│▌/.test(line)) ?? "";
  assert.match(compactRow, /FOC/);
  assert.doesNotMatch(compactRow, /EX/);
  assert.match(compactText, /PL─▐FOC▌─RV─RF─CM · auth-003/);
  assert.doesNotMatch(compactText, /mode\s+Focus/);

  const expandedText = renderSessions(buildRenderModel({
    sessions: [focused],
    selectedId: "focus",
    width: 110,
    now: 1_000,
    detailsExpanded: true,
  })).lines.map(stripAnsi).join("\n");
  assert.match(expandedText, /mode\s+Focus · turn 4/);
});

test("focused cards stay in Execute and preserve FOC before the group adornment", () => {
  const focused = { ...session("focus", "agents", "running", "focused-work"), workflow: FOCUSED_WORKFLOW };
  const wide = buildRenderModel({ sessions: [focused], selectedId: "focus", viewMode: "board", width: 120 });
  assert.deepEqual(wide.sections.map((section) => section.key), ["execute"]);
  assert.equal(wide.sections[0]?.title, "EXECUTE");
  const wideText = renderSessions(wide).lines.map(stripAnsi).join("\n");
  assert.match(wideText, /FOC · agents/);
  assert.doesNotMatch(wideText, /── FOCUS/);

  const narrow = renderSessions(buildRenderModel({
    sessions: [{ ...focused, group: "group-name-that-cannot-fit", title: "focused-title-that-needs-space" }],
    selectedId: "focus",
    viewMode: "board",
    width: 40,
  }));
  const narrowText = narrow.lines.map(stripAnsi).join("\n");
  assert.match(narrowText, /FOC/);
  assert.doesNotMatch(narrowText, /group-name-that-cannot-fit/);
  for (const line of narrow.lines) assert.ok(visibleWidth(line) <= 40, line);

  const titleFirst = renderSessions(buildRenderModel({
    sessions: [{ ...focused, group: "agents", title: "focus-title-12345678" }],
    selectedId: "focus",
    viewMode: "board",
    width: 40,
  })).lines.map(stripAnsi).join("\n");
  assert.match(titleFirst, /focus-title-12345678/);
  assert.match(titleFirst, /FOC/);
  assert.doesNotMatch(titleFirst, /agents/);
});

test("stopped focus snapshots render as ordinary Execute sessions", () => {
  const stopped = { ...session("focus", "agents", "stopped"), workflow: FOCUSED_WORKFLOW };
  const groupsText = renderSessions(buildRenderModel({
    sessions: [stopped],
    selectedId: "focus",
    width: 110,
    detailsExpanded: true,
  })).lines.map(stripAnsi).join("\n");
  assert.match(groupsText, /PL─▐EX▌─RV─RF─CM/);
  assert.doesNotMatch(groupsText, /FOC|mode\s+Focus/);

  const board = buildRenderModel({ sessions: [stopped], selectedId: "focus", viewMode: "board", width: 120 });
  assert.equal(board.sections[0]?.key, "execute");
  const boardText = renderSessions(board).lines.map(stripAnsi).join("\n");
  const boardCard = boardText.split("\n").find((line) => /^│┌/.test(line))?.split("│")[1] ?? "";
  assert.match(boardText, /EXECUTE/);
  assert.match(boardCard, /focus\s+agents/);
  assert.doesNotMatch(boardCard, /FOC|\bEX\b/);
  assert.doesNotMatch(boardText, /mode\s+Focus/);
});

test("focused workflow markers use accent and stay width-safe", () => {
  const theme = { ...darkTheme, accent: "#010203", muted: "#040506", border: "#070809" };
  const focused = { ...session("focus", "agents", "waiting", "focused-".repeat(8)), workflow: FOCUSED_WORKFLOW, lastActivityAt: 0 };
  for (const width of [40, 60, 110]) {
    const layout = renderSessions(buildRenderModel({ sessions: [focused], selectedId: "focus", width, now: 14 * 60_000 }), theme);
    const rendered = layout.lines.join("\n");
    assert.match(rendered, /\u001b\[38;2;1;2;3mFOC/);
    assert.doesNotMatch(rendered, /\u001b\[38;2;4;5;6mFOC/);
    for (const line of layout.lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  }
});

test("workflow rail renders compact in the list row and full in details", () => {
  const model = buildRenderModel({ sessions: [{ ...session("a", "default", "running"), workflow: WORKFLOW }], selectedId: "a", width: 110 });
  assert.equal(model.selected?.workflow?.activeIndex, 1);

  const lines = renderSessions(model).lines.map(stripAnsi);
  const row = lines.find((line) => /^│▌/.test(line));
  assert.match(row ?? "", /● a\s+EX/);
  assert.doesNotMatch(row ?? "", /4\/7/);
  assert.match(lines.join("\n"), /PL─▐EX▌─RV─RF─CM · auth-003/);
  for (const line of renderSessions(model).lines) assert.ok(visibleWidth(line) <= 110, line);
});

test("sidebar workflow stages use the theme accent color", () => {
  const theme = { ...darkTheme, accent: "#010203", muted: "#040506" };
  const model = buildRenderModel({ sessions: [{ ...session("a", "default", "running"), workflow: WORKFLOW }], selectedId: "a", width: 70 });
  const row = renderSessions(model, theme).lines.find((line) => /^│▌/.test(stripAnsi(line))) ?? "";

  assert.match(row, /\u001b\[38;2;1;2;3mEX/);
  assert.doesNotMatch(row, /\u001b\[38;2;4;5;6mEX/);
});

test("active and backlog rows use fixed stage and activity slots", () => {
  const now = 1_000_000;
  const sessions = [
    { ...session("running", "default", "running"), workflow: WORKFLOW, lastActivityAt: now - 14 * 60_000 },
    { ...session("waiting", "default", "waiting"), workflow: WORKFLOW, lastActivityAt: now - 14 * 60_000 },
    { ...session("focused", "default", "waiting"), workflow: FOCUSED_WORKFLOW, lastActivityAt: now - 14 * 60_000 },
    { ...session("idle", "default", "idle"), lastActivityAt: now - 14 * 60_000 },
    { ...session("backlog", "default", "waiting"), bucket: "backlog" as const, workflow: WORKFLOW, lastActivityAt: now - 14 * 60_000 },
  ];
  const lines = renderSessions(buildRenderModel({ sessions, selectedId: "running", width: 110, now })).lines.map(stripAnsi);
  const running = lines.find((line) => /^│▌ ● running/.test(line)) ?? "";
  const waiting = lines.find((line) => /^│  ◐ waiting/.test(line)) ?? "";
  const focused = lines.find((line) => /^│  ◐ focused/.test(line)) ?? "";
  const idle = lines.find((line) => /^│  ○ idle/.test(line)) ?? "";
  const backlog = lines.find((line) => /^│  ◐ backlog/.test(line)) ?? "";

  assert.match(running, /EX/);
  assert.doesNotMatch(running, /14m/);
  assert.match(waiting, /EX\s+14m/);
  assert.doesNotMatch(waiting.split("│")[1] ?? "", /·/);
  assert.equal(running.indexOf("EX"), waiting.indexOf("EX"));
  assert.match(focused, /FOC 14m/);
  assert.equal(focused.indexOf("FOC"), waiting.indexOf("EX"));
  assert.equal(focused.indexOf("14m"), waiting.indexOf("14m"));
  assert.match(idle, /14m/);
  assert.doesNotMatch(idle, /EX/);
  assert.equal(waiting.indexOf("14m"), idle.indexOf("14m"));
  assert.match(backlog, /EX\s+14m/);
  assert.equal(waiting.indexOf("EX"), backlog.indexOf("EX"));
});

test("expanded details include the full workflow rail", () => {
  const model = buildRenderModel({ sessions: [{ ...session("a", "default", "running"), workflow: { ...WORKFLOW, ticketId: undefined } }], selectedId: "a", width: 110, detailsExpanded: true });
  const text = renderSessions(model).lines.map(stripAnsi).join("\n");
  assert.match(text, /PL─▐EX▌─RV─RF─CM/);
  assert.doesNotMatch(text, /· auth-003/);
});

test("sessions without workflow render no rail", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "running")], selectedId: "a", width: 110 });
  const text = renderSessions(model).lines.map(stripAnsi).join("\n");
  assert.doesNotMatch(text, /4\/7/);
  assert.doesNotMatch(text, /PL─EX/);
});

test("archive age takes priority over the compact rail", () => {
  const day = 24 * 60 * 60 * 1000;
  const archived = { ...session("a", "default", "stopped"), bucket: "archived" as const, bucketChangedAt: 100, lastActivityAt: 100 + day, workflow: WORKFLOW };
  const model = buildRenderModel({ sessions: [archived, session("b", "default", "running")], selectedId: "a", width: 110, now: 100 + 2 * day });
  const row = renderSessions(model).lines.map(stripAnsi).find((line) => /^│▌/.test(line));
  assert.match(row ?? "", /a\s+2d/);
  assert.doesNotMatch(row ?? "", /\[exp|EX/);
  assert.match(renderSessions(model).lines.map(stripAnsi).join("\n"), /archived 2d ago · cleanup eligible in 5d/);
});

test("archive labels remain width-safe at sidebar widths and show retention eligibility", () => {
  const day = 24 * 60 * 60 * 1000;
  const archived = Array.from({ length: 7 }, (_, index) => ({
    ...session(`archive-${index}`, "default", "stopped", `archive-${index}-${"long".repeat(8)}`),
    bucket: "archived" as const,
    bucketChangedAt: index === 0 ? 0 : day * (8 - index),
  }));
  for (const width of [40, 42]) {
    const lines = renderSessions(buildRenderModel({ sessions: archived, selectedId: "archive-0", width, now: 8 * day })).lines;
    assert.match(lines.map(stripAnsi).join("\n"), /… 2 older archived/);
    assert.doesNotMatch(lines.map(stripAnsi).join("\n"), /\[exp/);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  }
  const expired = { ...session("expired", "default", "stopped"), bucket: "archived" as const, bucketChangedAt: 0 };
  const details = renderSessions(buildRenderModel({ sessions: [expired], selectedId: "expired", width: 100, now: 8 * day })).lines.map(stripAnsi).join("\n");
  assert.match(details, /archived 8d ago · cleanup eligible now/);

  const almostEligible = buildRenderModel({ sessions: [expired], selectedId: "expired", width: 100, now: 7 * day - 30_000 });
  assert.equal(almostEligible.selected?.archiveRetentionIn, "<1m");
  assert.match(renderSessions(almostEligible).lines.map(stripAnsi).join("\n"), /cleanup eligible in <1m/);
});

test("workflow rail stays width-safe at narrow and wide sizes", () => {
  const sessions = [{ ...session("a", "default", "running", "long-title-".repeat(6)), workflow: WORKFLOW }];
  for (const width of [70, 100, 160]) {
    for (const line of renderSessions(buildRenderModel({ sessions, selectedId: "a", width })).lines) {
      assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
    }
  }
});

test("board view groups only compatible Active workflow trees into producer lanes", () => {
  const parent = { ...session("p", "agents", "running"), workflow: WORKFLOW };
  const sub = { ...session("sub", "agents", "running"), kind: "subagent" as const, parentId: "p" };
  const planning = { ...session("x", "experiments", "running"), workflow: { ...WORKFLOW, activeIndex: 0, ticketId: undefined } };
  const none = session("z", "experiments", "idle");
  const backlog = { ...session("bk", "experiments", "idle"), bucket: "backlog" as const, bucketChangedAt: 1 };
  const model = buildRenderModel({ sessions: [parent, sub, planning, none, backlog], viewMode: "board", width: 120 });

  assert.deepEqual(model.sections.map((item) => item.key), ["plan-md", "execute"]);
  assert.deepEqual(model.sections[1]?.groups.flatMap((group) => group.sessions.map((row) => row.id)), ["p", "sub"]);
  assert.deepEqual(model.boardHidden, { withoutWorkflow: 1, otherWorkflows: 0, nonActive: 1 });
  assert.equal(model.selected?.id, "x");

  const rendered = renderSessions(model).lines.map(stripAnsi).join("\n");
  assert.match(rendered, /PLAN.*·1/);
  assert.match(rendered, /EXECUTE.*·1/);
  assert.doesNotMatch(rendered, /NO WORKFLOW/);
  assert.match(rendered, /\+1 without workflow · 1 backlog\/archive/);
  assert.match(rendered, /view board/);
});

test("board rows show the group name instead of the rail", () => {
  const model = buildRenderModel({ sessions: [{ ...session("p", "agents", "running"), workflow: WORKFLOW }], viewMode: "board", width: 120 });
  const row = renderSessions(model).lines.map(stripAnsi).find((line) => /^│┌/.test(line));
  const listCell = row?.split("│")[1] ?? "";
  assert.match(listCell, /● p\s+agents/);
  assert.doesNotMatch(listCell, /EX|4\/7/);
});

test("board chooses the prevalent pipeline deterministically and uses its newest vocabulary", () => {
  const steps = [
    { id: "plan-md", short: "PL", label: "Old plan" },
    { id: "execute", short: "EX", label: "Execute" },
    { id: "review", short: "RV", label: "Review" },
  ];
  const currentSteps = steps.map((step) => step.id === "plan-md" ? { ...step, short: "PN", label: "Plan" } : step);
  const alternateSteps = [{ id: "discover", short: "DS", label: "Discover" }, ...steps];
  const sessions = [
    { ...session("alt-2", "alt", "waiting"), workflow: { steps: alternateSteps, activeIndex: 0, updatedAt: 50 } },
    { ...session("main-old", "main", "running"), workflow: { steps, activeIndex: 0, updatedAt: 10 } },
    { ...session("alt-1", "alt", "running"), workflow: { steps: alternateSteps, activeIndex: 1, updatedAt: 40 } },
    { ...session("main-new", "main", "idle"), workflow: { steps: currentSteps, activeIndex: 1, updatedAt: 20 } },
    { ...session("main-third", "main", "waiting"), workflow: { steps, activeIndex: 2, updatedAt: 15 } },
  ];
  const model = buildRenderModel({ sessions, viewMode: "board", width: 120 });

  assert.deepEqual(model.sections.map((section) => [section.key, section.title, section.sessionsTotal]), [
    ["plan-md", "PLAN", 1],
    ["execute", "EXECUTE", 1],
    ["review", "REVIEW", 1],
  ]);
  assert.equal(model.boardHidden.otherWorkflows, 2);
  assert.deepEqual(model.sections.flatMap((section) => section.groups[0]?.sessions.filter((row) => row.kind !== "subagent").map((row) => row.id) ?? []), ["main-old", "main-new", "main-third"]);

  const tied = buildRenderModel({ sessions: sessions.slice(0, 4), viewMode: "board", width: 120 });
  assert.equal(tied.sections[0]?.key, "discover");
});

test("board renders the selected plan as a bordered card at every width", () => {
  const planned = {
    ...session("planned", "agents", "running", "auth-api"),
    workflow: WORKFLOW,
    sessionMetadata: {
      source: "pi-session-summary",
      goal: "  Rotate   refresh tokens before release ",
      status: "Handlers are being wired.",
      nextStep: "Distinct semantic follow-up.",
      updatedAt: 900,
      plan: {
        feature: "Rotate refresh tokens before release",
        phase: { title: "Wire endpoints", index: 2, count: 4 },
        tasks: { completed: 3, total: 8 },
        nextStep: "Add refresh handler tests",
      },
    },
  };

  for (const width of [40, 60, 79, 80, 100, 160]) {
    const layout = renderSessions(buildRenderModel({ sessions: [planned], selectedId: "planned", viewMode: "board", width, now: 1_000 }));
    const text = layout.lines.map(stripAnsi).join("\n");
    assert.match(text, /┌.*● auth-api.*┐/);
    assert.match(text, /Rotate refresh tokens/);
    assert.match(text, /Phase 2\/4/);
    assert.match(text, /3\/8 tasks/);
    assert.match(text, /next\s+Add refresh[\s\S]*handler tests/);
    assert.match(text, /└─+┘/);
    assert.doesNotMatch(text, /── plan/);
    assert.equal(layout.rowTargets.filter((target) => target?.kind === "session" && target.id === "planned").length, 1);
    if (width >= 80) {
      assert.match(text, /prog\s+Handlers are being wired/);
      assert.match(text, /next\s+Distinct semantic follow-up/);
      assert.doesNotMatch(text, /goal\s+Rotate/);
    }
    for (const line of layout.lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  }
});

test("board projects row-owned attention only for waiting and idle sessions", () => {
  const sessions = [
    { ...session("ready", "agents", "waiting"), workflow: WORKFLOW, sessionMetadata: { stage: "complete", confidence: 0.9, attention: { kind: "ready" as const, text: "Ready for review" } } },
    { ...session("question", "agents", "idle"), workflow: WORKFLOW, sessionMetadata: { stage: "waiting", confidence: 0.9, attention: { kind: "question" as const, text: "Choose rollout order" } } },
    { ...session("blocked", "agents", "waiting"), workflow: WORKFLOW, sessionMetadata: { stage: "blocked", confidence: 0.9, attention: { kind: "blocked" as const, text: "Needs credentials" } } },
    { ...session("running", "agents", "running"), workflow: WORKFLOW, sessionMetadata: { stage: "complete", confidence: 0.9, attention: { kind: "ready" as const, text: "Must stay hidden" } } },
    { ...session("stopped", "agents", "stopped"), workflow: WORKFLOW, sessionMetadata: { stage: "blocked", confidence: 0.9, attention: { kind: "blocked" as const, text: "Must stay hidden" } } },
  ];
  const model = buildRenderModel({ sessions, selectedId: "running", viewMode: "board", width: 80 });
  assert.equal(model.sections.flatMap((section) => section.groups[0]?.sessions ?? []).find((row) => row.id === "ready")?.attention?.kind, "ready");
  assert.equal(model.sections.flatMap((section) => section.groups[0]?.sessions ?? []).find((row) => row.id === "running")?.attention, undefined);
  assert.equal(model.sections.flatMap((section) => section.groups[0]?.sessions ?? []).find((row) => row.id === "stopped")?.attention, undefined);

  for (const width of [40, 60, 79, 80, 100, 160]) {
    const widthModel = buildRenderModel({ sessions, selectedId: "running", viewMode: "board", width });
    const lines = renderSessions(widthModel).lines.map(stripAnsi);
    assert.ok(lines.some((line) => /✓ ◐ ready/.test(line)), `${width}: ${lines.join("\n")}`);
    assert.ok(lines.some((line) => /\? ○ question/.test(line)), `${width}: ${lines.join("\n")}`);
    assert.ok(lines.some((line) => /! ◐ blocked/.test(line)), `${width}: ${lines.join("\n")}`);
    assert.ok(lines.some((line) => /· - stopped/.test(line)), `${width}: ${lines.join("\n")}`);
    assert.doesNotMatch(lines.join("\n"), /✓ ● running/);
    for (const line of renderSessions(widthModel).lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  }
  for (const glyph of ["✓", "?", "!"]) assert.equal(visibleWidth(glyph), 1);

  const theme = { ...darkTheme, success: "#010203", warning: "#040506", error: "#070809", accent: "#0a0b0c" };
  const themed = renderSessions(model, theme).lines;
  assert.match(themed.find((line) => /ready/.test(stripAnsi(line))) ?? "", /\u001b\[38;2;1;2;3m✓/);
  assert.match(themed.find((line) => /question/.test(stripAnsi(line))) ?? "", /\u001b\[38;2;4;5;6m\?/);
  assert.match(themed.find((line) => /blocked/.test(stripAnsi(line))) ?? "", /\u001b\[38;2;7;8;9m!/);
  assert.match(themed.find((line) => /┌.*running/.test(stripAnsi(line))) ?? "", /\u001b\[38;2;10;11;12m┌/);

  const groups = renderSessions(buildRenderModel({ sessions, selectedId: "running", viewMode: "groups", width: 80 })).lines.map(stripAnsi).join("\n");
  assert.doesNotMatch(groups, /✓ ◐ ready|\? ○ question|! ◐ blocked/);
});

test("selected board card shows attention at every width without requiring a plan", () => {
  const selected = {
    ...session("question", "agents", "waiting", "workflow-board-001"),
    workflow: WORKFLOW,
    sessionMetadata: {
      source: "pi-session-summary",
      status: "Choose the rollout order",
      nextStep: "Choose the rollout order",
      stage: "waiting",
      confidence: 0.9,
      attention: { kind: "question" as const, text: "Choose the rollout order" },
    },
  };
  for (const width of [40, 60, 79, 80, 100, 160]) {
    const layout = renderSessions(buildRenderModel({ sessions: [selected], selectedId: "question", viewMode: "board", width, detailsExpanded: true }));
    const text = layout.lines.map(stripAnsi).join("\n");
    assert.match(text, /┌\? ◐ workflow-board-(?:001|…).*┐/);
    assert.match(text, /\?\s+Choose the rollout(?: order| o…)/);
    assert.match(text, /└─+┘/);
    assert.doesNotMatch(text, /prog\s+Choose the rollout order|next\s+Choose the rollout order|\[waiting\]/);
    assert.equal(layout.rowTargets.filter((target) => target?.kind === "session" && target.id === "question").length, 1);
    for (const line of layout.lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  }
});

test("attention is searchable and remains attached to its subagent row", () => {
  const parent = { ...session("parent", "agents", "waiting"), workflow: WORKFLOW };
  const child = {
    ...session("child", "agents", "waiting"),
    kind: "subagent" as const,
    parentId: "parent",
    agentName: "worker",
    sessionMetadata: { stage: "blocked", confidence: 0.9, attention: { kind: "blocked" as const, text: "Needs sandbox access" } },
  };
  const model = buildRenderModel({ sessions: [parent, child], filter: "sandbox", viewMode: "board", width: 80 });
  const rows = model.sections.flatMap((section) => section.groups[0]?.sessions ?? []);
  assert.equal(rows.find((row) => row.id === "parent")?.attention, undefined);
  assert.equal(rows.find((row) => row.id === "child")?.attention?.text, "Needs sandbox access");
});

test("board selected-card window retains attention then progress without duplicate targets", () => {
  const sessions = Array.from({ length: 7 }, (_, index) => ({
    ...session(`a${index}`, "agents", "idle", `session-${index}`),
    workflow: WORKFLOW,
    ...(index === 3 ? { sessionMetadata: {
      stage: "blocked",
      confidence: 0.9,
      attention: { kind: "blocked" as const, text: "Needs production credentials before deployment can continue" },
      plan: { feature: "A long feature description", phase: { title: "Rendering", index: 2, count: 3 }, tasks: { completed: 1, total: 4 }, nextStep: "Run width tests" },
    } } : {}),
  }));
  const theme = { ...darkTheme, selectedBg: "#010203" };
  const layout = renderSessions(buildRenderModel({ sessions, selectedId: "a3", viewMode: "board", width: 60, height: 10 }), theme);
  const text = layout.lines.map(stripAnsi).join("\n");

  assert.match(text, /!\s+Needs production credentials/);
  assert.match(text, /Phase 2\/3/);
  assert.doesNotMatch(text, /next\s+Run width tests|A long feature description/);
  assert.match(text, /└─+┘/);
  assert.equal(layout.rowTargets.filter((target) => target?.kind === "session" && target.id === "a3").length, 1);
  assert.equal(layout.lines.length, 10);
  assert.doesNotMatch(text, /[↑↓] 0 more/);
});

test("board selected-card window retains progress then next without duplicate targets", () => {
  const sessions = Array.from({ length: 7 }, (_, index) => ({
    ...session(`s${index}`, "agents", "idle", `session-${index}`),
    workflow: WORKFLOW,
    ...(index === 3 ? { sessionMetadata: { plan: { feature: "A long feature description", phase: { title: "Rendering", index: 2, count: 3 }, tasks: { completed: 1, total: 4 }, nextStep: "Run width tests" } } } : {}),
  }));
  const theme = { ...darkTheme, selectedBg: "#010203" };
  const layout = renderSessions(buildRenderModel({ sessions, selectedId: "s3", viewMode: "board", width: 60, height: 10 }), theme);
  const text = layout.lines.map(stripAnsi).join("\n");

  assert.match(text, /Phase 2\/3/);
  assert.match(text, /next\s+Run width tests/);
  assert.match(text, /└─+┘/);
  assert.doesNotMatch(text, /A long feature description/);
  assert.equal(layout.rowTargets.filter((target) => target?.kind === "session" && target.id === "s3").length, 1);
  assert.equal(layout.lines.filter((line) => /\u001b\[48;2;1;2;3m/.test(line)).length, 4);
  assert.equal(layout.lines.length, 10);

  const lastSessions = sessions.map((item, index) => index === 6 ? { ...item, sessionMetadata: sessions[3]?.sessionMetadata } : item);
  const lastText = renderSessions(buildRenderModel({ sessions: lastSessions, selectedId: "s6", viewMode: "board", width: 60, height: 9 }), theme).lines.map(stripAnsi).join("\n");
  assert.doesNotMatch(lastText, /[↑↓] 0 more/);
});

test("board has distinct unfiltered empty and filtered no-match states", () => {
  const sessions = [session("plain", "default", "idle"), { ...session("backlog", "default", "idle"), bucket: "backlog" as const, workflow: WORKFLOW }];
  const empty = buildRenderModel({ sessions, viewMode: "board", width: 60 });
  assert.equal(empty.noBoardSessions, true);
  assert.match(renderSessions(empty).lines.map(stripAnsi).join("\n"), /No active workflow sessions[\s\S]*v  return to groups view/);

  const filtered = buildRenderModel({ sessions, viewMode: "board", width: 60, filter: "plain" });
  assert.equal(filtered.noMatches, true);
  assert.match(renderSessions(filtered).lines.map(stripAnsi).join("\n"), /No sessions match "plain"/);
});

test("wide preview suppression moves selected plan context inline", () => {
  const planned = { ...session("planned", "agents", "stopped"), workflow: WORKFLOW, sessionMetadata: { plan: { feature: "Inline when panels own the right side", tasks: { completed: 1, total: 2 } } } };
  const model = buildRenderModel({ sessions: [planned], selectedId: "planned", viewMode: "board", width: 120, hidePreview: true });
  const text = renderSessions(model).lines.map(stripAnsi).join("\n");
  assert.equal(model.showPreview, false);
  assert.match(text, /Inline when panels own the right side/);
  assert.doesNotMatch(text, /── plan|── preview/);
});

test("render model records side pane slots by session id", () => {
  const model = buildRenderModel({
    sessions: [session("api", "default", "running"), session("docs", "default", "running")],
    width: 120,
    sidePaneSessionIds: new Map([["api", 2]]),
  });

  assert.equal(model.groups[0]?.sessions.find((item) => item.id === "api")?.sidePaneSlot, 2);
  assert.equal(model.groups[0]?.sessions.find((item) => item.id === "docs")?.sidePaneSlot, undefined);
});

test("panel strip uses all sessions and records the focused slot", () => {
  const model = buildRenderModel({
    sessions: [session("api", "default", "running"), session("docs", "default", "idle")],
    filter: "api",
    width: 100,
    sidePaneSessionIds: new Map([["api", 2], ["docs", 1]]),
    sidePaneFocusedSlot: 2,
  });
  assert.deepEqual(model.panelStrip, [
    { slot: 1, title: "docs" },
    { slot: 2, title: "api" },
    { slot: 3 },
    { slot: 4 },
  ]);
  assert.equal(model.sidePaneFocusedSlot, 2);
  assert.match(renderSessions(model).lines.map(stripAnsi).join("\n"), /◫1 docs  ◫2 api  ·3  ·4/);
});

test("render model omits the panel strip when no panels are open", () => {
  assert.equal(buildRenderModel({ sessions: [session("api", "default", "running")], width: 100 }).panelStrip, undefined);
});

test("side pane glyphs render numbered slots on the left", () => {
  const model = buildRenderModel({
    sessions: [session("api", "default", "running"), session("docs", "default", "idle")],
    width: 100,
    sidePaneSessionIds: new Map([["api", 2], ["docs", 1]]),
  });
  const rendered = renderSessions(model).lines.map(stripAnsi);
  assert.match(rendered.find((line) => /● ◫2 api/.test(line)) ?? "", /● ◫2 api/);
  assert.match(rendered.find((line) => /○ ◫1 docs/.test(line)) ?? "", /○ ◫1 docs/);
});

test("side pane glyphs do not crowd compact workflow rails", () => {
  const model = buildRenderModel({
    sessions: [{ ...session("api", "default", "running"), workflow: WORKFLOW }],
    selectedId: "api",
    width: 110,
    sidePaneSessionIds: new Map([["api", 1]]),
  });
  const row = renderSessions(model).lines.map(stripAnsi).find((line) => /^│▌/.test(line));
  assert.match(row ?? "", /● ◫1 api\s+EX/);
  assert.doesNotMatch(row ?? "", /4\/7|EX ◫1/);
});

test("side pane glyphs remain left-visible at narrow widths", () => {
  const workflow = { ...WORKFLOW, steps: WORKFLOW.steps.map((step) => step.id === "execute" ? { ...step, short: "EXECUTE-LONG-LABEL" } : step) };
  const model = buildRenderModel({
    sessions: [{ ...session("api", "default", "running", "long-title-".repeat(4)), workflow }],
    selectedId: "api",
    width: 40,
    sidePaneSessionIds: new Map([["api", 1]]),
  });
  const row = renderSessions(model).lines.map(stripAnsi).find((line) => /^│▌/.test(line));
  assert.match(row ?? "", /● ◫1 long-t/);
  assert.match(row ?? "", /EXECUTE-LONG-LABEL/);
  assert.doesNotMatch(row ?? "", /4\/7/);
});

test("board view keeps side pane glyphs separate from group adornments", () => {
  const model = buildRenderModel({
    sessions: [{ ...session("api", "long-group-name-that-does-not-fit", "running", "long-title-".repeat(4)), workflow: WORKFLOW }],
    selectedId: "api",
    width: 40,
    viewMode: "board",
    sidePaneSessionIds: new Map([["api", 1]]),
  });
  const row = renderSessions(model).lines.map(stripAnsi).find((line) => /^│┌/.test(line));
  assert.match(row ?? "", /● ◫1 long-title/);
});

test("side pane glyphs stay width-safe with workflow rails", () => {
  const sessions = [
    { ...session("api", "default", "running", "long-title-".repeat(6)), workflow: WORKFLOW },
    session("docs", "default", "idle", "docs-title-".repeat(6)),
  ];
  for (const width of [42, 70, 120]) {
    for (const line of renderSessions(buildRenderModel({ sessions, selectedId: "api", width, sidePaneSessionIds: new Map([["api", 1], ["docs", 2]]) })).lines) {
      assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
    }
  }
});

test("wide layout can suppress the built-in preview independently of width", () => {
  const model = buildRenderModel({ sessions: [session("api", "default", "idle")], width: 120, hidePreview: true });
  assert.equal(model.showPreview, false);
  assert.doesNotMatch(renderSessions(model).lines.map(stripAnsi).join("\n"), /── preview/);
});

test("layout hit map marks only rendered session rows", () => {
  const sessions = [
    session("active", "default", "idle", "active-api"),
    { ...session("backlog", "default", "running", "backlog-docs"), bucket: "backlog" as const, bucketChangedAt: 1 },
    { ...session("archived", "work", "stopped", "archived-worker"), bucket: "archived" as const, bucketChangedAt: 1 },
  ];
  const layout = renderSessions(buildRenderModel({ sessions, selectedId: "backlog", width: 70, now: 100 }));

  assert.equal(layout.lines.length, layout.rowTargets.length);
  for (const [index, target] of layout.rowTargets.entries()) {
    const text = stripAnsi(layout.lines[index] ?? "");
    if (target?.kind !== "session") {
      assert.doesNotMatch(text, /active-api|backlog-docs|archived-worker/);
      continue;
    }
    const title = sessions.find((item) => item.id === target.id)?.title;
    assert.ok(title, `unknown session id ${target.id}`);
    assert.match(text, new RegExp(title));
  }
  assert.equal(layout.rowTargets[0], undefined);
  assert.equal(layout.rowTargets.at(-1), undefined);
});

test("layout hit map handles empty and wide preview layouts", () => {
  const empty = renderSessions(buildRenderModel({ sessions: [], width: 80 }));
  assert.ok(empty.rowTargets.every((target) => target === undefined));
  assert.equal(empty.listWidth, 0);

  const wide = renderSessions(buildRenderModel({ sessions: [session("a", "default", "idle")], width: 110 }));
  assert.equal(wide.lines.length, wide.rowTargets.length);
  assert.ok(wide.listWidth < 108);
});

function manySessions(count: number): ManagedSession[] {
  return Array.from({ length: count }, (_, index) => session(`s${index}`, "default", "idle", `session-${index}`));
}

function renderedSessionIds(layout: ReturnType<typeof renderSessions>): string[] {
  return layout.rowTargets.flatMap((target) => target?.kind === "session" ? [target.id] : []);
}

test("height-bounded layout clips long lists to terminal rows", () => {
  const layout = renderSessions(buildRenderModel({ sessions: manySessions(20), selectedId: "s10", width: 80, height: 15 }));

  assert.equal(layout.lines.length, 15);
  assert.equal(layout.rowTargets.length, 15);
  assert.ok(layout.rowTargets.some((target) => target?.kind === "session" && target.id === "s10"));
  for (const line of layout.lines) assert.ok(visibleWidth(line) <= 80, line);
});

test("height-bounded empty and no-match states fit terminal rows", () => {
  const empty = renderSessions(buildRenderModel({ sessions: [], width: 80, height: 15 }));
  const noMatches = renderSessions(buildRenderModel({ sessions: manySessions(3), filter: "zzz", width: 80, height: 15 }));

  assert.equal(empty.lines.length, 15);
  assert.equal(noMatches.lines.length, 15);
  assert.equal(empty.rowTargets.length, 15);
  assert.equal(noMatches.rowTargets.length, 15);
});

test("height-bounded list shows bottom indicator at the top", () => {
  const layout = renderSessions(buildRenderModel({ sessions: manySessions(20), selectedId: "s0", width: 80, height: 15 }));
  const text = layout.lines.map(stripAnsi).join("\n");

  assert.doesNotMatch(text, /↑ \d+ more/);
  assert.match(text, /↓ 12 more/);
  assert.deepEqual(renderedSessionIds(layout), manySessions(8).map((item) => item.id));
});

test("height-bounded list shows top indicator at the bottom", () => {
  const layout = renderSessions(buildRenderModel({ sessions: manySessions(20), selectedId: "s19", width: 80, height: 15 }));
  const text = layout.lines.map(stripAnsi).join("\n");

  assert.match(text, /↑ 11 more/);
  assert.doesNotMatch(text, /↓ \d+ more/);
  assert.deepEqual(renderedSessionIds(layout), manySessions(20).slice(11).map((item) => item.id));
});

test("height-bounded list shows both indicators in the middle", () => {
  const layout = renderSessions(buildRenderModel({ sessions: manySessions(20), selectedId: "s10", width: 80, height: 15 }));
  const text = layout.lines.map(stripAnsi).join("\n");

  assert.match(text, /↑ 3 more/);
  assert.match(text, /↓ 9 more/);
  assert.deepEqual(renderedSessionIds(layout), manySessions(20).slice(3, 11).map((item) => item.id));
});

test("height-bounded list handles exact and one-over capacity", () => {
  const exact = renderSessions(buildRenderModel({ sessions: manySessions(9), selectedId: "s0", width: 80, height: 15 }));
  assert.equal(exact.listScrollTop, 0);
  assert.doesNotMatch(exact.lines.map(stripAnsi).join("\n"), /[↑↓] \d+ more/);
  assert.deepEqual(renderedSessionIds(exact), manySessions(9).map((item) => item.id));

  const oneOver = renderSessions(buildRenderModel({ sessions: manySessions(10), selectedId: "s0", width: 80, height: 15 }));
  const oneOverText = oneOver.lines.map(stripAnsi).join("\n");
  assert.doesNotMatch(oneOverText, /↑ \d+ more/);
  assert.match(oneOverText, /↓ 2 more/);
  assert.equal(renderedSessionIds(oneOver).length, 8);
});

test("height-bounded list preserves scroll top until selection reaches an edge", () => {
  const sessions = manySessions(30);
  const first = renderSessions(buildRenderModel({ sessions, selectedId: "s10", width: 80, height: 15 }));
  assert.equal(first.listScrollTop, 4);

  const inside = renderSessions(buildRenderModel({ sessions, selectedId: "s9", width: 80, height: 15, listScrollTop: first.listScrollTop }));
  assert.equal(inside.listScrollTop, first.listScrollTop);

  const edge = renderSessions(buildRenderModel({ sessions, selectedId: "s11", width: 80, height: 15, listScrollTop: inside.listScrollTop }));
  assert.equal(edge.listScrollTop, first.listScrollTop + 1);
});

test("groups view is unchanged when viewMode is omitted", () => {
  const backlog = { ...session("bk", "experiments", "idle"), bucket: "backlog" as const, bucketChangedAt: 1 };
  const model = buildRenderModel({ sessions: [session("a", "default", "idle"), backlog], width: 120 });
  const rendered = renderSessions(model).lines.map(stripAnsi).join("\n");
  assert.match(rendered, /BACKLOG/);
  assert.doesNotMatch(rendered, /view board/);
  assert.doesNotMatch(rendered, /backlog\/archived · v groups/);
});

test("empty state rendering includes first-run prompts", () => {
  const lines = renderSessions(buildRenderModel({ sessions: [], width: 64 })).lines;
  assert.match(lines.join("\n"), /No managed Pi sessions yet/);
  assert.match(lines.join("\n"), /▶ n  create a session/);
  assert.match(lines.join("\n"), /  q  quit/);
});

test("grouping order and status counts", () => {
  const model = buildRenderModel({
    sessions: [session("b", "work", "idle"), session("a", "default", "waiting"), session("e", "default", "error")],
    width: 120,
  });
  assert.deepEqual(model.groups.map((group) => group.name), ["default", "work"]);
  assert.deepEqual(model.groups[0]?.statusCounts, { running: 0, waiting: 1, idle: 0, error: 1, stopped: 0 });
  assert.deepEqual(model.groups[1]?.statusCounts, { running: 0, waiting: 0, idle: 1, error: 0, stopped: 0 });
  const rendered = renderSessions(model).lines.join("\n");
  assert.match(rendered, /◐1 ×1/);
  assert.doesNotMatch(rendered, /1 waiting · 1 error/);
});

test("groups are rendered by newest waiting or idle activity", () => {
  const model = buildRenderModel({
    sessions: [
      { ...session("default-idle", "default", "idle"), lastActivityAt: 100 },
      { ...session("work-idle", "work", "idle"), lastActivityAt: 200 },
      { ...session("work-waiting", "work", "waiting"), lastActivityAt: 300 },
      { ...session("z-waiting", "z", "waiting"), lastActivityAt: 400 },
      { ...session("z-idle", "z", "idle"), lastActivityAt: 50 },
    ],
    width: 120,
  });

  assert.deepEqual(model.groups.map((group) => group.name), ["z", "work", "default"]);
});

test("sectioned model preserves Active and Backlog groups but flattens Archived chronologically", () => {
  const day = 24 * 60 * 60 * 1000;
  const backlog = { ...session("backlog", "default", "idle"), bucket: "backlog" as const, bucketChangedAt: 100 };
  const archiveOld = { ...session("archive-old", "default", "stopped"), bucket: "archived" as const, bucketChangedAt: 100 };
  const archiveNew = { ...session("archive-new", "work", "stopped"), bucket: "archived" as const, bucketChangedAt: 100 + day };
  const model = buildRenderModel({ sessions: [archiveOld, session("active", "default", "idle"), backlog, archiveNew], selectedId: "archive-new", width: 120, now: 100 + 2 * day });

  assert.equal(model.showSections, true);
  assert.deepEqual(model.sections.map((section) => [section.key, section.groups.map((group) => group.name)]), [["active", ["default"]], ["backlog", ["default"]], ["archived", [""]]]);
  assert.deepEqual(model.sections[2]?.groups[0]?.sessions.map((row) => row.id), ["archive-new", "archive-old"]);
  assert.equal(model.selected?.archivedAge, "1d");
  assert.equal(model.selected?.archiveRetentionIn, "6d");
  assert.match(model.footer, /U Restore/);

  const rendered = renderSessions(model).lines.map(stripAnsi).join("\n");
  assert.match(rendered, /ACTIVE/);
  assert.match(rendered, /BACKLOG/);
  assert.match(rendered, /ARCHIVED/);
  assert.doesNotMatch(rendered, /\[exp/);
});

test("Archived collapses after five parent cascades and filtering reveals matches", () => {
  const archived = Array.from({ length: 7 }, (_, index) => ({
    ...session(`archive-${index}`, index % 2 ? "work" : "default", "stopped"),
    bucket: "archived" as const,
    bucketChangedAt: 700 - index,
  }));
  const child = { ...session("child", "default", "stopped"), kind: "subagent" as const, parentId: "archive-0", agentName: "scout" };

  const collapsed = buildRenderModel({ sessions: [...archived, child], width: 80, now: 800 });
  const archiveSection = collapsed.sections.find((section) => section.key === "archived");
  assert.equal(archiveSection?.sessionsTotal, 8);
  assert.equal(archiveSection?.archiveDisclosure?.hiddenParents, 2);
  assert.deepEqual(archiveSection?.groups[0]?.sessions.map((row) => row.id), ["archive-0", "child", "archive-1", "archive-2", "archive-3", "archive-4"]);
  assert.match(renderSessions(collapsed).lines.map(stripAnsi).join("\n"), /… 2 older archived/);

  const expanded = buildRenderModel({ sessions: [...archived, child], width: 80, now: 800, archiveExpanded: true, archiveDisclosureSelected: true });
  assert.equal(expanded.sections.find((section) => section.key === "archived")?.groups[0]?.sessions.length, 8);
  assert.match(renderSessions(expanded).lines.map(stripAnsi).join("\n"), /▌ ⌃ show fewer/);

  const filtered = buildRenderModel({ sessions: [...archived, child], width: 80, filter: "archive-6", now: 800 });
  assert.deepEqual(filtered.sections.find((section) => section.key === "archived")?.groups[0]?.sessions.map((row) => row.id), ["archive-6"]);
  assert.equal(filtered.sections.find((section) => section.key === "archived")?.archiveDisclosure, undefined);
});

test("late-created descendants inherit Archived presentation and stay out of the board", () => {
  const parent = { ...session("parent", "default", "stopped"), bucket: "archived" as const, bucketChangedAt: 100 };
  const child = { ...session("child", "default", "running"), kind: "subagent" as const, parentId: "parent", agentName: "worker", workflow: WORKFLOW };

  const groups = buildRenderModel({ sessions: [parent, child], width: 100, now: 200 });
  assert.deepEqual(groups.sections.find((section) => section.key === "archived")?.groups[0]?.sessions.map((row) => [row.id, row.section]), [["parent", "archived"], ["child", "archived"]]);

  const board = buildRenderModel({ sessions: [parent, child], width: 100, viewMode: "board", now: 200 });
  assert.equal(board.sections.length, 0);
  assert.deepEqual(board.boardHidden, { withoutWorkflow: 0, otherWorkflows: 0, nonActive: 1 });
});

test("all-active dashboards suppress lifecycle section headers", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle")], width: 120 });
  assert.equal(model.showSections, false);
  assert.doesNotMatch(renderSessions(model).lines.join("\n"), /ACTIVE/);
});

test("session order mixes waiting and idle by activity and ignores title", () => {
  const model = buildRenderModel({
    sessions: [
      { ...session("worker", "default", "idle", "zzz"), lastActivityAt: 200 },
      session("api", "default", "error", "aaa"),
      { ...session("docs", "default", "waiting", "mmm"), lastActivityAt: 100 },
    ],
    width: 120,
  });
  assert.deepEqual(model.groups[0]?.sessions.map((item) => item.id), ["api", "worker", "docs"]);
});

test("narrow layout hides preview and uses readable compact footer", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle")], width: 42 });
  assert.equal(model.showPreview, false);
  assert.equal(model.footer, "1-4 Set · x# Close · F# Focus · ? Help");
});


test("wide footer groups keys by intent", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle")], width: 120 });
  assert.equal(model.footer, "Enter Open · 1-4 Panels · x# Close · F#/Alt+# Focus · o Reset · n New · / Filter  │  p Send · i Info · r Restart · R Rename · d Delete · A Archive · B Backlog  │  v View · ? Help");
});

test("wide footer shows worktree finish only for worktree sessions", () => {
  const model = buildRenderModel({
    sessions: [{ ...session("a", "default", "idle"), worktreeOwnedByHub: true, worktreePath: "/tmp/wt" }],
    width: 120,
  });
  assert.equal(model.footer, "Enter Open · 1-4 Panels · x# Close · F#/Alt+# Focus · o Reset · n New · / Filter  │  p Send · i Info · r Restart · R Rename · d Delete · w Finish WT · A Archive · B Backlog  │  v View · ? Help");
});

test("long titles/cwd truncate without exceeding width", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle", "a".repeat(100))], width: 60 });
  for (const line of renderSessions(model).lines) assert.ok(visibleWidth(line) <= 60, line);
});


test("long paths truncate from the start and keep basename", () => {
  const longPath = `/tmp/${"deep/".repeat(20)}project-api`;
  const model = buildRenderModel({ sessions: [{ ...session("a", "default", "idle", "api"), cwd: longPath }], selectedId: "a", width: 80 });
  const rendered = renderSessions(model).lines.join("\n");
  assert.match(rendered, /….*project-api/);
  for (const line of renderSessions(model).lines) assert.ok(visibleWidth(line) <= 80, line);
});

test("wide preview glyphs do not exceed terminal width", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle", "api")], selectedId: "a", width: 80, preview: " - npm test ✅\n - npm run package:check ✅" });
  for (const line of renderSessions(model).lines) assert.ok(visibleWidth(line) <= 80, line);
});

test("styled preview lines keep italics only", () => {
  const preview = "\u001b[1;38;5;244mHeading\u001b[0m\n\u001b[3;38;2;1;2;3m- thought\u001b[0m\n\u001b[4munderlined\u001b[0m";
  const rendered = renderSessions(buildRenderModel({ sessions: [session("a", "default", "idle", "api")], selectedId: "a", width: 120, preview })).lines.join("\n");

  assert.doesNotMatch(rendered, /\u001b\[1mHeading/);
  assert.match(rendered, /\u001b\[3m- thought\u001b\[0m/);
  assert.doesNotMatch(rendered, /\u001b\[4munderlined/);
  assert.doesNotMatch(rendered, /38;[25];/);
  for (const line of rendered.split("\n")) assert.ok(visibleWidth(line) <= 120, line);
});

test("top summary shows visible totals status counts and filter", () => {
  const model = buildRenderModel({
    sessions: [session("api", "default", "running"), session("docs", "default", "waiting"), session("web", "default", "error")],
    width: 120,
    filter: "doc",
  });

  assert.equal(model.summary.total, 3);
  assert.equal(model.summary.visibleTotal, 1);
  assert.deepEqual(model.summary.statusCounts, { running: 0, waiting: 1, idle: 0, error: 0, stopped: 0 });
  assert.match(renderSessions(model).lines.join("\n"), /1\/3 sessions · ◐1 · filter: doc/);
});


test("error reason appears in selected metadata", () => {
  const broken = { ...session("a", "default", "error", "api"), error: "MCP failed" };
  const lines = renderSessions(buildRenderModel({ sessions: [broken], selectedId: "a", width: 120 })).lines;
  assert.match(lines.join("\n"), /error\s+MCP failed/);
});

test("selected and stopped rows have distinct treatments with stopped rows last", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "stopped", "api"), session("b", "default", "idle", "docs")], selectedId: "b", width: 100 });
  const lines = renderSessions(model).lines.join("\n");
  assert.match(lines, /▌ ○ docs[\s\S]*· - api/);
  assert.doesNotMatch(lines, /Stopped/);
});

test("preview renders captured tmux output with empty state", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle", "api")], selectedId: "a", width: 120, preview: "one\ntwo" });
  const lines = renderSessions(model).lines.join("\n");
  assert.match(lines, /one/);
  assert.match(lines, /two/);
  assert.doesNotMatch(lines, /preview loads from tmux/);

  const empty = renderSessions(buildRenderModel({ sessions: [session("a", "default", "idle", "api")], selectedId: "a", width: 120, preview: "" })).lines.join("\n");
  assert.match(empty, /preview empty/);
});

test("filter matches across title group cwd basename and status", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle", "api"), session("b", "work", "waiting", "docs")], width: 100, filter: "wait" });
  assert.equal(model.groups.length, 1);
  assert.equal(model.groups[0]?.sessions[0]?.id, "b");
});

test("filter matches semantic and deterministic plan metadata", () => {
  const semantic = buildRenderModel({
    sessions: [{
      ...session("a", "default", "idle", "api"),
      sessionMetadata: { source: "any-extension", goal: "Implement semantic summaries" },
    }, session("b", "default", "idle", "docs")],
    width: 100,
    filter: "semantic",
  });
  assert.equal(semantic.groups[0]?.sessions[0]?.id, "a");

  const plan = buildRenderModel({
    sessions: [{
      ...session("a", "default", "idle", "api"),
      sessionMetadata: { plan: { feature: "Responsive workflow board", phase: { title: "Render cards", index: 2, count: 3 }, nextStep: "Check narrow widths" } },
    }, session("b", "default", "idle", "docs")],
    width: 100,
    filter: "narrow",
  });
  assert.equal(plan.groups[0]?.sessions[0]?.id, "a");
});

test("multi-repo sessions render repo badge and compact details", () => {
  const multi = {
    ...session("a", "default", "idle", "api"),
    cwd: "/repo/api",
    additionalCwds: ["/repo/web", "/repo/shared"],
    workspaceCwd: "/state/workspaces/a",
  };
  const model = buildRenderModel({ sessions: [multi], selectedId: "a", width: 120, filter: "shared" });

  assert.equal(model.selected?.repoCount, 3);
  const rendered = renderSessions(model).lines.join("\n");
  assert.match(rendered, /\[3 repos\]/);
  assert.match(rendered, /\/repo\/api · 3 repos/);
  assert.doesNotMatch(rendered, /group default/);
  assert.doesNotMatch(rendered, /extra\s+\/repo\/web/);
  assert.doesNotMatch(rendered, /runtime\s+\/state\/workspaces\/a/);
});


test("single-repo compact details omit repo count and group", () => {
  const model = buildRenderModel({
    sessions: [{ ...session("a", "default", "idle", "api"), cwd: "/repo/api" }],
    selectedId: "a",
    width: 120,
  });
  const rendered = renderSessions(model).lines.join("\n");
  assert.match(rendered, /\/repo\/api/);
  assert.doesNotMatch(rendered, /1 repo/);
  assert.doesNotMatch(rendered, /group default/);
});

test("session metadata renders without replacing the Hub title", () => {
  const model = buildRenderModel({
    sessions: [{
      ...session("a", "default", "idle", "Hub title"),
      cwd: "/repo/api",
      sessionMetadata: {
        source: "any-extension",
        goal: "Support semantic dashboard metadata.",
        status: "Reader is wired into refresh.",
        nextStep: "Validate rendering.",
        stage: "implementing",
        updatedAt: 880_000,
      },
    }],
    selectedId: "a",
    width: 120,
    now: 1_000_000,
  });

  assert.equal(model.selected?.title, "Hub title");
  const rendered = renderSessions(model).lines.join("\n");
  assert.match(rendered, /Hub title/);
  assert.match(rendered, /── metadata .*via any-extension · 2m/);
  assert.match(rendered, /goal\s+Support semantic dashboard metadata\./);
  assert.match(rendered, /prog\s+Reader is wired into refresh\./);
  assert.match(rendered, /next\s+Validate rendering\./);
  assert.doesNotMatch(rendered, /next\s+▶/);
  assert.doesNotMatch(rendered, /confidence/);
});


test("compact details surface selected skills and MCP when present", () => {
  const withTools = {
    ...session("a", "default", "idle", "api"),
    cwd: "/repo/api",
    enabledMcpServers: ["filesystem", "github"],
  };
  const model = buildRenderModel({ sessions: [withTools], selectedId: "a", width: 120, selectedSkillCount: 3 });

  const rendered = renderSessions(model).lines.join("\n");
  assert.match(rendered, /skills 3 · mcp 2\s+s\/m edit/);
  assert.doesNotMatch(rendered, /filesystem, github/);
});


test("compact details hide capabilities line when no skills or MCP are attached", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle", "api")], selectedId: "a", width: 120, selectedSkillCount: 0 });
  const rendered = renderSessions(model).lines.join("\n");
  assert.doesNotMatch(rendered, /skills 0/);
  assert.doesNotMatch(rendered, /mcp 0/);
  assert.doesNotMatch(rendered, /s\/m edit/);
});


test("preview divider has no read-only label", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle", "api")], selectedId: "a", width: 120, preview: "hi" });
  const rendered = renderSessions(model).lines.join("\n");
  assert.match(rendered, /── preview ─/);
  assert.doesNotMatch(rendered, /read-only/);
});


test("selected title and status render inline on the same line", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "running", "c-bridge")], selectedId: "a", width: 200 });
  const rendered = renderSessions(model).lines.join("\n");
  const titleLine = rendered.split("\n").find((line) => line.includes("c-bridge") && !line.includes("▌"));
  assert.ok(titleLine, "expected an inline title row in the right pane");
  assert.match(titleLine!, /c-bridge\s{1,}● running/);
});


test("long selected title preserves inline status", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "waiting", "selected-title-".repeat(10))], selectedId: "a", width: 80 });
  const lines = renderSessions(model).lines;
  const titleLine = lines.find((line) => line.includes("◐ waiting") && !line.includes("▌"));
  assert.ok(titleLine, "expected selected details to keep the status badge");
  assert.match(stripAnsi(titleLine!), /…\s+◐ waiting/);
  for (const line of lines) assert.ok(visibleWidth(line) <= 80, line);
});


test("model.height pads body rows so the box fills the terminal", () => {
  const lines = renderSessions(buildRenderModel({
    sessions: [session("a", "default", "idle", "api")],
    selectedId: "a",
    width: 120,
    height: 30,
  })).lines;
  assert.equal(lines.length, 30);
});


test("narrow group header truncates name before status counts", () => {
  const sessions = [
    { ...session("a", "long-group-name-that-overflows", "running"), cwd: "/r/a" },
    { ...session("b", "long-group-name-that-overflows", "waiting"), cwd: "/r/b" },
    { ...session("c", "long-group-name-that-overflows", "error"), cwd: "/r/c" },
  ];
  const lines = renderSessions(buildRenderModel({ sessions, width: 50 })).lines;
  const groupLine = lines.find((line) => line.includes("◐1") || line.includes("●1"));
  assert.ok(groupLine, "expected a group header line with status counts");
  for (const line of lines) assert.ok(visibleWidth(line) <= 50, line);
  assert.match(groupLine!, /●1\s◐1\s×1/);
});


test("very long group names preserve status counts", () => {
  const group = "group-".repeat(20);
  const sessions = [session("a", group, "running"), session("b", group, "waiting"), session("c", group, "error")];
  const lines = renderSessions(buildRenderModel({ sessions, width: 50 })).lines;
  const groupLine = lines.map(stripAnsi).find((line) => line.includes("group-") && line.includes("●1") && line.includes("◐1") && line.includes("×1"));
  assert.ok(groupLine, "expected counts to remain visible after group name truncation");
  assert.match(groupLine!, /…\s+●1\s◐1\s×1/);
  for (const line of lines) assert.ok(visibleWidth(line) <= 50, line);
});


test("expanded multi-repo details show full metadata", () => {
  const multi = {
    ...session("a", "default", "idle", "api"),
    cwd: "/repo/api",
    additionalCwds: ["/repo/web", "/repo/shared"],
    workspaceCwd: "/state/workspaces/a",
  };
  const model = buildRenderModel({ sessions: [multi], selectedId: "a", width: 120, detailsExpanded: true });

  const rendered = renderSessions(model).lines.join("\n");
  assert.match(rendered, /extra\s+\/repo\/web/);
  assert.match(rendered, /extra\s+\/repo\/shared/);
  assert.match(rendered, /runtime\s+\/state\/workspaces\/a/);
});

test("filter with zero matches renders no-match state", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "idle", "api")], width: 100, filter: "zzz" });
  assert.equal(model.noMatches, true);
  const rendered = renderSessions(model).lines.join("\n");
  assert.match(rendered, /0\/1 sessions · filter: zzz/);
  assert.match(rendered, /No sessions match/);
  assert.match(rendered, /▶ Use the footer controls below/);
});

test("starting displays and counts as running", () => {
  const model = buildRenderModel({ sessions: [session("a", "default", "starting")], width: 100 });
  assert.equal(model.selected?.displayStatus, "running");
  assert.deepEqual(model.summary.statusCounts, { running: 1, waiting: 0, idle: 0, error: 0, stopped: 0 });
});

test("selection retention chooses next sibling without jumping groups", () => {
  const previous = [session("a", "default", "idle"), session("b", "default", "idle"), session("c", "work", "idle")];
  const next = [session("a", "default", "idle"), session("c", "work", "idle")];
  assert.equal(retainSelectionAfterRefresh(previous, next, "b"), "a");
});

test("subagent rows render directly under their parent", () => {
  const parent = session("parent", "default", "idle", "api");
  const child = {
    ...session("child", "default", "running", "scout child"),
    kind: "subagent" as const,
    parentId: "parent",
    agentName: "scout",
    taskPreview: "read auth.ts",
  };
  const sibling = session("sibling", "default", "idle", "web");
  const model = buildRenderModel({ sessions: [parent, sibling, child], width: 120 });

  assert.deepEqual(model.groups[0]?.sessions.map((item) => item.id), ["parent", "child", "sibling"]);
  assert.equal(model.groups[0]?.sessions[1]?.depth, 1);
  const lines = renderSessions(model).lines.join("\n");
  assert.match(lines, /└ .*scout/);
  assert.doesNotMatch(lines, /read auth\.ts/);
});

test("nested subagent rows render under their subagent parent", () => {
  const parent = session("parent", "default", "idle", "api");
  const child = {
    ...session("child", "default", "running", "worker"),
    kind: "subagent" as const,
    parentId: "parent",
    agentName: "worker",
  };
  const grandchild = {
    ...session("grandchild", "default", "waiting", "critic"),
    kind: "subagent" as const,
    parentId: "child",
    agentName: "code-critic",
  };
  const model = buildRenderModel({ sessions: [parent, grandchild, child], width: 120 });

  assert.deepEqual(model.groups[0]?.sessions.map((item) => item.id), ["parent", "child", "grandchild"]);
  assert.equal(model.groups[0]?.sessions[1]?.depth, 1);
  assert.equal(model.groups[0]?.sessions[2]?.depth, 2);
  assert.match(renderSessions(model).lines.join("\n"), /└ .*worker[\s\S]*└ .*code-critic/);
});

test("filtering by nested child includes ancestor context", () => {
  const parent = session("parent", "default", "idle", "api");
  const child = {
    ...session("child", "default", "running", "scout child"),
    kind: "subagent" as const,
    parentId: "parent",
    agentName: "scout",
  };
  const grandchild = {
    ...session("grandchild", "default", "waiting", "critic child"),
    kind: "subagent" as const,
    parentId: "child",
    agentName: "code-critic",
    taskPreview: "unique nested task",
  };
  const model = buildRenderModel({ sessions: [parent, child, grandchild, session("other", "default", "idle", "web")], width: 120, filter: "unique" });

  assert.deepEqual(model.groups[0]?.sessions.map((item) => item.id), ["parent", "child", "grandchild"]);
});
