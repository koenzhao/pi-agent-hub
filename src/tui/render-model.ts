import { archivedExpiresAt, sessionSection, type SessionSection } from "../core/session-bucket.js";
import { groupOrder, orderedSessions } from "../core/session-order.js";
import { orderedSessionRows, sessionDepth } from "../core/session-tree.js";
import { primaryWorktree, sessionWorktrees } from "../core/worktree.js";
import type { RuntimeSession, SessionStatus, SessionMetadata, WorkflowSnapshot } from "../core/types.js";

export interface RenderSession {
  id: string;
  title: string;
  cwd: string;
  additionalCwds: string[];
  workspaceCwd?: string;
  repoCount: number;
  group: string;
  section: SessionSection;
  bucketChangedAt?: number;
  archiveExpiresIn?: string;
  status: SessionStatus;
  displayStatus: "running" | "waiting" | "idle" | "error" | "stopped";
  symbol: string;
  selected: boolean;
  error?: string;
  sessionFile?: string;
  enabledMcpServers: string[];
  skillCount?: number;
  kind: "main" | "subagent";
  depth: number;
  parentId?: string;
  agentName?: string;
  taskPreview?: string;
  resultSummary?: string;
  sessionMetadata?: SessionMetadata;
  metadataUpdatedAge?: string;
  workflow?: WorkflowSnapshot;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeBaseBranch?: string;
  worktreeOwnedByHub?: boolean;
  worktreeCount?: number;
}

export interface StatusCounts {
  running: number;
  waiting: number;
  idle: number;
  error: number;
  stopped: number;
}

export interface RenderGroup {
  name: string;
  statusCounts: StatusCounts;
  sessions: RenderSession[];
}

export interface RenderSection {
  key: string;
  title: string;
  statusCounts: StatusCounts;
  sessionsTotal: number;
  groups: RenderGroup[];
}

export interface RenderSummary {
  total: number;
  visibleTotal: number;
  statusCounts: StatusCounts;
}

export interface RenderModel {
  width: number;
  height?: number;
  empty: boolean;
  noMatches: boolean;
  showPreview: boolean;
  compactFooter: boolean;
  groups: RenderGroup[];
  sections: RenderSection[];
  showSections: boolean;
  summary: RenderSummary;
  selected?: RenderSession;
  footer: string;
  filter?: string;
  preview: string;
  detailsExpanded: boolean;
  viewMode: "groups" | "stages";
  hiddenNonActive: number;
}

export interface BuildRenderModelInput {
  sessions: RuntimeSession[];
  selectedId?: string;
  width: number;
  height?: number;
  filter?: string;
  filterEditing?: boolean;
  preview?: string;
  detailsExpanded?: boolean;
  selectedSkillCount?: number;
  viewMode?: "groups" | "stages";
  now?: number;
}

export function buildRenderModel(input: BuildRenderModelInput): RenderModel {
  const stages = input.viewMode === "stages";
  const allRows = orderedSessionRows(input.sessions, input.filter);
  const visible = stages ? stageLaneRows(allRows.filter((session) => sessionSection(session) === "active")).flatMap((lane) => lane.rows) : allRows;
  const selectedId = pickSelectedId(visible, input.selectedId);
  const mapped = visible.map((session) => toRenderSession(session, session.id === selectedId, input.sessions, session.id === selectedId ? input.selectedSkillCount : undefined, input.now));
  const groups = groupsForSessions(mapped);
  const sections = stages ? lanesForSessions(mapped) : sectionsForSessions(mapped);

  const compactFooter = input.width < 80;
  const selected = mapped.find((session) => session.selected);
  const worktreeFooter = selected?.worktreeOwnedByHub ? " · w Finish WT" : "";
  const showLifecycleFooter = selected && selected.kind !== "subagent" && input.width >= 120;
  const lifecycleFooter = showLifecycleFooter ? selected.section === "active" ? " · A Archive · B Backlog" : " · U Restore" : "";
  const compactLifecycleFooter = selected && selected.kind !== "subagent" ? selected.section === "active" ? " · A · B" : " · U" : "";
  const sideFooter = input.width >= 120 ? "o Side" : "o";
  return {
    width: input.width,
    empty: input.sessions.length === 0,
    noMatches: input.sessions.length > 0 && allRows.length === 0,
    showPreview: input.width >= 80,
    compactFooter,
    groups,
    sections,
    showSections: stages ? mapped.length > 0 : sections.some((section) => section.key !== "active" && section.sessionsTotal > 0),
    summary: {
      total: input.sessions.length,
      visibleTotal: visible.length,
      statusCounts: countRenderSessions(mapped),
    },
    ...(input.height ? { height: input.height } : {}),
    selected,
    footer: compactFooter ? `Enter · o · n · /  │  p · i · r · R · d${selected?.worktreeOwnedByHub ? " · w" : ""}${compactLifecycleFooter}  │  v · ?` : `Enter Open · ${sideFooter} · n New · / Filter  │  p Send · i Info · r Restart · R Rename · d Delete${worktreeFooter}${lifecycleFooter}  │  ${input.width >= 120 ? "v View · " : ""}? Help`,
    filter: input.filter,
    preview: input.preview ?? "",
    detailsExpanded: input.detailsExpanded ?? false,
    viewMode: stages ? "stages" : "groups",
    hiddenNonActive: allRows.length - visible.length,
  };
}

