import test from "node:test";
import assert from "node:assert/strict";
import { closeSidePaneShowing, openInSidePane } from "../src/app/side-pane.js";
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

test("openInSidePane splits when only the dashboard pane exists", async () => {
  const exec = sidePaneExec("%1 /dev/ttys001 1\n", "");

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-api", ownPane: "%1" }, exec), { kind: "opened" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    ["list-panes", "-t", "%1", "-F", "#{pane_id} #{pane_tty} #{pane_active}"],
    ["split-window", "-h", "-t", "%1", "env -u TMUX tmux attach-session -t 'pi-agent-hub-api'"],
    ["resize-pane", "-t", "%1", "-x", "42"],
  ]);
});

test("openInSidePane closes the content pane when it already shows the target", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1\n%2 /dev/ttys002 0\n",
    "/dev/ttys002 pi-agent-hub-api\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-api", ownPane: "%1" }, exec), { kind: "closed" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    ["list-panes", "-t", "%1", "-F", "#{pane_id} #{pane_tty} #{pane_active}"],
    ["list-clients", "-F", "#{client_tty} #{client_session}"],
    ["kill-pane", "-t", "%2"],
  ]);
});

test("openInSidePane retargets an existing managed content pane", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1\n%2 /dev/ttys002 0\n",
    "/dev/ttys002 pi-agent-hub-api\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-docs", ownPane: "%1" }, exec), { kind: "retargeted" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    ["list-panes", "-t", "%1", "-F", "#{pane_id} #{pane_tty} #{pane_active}"],
    ["list-clients", "-F", "#{client_tty} #{client_session}"],
    ["switch-client", "-c", "/dev/ttys002", "-t", "pi-agent-hub-docs"],
    ["select-pane", "-t", "%2"],
  ]);
});

test("openInSidePane leaves non-owned panes alone and splits a fresh pane", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1\n%2 /dev/ttys002 0\n%3 /dev/ttys003 0\n",
    "/dev/ttys003 user-shell\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-api", ownPane: "%1", sidebarWidth: 50 }, exec), { kind: "opened" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    ["list-panes", "-t", "%1", "-F", "#{pane_id} #{pane_tty} #{pane_active}"],
    ["list-clients", "-F", "#{client_tty} #{client_session}"],
    ["split-window", "-h", "-t", "%1", "env -u TMUX tmux attach-session -t 'pi-agent-hub-api'"],
    ["resize-pane", "-t", "%1", "-x", "50"],
  ]);
});

test("openInSidePane uses the first non-own pane that passes ownership", async () => {
  const exec = sidePaneExec(
    "%1 /dev/ttys001 1\n%2 /dev/ttys002 0\n%3 /dev/ttys003 0\n",
    "/dev/ttys002 pi-agent-hub-api\n/dev/ttys003 pi-agent-hub-other\n",
  );

  assert.deepEqual(await openInSidePane({ target: "pi-agent-hub-docs", ownPane: "%1" }, exec), { kind: "retargeted" });

  assert.deepEqual(exec.calls.map((call) => call.args), [
    ["list-panes", "-t", "%1", "-F", "#{pane_id} #{pane_tty} #{pane_active}"],
    ["list-clients", "-F", "#{client_tty} #{client_session}"],
    ["switch-client", "-c", "/dev/ttys002", "-t", "pi-agent-hub-docs"],
    ["select-pane", "-t", "%2"],
  ]);
});

test("closeSidePaneShowing only kills a content pane showing the exact target", async () => {
  const matching = sidePaneExec(
    "%1 /dev/ttys001 1\n%2 /dev/ttys002 0\n",
    "/dev/ttys002 pi-agent-hub-api\n",
  );
  assert.equal(await closeSidePaneShowing({ target: "pi-agent-hub-api", ownPane: "%1" }, matching), true);
  assert.equal(matching.calls.at(-1)?.args[0], "kill-pane");

  const other = sidePaneExec(
    "%1 /dev/ttys001 1\n%2 /dev/ttys002 0\n",
    "/dev/ttys002 pi-agent-hub-docs\n",
  );
  assert.equal(await closeSidePaneShowing({ target: "pi-agent-hub-api", ownPane: "%1" }, other), false);
  assert.equal(other.calls.some((call) => call.args[0] === "kill-pane"), false);
});
