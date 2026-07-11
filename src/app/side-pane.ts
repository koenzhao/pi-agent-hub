import { clientSessionsByTty, killPane, listWindowPanes, presizeSessionWindow, realTmuxExec, resetSessionWindowSize, selectPane, setPaneTitle, splitPaneAttach, splitWindowAttach, switchClientTo, type TmuxExec, type WindowPane } from "../core/tmux.js";
import { MANAGED_SESSION_PREFIX } from "../core/names.js";

export const SIDEBAR_WIDTH = 42;
const MIN_SIDEBAR_WIDTH = 40;
const MIN_CONTENT_WIDTH = 40;

export type SidePaneSlot = 1 | 2 | 3 | 4;
export type SidePaneResult =
  | { kind: "opened"; slot: SidePaneSlot }
  | { kind: "retargeted"; slot: SidePaneSlot }
  | { kind: "closed" }
  | { kind: "too-narrow"; panels: number };
export type FocusSidePaneResult = { kind: "focused" } | { kind: "unavailable" };

interface ContentPane {
  pane: WindowPane;
  session: string;
}

export interface SidePaneStatus {
  sessions: string[];
  paneIds: string[];
  ownWidth?: number;
  windowWidth?: number;
}

interface SidePaneWindow {
  own?: WindowPane;
  content: ContentPane[];
}

export function sidebarRepairWidth(ownWidth: number, windowWidth: number): number | undefined {
  if (ownWidth >= MIN_SIDEBAR_WIDTH) return undefined;
  const desired = Math.min(SIDEBAR_WIDTH, windowWidth - MIN_CONTENT_WIDTH - 1);
  return desired >= MIN_SIDEBAR_WIDTH ? desired : undefined;
}

export async function toggleSidePaneSlot(options: {
  target: string;
  ownPane: string;
  slot: SidePaneSlot;
  titleFor?: (tmuxSession: string) => string | undefined;
}, exec: TmuxExec = realTmuxExec): Promise<SidePaneResult> {
  const inspected = await inspectSidePaneWindow(options.ownPane, exec);
  const sessions = inspected.content.map((content) => content.session);
  const existingIndex = sessions.indexOf(options.target);
  const maxIndex = existingIndex >= 0 ? sessions.length - 1 : sessions.length;
  const index = Math.min(options.slot - 1, maxIndex);
  const slot = (index + 1) as SidePaneSlot;

  if (sessions[index] === options.target) {
    if (index === options.slot - 1) {
      sessions.splice(index, 1);
      await rebuildSidePanes(options.ownPane, inspected, sessions, exec, options.titleFor);
      return { kind: "closed" };
    }
    await selectPane(inspected.content[index]!.pane.id, exec);
    return { kind: "retargeted", slot };
  }

  if (existingIndex >= 0) {
    [sessions[index], sessions[existingIndex]] = [sessions[existingIndex]!, sessions[index]!];
    const panes = await rebuildSidePanes(options.ownPane, inspected, sessions, exec, options.titleFor);
    await selectPane(panes[index]!, exec);
    return { kind: "retargeted", slot };
  }

  const occupied = inspected.content[index];
  if (occupied) {
    let presized = false;
    try {
      await presizeSessionWindow({ target: options.target, width: occupied.pane.width, height: occupied.pane.height - 1 }, exec);
      presized = true;
    } catch {
      // The target can disappear between dashboard refresh and retargeting.
    }
    try {
      await switchClientTo({ clientTty: occupied.pane.tty, target: options.target }, exec);
    } finally {
      if (presized) await resetSessionWindowSize(options.target, exec).catch(() => {});
    }
    await setSidePaneTitle(occupied.pane.id, options.target, slot, options.titleFor, exec);
    await selectPane(occupied.pane.id, exec);
    return { kind: "retargeted", slot };
  }

  const panelCount = sessions.length + 1;
  if (!panelsFit(inspected, panelCount)) return { kind: "too-narrow", panels: panelCount };
  sessions.push(options.target);
  const panes = await rebuildSidePanes(options.ownPane, inspected, sessions, exec, options.titleFor);
  await selectPane(panes[index]!, exec);
  return { kind: "opened", slot };
}

