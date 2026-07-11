import test from "node:test";
import assert from "node:assert/strict";
import { closeSidePaneShowing, closeSidePanes, focusSidePaneSlot, panelGeometry, resetSidePane, sidebarRepairWidth, sidePaneStatus, toggleSidePaneSlot } from "../src/app/side-pane.js";
import type { TmuxExec } from "../src/core/tmux.js";
import type { CommandResult } from "../src/core/types.js";

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

function sidePaneExec(panes: string, clients: string): TmuxExec & { calls: Call[] } {
  let nextPane = 10;
  return fakeTmux((call) => {
    if (call.args[0] === "list-panes") return { stdout: panes, stderr: "" };
    if (call.args[0] === "list-clients") return { stdout: clients, stderr: "" };
    if (call.args[0] === "split-window") return { stdout: `%${nextPane++}\n`, stderr: "" };
    return { stdout: "", stderr: "" };
  });
}

const listPanesCall = ["list-panes", "-t", "%1", "-F", "#{pane_id} #{pane_tty} #{pane_active} #{pane_left} #{pane_top} #{pane_width} #{pane_height} #{window_width} #{window_height}"];
const listClientsCall = ["list-clients", "-F", "#{client_tty} #{client_session}"];
const attach = (direction: "-h" | "-v", pane: string, target: string, size: number) => [
  "split-window", "-d", direction, "-l", String(size), "-P", "-F", "#{pane_id}", "-t", pane,
  `env -u TMUX tmux attach-session -t '${target}'`,
];
const presize = (target: string, width: number, height: number) => ["resize-window", "-t", target, "-x", String(width), "-y", String(height)];
const resetSize = (target: string) => ["set-option", "-w", "-t", target, "window-size", "latest"];

const dashboard = "%1 /dev/ttys001 1 0 0 42 59 160 60\n";
const onePane = `${dashboard}%2 /dev/ttys002 0 43 0 117 59 160 60\n`;
const twoPanes = `${dashboard}%2 /dev/ttys002 0 43 0 117 29 160 60\n%3 /dev/ttys003 0 43 30 117 29 160 60\n`;
const threePanes = `${dashboard}%2 /dev/ttys002 0 43 0 58 59 160 60\n%3 /dev/ttys003 0 102 0 58 29 160 60\n%4 /dev/ttys004 0 102 30 58 29 160 60\n`;
const fourPanes = `${dashboard}%2 /dev/ttys002 0 43 0 58 29 160 60\n%3 /dev/ttys003 0 102 0 58 29 160 60\n%4 /dev/ttys004 0 43 30 58 29 160 60\n%5 /dev/ttys005 0 102 30 58 29 160 60\n`;

const sessions = {
  one: "/dev/ttys002 pi-agent-hub-api\n",
  two: "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n",
  three: "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n/dev/ttys004 pi-agent-hub-web\n",
  four: "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n/dev/ttys004 pi-agent-hub-web\n/dev/ttys005 pi-agent-hub-tests\n",
};

test("sidePaneStatus reports four managed panes in visual slot order", async () => {
  const exec = sidePaneExec(
    `${dashboard}%5 /dev/ttys005 0 102 31 58 29 160 60\n%4 /dev/ttys004 0 43 31 58 29 160 60\n%3 /dev/ttys003 0 102 0 58 30 160 60\n%2 /dev/ttys002 0 43 0 58 30 160 60\n`,
    sessions.four,
  );

  assert.deepEqual((await sidePaneStatus({ ownPane: "%1" }, exec)).sessions, [
    "pi-agent-hub-api",
    "pi-agent-hub-docs",
    "pi-agent-hub-web",
    "pi-agent-hub-tests",
  ]);
});