export interface StageLaneRow {
  id: string;
  kind?: "main" | "subagent";
  parentId?: string;
  workflow?: WorkflowSnapshot;
}

export function stageLaneRows<T extends StageLaneRow>(rows: T[]): { key: string; rows: T[] }[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const laneOf = (row: T): string => {
    let owner: StageLaneRow | undefined = row;
    while (owner && owner.kind === "subagent") owner = owner.parentId ? byId.get(owner.parentId) : undefined;
    const workflow = owner?.workflow;
    return workflow?.steps[workflow.activeIndex]?.id ?? "none";
  };
  const order: string[] = [];
  for (const row of rows) {
    for (const step of row.workflow?.steps ?? []) if (!order.includes(step.id)) order.push(step.id);
  }
  order.push("none");
  const byLane = new Map<string, T[]>();
  for (const row of rows) {
    const lane = laneOf(row);
    byLane.set(lane, [...(byLane.get(lane) ?? []), row]);
  }
  return order.flatMap((key) => {
    const laneRows = byLane.get(key);
    return laneRows?.length ? [{ key, rows: laneRows }] : [];
  });
}

function lanesForSessions(sessions: RenderSession[]): RenderSection[] {
  return stageLaneRows(sessions).map(({ key, rows }) => ({
    key,
    title: key === "none" ? "NO WORKFLOW" : key.toUpperCase(),
    statusCounts: countRenderSessions(rows),
    sessionsTotal: rows.length,
    groups: [{ name: "", statusCounts: countRenderSessions(rows), sessions: rows }],
  } satisfies RenderSection));
}

export function retainSelectionAfterRefresh(
  previous: RuntimeSession[],
  next: RuntimeSession[],
  selectedId: string | undefined,
): string | undefined {
  if (!next.length) return undefined;
  if (selectedId && next.some((session) => session.id === selectedId)) return selectedId;
  const removed = previous.find((session) => session.id === selectedId);
  if (!removed) return next[0]?.id;

  const sameGroup = orderedSessions(next).filter((session) => session.group === removed.group);
  if (!sameGroup.length) return orderedSessions(next)[0]?.id;

  const previousSameGroup = orderedSessions(previous).filter((session) => session.group === removed.group);
  const oldIndex = previousSameGroup.findIndex((session) => session.id === selectedId);
  return sameGroup[Math.min(oldIndex, sameGroup.length - 1)]?.id ?? sameGroup.at(-1)?.id;
}

function pickSelectedId(sessions: RuntimeSession[], selectedId: string | undefined): string | undefined {
  if (!sessions.length) return undefined;
  if (selectedId && sessions.some((session) => session.id === selectedId)) return selectedId;
  return sessions[0]?.id;
}

function groupsForSessions(sessions: RenderSession[]): RenderGroup[] {
  const groupsByName = new Map<string, RenderSession[]>();
  for (const session of sessions) {
    const group = groupsByName.get(session.group) ?? [];
    group.push(session);
    groupsByName.set(session.group, group);
  }
  return [...groupsByName.entries()]
    .sort(([a], [b]) => groupOrder(a, b))
    .map(([name, groupSessions]) => ({
      name,
      statusCounts: countRenderSessions(groupSessions),
      sessions: groupSessions,
    } satisfies RenderGroup));
}

