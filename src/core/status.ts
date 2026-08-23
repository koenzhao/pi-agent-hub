import { nextUpdatedAt } from "./session-version.js";
export { readHeartbeat } from "./heartbeat.js";
import type { ManagedSession, SessionStatus, Heartbeat, StatusInput } from "./types.js";

export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_STALE_MS = 60_000;
export const TMUX_ACTIVE_MS = 5_000;

export interface ComputedStatus {
  status: SessionStatus;
  note?: string;
  error?: string;
}

export function computeStatus(input: StatusInput): ComputedStatus {
  const { session, tmux, heartbeat, now } = input;
  if (!tmux.exists) {
    return session.status === "stopped"
      ? { status: "stopped" }
      : { status: "error", error: tmux.error ?? "tmux session is missing" };
  }

  const fallbackFromTmux = (note?: string): ComputedStatus => {
    if (tmux.recentActivityMs !== undefined && tmux.recentActivityMs < TMUX_ACTIVE_MS) {
      return { status: "running", note };
    }
    if (session.status === "starting") return { status: "starting", note };
    if (session.status === "running") return { status: "waiting", note };
    return { status: session.acknowledgedAt ? "idle" : "waiting", note };
  };

  if (!heartbeat) return fallbackFromTmux("missing heartbeat");
  if (heartbeat.state === "error") return { status: "error", error: heartbeat.message ?? "Pi session reported an error" };
  if (heartbeat.state === "shutdown") return { status: "stopped" };

  const stale = now - heartbeat.updatedAt > HEARTBEAT_STALE_MS;
  if (stale) return fallbackFromTmux("stale heartbeat");
  if (heartbeat.state === "running" || heartbeat.state === "starting") return { status: "running" };

  const lastAgentEnd = heartbeat.stateSince;
  if (!session.acknowledgedAt || session.acknowledgedAt < lastAgentEnd) return { status: "waiting" };
  return { status: "idle" };
}

export function applyComputedStatus(session: ManagedSession, computed: ComputedStatus, now = Date.now(), heartbeat?: Heartbeat): ManagedSession {
  return updateSession(session, {
    status: computed.status,
    error: computed.error,
    sessionFile: heartbeat?.piSessionFile ?? session.sessionFile,
    piSessionId: heartbeat?.piSessionId ?? session.piSessionId,
    lastActivityAt: latestActivityAt(session.lastActivityAt, heartbeat?.stateSince),
    kind: heartbeat?.kind ?? session.kind,
    parentId: heartbeat?.parentId ?? session.parentId,
    agentName: heartbeat?.agentName ?? session.agentName,
    taskPreview: heartbeat?.taskPreview ?? session.taskPreview,
    resultPath: heartbeat?.resultPath ?? session.resultPath,
    activeTheme: isFreshHeartbeat(heartbeat, now) ? heartbeat.activeTheme : undefined,
    workflow: isFreshHeartbeat(heartbeat, now) ? retainedWorkflow(heartbeat.workflow) : session.workflow,
  }, now);
}

export function markAcknowledged(session: ManagedSession, now = Date.now()): ManagedSession {
  if (session.acknowledgedAt !== undefined && session.status !== "waiting") return session;
  return updateSession(session, {
    acknowledgedAt: now,
    status: session.status === "waiting" ? "idle" : session.status,
  }, now);
}

function updateSession(session: ManagedSession, changes: Partial<ManagedSession>, now: number): ManagedSession {
  const next = { ...session, ...changes };
  if (sessionStateKey(session) === sessionStateKey(next)) return session;
  return { ...next, updatedAt: nextUpdatedAt(session.updatedAt, now) };
}

function sessionStateKey(session: ManagedSession): string {
  const { updatedAt: _updatedAt, ...state } = session;
  return JSON.stringify(state);
}

function latestActivityAt(current: number | undefined, heartbeatStateSince: number | undefined): number | undefined {
  if (heartbeatStateSince === undefined) return current;
  return Math.max(current ?? heartbeatStateSince, heartbeatStateSince);
}

export function isFreshHeartbeat(heartbeat: Heartbeat | undefined, now: number): heartbeat is Heartbeat {
  return Boolean(heartbeat && heartbeat.state !== "shutdown" && now - heartbeat.updatedAt <= HEARTBEAT_STALE_MS);
}

function retainedWorkflow(workflow: Heartbeat["workflow"]): ManagedSession["workflow"] {
  if (!workflow) return undefined;
  const { activeMode: _activeMode, ...snapshot } = workflow;
  return snapshot;
}