test("sidePaneStatus ignores user panes and reports dashboard dimensions", async () => {
  const exec = sidePaneExec(
    `${dashboard}%2 /dev/ttys002 0 43 0 58 60 160 60\n%9 /dev/ttys009 0 102 0 58 60 160 60\n`,
    "/dev/ttys002 pi-agent-hub-api\n/dev/ttys009 user-shell\n",
  );

  assert.deepEqual(await sidePaneStatus({ ownPane: "%1" }, exec), {
    sessions: ["pi-agent-hub-api"],
    paneIds: ["%2"],
    ownWidth: 42,
    windowWidth: 160,
  });
  assert.deepEqual(exec.calls.map((call) => call.args), [listPanesCall, listClientsCall]);
});

test("panelGeometry tiles one through four panels within the bordered content area", () => {
  assert.deepEqual(panelGeometry(1, 158, 50, 1), [{ width: 158, height: 49 }]);
  assert.deepEqual(panelGeometry(2, 158, 50, 1), [
    { width: 158, height: 24 }, { width: 158, height: 24 },
  ]);
  assert.deepEqual(panelGeometry(3, 158, 50, 1), [
    { width: 79, height: 49 }, { width: 78, height: 24 }, { width: 78, height: 24 },
  ]);
  assert.deepEqual(panelGeometry(4, 158, 50, 1), [
    { width: 79, height: 24 }, { width: 78, height: 24 },
    { width: 79, height: 24 }, { width: 78, height: 24 },
  ]);
  assert.deepEqual(panelGeometry(2, 117, 60, 1).map((panel) => panel.height), [29, 29]);
});

test("sidebarRepairWidth only repairs collapsed sidebars when content can fit", () => {
  assert.equal(sidebarRepairWidth(12, 160), 42);
  assert.equal(sidebarRepairWidth(12, 100), 42);
  assert.equal(sidebarRepairWidth(12, 80), undefined);
  assert.equal(sidebarRepairWidth(40, 160), undefined);
  assert.equal(sidebarRepairWidth(60, 160), undefined);
});

test("slot 1 opens the first panel", async () => {
  const exec = sidePaneExec(dashboard, "");

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-api", ownPane: "%1", slot: 1 }, exec), { kind: "opened", slot: 1 });
  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    presize("pi-agent-hub-api", 117, 58),
    attach("-h", "%1", "pi-agent-hub-api", 117),
    resetSize("pi-agent-hub-api"),
    ["select-pane", "-t", "%10"],
  ]);
});

test("slot 2 rebuilds the content region as two stacked panels", async () => {
  const exec = sidePaneExec(onePane, sessions.one);

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-docs", ownPane: "%1", slot: 2 }, exec), { kind: "opened", slot: 2 });
  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    listClientsCall,
    ["kill-pane", "-t", "%2"],
    presize("pi-agent-hub-api", 117, 28),
    presize("pi-agent-hub-docs", 117, 28),
    attach("-h", "%1", "pi-agent-hub-api", 117),
    attach("-v", "%10", "pi-agent-hub-docs", 29),
    resetSize("pi-agent-hub-api"),
    resetSize("pi-agent-hub-docs"),
    ["select-pane", "-t", "%11"],
  ]);
});

test("panel rebuild assigns numbered pane titles", async () => {
  const exec = sidePaneExec(onePane, sessions.one);
  const titles = new Map([
    ["pi-agent-hub-api", "API"],
    ["pi-agent-hub-docs", "Docs"],
  ]);

  await toggleSidePaneSlot({
    target: "pi-agent-hub-docs",
    ownPane: "%1",
    slot: 2,
    titleFor: (tmuxSession) => titles.get(tmuxSession),
  }, exec);

  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "select-pane" && args[3] === "-T"), [
    ["select-pane", "-t", "%10", "-T", "[1] API"],
    ["select-pane", "-t", "%11", "-T", "[2] Docs"],
  ]);
  assert.deepEqual(exec.calls.map((call) => call.args).at(-1), ["select-pane", "-t", "%11"]);
});

