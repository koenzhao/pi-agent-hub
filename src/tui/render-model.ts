import { ARCHIVE_PRUNE_AFTER_MS, type SessionSection } from "../core/session-bucket.js";
import { compareGroupPriority, groupOrder, orderedSessions } from "../core/session-order.js";
import { orderedSessionRows, sessionDepth } from "../core/session-tree.js";
import { primaryWorktree, sessionWorktrees } from "../core/worktree.js";
import type { RuntimeSession, SessionAttention, SessionStatus, SessionMetadata, WorkflowRuntimeSnapshot, WorkflowSnapshot } from "../core/types.js";
import { archiveSectionRows, effectiveSessionLifecycle } from "./archive-section.js";

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
  archivedAge?: string;
  archiveRetentionIn?: string;
  lastActivityAt?: number;
  activityAge?: string;
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
  attention?: SessionAttention;
  selectedPlan?: RenderPlanSummary;
  workflow?: WorkflowRuntimeSnapshot;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeBaseBranch?: string;
  worktreeOwnedByHub?: boolean;
  worktreeCount?: number;
  sidePaneSlot?: number;
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

export interface ArchiveDisclosure {
  expanded: boolean;
  hiddenParents: number;
  selected: boolean;
}

export interface RenderSection {
  key: string;
  title: string;
  statusCounts: StatusCounts;
  sessionsTotal: number;
  groups: RenderGroup[];
  archiveDisclosure?: ArchiveDisclosure;
}

export interface RenderSummary {
  total: number;
  visibleTotal: number;
  statusCounts: StatusCounts;
}

export interface PanelStripItem {
  slot: 1 | 2 | 3 | 4;
  title?: string;
}

export interface RenderPlanSummary {
  feature?: string;
  phase?: { title: string; index: number; count: number };
  tasks?: { completed: number; total: number };
  nextStep?: string;
}

export interface BoardHiddenCounts {
  withoutWorkflow: number;
  otherWorkflows: number;
  nonActive: number;
}

export interface RenderModel {
  width: number;
  height?: number;
  listScrollTop?: number;
  empty: boolean;
  noMatches: boolean;
  noBoardSessions: boolean;
  showPreview: boolean;
  compactFooter: boolean;
  groups: RenderGroup[];
  sections: RenderSection[];
  showSections: boolean;
  summary: RenderSummary;
  boardCardCount: number;
  boardStatusCounts: StatusCounts;
  boardHidden: BoardHiddenCounts;
  selected?: RenderSession;
  footer: string;
  filter?: string;
  preview: string;
  detailsExpanded: boolean;
  viewMode: "groups" | "board";
  panelStrip?: PanelStripItem[];
  sidePaneFocusedSlot?: number;
}

export interface BuildRenderModelInput {
  sessions: RuntimeSession[];
  selectedId?: string;
  width: number;
  height?: number;
  listScrollTop?: number;
  filter?: string;
  filterEditing?: boolean;
  preview?: string;
  detailsExpanded?: boolean;
  selectedSkillCount?: number;
  viewMode?: "groups" | "board";
  now?: number;
  sidePaneSessionIds?: ReadonlyMap<string, number>;
  sidePaneFocusedSlot?: number;
  archiveExpanded?: boolean;
  archiveDisclosureSelected?: boolean;
  hidePreview?: boolean;
}

