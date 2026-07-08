import { clientSessionsByTty, killPane, listWindowPanes, realTmuxExec, splitPaneBelowAttach, splitWindowAttach, switchClientTo, type TmuxExec, type WindowPane } from "../core/tmux.js";
import { MANAGED_SESSION_PREFIX } from "../core/names.js";

export const SIDEBAR_WIDTH = 42;
const MIN_SIDEBAR_WIDTH = 40;
const MIN_CONTENT_WIDTH = 40;

export type SidePaneResult =
  | { kind: "opened" }
  | { kind: "retargeted" }
  | { kind: "closed" };

interface ContentPane {
  pane: WindowPane;
  session: string;
}

export interface SidePaneStatus {
  sessions: string[];
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

export async function openInSidePane(options: {
  target: string;
  ownPane: string;
  sidebarWidth?: number;
}, exec: TmuxExec = realTmuxExec): Promise<SidePaneResult> {
  const panes = await findContentPanes(options.ownPane, exec);
  const showingTarget = panes.find((content) => content.session === options.target);
  if (showingTarget) {
    await killPane(showingTarget.pane.id, exec);
    return { kind: "closed" };
  }
  if (!panes.length) {
    await splitWindowAttach({ pane: options.ownPane, target: options.target, sidebarWidth: options.sidebarWidth ?? SIDEBAR_WIDTH }, exec);
    return { kind: "opened" };
  }
  if (panes.length === 1) {
    await splitPaneBelowAttach({ pane: panes[0].pane.id, target: options.target }, exec);
    return { kind: "opened" };
  }
  const content = panes[panes.length - 1];
  await switchClientTo({ clientTty: content.pane.tty, target: options.target }, exec);
  return { kind: "retargeted" };
}

export async function closeSidePaneShowing(options: {
  target: string;
  ownPane: string;
}, exec: TmuxExec = realTmuxExec): Promise<boolean> {
  const content = (await findContentPanes(options.ownPane, exec)).find((pane) => pane.session === options.target);
  if (!content) return false;
  await killPane(content.pane.id, exec);
  return true;
}

export async function closeSidePanes(options: { ownPane: string }, exec: TmuxExec = realTmuxExec): Promise<void> {
  for (const content of await findContentPanes(options.ownPane, exec)) {
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
    ownWidth: inspected.own?.width,
    windowWidth: inspected.own?.windowWidth,
  };
}

async function findContentPanes(ownPane: string, exec: TmuxExec): Promise<ContentPane[]> {
  return (await inspectSidePaneWindow(ownPane, exec)).content;
}

async function inspectSidePaneWindow(ownPane: string, exec: TmuxExec): Promise<SidePaneWindow> {
  const panes = await listWindowPanes(ownPane, exec);
  const own = panes.find((pane) => pane.id === ownPane);
  const contentPanes = panes.filter((pane) => pane.id !== ownPane);
  if (!contentPanes.length) return { own, content: [] };
  const clients = await clientSessionsByTty(exec);
  const content = contentPanes.flatMap((pane) => {
    const session = clients.get(pane.tty);
    return session?.startsWith(MANAGED_SESSION_PREFIX) ? [{ pane, session }] : [];
  }).sort((a, b) => a.pane.top - b.pane.top);
  return { own, content };
}
