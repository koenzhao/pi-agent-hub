import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { WorkflowModeDisplay, WorkflowRuntimeSnapshot } from "../core/types.js";
import type { RenderModel, RenderSession, StatusCounts } from "./render-model.js";
import { darkTheme, stripAnsi, stripAnsiExceptItalics, styleBgToken, styleToken, type SessionsTheme } from "./theme.js";

export type SessionListTarget =
  | { kind: "session"; id: string }
  | { kind: "archive-disclosure" };

export interface SessionsLayout {
  lines: string[];
  rowTargets: (SessionListTarget | undefined)[];
  listWidth: number;
  listScrollTop: number;
}

export function renderSessions(model: RenderModel, theme?: SessionsTheme): SessionsLayout {
  const styles = theme ? createStyles(theme) : plainStyles();
  const width = Math.max(40, model.width);
  if (model.empty) {
    const lines = box(width, fitBoxBody(emptyLines(width, styles), model.height), styles);
    return { lines, rowTargets: lines.map(() => undefined), listWidth: 0, listScrollTop: 0 };
  }

  const bodyWidth = width - 2;
  if (model.noMatches) {
    const body = [renderTopSummary(model, bodyWidth, styles), ...(model.panelStrip ? [renderPanelStrip(model, bodyWidth, styles)] : []), ...noMatchLines(width, model.filter ?? "", styles), styles.border("─".repeat(bodyWidth)), styleFooter(model.footer, styles)];
    const lines = box(width, fitBoxBody(body, model.height), styles);
    return { lines, rowTargets: lines.map(() => undefined), listWidth: 0, listScrollTop: 0 };
  }
  if (model.noBoardSessions) {
    const body = [renderTopSummary(model, bodyWidth, styles), ...(model.panelStrip ? [renderPanelStrip(model, bodyWidth, styles)] : []), ...noBoardLines(width, model, styles), styles.border("─".repeat(bodyWidth)), styleFooter(model.footer, styles)];
    const lines = box(width, fitBoxBody(body, model.height), styles);
    return { lines, rowTargets: lines.map(() => undefined), listWidth: 0, listScrollTop: 0 };
  }

  const split = model.showPreview
    ? model.viewMode === "board"
      ? Math.max(40, Math.min(60, Math.floor(bodyWidth * 0.38)))
      : Math.max(26, Math.min(40, Math.floor(bodyWidth * 0.38)))
    : bodyWidth;
  const stripLines = model.panelStrip ? 1 : 0;
  const targetRows = bodyRowsFromHeight(model.height, stripLines);
  const left = renderSessionList(model, split, styles);
  const right = model.showPreview ? renderDetails(model.selected, bodyWidth - split - 1, model.preview, model.detailsExpanded, targetRows, styles) : [];
  const rows = targetRows ?? Math.max(left.lines.length, right.length, 8);
  const windowedLeft = windowList(left, rows, model.listScrollTop ?? 0, styles);
  const body: string[] = [renderTopSummary(model, bodyWidth, styles)];
  if (model.panelStrip) body.push(renderPanelStrip(model, bodyWidth, styles));
  for (let i = 0; i < rows; i += 1) {
    const padded = pad(windowedLeft.lines[i] ?? "", split);
    const l = i >= windowedLeft.selectedIndex && i <= windowedLeft.selectedEndIndex ? styles.selected(padded) : padded;
    if (!model.showPreview) body.push(l);
    else body.push(`${l}${styles.border("│")}${pad(right[i] ?? "", bodyWidth - split - 1)}`);
  }
  body.push(styles.border("─".repeat(bodyWidth)));
  body.push(truncate(styleFooter(model.footer, styles), bodyWidth));
  const lines = box(width, body, styles);
  const rowTargets = lines.map(() => undefined as SessionListTarget | undefined);
  for (let i = 0; i < rows; i += 1) rowTargets[2 + stripLines + i] = windowedLeft.targets[i];
  return { lines, rowTargets, listWidth: split, listScrollTop: windowedLeft.top };
}

// Footer strings stay plain in the render model for testability; keys get
// accent, labels dim, separators border here.
function styleFooter(footer: string, styles: LayoutStyles): string {
  return footer.split("│").map((segment) =>
    segment.split(" · ").map((part) => {
      const match = /^(\s*)(\S+)((?: .*)?)$/.exec(part);
      if (!match) return part;
      const [, lead = "", key = "", label = ""] = match;
      return `${lead}${styles.accent(key)}${label ? styles.dim(label) : ""}`;
    }).join(styles.border(" · ")),
  ).join(styles.border("│"));
}

function bodyRowsFromHeight(height: number | undefined, stripLines = 0): number | undefined {
  if (!height || height <= 0) return undefined;
  return Math.max(1, height - 5 - stripLines);
}

function fitBoxBody(lines: string[], height: number | undefined): string[] {
  if (!height || height <= 0) return lines;
  const target = Math.max(0, height - 2);
  if (lines.length >= target) return lines.slice(0, target);
  return [...lines, ...Array.from({ length: target - lines.length }, () => "")];
}

interface LayoutStyles {
  accent(text: string): string;
  border(text: string): string;
  dim(text: string): string;
  error(text: string): string;
  success(text: string): string;
  muted(text: string): string;
  warning(text: string): string;
  selected(text: string): string;
  status(status: RenderSession["displayStatus"], text: string): string;
}