export async function focusSidePaneSlot(options: {
  ownPane: string;
  slot: SidePaneSlot;
}, exec: TmuxExec = realTmuxExec): Promise<FocusSidePaneResult> {
  const content = (await inspectSidePaneWindow(options.ownPane, exec)).content[options.slot - 1];
  if (!content) return { kind: "unavailable" };
  await selectPane(content.pane.id, exec);
  return { kind: "focused" };
}

export async function resetSidePane(options: {
  target: string;
  ownPane: string;
  titleFor?: (tmuxSession: string) => string | undefined;
}, exec: TmuxExec = realTmuxExec): Promise<SidePaneResult> {
  const inspected = await inspectSidePaneWindow(options.ownPane, exec);
  if (inspected.content.length === 1 && inspected.content[0]?.session === options.target) {
    await killPane(inspected.content[0].pane.id, exec);
    return { kind: "closed" };
  }
  const kind = inspected.content.length ? "retargeted" : "opened";
  if (!inspected.content.length && !panelsFit(inspected, 1)) return { kind: "too-narrow", panels: 1 };
  await rebuildSidePanes(options.ownPane, inspected, [options.target], exec, options.titleFor);
  return { kind, slot: 1 };
}

export async function closeSidePaneShowing(options: {
  target: string;
  ownPane: string;
}, exec: TmuxExec = realTmuxExec): Promise<boolean> {
  const content = (await inspectSidePaneWindow(options.ownPane, exec)).content.find((pane) => pane.session === options.target);
  if (!content) return false;
  await killPane(content.pane.id, exec);
  return true;
}

export async function closeSidePanes(options: { ownPane: string }, exec: TmuxExec = realTmuxExec): Promise<void> {
  for (const content of (await inspectSidePaneWindow(options.ownPane, exec)).content) {
    try {
      await killPane(content.pane.id, exec);
    } catch {
      // The nested attach pane may already have closed while quitting.
    }
  }
}

export async function sidePaneStatus(options: { ownPane: string }, exec: TmuxExec = realTmuxExec): Promise<SidePaneStatus> {
  const inspected = await inspectSidePaneWindow(options.ownPane, exec);
  return {
    sessions: inspected.content.map((pane) => pane.session),
    paneIds: inspected.content.map((pane) => pane.pane.id),
    ownWidth: inspected.own?.width,
    windowWidth: inspected.own?.windowWidth,
  };
}

export interface PanelGeometry {
  width: number;
  height: number;
}

export function panelGeometry(count: 1 | 2 | 3 | 4, contentWidth: number, windowHeight: number, borderRows: number): PanelGeometry[] {
  const availableHeight = windowHeight - borderRows;
  const bottomHeight = Math.floor((availableHeight - 1) / 2);
  const topHeight = availableHeight - 1 - bottomHeight;
  const rightWidth = Math.floor((contentWidth - 1) / 2);
  const leftWidth = contentWidth - 1 - rightWidth;
  if (count === 1) return [{ width: contentWidth, height: availableHeight }];
  if (count === 2) return [
    { width: contentWidth, height: topHeight },
    { width: contentWidth, height: bottomHeight },
  ];
  if (count === 3) return [
    { width: leftWidth, height: availableHeight },
    { width: rightWidth, height: topHeight },
    { width: rightWidth, height: bottomHeight },
  ];
  return [
    { width: leftWidth, height: topHeight },
    { width: rightWidth, height: topHeight },
    { width: leftWidth, height: bottomHeight },
    { width: rightWidth, height: bottomHeight },
  ];
}

function panelFitWidth(windowWidth: number, sidebarWidth: number, count: number): number {
  const contentWidth = windowWidth - sidebarWidth - 1;
  return count <= 2 ? contentWidth : Math.floor((contentWidth - 1) / 2);
}

function panelsFit(inspected: SidePaneWindow, count: number): boolean {
  if (!inspected.own) return true;
  const sidebarWidth = inspected.content.length && inspected.own.width >= MIN_SIDEBAR_WIDTH
    ? inspected.own.width
    : SIDEBAR_WIDTH;
  return panelFitWidth(inspected.own.windowWidth, sidebarWidth, count) >= MIN_CONTENT_WIDTH;
}

