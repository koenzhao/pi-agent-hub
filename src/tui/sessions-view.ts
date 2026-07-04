import { Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { attachPlan } from "../app/actions.js";
import type { SessionsController, SyncPiNameResult } from "../app/controller.js";
import { sessionSection } from "../core/session-bucket.js";
import { orderedSessionRows } from "../core/session-tree.js";
import type { ManagedSession } from "../core/types.js";
import { matchesDashboardShortcut } from "./dashboard-shortcuts.js";
import { buildRenderModel, stageLaneRows } from "./render-model.js";
import { renderSessions } from "./layout.js";
import { stripAnsi, styleToken, type SessionsTheme } from "./theme.js";
import type { PickerItem } from "./two-column-picker.js";
import { errorMessage, isPromise, type DialogContext, type OpenSidePaneResult, type SessionDialog, type SessionsViewActions } from "./dialog.js";
import { handlePromptInput, openFilterPrompt, openRenamePrompt, openSendPrompt, promptFilterValue, promptFooter } from "./prompt-dialog.js";
import { handleFormDialogInput, openForkDialog, openMoveGroupDialog, openRenameGroupDialog, openRenameSessionForm, renderFormDialog } from "./form-dialogs.js";
import { handleConfirmInput, openDeleteDialog, openFinishDialog, renderConfirmDialog, renderRestartDialog } from "./confirm-dialogs.js";
import { createPickerDialog, handlePickerDialogInput, renderPickerDialog } from "./picker-dialog.js";
import { handleNewSessionInput, openNewSessionDialog, renderNewSessionDialog } from "./new-session-dialog.js";

export class SessionsView implements Component {
  private dialog: SessionDialog | undefined;
  private message: string | undefined;
  private flash: { text: string; expiresAt: number } | undefined;
  private detailsExpanded = false;
  private viewMode: "groups" | "stages" = "groups";
  private pendingRestart: { sessionId: string } | undefined;
  private busy = false;

  constructor(private controller: SessionsController, private stop: () => void, private actions: SessionsViewActions = {}, private theme?: SessionsTheme) {}

  setTheme(theme: SessionsTheme): void {
    this.theme = theme;
  }

  setMessage(message: string | undefined): void {
    this.message = message;
  }

  handleInput(data: string): void {
    if (this.dialog) {
      if (this.dialog.kind === "help") {
        if (data === "q") this.stop();
        else if (matchesKey(data, Key.escape) || data === "?") this.dialog = undefined;
      } else if (this.dialog.kind === "prompt") this.dialog = handlePromptInput(this.dialog, data, this.dialogContext());
      else if (this.dialog.kind === "form") this.dialog = handleFormDialogInput(this.dialog, data, this.dialogContext());
      else if (this.dialog.kind === "confirm") this.dialog = handleConfirmInput(this.dialog, data, this.dialogContext());
      else if (this.dialog.kind === "picker") this.dialog = handlePickerDialogInput(this.dialog, data, this.dialogContext());
      else if (this.dialog.kind === "new" || this.dialog.kind === "repoPicker") this.dialog = handleNewSessionInput(this.dialog, data, this.dialogContext());
      return;
    }

    if (this.busy) {
      if (data === "q") this.stop();
      return;
    }

    if (matchesKey(data, Key.escape)) {
      this.clearPendingRestart();
      this.message = undefined;
      this.clearFlash();
      if (this.controller.snapshot().filter !== undefined) this.controller.setFilter(undefined);
      return;
    }

    if (this.pendingRestart) {
      if (data === "r" || data === "R") this.confirmRestartSelected(false);
      else if (data === "n" || data === "N") this.confirmRestartSelected(true);
      else if (data === "a") this.confirmRestartAll();
      return;
    }

    if (this.runConfiguredShortcut(data)) return;

    if (data === "J" || matchesKey(data, Key.shift("down"))) this.reorderSelected(1);
    else if (data === "K" || matchesKey(data, Key.shift("up"))) this.reorderSelected(-1);
    else if (data === "N" || matchesKey(data, Key.alt("n"))) this.syncPiNameSelected();
    else if (matchesKey(data, Key.down) || data === "j") {
      this.clearPendingRestart();
      this.moveSelection(1);
    }
    else if (matchesKey(data, Key.up) || data === "k") {
      this.clearPendingRestart();
      this.moveSelection(-1);
    }
    else if (matchesKey(data, Key.enter) || matchesKey(data, Key.return) || data === "\r") this.attachSelected();
    else if (matchesKey(data, Key.slash)) this.startFilter();
    else if (data === "n") this.startNewDialog();
    else if (data === "f") this.startForkDialog();
    else if (data === "g") this.startGroupDialog();
    else if (data === "A") this.moveSelectedToBucket("archived");
    else if (data === "B") this.moveSelectedToBucket("backlog");
    else if (data === "U") this.restoreSelectedBucket();
    else if (data === "e" || data === "R") this.startRenameSessionDialog();
    else if (data === "G") this.startRenameGroupDialog();
    else if (data === "o") this.openSelectedSidePane();
    else if (data === "p") this.startSendDialog();
    else if (data === "r") this.restartSelected();
    else if (data === "d") this.startDeleteDialog();
    else if (data === "w") this.startFinishDialog();
    else if (data === "s") this.startPicker("skills");
    else if (data === "m") this.startPicker("mcp");
    else if (data === "i") {
      this.clearPendingRestart();
      this.clearFlash();
      this.detailsExpanded = !this.detailsExpanded;
    }
    else if (data === "v") this.toggleViewMode();
    else if (data === "a") {
      this.clearPendingRestart();
      this.clearFlash();
      this.runAction(() => this.actions.acknowledge ? this.actions.acknowledge() : this.controller.acknowledgeSelected(), "marking read...");
    }
    else if (data === "?") {
      this.clearPendingRestart();
      this.clearFlash();
      this.dialog = { kind: "help" };
    }
    else if (data === "q") this.stop();
  }

  render(width: number): string[] {
    this.clearExpiredFlash();
    if (this.dialog?.kind === "help") return renderHelp(width, this.theme);
    if (this.dialog?.kind === "picker") return renderPickerDialog(this.dialog, width, this.dialogContext());
    if (this.dialog?.kind === "new" || this.dialog?.kind === "repoPicker") return renderNewSessionDialog(this.dialog, width, this.dialogContext());
    if (this.dialog?.kind === "form") return renderFormDialog(this.dialog, width, this.dialogContext());
    if (this.dialog?.kind === "confirm") return renderConfirmDialog(this.dialog, width, this.dialogContext());
    if (this.pendingRestart) return renderRestartDialog(width, this.dialogContext());
    const snapshot = this.controller.snapshot();
    const selected = this.controller.selected();
    const now = this.actions.now?.() ?? Date.now();
    const lines = renderSessions(buildRenderModel({
      sessions: snapshot.sessions,
      selectedId: snapshot.selectedId,
      width,
      filter: this.dialog?.kind === "prompt" ? (promptFilterValue(this.dialog) ?? snapshot.filter) : snapshot.filter,
      filterEditing: this.dialog?.kind === "prompt" && this.dialog.purpose === "filter",
      preview: snapshot.preview,
      detailsExpanded: this.detailsExpanded,
      height: this.actions.terminalRows?.() ?? process.stdout.rows,
      selectedSkillCount: selected ? this.actions.skillCount?.(selected.cwd) : undefined,
      viewMode: this.viewMode,
      now,
    }), this.theme);
    const footer = this.dialog?.kind === "prompt" ? promptFooter(this.dialog, this.dialogContext()) : undefined;
    const withFooter = footer ? replaceFooter(lines, footer, this.theme) : lines;
    if (this.message) return replaceFooter(withFooter, this.message, this.theme);
    return this.flash ? replaceFooter(withFooter, this.flash.text, this.theme) : withFooter;
  }

  invalidate(): void {}

  openRenameForTmuxSession(tmuxSession: string): boolean {
    const target = this.controller.snapshot().registry.sessions.find((session) => session.tmuxSession === tmuxSession);
    if (!target) {
      this.message = `session not found: ${tmuxSession}`;
      return false;
    }
    this.controller.setFilter(undefined);
    if (!this.controller.selectSession(target.id)) return false;
    this.startRenameSessionDialog(tmuxSession);
    return this.dialog?.kind === "form" && this.dialog.purpose === "renameSession";
  }

  private dialogContext(): DialogContext {
    return {
      controller: this.controller,
      actions: this.actions,
      theme: this.theme,
      now: () => this.actions.now?.() ?? Date.now(),
      close: () => { this.dialog = undefined; },
      setDialog: (dialog) => { this.dialog = dialog; },
      dialog: () => this.dialog,
      setMessage: (message) => { this.message = message; },
      message: () => this.message,
      flashMessage: (text) => this.flashMessage(text),
      runAction: (action, pending, onSuccess) => this.runAction(action, pending, onSuccess),
      attachSession: (session) => this.attachSession(session),
      stop: () => this.stop(),
    };
  }

  private openDialog(open: (ctx: DialogContext) => SessionDialog | undefined) {
    const dialog = open(this.dialogContext());
    if (!dialog) return;
    this.clearPendingRestart();
    this.clearFlash();
    this.message = undefined;
    this.dialog = dialog;
  }

  private startFilter() {
    this.openDialog(openFilterPrompt);
  }

  private startNewDialog() {
    this.openDialog(openNewSessionDialog);
  }

  private startForkDialog() {
    this.openDialog(openForkDialog);
  }

  private startGroupDialog() {
    this.openDialog(openMoveGroupDialog);
  }

  private startRenameSessionDialog(returnAfterRenameTmuxSession?: string) {
    const selected = this.controller.selected();
    if (!selected) return;
    if (selected.kind === "subagent") {
      this.message = "subagent rows cannot be renamed";
      return;
    }
    if (!returnAfterRenameTmuxSession) this.openDialog(openRenamePrompt);
    else this.openDialog((ctx) => openRenameSessionForm(ctx, returnAfterRenameTmuxSession));
  }

  private startRenameGroupDialog() {
    this.openDialog(openRenameGroupDialog);
  }

  private runConfiguredShortcut(data: string): boolean {
    const shortcut = this.actions.dashboardShortcuts?.find((item) => matchesDashboardShortcut(data, item.key));
    if (!shortcut) return false;
    const selected = this.controller.selected();
    if (!selected) return true;
    if (selected.kind === "subagent") {
      this.message = "subagent rows cannot receive input";
      return true;
    }
    if (selected.status === "stopped" || selected.status === "error") {
      this.message = "session is not live; press r to restart";
      return true;
    }
    if (!this.actions.runDashboardShortcut) {
      this.message = "shortcut unavailable";
      return true;
    }
    this.clearPendingRestart();
    this.clearFlash();
    this.runAction(
      () => this.actions.runDashboardShortcut?.(selected.id, shortcut),
      "running shortcut...",
      () => { this.flashMessage(`${shortcut.label ?? "shortcut sent"} → ${selected.title}`); },
    );
    return true;
  }

  private startSendDialog() {
    this.openDialog(openSendPrompt);
  }

  private openSelectedSidePane() {
    this.clearPendingRestart();
    this.clearFlash();
    this.message = undefined;
    const selected = this.controller.selected();
    if (!selected) return;
    if (selected.status === "stopped" || selected.status === "error") {
      this.flashMessage("session not running");
      return;
    }
    const openSidePane = this.actions.openSidePane;
    if (!openSidePane) {
      this.message = "side pane unavailable";
      return;
    }
    const apply = (result: OpenSidePaneResult) => {
      this.flashMessage(result.kind === "closed" ? "side closed" : `side: ${selected.title}`);
    };
    const applyError = (error: unknown) => {
      const message = errorMessage(error);
      if (message.startsWith("side pane needs tmux")) this.flashMessage(message);
      else this.message = message;
    };
    try {
      const result = openSidePane(selected.id);
      if (isPromise<OpenSidePaneResult>(result)) {
        this.busy = true;
        this.message = "opening side pane...";
        void result.then((sidePaneResult) => {
          this.busy = false;
          apply(sidePaneResult);
          if (this.message === "opening side pane...") this.message = undefined;
        }).catch((error: unknown) => {
          this.busy = false;
          if (this.message === "opening side pane...") this.message = undefined;
          applyError(error);
        });
        return;
      }
      apply(result);
    } catch (error) {
      applyError(error);
    }
  }

  private startPicker(mode: "skills" | "mcp") {
    this.clearPendingRestart();
    this.clearFlash();
    const result = mode === "skills" ? this.actions.skills?.() : this.actions.mcpServers?.();
    if (!result) {
      this.message = `${mode}: no catalog loaded`;
      return;
    }
    if (isPromise<PickerItem[]>(result)) {
      this.busy = true;
      this.message = `loading ${mode}...`;
      void result.then((items) => {
        this.busy = false;
        this.setPickerDialog(mode, items);
      }).catch((error: unknown) => {
        this.busy = false;
        this.message = errorMessage(error);
      });
      return;
    }
    this.setPickerDialog(mode, result);
  }

  private setPickerDialog(mode: "skills" | "mcp", items: PickerItem[]) {
    const dialog = createPickerDialog(mode, items, this.dialogContext());
    if (dialog) this.dialog = dialog;
  }

  private attachSelected() {
    this.clearPendingRestart();
    this.clearFlash();
    this.message = undefined;
    const selected = this.controller.selected();
    if (!selected) return;
    if (selected.status === "stopped") {
      if (this.actions.restart) this.runAction(() => this.actions.restart?.(selected.id), "starting stopped session...");
      else this.message = "session stopped; press r twice to restart";
      return;
    }
    if (selected.status === "waiting") {
      try {
        const result = this.actions.acknowledge ? this.actions.acknowledge() : this.controller.acknowledgeSelected();
        if (isPromise(result)) {
          this.busy = true;
          this.message = "marking read...";
          void result.then(() => {
            this.busy = false;
            if (this.message === "marking read...") this.message = undefined;
            this.attachSession(selected);
          }).catch((error: unknown) => {
            this.busy = false;
            this.message = errorMessage(error);
          });
          return;
        }
      } catch (error) {
        this.message = errorMessage(error);
        return;
      }
    }
    this.attachSession(selected);
  }

  private attachSession(selected: ManagedSession) {
    const plan = attachPlan(selected);
    if (plan.type === "inside-tmux") {
      const switchInsideTmux = this.actions.switchInsideTmux;
      if (!switchInsideTmux) {
        this.message = plan.message;
        return;
      }
      this.flashMessage(`switching: ${plan.command} · Ctrl+Q returns`);
      try {
        const result = switchInsideTmux(selected.tmuxSession);
        if (isPromise(result)) void result.catch((error: unknown) => { this.message = `switch failed: ${errorMessage(error)}`; });
      } catch (error) {
        this.message = `switch failed: ${errorMessage(error)}`;
      }
      return;
    }
    try {
      const result = this.actions.attachOutsideTmux?.(selected.tmuxSession);
      if (isPromise(result)) void result.catch((error: unknown) => { this.message = `attach failed: ${errorMessage(error)}`; });
    } catch (error) {
      this.message = `attach failed: ${errorMessage(error)}`;
    }
  }

  private moveSelection(delta: number) {
    if (this.viewMode !== "stages") {
      this.controller.move(delta);
      return;
    }
    const rows = this.stageRows();
    if (!rows.length) return;
    const index = Math.max(0, rows.findIndex((row) => row.id === this.controller.snapshot().selectedId));
    const next = rows[(index + delta + rows.length) % rows.length];
    if (next) this.controller.selectSession(next.id);
  }

  private stageRows() {
    const snapshot = this.controller.snapshot();
    const active = orderedSessionRows(snapshot.sessions, snapshot.filter).filter((session) => sessionSection(session) === "active");
    return stageLaneRows(active).flatMap((lane) => lane.rows);
  }

  private toggleViewMode() {
    this.clearPendingRestart();
    this.clearFlash();
    this.message = undefined;
    this.viewMode = this.viewMode === "groups" ? "stages" : "groups";
    if (this.viewMode !== "stages") return;
    const rows = this.stageRows();
    if (rows.length && !rows.some((row) => row.id === this.controller.snapshot().selectedId)) {
      this.controller.selectSession(rows[0]?.id ?? "");
    }
  }

  private reorderSelected(delta: -1 | 1) {
    this.clearPendingRestart();
    this.clearFlash();
    this.message = undefined;
    if (this.viewMode === "stages") {
      this.message = "switch to groups view to reorder";
      return;
    }
    if (this.controller.snapshot().filter !== undefined) {
      this.message = "clear filter to reorder";
      return;
    }
    if (this.controller.selected()?.kind === "subagent") {
      this.message = "subagent rows follow their parent order";
      return;
    }
    const reorder = this.actions.reorderSelected;
    this.runAction(() => reorder ? reorder(delta) : this.controller.reorderSelected(delta), "reordering session...");
  }

  private moveSelectedToBucket(bucket: "backlog" | "archived") {
    const selected = this.controller.selected();
    if (!selected) return;
    if (selected.kind === "subagent") {
      this.message = "subagent rows follow their parent section";
      return;
    }
    this.clearPendingRestart();
    this.clearFlash();
    const action = bucket === "archived" ? this.actions.archiveSession : this.actions.backlogSession;
    this.runAction(() => action ? action(selected.id) : this.controller.moveSessionToBucket(selected.id, bucket), bucket === "archived" ? "archiving session..." : "moving to backlog...");
  }

  private restoreSelectedBucket() {
    const selected = this.controller.selected();
    if (!selected) return;
    if (selected.kind === "subagent") {
      this.message = "subagent rows follow their parent section";
      return;
    }
    if (!selected.bucket) {
      this.message = "session already active";
      return;
    }
    this.clearPendingRestart();
    this.clearFlash();
    this.runAction(() => this.actions.restoreSession ? this.actions.restoreSession(selected.id) : this.controller.restoreSessionBucket(selected.id), "restoring session...");
  }

  private syncPiNameSelected() {
    const selected = this.controller.selected();
    if (!selected) return;
    if (selected.kind === "subagent") {
      this.message = "subagent rows cannot sync Pi names";
      return;
    }
    this.clearPendingRestart();
    this.clearFlash();
    const sync = this.actions.syncPiName ?? ((sessionId: string) => this.controller.syncPiName(sessionId));
    try {
      const result = sync(selected.id);
      const apply = (syncResult: SyncPiNameResult) => { this.message = syncPiNameMessage(syncResult); };
      if (isPromise(result)) {
        this.busy = true;
        this.message = "syncing Pi name...";
        void result.then((syncResult) => {
          this.busy = false;
          apply(syncResult);
        }).catch((error: unknown) => {
          this.busy = false;
          this.message = errorMessage(error);
        });
      } else {
        apply(result);
      }
    } catch (error) {
      this.message = errorMessage(error);
    }
  }

  private restartSelected() {
    this.clearFlash();
    const selected = this.controller.selected();
    if (!selected) return;
    if (selected.kind === "subagent") {
      this.message = "subagent rows cannot be restarted here";
      return;
    }
    this.pendingRestart = { sessionId: selected.id };
    this.message = undefined;
  }

  private confirmRestartSelected(newConversation: boolean) {
    const selected = this.controller.selected();
    if (!selected || this.pendingRestart?.sessionId !== selected.id) return;
    this.pendingRestart = undefined;
    this.message = undefined;
    if (newConversation) {
      if (!this.actions.restartNew) {
        this.message = "new conversation restart unavailable";
        return;
      }
      this.runAction(() => this.actions.restartNew?.(selected.id), "restarting new conversation...");
      return;
    }
    this.runAction(() => this.actions.restart?.(selected.id), "restarting session...");
  }

  private confirmRestartAll() {
    if (!this.pendingRestart) return;
    this.pendingRestart = undefined;
    this.message = undefined;
    if (!this.actions.restartAll) {
      this.message = "restart all unavailable";
      return;
    }
    this.runAction(() => this.actions.restartAll?.(), "restarting all sessions...");
  }

  private startDeleteDialog() {
    this.openDialog(openDeleteDialog);
  }

  private startFinishDialog() {
    this.openDialog(openFinishDialog);
  }

  private clearPendingRestart() {
    const hadPendingRestart = Boolean(this.pendingRestart);
    this.pendingRestart = undefined;
    if (hadPendingRestart) this.message = undefined;
  }

  private flashMessage(text: string, ttlMs = 1_500): void {
    const now = this.actions.now?.() ?? Date.now();
    this.flash = { text, expiresAt: now + ttlMs };
  }

  private clearFlash(): void {
    this.flash = undefined;
  }

  private clearExpiredFlash(): void {
    if (!this.flash) return;
    const now = this.actions.now?.() ?? Date.now();
    if (this.flash.expiresAt <= now) this.flash = undefined;
  }

  private runAction(action: () => unknown, pendingMessage: string, onSuccess?: () => void): void {
    try {
      const result = action();
      if (!isPromise(result)) {
        onSuccess?.();
        return;
      }
      this.busy = true;
      this.message = pendingMessage;
      void result.then(() => {
        this.busy = false;
        onSuccess?.();
        if (this.message === pendingMessage) this.message = undefined;
      }).catch((error: unknown) => {
        this.busy = false;
        this.message = errorMessage(error);
      });
    } catch (error) {
      this.message = errorMessage(error);
    }
  }

}

function syncPiNameMessage(result: SyncPiNameResult): string {
  switch (result.status) {
    case "synced": return `renamed from Pi name: ${result.name}`;
    case "unavailable": return "Pi session file not available yet";
    case "unnamed": return "no Pi name set";
  }
}

function renderHelp(width: number, theme?: SessionsTheme): string[] {
  const heading = (text: string) => theme ? styleToken(theme, "accent", text) : text;
  const lines = [
    heading("pi agent hub help"),
    "",
    heading("Navigation"),
    "  ↑↓/j/k move selection     Enter open/switch     o side pane     / filter",
    "  K/J reorder in group      q quit                Esc cancel/clear",
    "  v toggle groups/stages view",
    "",
    heading("Sessions"),
    "  n new     p send     r restart choices     N sync Pi name     f fork     w finish worktree",
    "  R rename     g move group (Ctrl+N/P cycles groups)     G rename group     d delete     a mark read",
    "  A archive     B backlog     U restore to Active",
    "  Restart choices: r selected     n new conversation     a all     Esc cancel",
    "  Delete choices: d delete/forget     D discard worktree     s close subagents     w finish worktree",
    "",
    heading("New-session form"),
    "  Tab/↑↓ move     Ctrl+O choose repo     Alt+A add repo     Alt+X remove extra     Ctrl+T worktree",
    "",
    heading("Project state"),
    "  s skills picker     m MCP picker     ←→/Tab switch picker columns",
    "",
    heading("Return from managed sessions"),
    "  Ctrl+Q return to dashboard     Alt+R rename current session",
    "",
    heading("Sections and views"),
    "  Active · Backlog · Archived keep project/group headers inside each section",
    "  Archived rows auto-remove after 72h once their tmux session is gone",
    "  Stages view lanes active sessions by workflow step (via the workflow-indicator extension);",
    "  backlog/archived rows are summarized and K/J reorder is groups-view only",
    "",
    heading("Status legend"),
    "  ● running/starting     ◐ waiting     ○ idle     × error     - stopped",
    "  zero counts are hidden in group and top summary",
    "",
    heading("Metadata"),
    "  i toggle compact/full selected-session info",
  ];
  const inner = Math.max(40, width) - 2;
  const border = (text: string) => theme ? styleToken(theme, "border", text) : text;
  return [
    border(`╭${"─".repeat(inner)}╮`),
    ...lines.map((line) => `${border("│")}${padVisibleLine(line, inner)}${border("│")}`),
    border(`╰${"─".repeat(inner)}╯`),
  ];
}

function padVisibleLine(line: string, width: number): string {
  const text = truncateVisible(line, width);
  return `${text}${" ".repeat(Math.max(0, width - stripAnsi(text).length))}`;
}

function replaceFooter(lines: string[], message: string, theme?: SessionsTheme): string[] {
  if (lines.length < 3) return lines;
  const copy = lines.slice();
  const footerIndex = copy.length - 2;
  const width = stripAnsi(copy[footerIndex] ?? "").length;
  const inner = Math.max(0, width - 2);
  const border = (text: string) => theme ? styleToken(theme, "border", text) : text;
  const text = truncateVisible(message, inner);
  copy[footerIndex] = `${border("│")}${text}${" ".repeat(Math.max(0, inner - visibleWidth(text)))}${border("│")}`;
  return copy;
}

function truncateVisible(value: string, width: number): string {
  if (width <= 1) return "";
  return truncateToWidth(value, width, "…");
}