function createStyles(theme: SessionsTheme): LayoutStyles {
  return {
    accent: (text) => styleToken(theme, "accent", text),
    border: (text) => styleToken(theme, "border", text),
    dim: (text) => styleToken(theme, "dim", text),
    error: (text) => styleToken(theme, "error", text),
    success: (text) => styleToken(theme, "success", text),
    muted: (text) => styleToken(theme, "muted", text),
    warning: (text) => styleToken(theme, "warning", text),
    selected: (text) => styleBgToken(theme, "selectedBg", text),
    status: (status, text) => styleToken(theme, status === "error" ? "error" : status === "waiting" ? "warning" : status === "running" ? "success" : "muted", text),
  };
}

function plainStyles(): LayoutStyles {
  return createStyles({ ...darkTheme, accent: "", border: "", dim: "", error: "", muted: "", success: "", warning: "", selectedBg: "" });
}

function emptyLines(width: number, styles: LayoutStyles): string[] {
  const inner = width - 2;
  return [
    "",
    styles.accent("No managed Pi sessions yet."),
    "",
    `${styles.accent("▶")} ${styles.accent("n")}  create a session here`,
    `  ${styles.accent("?")}  ${styles.dim("show help")}`,
    `  ${styles.accent("q")}  ${styles.dim("quit")}`,
    "",
  ].map((line) => truncate(line, inner));
}

function noMatchLines(width: number, filter: string, styles: LayoutStyles): string[] {
  const inner = width - 2;
  return [
    "",
    styles.warning(`No sessions match ${JSON.stringify(filter)}.`),
    "",
    `${styles.warning("▶")} Use the footer controls below.`,
    "",
  ].map((line) => truncate(line, inner));
}

function noBoardLines(width: number, model: RenderModel, styles: LayoutStyles): string[] {
  const inner = width - 2;
  return [
    "",
    styles.accent("No Active sessions."),
    "",
    `${styles.accent("▶")} ${styles.accent("v")}  return to groups view`,
    boardHiddenSummary(model, inner, styles),
    "",
  ].map((line) => truncate(line, inner));
}

const STATUS_ORDER = [
  ["running", "●"],
  ["waiting", "◐"],
  ["idle", "○"],
  ["error", "×"],
  ["stopped", "-"],
] as const;

function renderTopSummary(model: RenderModel, width: number, styles: LayoutStyles): string {
  const board = model.viewMode === "board";
  const countLabel = board
    ? `${model.boardCardCount} Active ${model.boardCardCount === 1 ? "session" : "sessions"}`
    : model.filter === undefined
      ? `${model.summary.total} ${model.summary.total === 1 ? "session" : "sessions"}`
      : `${model.summary.visibleTotal}/${model.summary.total} sessions`;
  const parts = [styles.accent(countLabel)];
  const counts = formatStatusCounts(board ? model.boardStatusCounts : model.summary.statusCounts, styles);
  if (counts) parts.push(counts);
  if (board) parts.push(styles.dim("view board"));
  if (model.filter !== undefined) parts.push(styles.dim(`filter: ${model.filter}`));
  return truncate(parts.join(" · "), width);
}

function renderPanelStrip(model: RenderModel, width: number, styles: LayoutStyles): string {
  const segments = model.panelStrip?.map(({ slot, title }) => {
    if (!title) return styles.dim(`·${slot}`);
    const text = `◫${slot} ${title}`;
    return slot === model.sidePaneFocusedSlot ? styles.accent(text) : `${styles.muted(`◫${slot}`)} ${title}`;
  }) ?? [];
  return truncate(segments.join("  "), width);
}

interface SessionListContent {
  lines: string[];
  targets: (SessionListTarget | undefined)[];
  selectedIndex: number;
  selectedEndIndex: number;
  continuationPriorities: Map<number, number>;
}