test("slot 3 rebuilds as one left panel and two stacked right panels", async () => {
  const exec = sidePaneExec(twoPanes, sessions.two);

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-web", ownPane: "%1", slot: 3 }, exec), { kind: "opened", slot: 3 });
  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "split-window"), [
    attach("-h", "%1", "pi-agent-hub-api", 117),
    attach("-h", "%10", "pi-agent-hub-docs", 58),
    attach("-v", "%11", "pi-agent-hub-web", 29),
  ]);
  assert.deepEqual(exec.calls.map((call) => call.args).at(-1), ["select-pane", "-t", "%12"]);
});

test("slot 4 rebuilds the content region as a two-by-two grid", async () => {
  const exec = sidePaneExec(threePanes, sessions.three);

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-tests", ownPane: "%1", slot: 4 }, exec), { kind: "opened", slot: 4 });
  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "split-window"), [
    attach("-h", "%1", "pi-agent-hub-api", 117),
    attach("-v", "%10", "pi-agent-hub-web", 29),
    attach("-h", "%10", "pi-agent-hub-docs", 58),
    attach("-h", "%11", "pi-agent-hub-tests", 58),
  ]);
  assert.deepEqual(exec.calls.map((call) => call.args).at(-1), ["select-pane", "-t", "%13"]);
});

test("an occupied slot retargets to a newly selected session", async () => {
  const exec = sidePaneExec(twoPanes, sessions.two);

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-web", ownPane: "%1", slot: 2 }, exec), { kind: "retargeted", slot: 2 });
  assert.deepEqual(exec.calls.map((call) => call.args).slice(-4), [
    presize("pi-agent-hub-web", 117, 28),
    ["switch-client", "-c", "/dev/ttys003", "-t", "pi-agent-hub-web"],
    resetSize("pi-agent-hub-web"),
    ["select-pane", "-t", "%3"],
  ]);
});

test("retargeting an occupied slot updates its numbered pane title", async () => {
  const exec = sidePaneExec(twoPanes, sessions.two);

  await toggleSidePaneSlot({
    target: "pi-agent-hub-web",
    ownPane: "%1",
    slot: 2,
    titleFor: () => "Web",
  }, exec);

  assert.deepEqual(exec.calls.map((call) => call.args).slice(-5), [
    presize("pi-agent-hub-web", 117, 28),
    ["switch-client", "-c", "/dev/ttys003", "-t", "pi-agent-hub-web"],
    resetSize("pi-agent-hub-web"),
    ["select-pane", "-t", "%3", "-T", "[2] Web"],
    ["select-pane", "-t", "%3"],
  ]);
});

test("pressing a slot showing the selected session closes it and reflows remaining panels", async () => {
  const exec = sidePaneExec(threePanes, sessions.three);

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-docs", ownPane: "%1", slot: 2 }, exec), { kind: "closed" });
  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "kill-pane"), [
    ["kill-pane", "-t", "%2"],
    ["kill-pane", "-t", "%3"],
    ["kill-pane", "-t", "%4"],
  ]);
  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "split-window"), [
    attach("-h", "%1", "pi-agent-hub-api", 117),
    attach("-v", "%10", "pi-agent-hub-web", 29),
  ]);
});

test("panel rebuild tolerates a pane closing after inspection", async () => {
  let nextPane = 10;
  const exec = fakeTmux((call) => {
    if (call.args[0] === "list-panes") return { stdout: twoPanes, stderr: "" };
    if (call.args[0] === "list-clients") return { stdout: sessions.two, stderr: "" };
    if (call.args[0] === "kill-pane" && call.args[2] === "%2") throw new Error("can't find pane: %2");
    if (call.args[0] === "split-window") return { stdout: `%${nextPane++}\n`, stderr: "" };
    return { stdout: "", stderr: "" };
  });

  await assert.doesNotReject(() => toggleSidePaneSlot({ target: "pi-agent-hub-web", ownPane: "%1", slot: 3 }, exec));
  assert.equal(exec.calls.some((call) => call.args[0] === "split-window"), true);
});

