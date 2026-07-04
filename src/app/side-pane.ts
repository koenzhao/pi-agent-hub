import { clientSessionsByTty, killPane, listWindowPanes, realTmuxExec, selectPane, splitWindowAttach, switchClientTo, type TmuxExec, type WindowPane } from "../core/tmux.js";
import { MANAGED_SESSION_PREFIX } from "../core/names.js";

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
  sidebarWidth?: number;
}, exec: TmuxExec = realTmuxExec): Promise<SidePaneResult> {
  const content = await findContentPane(options.ownPane, exec);
  if (!content) {
    await splitWindowAttach({ pane: options.ownPane, target: options.target, sidebarWidth: options.sidebarWidth ?? 42 }, exec);
    return { kind: "opened" };
  }
  if (content.session === options.target) {
    await killPane(content.pane.id, exec);
    return { kind: "closed" };
  }
  await switchClientTo({ clientTty: content.pane.tty, target: options.target }, exec);
  await selectPane(content.pane.id, exec);
  return { kind: "retargeted" };
}

export async function closeSidePaneShowing(options: {
  target: string;
  ownPane: string;
}, exec: TmuxExec = realTmuxExec): Promise<boolean> {
  const content = await findContentPane(options.ownPane, exec);
  if (!content || content.session !== options.target) return false;
  await killPane(content.pane.id, exec);
  return true;
}

async function findContentPane(ownPane: string, exec: TmuxExec): Promise<ContentPane | undefined> {
  const panes = (await listWindowPanes(ownPane, exec)).filter((pane) => pane.id !== ownPane);
  if (!panes.length) return undefined;
  const clients = await clientSessionsByTty(exec);
  for (const pane of panes) {
    const session = clients.get(pane.tty);
    if (session?.startsWith(MANAGED_SESSION_PREFIX)) return { pane, session };
  }
  return undefined;
}