function renderSessionList(model: RenderModel, width: number, styles: LayoutStyles): SessionListContent {
  const board = model.viewMode === "board";
  const lines: string[] = [];
  const targets: (SessionListTarget | undefined)[] = [];
  const continuationPriorities = new Map<number, number>();
  let selectedIndex = -1;
  let selectedEndIndex = -1;
  const pushLine = (line: string, target?: SessionListTarget) => {
    lines.push(line);
    targets.push(target);
  };
  const pushRow = (session: RenderSession) => {
    if (board && session.selected) {
      const innerWidth = Math.max(0, width - 2);
      selectedIndex = lines.length;
      const header = renderSessionRow(session, innerWidth, styles, true, model.sidePaneFocusedSlot, false);
      pushLine(`${styles.accent("┌")}${pad(header, innerWidth)}${styles.accent("┐")}`, { kind: "session", id: session.id });
      for (const continuation of selectedCardLines(session, innerWidth, styles)) {
        pushLine(`${styles.accent("│")}${pad(continuation.line, innerWidth)}${styles.accent("│")}`);
        continuationPriorities.set(lines.length - 1, continuation.priority);
      }
      pushLine(styles.accent(`└${"─".repeat(innerWidth)}┘`));
      continuationPriorities.set(lines.length - 1, 3);
      selectedEndIndex = lines.length - 1;
      return;
    }
    if (session.selected) selectedIndex = lines.length;
    pushLine(renderSessionRow(session, width, styles, board, model.sidePaneFocusedSlot), { kind: "session", id: session.id });
    if (session.selected) selectedEndIndex = lines.length - 1;
  };
  if (!model.showSections) {
    for (const group of model.groups) {
      pushLine(twoColumn(styles.accent(group.name), formatStatusCounts(group.statusCounts, styles), width));
      for (const session of group.sessions) pushRow(session);
    }
    return { lines, targets, selectedIndex, selectedEndIndex, continuationPriorities };
  }
  let firstSection = true;
  for (const section of model.sections) {
    if (!firstSection) pushLine("");
    const headingRight = board ? styles.dim(`·${section.sessionsTotal}`) : formatStatusCounts(section.statusCounts, styles);
    pushLine(sectionHeader(section.title, headingRight, width, styles));
    firstSection = false;
    for (const group of section.groups) {
      if (board) {
        const parentCount = group.sessions.filter((session) => session.kind !== "subagent").length;
        pushLine(twoColumn(styles.muted(group.name), styles.dim(`·${parentCount}`), width));
      } else if (group.name) {
        pushLine(twoColumn(styles.accent(group.name), formatStatusCounts(group.statusCounts, styles), width));
      }
      for (const session of group.sessions) pushRow(session);
    }
    if (section.archiveDisclosure) {
      if (section.archiveDisclosure.selected) {
        selectedIndex = lines.length;
        selectedEndIndex = lines.length;
      }
      const label = section.archiveDisclosure.expanded ? "⌃ show fewer" : `… ${section.archiveDisclosure.hiddenParents} older archived`;
      const prefix = section.archiveDisclosure.selected ? `${styles.accent("▌")} ` : "  ";
      pushLine(`${prefix}${styles.dim(truncate(label, Math.max(0, width - 2)))}`, { kind: "archive-disclosure" });
    }
  }
  if (board) {
    pushLine("");
    pushLine(boardHiddenSummary(model, width, styles));
  }
  return { lines, targets, selectedIndex, selectedEndIndex, continuationPriorities };
}

function boardHiddenSummary(model: RenderModel, width: number, styles: LayoutStyles): string {
  const parts = [
    model.boardHidden.nonActive ? `${model.boardHidden.nonActive} backlog/archived` : "",
    "v groups",
  ].filter(Boolean);
  return styles.dim(truncate(parts.join(" · "), width));
}

interface ListWindow {
  lines: string[];
  targets: (SessionListTarget | undefined)[];
  selectedIndex: number;
  selectedEndIndex: number;
  top: number;
}

function windowList(list: SessionListContent, capacity: number, scrollTop: number, styles: LayoutStyles): ListWindow {
  if (list.selectedEndIndex > list.selectedIndex) return windowSelectedCard(list, capacity, styles);
  if (capacity <= 0 || list.lines.length <= capacity) return { ...list, top: 0 };
  const total = list.lines.length;
  const selectedIndex = Math.max(0, list.selectedIndex);
  const sessionCount = (from: number, to: number) => list.targets.slice(Math.max(0, from), Math.min(total, to)).filter((target) => target?.kind === "session").length;
  const indicator = (arrow: "↑" | "↓", count: number) => count > 0 ? styles.dim(`${arrow} ${count} more`) : "";
  const slice = (top: number, lines: string[], targets: (SessionListTarget | undefined)[], selectedOffset = top): ListWindow => {
    const visibleSelected = selectedIndex >= selectedOffset && selectedIndex < selectedOffset + lines.length ? selectedIndex - selectedOffset : -1;
    return { lines, targets, selectedIndex: visibleSelected, selectedEndIndex: visibleSelected, top };
  };

  if (capacity === 1) return slice(selectedIndex, [list.lines[selectedIndex] ?? ""], [list.targets[selectedIndex]], selectedIndex);

  if (selectedIndex < capacity - 1) {
    const visibleEnd = capacity - 1;
    return slice(0, [...list.lines.slice(0, visibleEnd), indicator("↓", sessionCount(visibleEnd, total))], [...list.targets.slice(0, visibleEnd), undefined]);
  }

  if (selectedIndex >= total - (capacity - 1)) {
    const top = total - (capacity - 1);
    return {
      lines: [indicator("↑", sessionCount(0, top)), ...list.lines.slice(top)],
      targets: [undefined, ...list.targets.slice(top)],
      selectedIndex: selectedIndex - top + 1,
      selectedEndIndex: selectedIndex - top + 1,
      top,
    };
  }

  if (capacity === 2) {
    return {
      lines: [indicator("↑", sessionCount(0, selectedIndex)), list.lines[selectedIndex] ?? ""],
      targets: [undefined, list.targets[selectedIndex]],
      selectedIndex: 1,
      selectedEndIndex: 1,
      top: selectedIndex,
    };
  }

  const lastContent = capacity - 3;
  const maxTop = total - (capacity - 1);
  let top = Math.max(1, Math.min(scrollTop, maxTop));
  if (selectedIndex < top) top = selectedIndex;
  if (selectedIndex > top + lastContent) top = selectedIndex - lastContent;
  top = Math.max(1, Math.min(top, maxTop));
  const bottomStart = top + capacity - 2;
  return {
    lines: [indicator("↑", sessionCount(0, top)), ...list.lines.slice(top, bottomStart), indicator("↓", sessionCount(bottomStart, total))],
    targets: [undefined, ...list.targets.slice(top, bottomStart), undefined],
    selectedIndex: selectedIndex - top + 1,
    selectedEndIndex: selectedIndex - top + 1,
    top,
  };
}