export function buildRenderModel(input: BuildRenderModelInput): RenderModel {
  const board = input.viewMode === "board";
  const allRows = orderedSessionRows(input.sessions, input.filter);
  const activeRows = allRows.filter((session) => effectiveSessionLifecycle(session, allRows).section === "active");
  const boardProjection = projectBoardRows(activeRows, allRows);
  const archive = archiveSectionRows(allRows, { expanded: input.archiveExpanded ?? false, filterActive: input.filter !== undefined });
  const visible = board ? boardProjection.rows : archive.rows;
  const selectedId = pickSelectedId(input.archiveDisclosureSelected ? allRows : visible, input.selectedId);
  const sidePaneSessionIds = input.sidePaneSessionIds;
  const occupiedSlots = new Map<number, string>();
  for (const session of input.sessions) {
    const slot = sidePaneSessionIds?.get(session.id);
    if (slot !== undefined) occupiedSlots.set(slot, session.title);
  }
  const panelStrip = occupiedSlots.size
    ? ([1, 2, 3, 4] as const).map((slot) => ({ slot, ...(occupiedSlots.has(slot) ? { title: occupiedSlots.get(slot) } : {}) }))
    : undefined;
  const mapped = visible.map((session) => toRenderSession(session, session.id === selectedId && !input.archiveDisclosureSelected, allRows, session.id === selectedId ? input.selectedSkillCount : undefined, input.now, sidePaneSessionIds?.get(session.id), board));
  const allMapped = allRows.map((session) => toRenderSession(session, session.id === selectedId, allRows, session.id === selectedId ? input.selectedSkillCount : undefined, input.now, sidePaneSessionIds?.get(session.id), board));
  const groups = groupsForSessions(mapped);
  const sections = board
    ? lanesForBoard(mapped, boardProjection)
    : sectionsForSessions(mapped, allMapped, archive.showDisclosure ? {
      expanded: input.archiveExpanded ?? false,
      hiddenParents: archive.hiddenParents,
      selected: input.archiveDisclosureSelected ?? false,
    } : undefined);

  const compactFooter = input.width < 90;
  const selected = (board ? mapped : allMapped).find((session) => session.id === selectedId);
  const worktreeFooter = selected?.worktreeOwnedByHub ? " · w Finish WT" : "";
  const showLifecycleFooter = selected && selected.kind !== "subagent" && input.width >= 120;
  const lifecycleFooter = showLifecycleFooter ? selected.section === "active" ? " · A Archive · B Backlog" : " · U Restore" : "";
  const deleteFooter = input.width >= 120 ? "d Delete" : "d Del";
  const boardParents = mapped.filter((session) => session.kind !== "subagent");
  const noBoardMatches = board && input.filter !== undefined && allRows.length > 0 && mapped.length === 0;
  return {
    width: input.width,
    empty: input.sessions.length === 0,
    noMatches: input.sessions.length > 0 && (allRows.length === 0 || noBoardMatches),
    noBoardSessions: board && input.filter === undefined && mapped.length === 0,
    showPreview: input.width >= 80 && !input.hidePreview,
    compactFooter,
    groups,
    sections,
    showSections: board ? mapped.length > 0 : sections.some((section) => section.key !== "active" && section.sessionsTotal > 0),
    summary: {
      total: input.sessions.length,
      visibleTotal: allRows.length,
      statusCounts: countRenderSessions(allMapped),
    },
    boardCardCount: boardParents.length,
    boardStatusCounts: countRenderSessions(boardParents),
    boardHidden: boardProjection.hidden,
    ...(input.height ? { height: input.height } : {}),
    ...(input.listScrollTop ? { listScrollTop: input.listScrollTop } : {}),
    selected,
    footer: compactFooter
      ? "1-4 Set · x# Close · F# Focus · ? Help"
      : input.width < 120
        ? "Enter Open · 1-4 Panels · x# Close · F#/Alt+# Focus · o Reset · / Filter · i Info · ? Help"
        : `Enter Open · 1-4 Panels · x# Close · F#/Alt+# Focus · o Reset · n New · / Filter  │  p Send · i Info · r Restart · R Rename · ${deleteFooter}${worktreeFooter}${lifecycleFooter}  │  v View · ? Help`,
    filter: input.filter,
    preview: input.preview ?? "",
    detailsExpanded: input.detailsExpanded ?? false,
    viewMode: board ? "board" : "groups",
    ...(panelStrip ? { panelStrip } : {}),
    ...(input.sidePaneFocusedSlot !== undefined ? { sidePaneFocusedSlot: input.sidePaneFocusedSlot } : {}),
  };
}

export interface BoardLaneRow {
  id: string;
  kind?: "main" | "subagent";
  parentId?: string;
  workflow?: WorkflowRuntimeSnapshot;
}

interface BoardProjection<T> {
  rows: T[];
  lanes: { key: string; title: string; rows: T[]; parentCount: number }[];
  hidden: BoardHiddenCounts;
}

export function boardLaneRows<T extends BoardLaneRow>(activeRows: T[], allRows: T[] = activeRows): { key: string; rows: T[] }[] {
  return projectBoardRows(activeRows, allRows).lanes.map(({ key, rows }) => ({ key, rows }));
}