function sectionsForSessions(sessions: RenderSession[]): RenderSection[] {
  const titles: Record<SessionSection, string> = { active: "ACTIVE", backlog: "BACKLOG", archived: "ARCHIVED" };
  return (["active", "backlog", "archived"] as const).flatMap((key) => {
    const sectionSessions = sessions.filter((session) => session.section === key);
    if (!sectionSessions.length) return [];
    return [{
      key,
      title: titles[key],
      statusCounts: countRenderSessions(sectionSessions),
      sessionsTotal: sectionSessions.length,
      groups: groupsForSessions(sectionSessions),
    } satisfies RenderSection];
  });
}

function toRenderSession(session: RuntimeSession, selected: boolean, sessions: RuntimeSession[], skillCount: number | undefined, now: number | undefined): RenderSession {
  const displayStatus = displayStatusFor(session.status);
  const worktree = primaryWorktree(session);
  const worktrees = sessionWorktrees(session);
  return {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
    additionalCwds: session.additionalCwds ?? [],
    workspaceCwd: session.workspaceCwd,
    repoCount: 1 + (session.additionalCwds?.length ?? 0),
    group: session.group,
    section: sessionSection(session),
    bucketChangedAt: session.bucketChangedAt,
    archiveExpiresIn: archiveExpiresIn(session, now),
    status: session.status,
    displayStatus,
    symbol: symbolFor(displayStatus),
    selected,
    error: session.error,
    sessionFile: session.sessionFile,
    enabledMcpServers: session.enabledMcpServers ?? [],
    ...(skillCount !== undefined ? { skillCount } : {}),
    kind: session.kind ?? "main",
    depth: sessionDepth(session, sessions),
    parentId: session.parentId,
    agentName: session.agentName,
    taskPreview: session.taskPreview,
    resultSummary: session.resultSummary,
    sessionMetadata: session.sessionMetadata,
    metadataUpdatedAge: metadataUpdatedAge(session.sessionMetadata, now),
    workflow: session.workflow,
    worktreePath: worktree?.path ?? session.worktreePath,
    worktreeBranch: worktree?.branch ?? session.worktreeBranch,
    worktreeBaseBranch: worktree?.baseBranch ?? session.worktreeBaseBranch,
    worktreeOwnedByHub: session.worktreeOwnedByHub,
    worktreeCount: worktrees.length || undefined,
  };
}

function archiveExpiresIn(session: RuntimeSession, now: number | undefined): string | undefined {
  const expiresAt = archivedExpiresAt(session);
  if (expiresAt === undefined || now === undefined) return undefined;
  if (expiresAt <= now) return "now";
  return ageLabel(expiresAt - now);
}

function metadataUpdatedAge(metadata: SessionMetadata | undefined, now: number | undefined): string | undefined {
  if (!metadata?.updatedAt || now === undefined) return undefined;
  return ageLabel(Math.max(0, now - metadata.updatedAt));
}

function ageLabel(ageMs: number): string {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ageMs < minute) return "now";
  if (ageMs < hour) return `${Math.floor(ageMs / minute)}m`;
  if (ageMs < day) return `${Math.floor(ageMs / hour)}h`;
  return `${Math.floor(ageMs / day)}d`;
}

function displayStatusFor(status: SessionStatus): RenderSession["displayStatus"] {
  if (status === "starting") return "running";
  return status;
}

function symbolFor(status: RenderSession["displayStatus"]): string {
  switch (status) {
    case "running": return "●";
    case "waiting": return "◐";
    case "idle": return "○";
    case "error": return "×";
    case "stopped": return "-";
  }
}

function emptyStatusCounts(): StatusCounts {
  return { running: 0, waiting: 0, idle: 0, error: 0, stopped: 0 };
}

function countRenderSessions(sessions: RenderSession[]): StatusCounts {
  const counts = emptyStatusCounts();
  for (const session of sessions) counts[session.displayStatus] += 1;
  return counts;
}