function windowSelectedCard(list: SessionListContent, capacity: number, styles: LayoutStyles): ListWindow {
  const safeCapacity = Math.max(1, capacity);
  if (list.lines.length <= safeCapacity) return { ...list, top: 0 };

  const headerIndex = list.selectedIndex;
  const footerIndex = list.selectedEndIndex;
  if (safeCapacity === 1) {
    return { lines: [list.lines[headerIndex] ?? ""], targets: [list.targets[headerIndex]], selectedIndex: 0, selectedEndIndex: 0, top: headerIndex };
  }

  const beforeCount = list.targets.slice(0, headerIndex).filter((target) => target?.kind === "session").length;
  const afterCount = list.targets.slice(footerIndex + 1).filter((target) => target?.kind === "session").length;
  const indicators = [
    ...(beforeCount ? [{ side: "before" as const, line: styles.dim(`↑ ${beforeCount} more`) }] : []),
    ...(afterCount ? [{ side: "after" as const, line: styles.dim(`↓ ${afterCount} more`) }] : []),
  ];
  const detailIndexes = Array.from(
    { length: Math.max(0, footerIndex - headerIndex - 1) },
    (_, offset) => headerIndex + offset + 1,
  ).sort((a, b) => (list.continuationPriorities.get(a) ?? 99) - (list.continuationPriorities.get(b) ?? 99) || a - b);

  const available = safeCapacity - 2;
  const coreDetailCount = Math.min(2, detailIndexes.length, available);
  const indicatorCount = Math.min(indicators.length, available - coreDetailCount);
  const detailCount = Math.min(detailIndexes.length, available - indicatorCount);
  const keptDetails = new Set(detailIndexes.slice(0, detailCount));
  const keptIndicators = indicators.slice(0, indicatorCount);
  const beforeIndicator = keptIndicators.find((indicator) => indicator.side === "before");
  const afterIndicator = keptIndicators.find((indicator) => indicator.side === "after");
  const orderedDetails = Array.from(keptDetails).sort((a, b) => a - b);

  const lines = [
    ...(beforeIndicator ? [beforeIndicator.line] : []),
    list.lines[headerIndex] ?? "",
    ...orderedDetails.map((index) => list.lines[index] ?? ""),
    list.lines[footerIndex] ?? "",
    ...(afterIndicator ? [afterIndicator.line] : []),
  ];
  const targets = [
    ...(beforeIndicator ? [undefined] : []),
    list.targets[headerIndex],
    ...orderedDetails.map(() => undefined),
    undefined,
    ...(afterIndicator ? [undefined] : []),
  ];
  const selectedIndex = beforeIndicator ? 1 : 0;
  return {
    lines,
    targets,
    selectedIndex,
    selectedEndIndex: selectedIndex + orderedDetails.length + 1,
    top: headerIndex,
  };
}

function selectedCardLines(session: RenderSession, width: number, styles: LayoutStyles): { line: string; priority: number }[] {
  const indent = "  ";
  const lines: { line: string; priority: number }[] = [];
  if (session.attention) {
    const marker = attentionGlyph(session.attention.kind, styles);
    lines.push({ line: truncate(`${indent}${marker} ${session.attention.text}`, width), priority: 0 });
  }
  const plan = session.selectedPlan;
  if (!plan) return lines;
  const inExecute = session.workflow?.steps[session.workflow.activeIndex]?.id === "execute";
  const progress = planProgressText(plan, inExecute, styles);
  if (progress) lines.push({ line: truncate(`${indent}${progress}`, width), priority: 1 });
  const showNext = plan.nextStep
    && !(session.attention && plan.nextSource === "metadata")
    && normalizedText(plan.nextStep) !== normalizedText(plan.feature)
    && normalizedText(plan.nextStep) !== normalizedText(session.attention?.text);
  if (showNext) lines.push({ line: truncate(` ${styles.accent("→")} ${plan.nextStep}`, width), priority: 2 });
  return lines;
}

function planProgressText(plan: NonNullable<RenderSession["selectedPlan"]>, inExecute: boolean, styles: LayoutStyles): string {
  const phase = plan.phase ? `${inExecute ? "Phase" : "plan"} ${plan.phase.index}/${plan.phase.count}` : undefined;
  const tasks = plan.tasks ? `${plan.tasks.completed}/${plan.tasks.total} tasks` : undefined;
  const text = [phase, tasks].filter(Boolean).join(" · ");
  if (!text) return "";
  return inExecute ? text : styles.dim(phase ? text : `plan ${text}`);
}

function renderDetails(session: RenderSession | undefined, width: number, preview: string, expanded: boolean, targetRows: number | undefined, styles: LayoutStyles): string[] {
  if (!session) return ["No session selected"];
  const lines = expanded ? expandedDetails(session, width, styles) : compactDetails(session, width, styles);
  lines.push("", styles.border("── preview ────────────────────────────────"));
  const previewBudget = Math.max(4, (targetRows ?? lines.length + 12) - lines.length);
  const previewLines = preview.trimEnd() ? preview.trimEnd().split("\n").slice(-previewBudget).map(stripAnsiExceptItalics) : ["preview empty"];
  lines.push(...previewLines);
  return lines.map((line) => truncate(line, width));
}

