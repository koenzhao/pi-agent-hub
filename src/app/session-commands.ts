import { loadRegistry } from "../core/registry.js";
import { isSubagentSession } from "../core/session-tree.js";
import { configureManagedSessionStatusBar, sendMultilineToSession, sendTextToSession, sessionExists } from "../core/tmux.js";
import { loadManagedSessionTheme } from "../tui/theme.js";
import { resolveSession } from "./delete-session.js";

export {
  managedPiCommand,
} from "./session-lifecycle.js";
export type { ForkInput, SessionInput } from "./session-lifecycle.js";

export async function renameManagedSession(id: string, title: string): Promise<void> {
  const registry = await loadRegistry();
  const session = resolveSession(registry, id);
  const name = title.trim();
  if (isSubagentSession(session)) throw new Error("subagent rows cannot be renamed");
  if (session.status === "stopped" || session.status === "error") throw new Error("restart the Pi session before renaming");
  if (!name || /[\r\n]/.test(name)) throw new Error("name must be one nonblank line");
  await sendTextToSession(session.tmuxSession, `/name ${name}`);
}

export interface SentMessage {
  id: string;
  title: string;
}

/** Resolve a CLI send target: exact id, unique id prefix, or exact title (case-insensitive). */
export function resolveMessageTarget(registry: import("../core/types.js").SessionsRegistry, target: string): import("../core/types.js").ManagedSession {
  const sessions = registry.sessions;
  const exact = sessions.find((session) => session.id === target);
  if (exact) return exact;
  const prefixMatches = target.length >= 4 ? sessions.filter((session) => session.id.startsWith(target)) : [];
  if (prefixMatches.length === 1) return prefixMatches[0]!;
  if (prefixMatches.length > 1) throw new Error(`Ambiguous session id "${target}": ${prefixMatches.map((session) => session.id.slice(0, 8)).join(", ")}`);
  const titleMatches = sessions.filter((session) => session.title.toLowerCase() === target.toLowerCase());
  if (titleMatches.length === 1) return titleMatches[0]!;
  if (titleMatches.length > 1) throw new Error(`Ambiguous session title "${target}": ${titleMatches.map((session) => session.id.slice(0, 8)).join(", ")}`);
  throw new Error(`Unknown session: ${target}`);
}

/**
 * Paste a message into a specific live managed session (CLI `pi-hub send`).
 * Uses bracketed paste so multiline text arrives as one editor input.
 */
export async function sendMessageToSession(target: string, text: string): Promise<SentMessage> {
  if (!text.trim()) throw new Error("message cannot be blank");
  const registry = await loadRegistry();
  const session = resolveMessageTarget(registry, target);
  if (isSubagentSession(session)) throw new Error("subagent rows are not messageable; message their parent session");
  if (!await sessionExists(session.tmuxSession)) throw new Error(`session "${session.title}" is not running`);
  await sendMultilineToSession(session.tmuxSession, text);
  return { id: session.id, title: session.title };
}

export async function syncManagedSessionStatusBars(hiddenSessions: ReadonlySet<string> = new Set()): Promise<void> {
  const registry = await loadRegistry();
  for (const session of registry.sessions) {
    if (await sessionExists(session.tmuxSession)) {
      await configureManagedSessionStatusBar({
        name: session.tmuxSession,
        title: session.title,
        cwd: session.cwd,
        theme: await loadManagedSessionTheme(session),
        visible: !hiddenSessions.has(session.tmuxSession),
      });
    }
  }
}