function projectBoardRows<T extends BoardLaneRow>(activeRows: T[], allRows: T[]): BoardProjection<T> {
  const activeParents = activeRows.filter((row) => row.kind !== "subagent");
  const pipelineCounts = new Map<string, number>();
  for (const parent of activeParents) {
    const identity = workflowIdentity(parent.workflow);
    if (identity) pipelineCounts.set(identity, (pipelineCounts.get(identity) ?? 0) + 1);
  }
  const canonicalIdentity = [...pipelineCounts.entries()]
    .sort(([aId, aCount], [bId, bCount]) => bCount - aCount || aId.localeCompare(bId))[0]?.[0];
  const compatibleParents = activeParents.filter((parent) => workflowIdentity(parent.workflow) === canonicalIdentity);
  const vocabularyOwner = compatibleParents
    .slice()
    .sort((a, b) => (b.workflow?.updatedAt ?? 0) - (a.workflow?.updatedAt ?? 0) || a.id.localeCompare(b.id))[0];
  const steps = vocabularyOwner?.workflow?.steps ?? [];
  const compatibleIds = new Set(compatibleParents.map((parent) => parent.id));
  const byId = new Map(activeRows.map((row) => [row.id, row]));
  const ownerOf = (row: T): T | undefined => {
    let owner: T | undefined = row;
    const seen = new Set<string>();
    while (owner?.kind === "subagent" && owner.parentId && !seen.has(owner.parentId)) {
      seen.add(owner.parentId);
      owner = byId.get(owner.parentId);
    }
    return owner?.kind === "subagent" ? undefined : owner;
  };
  const rows = activeRows.filter((row) => {
    const owner = ownerOf(row);
    return owner ? compatibleIds.has(owner.id) : false;
  });
  const lanes = steps.flatMap((step) => {
    const laneRows = rows.filter((row) => ownerOf(row)?.workflow?.steps[ownerOf(row)?.workflow?.activeIndex ?? -1]?.id === step.id);
    if (!laneRows.length) return [];
    return [{
      key: step.id,
      title: (step.label ?? step.id).toUpperCase(),
      rows: laneRows,
      parentCount: laneRows.filter((row) => row.kind !== "subagent").length,
    }];
  });
  const allParents = allRows.filter((row) => row.kind !== "subagent");
  const activeParentIds = new Set(activeParents.map((row) => row.id));
  return {
    rows: lanes.flatMap((lane) => lane.rows),
    lanes,
    hidden: {
      withoutWorkflow: activeParents.filter((parent) => !workflowIdentity(parent.workflow)).length,
      otherWorkflows: canonicalIdentity ? activeParents.filter((parent) => {
        const identity = workflowIdentity(parent.workflow);
        return identity !== undefined && identity !== canonicalIdentity;
      }).length : 0,
      nonActive: allParents.filter((parent) => !activeParentIds.has(parent.id)).length,
    },
  };
}

function workflowIdentity(workflow: WorkflowSnapshot | undefined): string | undefined {
  if (!workflow || !Number.isFinite(workflow.updatedAt) || !Number.isInteger(workflow.activeIndex)) return undefined;
  if (!workflow.steps.length || workflow.activeIndex < 0 || workflow.activeIndex >= workflow.steps.length) return undefined;
  const ids = new Set<string>();
  const orderedIds: string[] = [];
  for (const step of workflow.steps) {
    const id = step.id?.trim();
    if (!id || !step.short?.trim() || ids.has(id)) return undefined;
    if (step.label !== undefined && !step.label.trim()) return undefined;
    ids.add(id);
    orderedIds.push(id);
  }
  return orderedIds.join("\u001f");
}

function lanesForBoard(sessions: RenderSession[], projection: BoardProjection<RuntimeSession>): RenderSection[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  return projection.lanes.map((lane) => {
    const rows = lane.rows.flatMap((row) => {
      const session = byId.get(row.id);
      return session ? [session] : [];
    });
    return {
      key: lane.key,
      title: lane.title,
      statusCounts: countRenderSessions(rows),
      sessionsTotal: lane.parentCount,
      groups: [{ name: "", statusCounts: countRenderSessions(rows), sessions: rows }],
    } satisfies RenderSection;
  });
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
    .sort(([a, aSessions], [b, bSessions]) => compareGroupPriority(aSessions, bSessions) || groupOrder(a, b))
    .map(([name, groupSessions]) => ({
      name,
      statusCounts: countRenderSessions(groupSessions),
      sessions: groupSessions,
    } satisfies RenderGroup));
}