function titleStatusRow(session: RenderSession, width: number, styles: LayoutStyles): string {
  const status = styles.status(session.displayStatus, `${session.symbol} ${session.displayStatus}`);
  const statusWidth = displayWidth(status);
  if (statusWidth >= width) return truncate(status, width);
  const title = truncate(styles.accent(session.title), Math.max(0, width - statusWidth - 2));
  const gap = Math.max(1, width - displayWidth(title) - statusWidth);
  return `${title}${" ".repeat(gap)}${status}`;
}

function activeWorkflowMode(session: RenderSession): WorkflowModeDisplay | undefined {
  return session.status === "stopped" ? undefined : session.workflow?.activeMode;
}

function activeStepShort(workflow: WorkflowRuntimeSnapshot, mode?: WorkflowModeDisplay): string {
  const step = workflow.steps[workflow.activeIndex];
  return step ? mode?.short ?? step.short : "";
}

function railCompact(workflow: WorkflowRuntimeSnapshot, mode: WorkflowModeDisplay | undefined, styles: LayoutStyles): string {
  const short = activeStepShort(workflow, mode);
  return short ? styles.accent(short) : "";
}

function sidePaneGlyph(slot: number | undefined, focusedSlot: number | undefined, styles: LayoutStyles): string {
  if (slot === undefined) return "";
  return `${slot === focusedSlot ? styles.accent(`◫${slot}`) : styles.muted(`◫${slot}`)} `;
}

function rowRightAdornment(session: RenderSession, styles: LayoutStyles, board: boolean, width: number): string {
  const mode = activeWorkflowMode(session);
  const fits = (right: string): boolean => Boolean(right) && width - displayWidth(right) - 1 >= 12;
  if (board) {
    if (session.kind === "subagent" || !mode) return "";
    const short = styles.accent(mode.short);
    return fits(short) ? short : "";
  }

  const stage = session.workflow ? activeStepShort(session.workflow, mode) : "";
  const activity = session.displayStatus === "running" ? "" : session.activityAge ?? "";
  const stageSlot = `${stage}${" ".repeat(Math.max(0, 3 - displayWidth(stage)))}`;
  const activitySlot = `${" ".repeat(Math.max(0, 3 - displayWidth(activity)))}${activity}`;
  const active = `${stage ? styles.accent(stageSlot) : stageSlot} ${activity ? styles.dim(activitySlot) : activitySlot}`;
  const right = session.archivedAge ? styles.dim(session.archivedAge) : active;
  return fits(right) ? right : "";
}

function railFull(workflow: WorkflowRuntimeSnapshot, mode: WorkflowModeDisplay | undefined, styles: LayoutStyles): string {
  const rail = workflow.steps
    .map((step, index) => index === workflow.activeIndex ? styles.accent(`▐${activeStepShort(workflow, mode)}▌`) : styles.dim(step.short))
    .join(styles.border("─"));
  return workflow.ticketId ? `${rail} ${styles.border("·")} ${styles.muted(workflow.ticketId)}` : rail;
}

function railLine(workflow: WorkflowRuntimeSnapshot, mode: WorkflowModeDisplay | undefined, width: number, styles: LayoutStyles): string {
  const full = railFull(workflow, mode, styles);
  return displayWidth(full) <= width ? full : railCompact(workflow, mode, styles);
}

function compactDetails(session: RenderSession, width: number, styles: LayoutStyles): string[] {
  const lines = [titleStatusRow(session, width, styles)];
  if (session.workflow) lines.push(railLine(session.workflow, activeWorkflowMode(session), width, styles));
  if (session.kind === "subagent") {
    lines.push(truncate([`agent ${session.agentName ?? "subagent"}`, session.taskPreview ? `task ${session.taskPreview}` : ""].filter(Boolean).join(" · "), width));
  } else {
    const parts = [truncatePath(session.cwd, Math.max(8, Math.floor(width * 0.6)))];
    if (session.worktreeBranch) parts.push(`⎇ ${session.worktreeBranch}`);
    if (session.repoCount > 1) parts.push(`${session.repoCount} repos`);
    lines.push(truncate(parts.join(" · "), width));
  }
  const lifecycle = lifecycleLine(session);
  if (lifecycle) lines.push(styles.dim(lifecycle));
  lines.push(...workBlock(session, width, styles));
  lines.push(...metadataBlock(session, width, false, styles));
  const capabilities = compactCapabilities(session, width, styles);
  if (capabilities) lines.push(capabilities);
  if (session.error) lines.push(styles.error(`error     ${session.error}`));
  return lines;
}

function compactCapabilities(session: RenderSession, width: number, styles: LayoutStyles): string | undefined {
  const parts = [];
  if ((session.skillCount ?? 0) > 0) parts.push(`skills ${session.skillCount}`);
  if (session.enabledMcpServers.length) parts.push(`mcp ${session.enabledMcpServers.length}`);
  if (!parts.length) return undefined;
  return twoColumn(styles.muted(parts.join(" · ")), styles.dim("s/m edit"), width);
}

