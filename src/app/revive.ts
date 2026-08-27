import { DASHBOARD_SESSION_NAME } from "../core/names.js";
import { loadRegistry } from "../core/registry.js";
import { sessionSection } from "../core/session-bucket.js";
import { isSubagentSession } from "../core/session-tree.js";
import { killSession, listSessions, realTmuxExec, type TmuxExec } from "../core/tmux.js";
import { restartManagedSession } from "./session-lifecycle.js";

export interface ReviveOptions {
  exec?: TmuxExec;
  restart?: (id: string) => Promise<unknown>;
}

export interface ReviveResult {
  restarted: string[];
  skipped: string[];
  killedStaleDashboard: boolean;
}

/**
 * Post-reboot recovery: restart every active non-subagent managed session so
 * each resumes its saved Pi conversation, and remove a stale dashboard tmux
 * session that tmux-resurrect restored as a plain shell instead of the TUI.
 */
export async function reviveSessions(options: ReviveOptions = {}): Promise<ReviveResult> {
  const exec = options.exec ?? realTmuxExec;
  const restart = options.restart ?? restartManagedSession;
  const registry = await loadRegistry();
  const present = await listSessions(exec).catch(() => new Set<string>());

  const restarted: string[] = [];
  const skipped: string[] = [];
  for (const session of registry.sessions) {
    if (isSubagentSession(session) || sessionSection(session) !== "active") {
      skipped.push(session.id);
      continue;
    }
    await restart(session.id);
    restarted.push(session.id);
  }

  const killedStaleDashboard = await killStaleDashboard(present, exec);
  return { restarted, skipped, killedStaleDashboard };
}

/**
 * Kill the dashboard tmux session only when it exists but is not running the
 * TUI (e.g. resurrect restored it as a bare shell). A live dashboard is
 * detected by any pane whose current command is not a login shell.
 */
async function killStaleDashboard(present: Set<string>, exec: TmuxExec): Promise<boolean> {
  if (!present.has(DASHBOARD_SESSION_NAME)) return false;
  const shellCommands = new Set(["bash", "zsh", "sh", "fish", "dash"]);
  try {
    const result = await exec.exec("tmux", ["list-panes", "-t", DASHBOARD_SESSION_NAME, "-F", "#{pane_current_command}"]);
    const commands = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (commands.length > 0 && commands.every((command) => shellCommands.has(command))) {
      await killSession(DASHBOARD_SESSION_NAME, exec);
      return true;
    }
  } catch {
    // If inspection fails, leave the dashboard session alone.
  }
  return false;
}
