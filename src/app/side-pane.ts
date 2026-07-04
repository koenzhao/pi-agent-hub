import { clientSessionsByTty, killPane, listWindowPanes, realTmuxExec, selectPane, splitPaneBelowAttach, splitWindowAttach, switchClientTo, type TmuxExec, type WindowPane } from "../core/tmux.js";
import { MANAGED_SESSION_PREFIX } from "../core/names.js";

export type SidePaneSlot = "top" | "bottom";

export type SidePaneResult =
  | { kind: "opened" }
  | { kind: "retargeted" }
  | { kind: "closed" };

interface ContentPane {
  pane: WindowPane;
  session: string;
}

export async function openInSidePane(options: {
  target: string;
  ownPane: string;
  slot?: SidePaneSlot;
  sidebarWidth?: number;
}, exec: TmuxExec = realTmuxExec): Promise<SidePaneResult> {
  const panes = await findContentPanes(options.ownPane, exec);
  const showingTarget = panes.find((content) => content.session === options.target);
  if (showingTarget) {
    await killPane(showingTarget.pane.id, exec);
    return { kind: "closed" };
  }
  if (!panes.length) {
    await splitWindowAttach({ pane: options.ownPane, target: options.target, sidebarWidth: options.sidebarWidth ?? 42 }, exec);
    return { kind: "opened" };
  }
  const slot = options.slot ?? "top";
  if (slot === "bottom" && panes.length === 1) {
    await splitPaneBelowAttach({ pane: panes[0].pane.id, target: options.target }, exec);
    return { kind: "opened" };
  }
  const content = slot === "bottom" ? panes[panes.length - 1] : panes[0];
  await switchClientTo({ clientTty: content.pane.tty, target: options.target }, exec);
  await selectPane(content.pane.id, exec);
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

async function findContentPanes(ownPane: string, exec: TmuxExec): Promise<ContentPane[]> {
  const panes = (await listWindowPanes(ownPane, exec)).filter((pane) => pane.id !== ownPane);
  if (!panes.length) return [];
  const clients = await clientSessionsByTty(exec);
  return panes.flatMap((pane) => {
    const session = clients.get(pane.tty);
    return session?.startsWith(MANAGED_SESSION_PREFIX) ? [{ pane, session }] : [];
  }).sort((a, b) => a.pane.top - b.pane.top);
}