function expandedDetails(session: RenderSession, width: number, styles: LayoutStyles): string[] {
  const lines = [titleStatusRow(session, width, styles)];
  const mode = activeWorkflowMode(session);
  if (session.workflow) lines.push(railLine(session.workflow, mode, width, styles));
  if (mode) {
    const detail = mode.detail ? `${styles.border(" · ")}${styles.dim(mode.detail)}` : "";
    lines.push(`mode      ${mode.label ?? mode.id}${detail}`);
  }
  lines.push(...[
    session.kind === "subagent" ? `agent     ${session.agentName ?? "subagent"}` : undefined,
    session.taskPreview ? `task      ${session.taskPreview}` : undefined,
    `cwd       ${truncatePath(session.cwd, Math.max(0, width - 10))}`,
    `repos     ${session.repoCount}`,
    `group     ${session.group}`,
    session.section !== "active" ? `section   ${session.section}` : undefined,
    session.archivedAge ? `archived  ${session.archivedAge === "now" ? "now" : `${session.archivedAge} ago`}` : undefined,
    session.archiveRetentionIn ? `cleanup   eligible ${session.archiveRetentionIn === "now" ? "now" : `in ${session.archiveRetentionIn}`}` : undefined,
  ].filter((line): line is string => Boolean(line)));
  for (const cwd of session.additionalCwds) lines.push(`extra     ${truncatePath(cwd, Math.max(0, width - 10))}`);
  if (session.worktreeBranch) lines.push(`worktree  ${session.worktreeBranch} → ${session.worktreeBaseBranch ?? "unknown"}${session.worktreeCount && session.worktreeCount > 1 ? ` (${session.worktreeCount})` : ""}`);
  if (session.worktreePath) lines.push(`wt path   ${truncatePath(session.worktreePath, Math.max(0, width - 10))}`);
  if (session.workspaceCwd) lines.push(`runtime   ${truncatePath(session.workspaceCwd, Math.max(0, width - 10))}`);
  if (session.sessionFile) lines.push(`session   ${truncatePath(session.sessionFile, Math.max(0, width - 10))}`);
  lines.push(...workBlock(session, width, styles));
  lines.push(...metadataBlock(session, width, true, styles));
  if (session.enabledMcpServers.length) lines.push(`mcp       ${session.enabledMcpServers.join(", ")}`);
  if (session.resultSummary) lines.push(`result    ${session.resultSummary}`);
  if (session.error) lines.push(styles.error(`error     ${session.error}`));
  return lines;
}

function workBlock(session: RenderSession, width: number, styles: LayoutStyles): string[] {
  const plan = session.selectedPlan;
  if (!plan && !session.attention) return [];
  const fields: [string, string, string?][] = [];
  if (plan?.feature) fields.push(["feature", plan.feature]);
  if (plan?.phase) fields.push(["phase", `${plan.phase.index}/${plan.phase.count} · ${plan.phase.title}`]);
  if (plan?.tasks) fields.push(["progress", `${plan.tasks.completed}/${plan.tasks.total} tasks`]);
  if (session.attention) fields.push(["attention", session.attention.text, attentionGlyph(session.attention.kind, styles)]);
  if (plan?.nextStep && plan.nextSource === "plan") fields.push(["next", plan.nextStep, styles.accent("→")]);
  if (!fields.length) return [];
  return [
    "",
    styles.border("── work ─"),
    ...fields.flatMap(([label, value, marker]) => workField(label, value, width, styles, marker ? `${marker} ` : "")),
  ];
}

function workField(label: string, value: string, width: number, styles: LayoutStyles, marker = ""): string[] {
  const labelText = styles.muted(pad(label, 9));
  const firstPrefix = `${labelText} `;
  const nextPrefix = `${pad("", 9)} `;
  const firstWidth = Math.max(4, width - displayWidth(firstPrefix) - displayWidth(marker));
  const nextWidth = Math.max(4, width - displayWidth(nextPrefix));
  return wrapWords(value, firstWidth, nextWidth).map((line, index) => index === 0 ? `${firstPrefix}${marker}${line}` : `${nextPrefix}${line}`);
}

function metadataBlock(session: RenderSession, width: number, expanded: boolean, styles: LayoutStyles): string[] {
  const metadata = session.sessionMetadata;
  if (!metadata) return [];
  const attentionText = session.attention?.text;
  const showGoal = metadata.goal && normalizedText(metadata.goal) !== normalizedText(session.selectedPlan?.feature);
  const showStatus = metadata.status && normalizedText(metadata.status) !== normalizedText(attentionText);
  const selectedNext = session.selectedPlan?.nextStep;
  const selectedNextRenderedInCard = session.selectedPlan?.nextSource === "metadata"
    && !session.attention
    && normalizedText(selectedNext) !== normalizedText(session.selectedPlan.feature);
  const showNext = metadata.nextStep
    && !(session.selectedPlan?.nextSource === "plan" && normalizedText(metadata.nextStep) === normalizedText(selectedNext))
    && !(selectedNextRenderedInCard && normalizedText(metadata.nextStep) === normalizedText(selectedNext))
    && normalizedText(metadata.nextStep) !== normalizedText(attentionText);
  const showStage = expanded && metadata.stage && !session.attention;
  if (!showGoal && !showStatus && !showNext && !showStage) return [];
  const headerRight = [metadata.source ? `via ${metadata.source}` : undefined, session.metadataUpdatedAge].filter(Boolean).join(" · ");
  const lines = ["", twoColumn(styles.border("── metadata ─"), styles.dim(headerRight), width)];
  if (showGoal) lines.push(...metadataField("goal", metadata.goal!, width, styles));
  if (showStatus) lines.push(...metadataField("prog", metadata.status!, width, styles));
  if (showNext) lines.push(...metadataField("next", metadata.nextStep!, width, styles));
  if (showStage) lines.push(`${styles.muted(pad("stage", 5))} ${styles.muted(truncate(`[${metadata.stage}]`, Math.max(4, width - 6)))}`);
  return lines;
}