test("panel rebuild skips a failed pre-size and continues attaching remaining sessions", async () => {
  let nextPane = 10;
  const exec = fakeTmux((call) => {
    if (call.args[0] === "list-panes") return { stdout: onePane, stderr: "" };
    if (call.args[0] === "list-clients") return { stdout: sessions.one, stderr: "" };
    if (call.args[0] === "resize-window" && call.args[2] === "pi-agent-hub-api") throw new Error("can't find session");
    if (call.args[0] === "split-window") return { stdout: `%${nextPane++}\n`, stderr: "" };
    return { stdout: "", stderr: "" };
  });

  await assert.doesNotReject(() => toggleSidePaneSlot({ target: "pi-agent-hub-docs", ownPane: "%1", slot: 2 }, exec));
  assert.equal(exec.calls.filter((call) => call.args[0] === "split-window").length, 2);
});

test("panel rebuild attempts every size reset and surfaces unexpected reset failures", async () => {
  let nextPane = 10;
  const exec = fakeTmux((call) => {
    if (call.args[0] === "list-panes") return { stdout: onePane, stderr: "" };
    if (call.args[0] === "list-clients") return { stdout: sessions.one, stderr: "" };
    if (call.args[0] === "split-window") return { stdout: `%${nextPane++}\n`, stderr: "" };
    if (call.args[0] === "set-option" && call.args[3] === "pi-agent-hub-api") throw new Error("reset failed");
    return { stdout: "", stderr: "" };
  });

  await assert.rejects(() => toggleSidePaneSlot({ target: "pi-agent-hub-docs", ownPane: "%1", slot: 2 }, exec), /reset failed/);
  assert.deepEqual(exec.calls.filter((call) => call.args[0] === "set-option").map((call) => call.args[3]), [
    "pi-agent-hub-api",
    "pi-agent-hub-docs",
  ]);
});

test("out-of-sequence slots append and focus the next available panel", async () => {
  const exec = sidePaneExec(onePane, sessions.one);

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-web", ownPane: "%1", slot: 4 }, exec), { kind: "opened", slot: 2 });
  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "split-window"), [
    attach("-h", "%1", "pi-agent-hub-api", 117),
    attach("-v", "%10", "pi-agent-hub-web", 29),
  ]);
  assert.deepEqual(exec.calls.map((call) => call.args).at(-1), ["select-pane", "-t", "%11"]);
});

test("requesting a high slot for the last open target is a no-op", async () => {
  const exec = sidePaneExec(twoPanes, sessions.two);

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-docs", ownPane: "%1", slot: 4 }, exec), { kind: "retargeted", slot: 2 });
  assert.equal(exec.calls.some((call) => ["kill-pane", "split-window", "switch-client"].includes(call.args[0] ?? "")), false);
  assert.deepEqual(exec.calls.map((call) => call.args).at(-1), ["select-pane", "-t", "%3"]);
});

test("growing the panel layout is refused when columns would be too narrow", async () => {
  const exec = sidePaneExec(twoPanes.replaceAll("160 60", "120 60"), sessions.two);

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-web", ownPane: "%1", slot: 3 }, exec), { kind: "too-narrow", panels: 3 });
  assert.equal(exec.calls.some((call) => ["kill-pane", "split-window", "switch-client", "select-pane"].includes(call.args[0] ?? "")), false);
});

test("closing and swapping panels remain available in narrow windows", async () => {
  const narrowPanes = twoPanes.replaceAll("160 60", "80 60");
  const closeExec = sidePaneExec(narrowPanes, sessions.two);
  const swapExec = sidePaneExec(narrowPanes, sessions.two);

  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-docs", ownPane: "%1", slot: 2 }, closeExec), { kind: "closed" });
  assert.deepEqual(await toggleSidePaneSlot({ target: "pi-agent-hub-api", ownPane: "%1", slot: 2 }, swapExec), { kind: "retargeted", slot: 2 });
  assert.equal(closeExec.calls.some((call) => call.args[0] === "split-window"), true);
  assert.equal(closeExec.calls.some((call) => call.args[0] === "select-pane"), false);
  assert.equal(swapExec.calls.some((call) => call.args[0] === "split-window"), true);
  assert.deepEqual(swapExec.calls.map((call) => call.args).at(-1), ["select-pane", "-t", "%11"]);
});