function sectionsForSessions(sessions: RenderSession[], allSessions: RenderSession[], archiveDisclosure?: ArchiveDisclosure): RenderSection[] {
  const titles: Record<SessionSection, string> = { active: "ACTIVE", backlog: "BACKLOG", archived: "ARCHIVED" };
  return (["active", "backlog", "archived"] as const).flatMap((key) => {
    const sectionSessions = sessions.filter((session) => session.section === key);
    const allSectionSessions = allSessions.filter((session) => session.section === key);
    if (!allSectionSessions.length) return [];
    return [{
      key,
      title: titles[key],
      statusCounts: countRenderSessions(allSectionSessions),
      sessionsTotal: allSectionSessions.length,
      groups: key === "archived"
        ? [{ name: "", statusCounts: countRenderSessions(allSectionSessions), sessions: sectionSessions }]
        : groupsForSessions(sectionSessions),
      ...(key === "archived" && archiveDisclosure ? { archiveDisclosure } : {}),
    } satisfies RenderSection];
  });
}

function toRenderSession(session: RuntimeSession, selected: boolean, sessions: RuntimeSession[], skillCount: number | undefined, now: number | undefined, sidePaneSlot: number | undefined, projectPlan: boolean): RenderSession {
  const displayStatus = displayStatusFor(session.status);
  const worktree = primaryWorktree(session);
  const worktrees = sessionWorktrees(session);
  const lifecycle = effectiveSessionLifecycle(session, sessions);
  const archiveTiming = archiveTimingFor(lifecycle.section, lifecycle.bucketChangedAt, now);
  return {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
    additionalCwds: session.additionalCwds ?? [],
    workspaceCwd: session.workspaceCwd,
    repoCount: 1 + (session.additionalCwds?.length ?? 0),
    group: session.group,
    section: lifecycle.section,
    bucketChangedAt: lifecycle.bucketChangedAt,
    ...archiveTiming,
    lastActivityAt: session.lastActivityAt,
    activityAge: activityAge(session.lastActivityAt, now),
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
    ...(projectPlan && (session.status === "waiting" || session.status === "idle") && session.sessionMetadata?.attention
      ? { attention: session.sessionMetadata.attention }
      : {}),
    ...(selected && projectPlan ? { selectedPlan: selectedPlanSummary(session.sessionMetadata) } : {}),
    workflow: session.workflow,
    worktreePath: worktree?.path ?? session.worktreePath,
    worktreeBranch: worktree?.branch ?? session.worktreeBranch,
    worktreeBaseBranch: worktree?.baseBranch ?? session.worktreeBaseBranch,
    worktreeOwnedByHub: session.worktreeOwnedByHub,
    worktreeCount: worktrees.length || undefined,
    sidePaneSlot,
  };
}

function archiveTimingFor(section: SessionSection, changedAt: number | undefined, now: number | undefined): Pick<RenderSession, "archivedAge" | "archiveRetentionIn"> {
  if (section !== "archived" || changedAt === undefined || now === undefined) return {};
  const elapsed = Math.max(0, now - changedAt);
  const remaining = ARCHIVE_PRUNE_AFTER_MS - elapsed;
  return {
    archivedAge: ageLabel(elapsed),
    archiveRetentionIn: remaining <= 0 ? "now" : remaining < 60_000 ? "<1m" : ageLabel(remaining),
  };
}

function activityAge(lastActivityAt: number | undefined, now: number | undefined): string | undefined {
  if (lastActivityAt === undefined || now === undefined) return undefined;
  return ageLabel(Math.max(0, now - lastActivityAt));
}

function metadataUpdatedAge(metadata: SessionMetadata | undefined, now: number | undefined): string | undefined {
  if (!metadata?.updatedAt || now === undefined) return undefined;
  return ageLabel(Math.max(0, now - metadata.updatedAt));
}

function selectedPlanSummary(metadata: SessionMetadata | undefined): RenderPlanSummary | undefined {
  if (!metadata) return undefined;
  const summary: RenderPlanSummary = {
    feature: metadata.plan?.feature ?? metadata.goal,
    phase: metadata.plan?.phase,
    tasks: metadata.plan?.tasks,
    nextStep: metadata.plan?.nextStep ?? metadata.nextStep,
  };
  return summary.feature || summary.phase || summary.tasks || summary.nextStep ? summary : undefined;
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