function normalizedText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function metadataField(label: string, value: string, width: number, styles: LayoutStyles, marker = ""): string[] {
  const labelText = styles.muted(pad(label, 5));
  const firstPrefix = `${labelText} `;
  const nextPrefix = `${pad("", 5)} `;
  const firstWidth = Math.max(4, width - displayWidth(firstPrefix) - displayWidth(marker));
  const nextWidth = Math.max(4, width - displayWidth(nextPrefix));
  const wrapped = wrapWords(value, firstWidth, nextWidth);
  return wrapped.map((line, index) => index === 0 ? `${firstPrefix}${marker}${line}` : `${nextPrefix}${line}`);
}

function wrapWords(value: string, firstWidth: number, nextWidth: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let width = firstWidth;
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (displayWidth(candidate) <= width) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
      width = nextWidth;
    }
    let remainder = word;
    while (displayWidth(remainder) > width) {
      const [head, tail] = splitAtWidth(remainder, width);
      lines.push(head);
      remainder = tail;
      width = nextWidth;
    }
    current = remainder;
  }
  if (current) lines.push(current);
  return lines;
}

function splitAtWidth(value: string, width: number): [string, string] {
  let head = "";
  let consumed = 0;
  for (const char of value) {
    if (head && displayWidth(`${head}${char}`) > width) break;
    head += char;
    consumed += char.length;
  }
  return [head, value.slice(consumed)];
}

function lifecycleLine(session: RenderSession): string | undefined {
  if (session.section === "active") return undefined;
  if (session.section === "archived" && session.archivedAge && session.archiveRetentionIn) {
    const retention = session.archiveRetentionIn === "now" ? "cleanup eligible now" : `cleanup eligible in ${session.archiveRetentionIn}`;
    const archived = session.archivedAge === "now" ? "archived now" : `archived ${session.archivedAge} ago`;
    return `${archived} · ${retention}`;
  }
  return `${session.section} · U restore`;
}

function sectionHeader(title: string, right: string, width: number, styles: LayoutStyles): string {
  const left = styles.border(`── ${title} `);
  return twoColumn(left, right, width);
}

function formatStatusCounts(counts: StatusCounts, styles: LayoutStyles): string {
  return STATUS_ORDER
    .flatMap(([status, symbol]) => counts[status] ? [styles.status(status, `${symbol}${counts[status]}`)] : [])
    .join(" ");
}

function truncatePath(path: string, width: number): string {
  return truncateValue(path, width, "start");
}

function attentionGlyph(kind: NonNullable<RenderSession["attention"]>["kind"], styles: LayoutStyles): string {
  if (kind === "ready") return styles.success("✓");
  if (kind === "question") return styles.warning("?");
  return styles.error("!");
}

function renderSessionRow(session: RenderSession, width: number, styles: LayoutStyles, board = false, focusedSlot?: number, selectionMarker = true): string {
  const attention = board && selectionMarker && session.attention ? attentionGlyph(session.attention.kind, styles) : "";
  const prefix = session.selected && selectionMarker ? styles.accent("▌") : attention || (session.status === "stopped" ? styles.dim("·") : " ");
  const symbol = styles.status(session.displayStatus, session.symbol);
  const titleText = session.kind === "subagent" ? (session.agentName ?? "subagent") : board ? (session.boardTitle ?? session.title) : session.title;
  const styleTitle = (value: string) => session.status === "stopped" ? styles.dim(value) : value;
  const sidePaneMarker = sidePaneGlyph(session.sidePaneSlot, focusedSlot, styles);
  const repoBadge = !board && session.repoCount > 1 && session.kind !== "subagent" ? styles.dim(` [${session.repoCount} repos]`) : "";
  const worktreeBadge = !board && session.worktreeBranch && session.kind !== "subagent" ? styles.dim(" ⎇") : "";
  const disclosureBadge = board && session.kind !== "subagent" && session.boardDescendantCount
    ? ` ${styles.dim(session.boardExpanded ? "▾" : "▸")}`
    : "";
  const runningBadge = board && session.kind !== "subagent" && session.runningSubagentCount
    ? ` ${styles.success(`⚙︎${session.runningSubagentCount}`)}`
    : "";
  const indent = session.depth > 0 ? styles.dim(`${"  ".repeat(session.depth)}└ `) : "";
  const leftPrefix = `${prefix} ${indent}${symbol} ${sidePaneMarker}`;
  const leftSuffix = `${disclosureBadge}${runningBadge}${repoBadge}${worktreeBadge}`;
  const right = rowRightAdornment(session, styles, board, width);
  const rightSpace = right ? displayWidth(right) + 1 : 0;
  const titleWidth = Math.max(0, width - displayWidth(leftPrefix) - displayWidth(leftSuffix) - rightSpace);
  const text = `${leftPrefix}${styleTitle(truncate(titleText, titleWidth))}${leftSuffix}`;
  return right ? twoColumn(text, right, width) : truncate(text, width);
}

export interface FormField {
  key: string;
  label: string;
  value: string;
  cursor?: number;
  hint?: string;
  error?: string;
  section?: string;
  truncate?: "end" | "start";
  readonly?: boolean;
}

export interface FormSpec {
  title: string;
  fields: FormField[];
  focus: string;
  footer: string;
  narrowFooter?: string;
}

