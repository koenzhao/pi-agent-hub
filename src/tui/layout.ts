import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { WorkflowSnapshot } from "../core/types.js";
import type { RenderModel, RenderSession, StatusCounts } from "./render-model.js";
import { darkTheme, stripAnsi, stripAnsiExceptItalics, styleBgToken, styleToken, type SessionsTheme } from "./theme.js";

export interface SessionsLayout {
  lines: string[];
  rowSessions: (string | undefined)[];
  listWidth: number;
  listScrollTop: number;
}

export function renderSessions(model: RenderModel, theme?: SessionsTheme): SessionsLayout {
  const styles = theme ? createStyles(theme) : plainStyles();
  const width = Math.max(40, model.width);
  if (model.empty) {
    const lines = box(width, fitBoxBody(emptyLines(width, styles), model.height), styles);
    return { lines, rowSessions: lines.map(() => undefined), listWidth: 0, listScrollTop: 0 };
  }

  const bodyWidth = width - 2;
  if (model.noMatches) {
    const body = [renderTopSummary(model, bodyWidth, styles), ...noMatchLines(width, model.filter ?? "", styles), styles.border("─".repeat(bodyWidth)), styleFooter(model.footer, styles)];
    const lines = box(width, fitBoxBody(body, model.height), styles);
    return { lines, rowSessions: lines.map(() => undefined), listWidth: 0, listScrollTop: 0 };
  }

  const split = model.showPreview ? Math.max(26, Math.min(40, Math.floor(bodyWidth * 0.38))) : bodyWidth;
  const targetRows = bodyRowsFromHeight(model.height);
  const left = renderSessionList(model, split, styles);
  const right = model.showPreview ? renderDetails(model.selected, bodyWidth - split - 1, model.preview, model.detailsExpanded, targetRows, styles) : [];
  const rows = targetRows ?? Math.max(left.lines.length, right.length, 8);
  const windowedLeft = windowList(left, rows, model.listScrollTop ?? 0, styles);
  const body: string[] = [renderTopSummary(model, bodyWidth, styles)];
  for (let i = 0; i < rows; i += 1) {
    const padded = pad(windowedLeft.lines[i] ?? "", split);
    const l = i === windowedLeft.selectedIndex ? styles.selected(padded) : padded;
    if (!model.showPreview) body.push(l);
    else body.push(`${l}${styles.border("│")}${pad(right[i] ?? "", bodyWidth - split - 1)}`);
  }
  body.push(styles.border("─".repeat(bodyWidth)));
  body.push(truncate(styleFooter(model.footer, styles), bodyWidth));
  const lines = box(width, body, styles);
  const rowSessions = lines.map(() => undefined as string | undefined);
  for (let i = 0; i < rows; i += 1) rowSessions[2 + i] = windowedLeft.sessions[i];
  return { lines, rowSessions, listWidth: split, listScrollTop: windowedLeft.top };
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

function bodyRowsFromHeight(height: number | undefined): number | undefined {
  if (!height || height <= 0) return undefined;
  return Math.max(1, height - 5);
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

const STATUS_ORDER = [
  ["running", "●"],
  ["waiting", "◐"],
  ["idle", "○"],
  ["error", "×"],
  ["stopped", "-"],
] as const;

function renderTopSummary(model: RenderModel, width: number, styles: LayoutStyles): string {
  const countLabel = model.filter === undefined
    ? `${model.summary.total} ${model.summary.total === 1 ? "session" : "sessions"}`
    : `${model.summary.visibleTotal}/${model.summary.total} sessions`;
  const parts = [styles.accent(countLabel)];
  const counts = formatStatusCounts(model.summary.statusCounts, styles);
  if (counts) parts.push(counts);
  if (model.viewMode === "stages") parts.push(styles.dim("view stages"));
  if (model.filter !== undefined) parts.push(styles.dim(`filter: ${model.filter}`));
  return truncate(parts.join(" · "), width);
}

function renderSessionList(model: RenderModel, width: number, styles: LayoutStyles): { lines: string[]; sessions: (string | undefined)[]; selectedIndex: number } {
  const stages = model.viewMode === "stages";
  const lines: string[] = [];
  const sessions: (string | undefined)[] = [];
  let selectedIndex = -1;
  const pushLine = (line: string, sessionId?: string) => {
    lines.push(line);
    sessions.push(sessionId);
  };
  const pushRow = (session: RenderSession) => {
    if (session.selected) selectedIndex = lines.length;
    pushLine(renderSessionRow(session, width, styles, stages), session.id);
  };
  if (!model.showSections) {
    for (const group of model.groups) {
      pushLine(twoColumn(styles.accent(group.name), formatStatusCounts(group.statusCounts, styles), width));
      for (const session of group.sessions) pushRow(session);
    }
    return { lines, sessions, selectedIndex };
  }
  let firstSection = true;
  for (const section of model.sections) {
    if (!firstSection) pushLine("");
    pushLine(sectionHeader(section.title, formatStatusCounts(section.statusCounts, styles), width, styles));
    firstSection = false;
    for (const group of section.groups) {
      if (group.name) pushLine(twoColumn(styles.accent(group.name), formatStatusCounts(group.statusCounts, styles), width));
      for (const session of group.sessions) pushRow(session);
    }
  }
  if (stages && model.hiddenNonActive > 0) {
    pushLine("");
    pushLine(styles.dim(truncate(`+${model.hiddenNonActive} backlog/archived · v groups view`, width)));
  }
  return { lines, sessions, selectedIndex };
}

interface ListWindow {
  lines: string[];
  sessions: (string | undefined)[];
  selectedIndex: number;
  top: number;
}

function windowList(
  list: { lines: string[]; sessions: (string | undefined)[]; selectedIndex: number },
  capacity: number,
  scrollTop: number,
  styles: LayoutStyles,
): ListWindow {
  if (capacity <= 0 || list.lines.length <= capacity) return { ...list, top: 0 };
  const total = list.lines.length;
  const selectedIndex = Math.max(0, list.selectedIndex);
  const sessionCount = (from: number, to: number) => list.sessions.slice(Math.max(0, from), Math.min(total, to)).filter(Boolean).length;
  const indicator = (arrow: "↑" | "↓", count: number) => styles.dim(`${arrow} ${count} more`);
  const slice = (top: number, lines: string[], sessions: (string | undefined)[], selectedOffset = top): ListWindow => ({
    lines,
    sessions,
    selectedIndex: selectedIndex >= selectedOffset && selectedIndex < selectedOffset + lines.length ? selectedIndex - selectedOffset : -1,
    top,
  });

  if (capacity === 1) {
    return slice(selectedIndex, [list.lines[selectedIndex] ?? ""], [list.sessions[selectedIndex]], selectedIndex);
  }

  if (selectedIndex < capacity - 1) {
    const visibleEnd = capacity - 1;
    return slice(0, [...list.lines.slice(0, visibleEnd), indicator("↓", sessionCount(visibleEnd, total))], [...list.sessions.slice(0, visibleEnd), undefined]);
  }

  if (selectedIndex >= total - (capacity - 1)) {
    const top = total - (capacity - 1);
    return {
      lines: [indicator("↑", sessionCount(0, top)), ...list.lines.slice(top)],
      sessions: [undefined, ...list.sessions.slice(top)],
      selectedIndex: selectedIndex - top + 1,
      top,
    };
  }

  if (capacity === 2) {
    return {
      lines: [indicator("↑", sessionCount(0, selectedIndex)), list.lines[selectedIndex] ?? ""],
      sessions: [undefined, list.sessions[selectedIndex]],
      selectedIndex: 1,
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
    sessions: [undefined, ...list.sessions.slice(top, bottomStart), undefined],
    selectedIndex: selectedIndex - top + 1,
    top,
  };
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

function railCompact(workflow: WorkflowSnapshot, styles: LayoutStyles): string {
  const step = workflow.steps[workflow.activeIndex];
  if (!step) return "";
  return `${styles.accent(step.short)} ${styles.dim(`${workflow.activeIndex + 1}/${workflow.steps.length}`)}`;
}

function sidePaneGlyph(inSidePane: boolean | undefined, styles: LayoutStyles): string {
  return inSidePane ? `${styles.accent("◫")} ` : "";
}

function rowRightAdornment(session: RenderSession, styles: LayoutStyles, stages: boolean, width: number): string {
  const right = stages
    ? (session.kind === "subagent" ? "" : styles.dim(session.group))
    : session.workflow && !session.archiveExpiresIn ? railCompact(session.workflow, styles) : "";
  return right && width - displayWidth(right) - 1 >= 12 ? right : "";
}

function railFull(workflow: WorkflowSnapshot, styles: LayoutStyles): string {
  const rail = workflow.steps
    .map((step, index) => index === workflow.activeIndex ? styles.accent(`▐${step.short}▌`) : styles.dim(step.short))
    .join(styles.border("─"));
  return workflow.ticketId ? `${rail} ${styles.border("·")} ${styles.muted(workflow.ticketId)}` : rail;
}

function railLine(workflow: WorkflowSnapshot, width: number, styles: LayoutStyles): string {
  const full = railFull(workflow, styles);
  return displayWidth(full) <= width ? full : railCompact(workflow, styles);
}

function compactDetails(session: RenderSession, width: number, styles: LayoutStyles): string[] {
  const lines = [titleStatusRow(session, width, styles)];
  if (session.kind === "subagent") {
    lines.push(truncate([`agent ${session.agentName ?? "subagent"}`, session.taskPreview ? `task ${session.taskPreview}` : ""].filter(Boolean).join(" · "), width));
  } else {
    const parts = [truncatePath(session.cwd, Math.max(8, Math.floor(width * 0.6)))];
    if (session.worktreeBranch) parts.push(`wt ${session.worktreeBranch}`);
    if (session.repoCount > 1) parts.push(`${session.repoCount} repos`);
    lines.push(truncate(parts.join(" · "), width));
  }
  if (session.workflow) lines.push(railLine(session.workflow, width, styles));
  const lifecycle = lifecycleLine(session);
  if (lifecycle) lines.push(styles.dim(lifecycle));
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
  const lines = [
    titleStatusRow(session, width, styles),
    session.kind === "subagent" ? `agent     ${session.agentName ?? "subagent"}` : undefined,
    session.taskPreview ? `task      ${session.taskPreview}` : undefined,
    `cwd       ${truncatePath(session.cwd, Math.max(0, width - 10))}`,
    `repos     ${session.repoCount}`,
    `group     ${session.group}`,
    session.section !== "active" ? `section   ${session.section}` : undefined,
    session.archiveExpiresIn ? `expires   ${session.archiveExpiresIn}` : undefined,
  ].filter((line): line is string => Boolean(line));
  if (session.workflow) lines.splice(1, 0, railLine(session.workflow, width, styles));
  for (const cwd of session.additionalCwds) lines.push(`extra     ${truncatePath(cwd, Math.max(0, width - 10))}`);
  if (session.worktreeBranch) lines.push(`worktree  ${session.worktreeBranch} → ${session.worktreeBaseBranch ?? "unknown"}${session.worktreeCount && session.worktreeCount > 1 ? ` (${session.worktreeCount})` : ""}`);
  if (session.worktreePath) lines.push(`wt path   ${truncatePath(session.worktreePath, Math.max(0, width - 10))}`);
  if (session.workspaceCwd) lines.push(`runtime   ${truncatePath(session.workspaceCwd, Math.max(0, width - 10))}`);
  if (session.sessionFile) lines.push(`session   ${truncatePath(session.sessionFile, Math.max(0, width - 10))}`);
  lines.push(...metadataBlock(session, width, true, styles));
  if (session.enabledMcpServers.length) lines.push(`mcp       ${session.enabledMcpServers.join(", ")}`);
  if (session.resultSummary) lines.push(`result    ${session.resultSummary}`);
  if (session.error) lines.push(styles.error(`error     ${session.error}`));
  return lines;
}

function metadataBlock(session: RenderSession, width: number, expanded: boolean, styles: LayoutStyles): string[] {
  const metadata = session.sessionMetadata;
  if (!metadata) return [];
  const headerRight = [metadata.source ? `via ${metadata.source}` : undefined, session.metadataUpdatedAge].filter(Boolean).join(" · ");
  const lines = ["", twoColumn(styles.border("── metadata ─"), styles.dim(headerRight), width)];
  if (metadata.goal) lines.push(...metadataField("goal", metadata.goal, width, styles));
  if (metadata.status) lines.push(...metadataField("prog", metadata.status, width, styles));
  if (metadata.nextStep) lines.push(...metadataField("next", metadata.nextStep, width, styles));
  if (expanded && metadata.stage) lines.push(`${styles.muted(pad("stage", 5))} ${styles.muted(truncate(`[${metadata.stage}]`, Math.max(4, width - 6)))}`);
  return lines;
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
    if (current) lines.push(current);
    width = nextWidth;
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function lifecycleLine(session: RenderSession): string | undefined {
  if (session.section === "active") return undefined;
  if (session.section === "archived" && session.archiveExpiresIn) return `archived · expires in ${session.archiveExpiresIn}`;
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

function renderSessionRow(session: RenderSession, width: number, styles: LayoutStyles, stages = false): string {
  const prefix = session.selected ? styles.accent("▶") : session.status === "stopped" ? styles.dim("·") : " ";
  const symbol = styles.status(session.displayStatus, session.symbol);
  const titleText = session.kind === "subagent" ? (session.agentName ?? "subagent") : session.title;
  const title = session.status === "stopped" ? styles.dim(titleText) : titleText;
  const sidePaneMarker = sidePaneGlyph(session.inSidePane, styles);
  const repoBadge = session.repoCount > 1 && session.kind !== "subagent" ? styles.dim(` [${session.repoCount} repos]`) : "";
  const worktreeBadge = session.worktreeBranch && session.kind !== "subagent" ? styles.dim(" [wt]") : "";
  const archiveBadge = session.archiveExpiresIn ? styles.dim(` [exp ${session.archiveExpiresIn}]`) : "";
  const indent = session.depth > 0 ? styles.dim(`${"  ".repeat(session.depth)}└ `) : "";
  const text = `${prefix} ${indent}${symbol} ${sidePaneMarker}${title}${repoBadge}${worktreeBadge}${archiveBadge}`;
  const right = rowRightAdornment(session, styles, stages, width);
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
    const focused = field.key === spec.focus && !field.readonly;
    const caret = focused ? styles.accent("▎") : " ";
    const label = focused ? field.label : styles.muted(field.label);
    const rawValue = focused ? styles.accent(renderCursorValue(field.value, field.cursor, valueWidth, field.truncate)) : truncateValue(field.value, valueWidth, field.truncate);
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