test("shift-number focuses the matching panel", async () => {
  const exec = sidePaneExec(fourPanes, sessions.four);

  assert.deepEqual(await focusSidePaneSlot({ ownPane: "%1", slot: 3 }, exec), { kind: "focused" });
  assert.deepEqual(exec.calls.map((call) => call.args).at(-1), ["select-pane", "-t", "%4"]);
});

test("shift-number reports an unavailable empty panel", async () => {
  const exec = sidePaneExec(onePane, sessions.one);

  assert.deepEqual(await focusSidePaneSlot({ ownPane: "%1", slot: 2 }, exec), { kind: "unavailable" });
  assert.equal(exec.calls.some((call) => call.args[0] === "select-pane"), false);
});

test("o reset replaces all panels with one selected session", async () => {
  const exec = sidePaneExec(fourPanes, sessions.four);

  assert.deepEqual(await resetSidePane({ target: "pi-agent-hub-web", ownPane: "%1" }, exec), { kind: "retargeted", slot: 1 });
  assert.equal(exec.calls.filter((call) => call.args[0] === "kill-pane").length, 4);
  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "split-window"), [
    attach("-h", "%1", "pi-agent-hub-web", 117),
  ]);
  assert.deepEqual(exec.calls.map((call) => call.args).at(-1), resetSize("pi-agent-hub-web"));
});

test("o reset closes a sole panel already showing the selected session", async () => {
  const exec = sidePaneExec(onePane, sessions.one);

  assert.deepEqual(await resetSidePane({ target: "pi-agent-hub-api", ownPane: "%1" }, exec), { kind: "closed" });
  assert.deepEqual(exec.calls.map((call) => call.args).at(-1), ["kill-pane", "-t", "%2"]);
});

test("o reset refuses to open the first panel when the window is too narrow", async () => {
  const exec = sidePaneExec(dashboard.replace("160 60", "80 60"), "");

  assert.deepEqual(await resetSidePane({ target: "pi-agent-hub-api", ownPane: "%1" }, exec), { kind: "too-narrow", panels: 1 });
  assert.equal(exec.calls.some((call) => call.args[0] === "split-window"), false);
});

test("o reset can reduce an existing narrow layout to one panel", async () => {
  const exec = sidePaneExec(twoPanes.replaceAll("160 60", "80 60"), sessions.two);

  assert.deepEqual(await resetSidePane({ target: "pi-agent-hub-web", ownPane: "%1" }, exec), { kind: "retargeted", slot: 1 });
  assert.equal(exec.calls.some((call) => call.args[0] === "split-window"), true);
});

test("closeSidePaneShowing kills the matching content pane", async () => {
  const exec = sidePaneExec(twoPanes, sessions.two);

  assert.equal(await closeSidePaneShowing({ target: "pi-agent-hub-docs", ownPane: "%1" }, exec), true);
  assert.deepEqual(exec.calls.map((call) => call.args).at(-1), ["kill-pane", "-t", "%3"]);
});

test("closeSidePanes kills only owned side panes and tolerates races", async () => {
  const exec = fakeTmux((call) => {
    if (call.args[0] === "list-panes") return { stdout: `${twoPanes}%9 /dev/ttys009 0 43 50 20 10 160 60\n`, stderr: "" };
    if (call.args[0] === "list-clients") return { stdout: `${sessions.two}/dev/ttys009 user-shell\n`, stderr: "" };
    if (call.args[0] === "kill-pane" && call.args[2] === "%2") throw new Error("can't find pane");
    return { stdout: "", stderr: "" };
  });

  await assert.doesNotReject(() => closeSidePanes({ ownPane: "%1" }, exec));
  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "kill-pane"), [
    ["kill-pane", "-t", "%2"],
    ["kill-pane", "-t", "%3"],
  ]);
});