export function renderForm(spec: FormSpec, width: number, theme?: SessionsTheme): string[] {
  const styles = theme ? createStyles(theme) : plainStyles();
  const inner = Math.max(20, Math.min(Math.max(20, width - 2), 86));
  const showHints = inner >= 38;
  const labelWidth = Math.max(...spec.fields.map((field) => displayWidth(field.label)), 5);
  const valueWidth = inner - labelWidth - 4;
  const body: string[] = [styles.accent(spec.title), styles.border("─".repeat(inner)), ""];
  let previousSection: string | undefined;
  for (const field of spec.fields) {
    if (field.section && field.section !== previousSection) {
      body.push(styles.muted(field.section));
      previousSection = field.section;
    }
    const focused = field.key === spec.focus;
    const caret = focused ? styles.accent("▎") : " ";
    const label = focused ? field.label : styles.muted(field.label);
    const focusedValue = field.readonly
      ? truncateValue(field.value, valueWidth, field.truncate)
      : renderCursorValue(field.value, field.cursor, valueWidth, field.truncate);
    const rawValue = focused ? styles.accent(focusedValue) : truncateValue(field.value, valueWidth, field.truncate);
    const value = field.readonly && !focused ? styles.dim(rawValue) : rawValue;
    body.push(`${caret} ${pad(label, labelWidth)}  ${value}`);
    const hintText = field.error ? styles.error(field.error) : (showHints && field.hint ? styles.dim(field.hint) : "");
    if (hintText) body.push(`  ${pad("", labelWidth)}  ${truncate(hintText, valueWidth)}`);
    body.push("");
  }
  body.push(styles.border("─".repeat(inner)));
  const footer = inner < 32 ? (spec.narrowFooter ?? "enter · esc") : spec.footer;
  body.push(truncate(styles.dim(footer), inner));
  return [
    `${styles.border("╭")}${styles.border("─".repeat(inner))}${styles.border("╮")}`,
    ...body.map((line) => `${styles.border("│")}${pad(line, inner)}${styles.border("│")}`),
    `${styles.border("╰")}${styles.border("─".repeat(inner))}${styles.border("╯")}`,
  ];
}

function renderCursorValue(value: string, cursor: number | undefined, width: number, mode: "end" | "start" | undefined): string {
  if (width <= 0) return "";
  const chars = [...value];
  const pos = Math.max(0, Math.min(cursor ?? chars.length, chars.length));
  const rendered = `${chars.slice(0, pos).join("")}█${chars.slice(pos).join("")}`;
  if ([...rendered].length <= width) return rendered;
  if (mode === "start" || pos >= width - 1) {
    const tailWidth = Math.max(0, width - 1);
    const tail = `${chars.slice(Math.max(0, pos - tailWidth + 1), pos).join("")}█${chars.slice(pos, pos + Math.max(0, tailWidth - Math.min(pos, tailWidth - 1))).join("")}`;
    return `…${[...tail].slice(-tailWidth).join("")}`;
  }
  return truncate(rendered, width);
}

function truncateValue(value: string, width: number, mode: "end" | "start" | undefined): string {
  if (width <= 0) return "";
  if (displayWidth(value) <= width) return value;
  if (mode !== "start") return truncate(value, width);
  if (width <= 1) return "";
  const visible = stripAnsi(value);
  const tail = [...visible].slice(-(width - 1)).join("");
  return `…${tail}`;
}

export function renderDialog(title: string, rows: string[], width: number, theme?: SessionsTheme): string[] {
  const styles = theme ? createStyles(theme) : plainStyles();
  const inner = Math.max(20, Math.min(Math.max(20, width - 2), 86));
  const body = [styles.accent(title), styles.border("─".repeat(Math.min(inner, Math.max(0, displayWidth(title) + 8)))), ...rows];
  return [
    `${styles.border("╭")}${styles.border("─".repeat(inner))}${styles.border("╮")}`,
    ...body.map((line) => `${styles.border("│")}${pad(line, inner)}${styles.border("│")}`),
    `${styles.border("╰")}${styles.border("─".repeat(inner))}${styles.border("╯")}`,
  ];
}

function box(width: number, body: string[], styles: LayoutStyles): string[] {
  const inner = width - 2;
  const title = "pi agent hub";
  const top = `${styles.border("╭")} ${styles.accent(title)} ${styles.border("─".repeat(Math.max(0, inner - displayWidth(title) - 2)))}${styles.border("╮")}`;
  const bottom = `${styles.border("╰")}${styles.border("─".repeat(inner))}${styles.border("╯")}`;
  return [top, ...body.map((line) => `${styles.border("│")}${pad(line, inner)}${styles.border("│")}`), bottom].map((line) => truncate(line, width));
}

function twoColumn(left: string, right: string, width: number): string {
  if (!right) return truncate(left, width);
  const rightWidth = displayWidth(right);
  if (rightWidth >= width) return truncate(right, width);
  const visibleLeft = truncate(left, Math.max(0, width - rightWidth - 1));
  const gap = Math.max(1, width - displayWidth(visibleLeft) - rightWidth);
  return `${visibleLeft}${" ".repeat(gap)}${right}`;
}

function pad(value: string, width: number): string {
  const text = truncate(value, width);
  return `${text}${" ".repeat(Math.max(0, width - displayWidth(text)))}`;
}

export function truncate(value: string, width: number): string {
  if (width <= 1) return "";
  return truncateToWidth(value, width, "…");
}

function displayWidth(value: string): number {
  return visibleWidth(value);
}
