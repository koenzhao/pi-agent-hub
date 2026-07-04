import test from "node:test";
import assert from "node:assert/strict";
import { closeSidePaneShowing, closeSidePanes, openInSidePane } from "../src/app/side-pane.js";
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
  return fakeTmux((call) => {
    if (call.args[0] === "list-panes") return { stdout: panes, stderr: "" };
    if (call.args[0] === "list-clients") return { stdout: clients, stderr: "" };
    return { stdout: "", stderr: "" };
  });
}

const listPanesCall = ["list-panes", "-t", "%1", "-F", "#{pane_id} #{pane_tty} #{pane_active} #{pane_top}"];
const listClientsCall = ["list-clients", "-F", "#{client_tty} #{client_session}"];

test("top slot splits when only the dashboard pane exists", async () => {
  const exec = sidePaneExec("%1 /dev/ttys001 1 0\n", "");

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-api", ownPane: "%1", slot: "top" }, exec), { kind: "opened" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    ["split-window", "-h", "-t", "%1", "env -u TMUX tmux attach-session -t 'pi-agent-hub-api'"],
    ["resize-pane", "-t", "%1", "-x", "42"],
  ]);
});

test("bottom slot with no content pane opens the only pane", async () => {
  const exec = sidePaneExec("%1 /dev/ttys001 1 0\n", "");

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-api", ownPane: "%1", slot: "bottom", sidebarWidth: 50 }, exec), { kind: "opened" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    ["split-window", "-h", "-t", "%1", "env -u TMUX tmux attach-session -t 'pi-agent-hub-api'"],
    ["resize-pane", "-t", "%1", "-x", "50"],
  ]);
});

test("bottom slot with one content pane splits below it", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%2 /dev/ttys002 0 0\n",
    "/dev/ttys002 pi-agent-hub-api\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-docs", ownPane: "%1", slot: "bottom" }, exec), { kind: "opened" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    listClientsCall,
    ["split-window", "-v", "-t", "%2", "env -u TMUX tmux attach-session -t 'pi-agent-hub-docs'"],
  ]);
});

test("top slot retargets the visually top managed pane", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%3 /dev/ttys003 0 40\n%2 /dev/ttys002 0 10\n",
    "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-web", ownPane: "%1", slot: "top" }, exec), { kind: "retargeted" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    listClientsCall,
    ["switch-client", "-c", "/dev/ttys002", "-t", "pi-agent-hub-web"],
    ["select-pane", "-t", "%2"],
  ]);
});

test("bottom slot retargets the visually bottom managed pane", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%2 /dev/ttys002 0 10\n%3 /dev/ttys003 0 40\n",
    "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-web", ownPane: "%1", slot: "bottom" }, exec), { kind: "retargeted" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    listClientsCall,
    ["switch-client", "-c", "/dev/ttys003", "-t", "pi-agent-hub-web"],
    ["select-pane", "-t", "%3"],
  ]);
});

test("toggle closes a visible target regardless of requested slot", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%2 /dev/ttys002 0 10\n%3 /dev/ttys003 0 40\n",
    "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-docs", ownPane: "%1", slot: "top" }, exec), { kind: "closed" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    listClientsCall,
    ["kill-pane", "-t", "%3"],
  ]);
});

test("non-owned panes are ignored when choosing slots", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%4 /dev/ttys004 0 5\n%2 /dev/ttys002 0 10\n%3 /dev/ttys003 0 40\n",
    "/dev/ttys004 user-shell\n/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-web", ownPane: "%1", slot: "top" }, exec), { kind: "retargeted" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    listClientsCall,
    ["switch-client", "-c", "/dev/ttys002", "-t", "pi-agent-hub-web"],
    ["select-pane", "-t", "%2"],
  ]);
});

test("unowned panes do not prevent opening a fresh pane", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%2 /dev/ttys002 0 10\n%3 /dev/ttys003 0 40\n",
    "/dev/ttys003 user-shell\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-api", ownPane: "%1" }, exec), { kind: "opened" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    listPanesCall,
    listClientsCall,
    ["split-window", "-h", "-t", "%1", "env -u TMUX tmux attach-session -t 'pi-agent-hub-api'"],
    ["resize-pane", "-t", "%1", "-x", "42"],
  ]);
});

test("closeSidePaneShowing kills the matching content pane even when it is second", async () => {
  const matching = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%2 /dev/ttys002 0 10\n%3 /dev/ttys003 0 40\n",
    "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n",
  );

  assert.equal(await closeSidePaneShowing({ target: "pi-agent-hub-docs", ownPane: "%1" }, matching), true);
  assert.deepEqual(matching.calls.map((call) => call.args).at(-1), ["kill-pane", "-t", "%3"]);

  const other = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%2 /dev/ttys002 0 10\n%3 /dev/ttys003 0 40\n",
    "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n",
  );
  assert.equal(await closeSidePaneShowing({ target: "pi-agent-hub-web", ownPane: "%1" }, other), false);
  assert.equal(other.calls.some((call) => call.args[0] === "kill-pane"), false);
});

test("closeSidePanes kills only owned side panes", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%2 /dev/ttys002 0 10\n%3 /dev/ttys003 0 40\n%4 /dev/ttys004 0 50\n",
    "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 user-shell\n/dev/ttys004 pi-agent-hub-docs\n",
  );

  await closeSidePanes({ ownPane: "%1" }, exec);

  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "kill-pane"), [
    ["kill-pane", "-t", "%2"],
    ["kill-pane", "-t", "%4"],
  ]);
});

test("closeSidePanes is a no-op when no owned panes exist", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1 0\n%2 /dev/ttys002 0 10\n",
    "/dev/ttys002 user-shell\n",
  );

  await closeSidePanes({ ownPane: "%1" }, exec);

  assert.equal(exec.calls.some((call) => call.args[0] === "kill-pane"), false);
});

test("closeSidePanes tolerates panes that close during shutdown", async () => {
  const exec = fakeTmux((call) => {
    if (call.args[0] === "list-panes") return { stdout: "%1 /dev/ttys001 1 0\n%2 /dev/ttys002 0 10\n%3 /dev/ttys003 0 40\n", stderr: "" };
    if (call.args[0] === "list-clients") return { stdout: "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-docs\n", stderr: "" };
    if (call.args[0] === "kill-pane" && call.args[2] === "%2") throw new Error("can't find pane");
    return { stdout: "", stderr: "" };
  });

  await assert.doesNotReject(() => closeSidePanes({ ownPane: "%1" }, exec));
  assert.deepEqual(exec.calls.map((call) => call.args).filter((args) => args[0] === "kill-pane"), [
    ["kill-pane", "-t", "%2"],
    ["kill-pane", "-t", "%3"],
  ]);
});