async function rebuildSidePanes(
  ownPane: string,
  inspected: SidePaneWindow,
  sessions: string[],
  exec: TmuxExec,
  titleFor?: (tmuxSession: string) => string | undefined,
): Promise<string[]> {
  const sidebarWidth = inspected.content.length && (inspected.own?.width ?? 0) >= MIN_SIDEBAR_WIDTH
    ? inspected.own!.width
    : SIDEBAR_WIDTH;
  for (const content of inspected.content) {
    try {
      await killPane(content.pane.id, exec);
    } catch (error) {
      if (!String(error).includes("can't find pane")) throw error;
    }
  }
  if (!sessions.length) return [];

  const own = inspected.own;
  if (!own) throw new Error("dashboard pane geometry is unavailable");
  const contentWidth = own.windowWidth - sidebarWidth - 1;
  const geometry = panelGeometry(sessions.length as 1 | 2 | 3 | 4, contentWidth, own.windowHeight, 1);
  for (const [index, session] of sessions.entries()) {
    const panel = geometry[index]!;
    try {
      await presizeSessionWindow({ target: session, width: panel.width, height: panel.height - 1 }, exec);
    } catch {
      // A dead session must not prevent the remaining panels from rebuilding.
    }
  }

  const panes: string[] = [];
  let layoutError: unknown;
  try {
    const first = await splitWindowAttach({ pane: ownPane, target: sessions[0]!, size: contentWidth }, exec);
    panes[0] = first;
    await setSidePaneTitle(first, sessions[0]!, 1, titleFor, exec);
    if (sessions.length === 2) {
      const second = await splitPaneAttach({ pane: first, target: sessions[1]!, direction: "vertical", size: geometry[1]!.height }, exec);
      panes[1] = second;
      await setSidePaneTitle(second, sessions[1]!, 2, titleFor, exec);
    } else if (sessions.length === 3) {
      const second = await splitPaneAttach({ pane: first, target: sessions[1]!, direction: "horizontal", size: geometry[1]!.width }, exec);
      panes[1] = second;
      await setSidePaneTitle(second, sessions[1]!, 2, titleFor, exec);
      const third = await splitPaneAttach({ pane: second, target: sessions[2]!, direction: "vertical", size: geometry[2]!.height }, exec);
      panes[2] = third;
      await setSidePaneTitle(third, sessions[2]!, 3, titleFor, exec);
    } else if (sessions.length === 4) {
      const third = await splitPaneAttach({ pane: first, target: sessions[2]!, direction: "vertical", size: geometry[2]!.height }, exec);
      panes[2] = third;
      await setSidePaneTitle(third, sessions[2]!, 3, titleFor, exec);
      const second = await splitPaneAttach({ pane: first, target: sessions[1]!, direction: "horizontal", size: geometry[1]!.width }, exec);
      panes[1] = second;
      await setSidePaneTitle(second, sessions[1]!, 2, titleFor, exec);
      const fourth = await splitPaneAttach({ pane: third, target: sessions[3]!, direction: "horizontal", size: geometry[3]!.width }, exec);
      panes[3] = fourth;
      await setSidePaneTitle(fourth, sessions[3]!, 4, titleFor, exec);
    }
  } catch (error) {
    layoutError = error;
  }
  let resetError: unknown;
  for (const session of sessions) {
    try {
      await resetSessionWindowSize(session, exec);
    } catch (error) {
      if (!String(error).includes("can't find") && resetError === undefined) resetError = error;
    }
  }
  if (layoutError !== undefined) throw layoutError;
  if (resetError !== undefined) throw resetError;
  return panes;
}

async function setSidePaneTitle(
  paneId: string,
  tmuxSession: string,
  slot: SidePaneSlot,
  titleFor: ((tmuxSession: string) => string | undefined) | undefined,
  exec: TmuxExec,
): Promise<void> {
  if (!titleFor) return;
  await setPaneTitle(paneId, `[${slot}] ${titleFor(tmuxSession) ?? tmuxSession}`, exec);
}

async function inspectSidePaneWindow(ownPane: string, exec: TmuxExec): Promise<SidePaneWindow> {
  const panes = await listWindowPanes(ownPane, exec);
  const own = panes.find((pane) => pane.id === ownPane);
  const candidates = panes.filter((pane) => pane.id !== ownPane);
  if (!candidates.length) return { own, content: [] };
  const clients = await clientSessionsByTty(exec);
  const content = candidates.flatMap((pane) => {
    const session = clients.get(pane.tty);
    return session?.startsWith(MANAGED_SESSION_PREFIX) ? [{ pane, session }] : [];
  });
  content.sort((a, b) => a.pane.top - b.pane.top || a.pane.left - b.pane.left);
  return { own, content };
}
