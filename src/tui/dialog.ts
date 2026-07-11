import type { SessionsController, SyncPiNameResult } from "../app/controller.js";
import type { DashboardShortcut } from "../core/dashboard-shortcuts.js";
import type { ManagedSession } from "../core/types.js";
import type { NewFormContext, NewFormSubmission } from "./new-form.js";
import type { PickerItem } from "./two-column-picker.js";
import type { SessionsTheme } from "./theme.js";
import type { PromptDialog } from "./prompt-dialog.js";
import type { FormDialog } from "./form-dialogs.js";
import type { ConfirmDialog } from "./confirm-dialogs.js";
import type { PickerDialog } from "./picker-dialog.js";
import type { NewSessionDialog, RepoPickerDialog } from "./new-session-dialog.js";

export interface SessionDialogInput {
  title: string;
  cwd?: string;
  group: string;
  additionalCwds?: string[];
  worktree?: { branch: string };
}

export type SidePaneActionResult =
  | { kind: "opened"; slot: 1 | 2 | 3 | 4 }
  | { kind: "retargeted"; slot: 1 | 2 | 3 | 4 }
  | { kind: "closed" }
  | { kind: "too-narrow"; panels: number };
export type FocusSidePaneResult = { kind: "focused" } | { kind: "unavailable" };

export interface SessionsViewActions {
  attachOutsideTmux?: (tmuxSession: string) => void | Promise<void>;
  switchInsideTmux?: (tmuxSession: string) => void | Promise<void>;
  toggleSidePaneSlot?: (sessionId: string, slot: 1 | 2 | 3 | 4) => SidePaneActionResult | Promise<SidePaneActionResult>;
  resetSidePane?: (sessionId: string) => SidePaneActionResult | Promise<SidePaneActionResult>;
  focusSidePaneSlot?: (slot: 1 | 2 | 3 | 4) => FocusSidePaneResult | Promise<FocusSidePaneResult>;
  sidePaneSessionIds?: () => ReadonlyMap<string, number>;
  restart?: (sessionId: string) => unknown;
  restartNew?: (sessionId: string) => unknown;
  restartAll?: () => unknown;
  deleteSession?: (sessionId: string) => void | Promise<void>;
  closeSubagents?: (sessionId: string) => void | Promise<void>;
  discardWorktree?: (sessionId: string) => void | Promise<void>;
  finishWorktree?: (sessionId: string) => void | Promise<void>;
  createSession?: (input: NewFormSubmission) => unknown;
  forkSession?: (sourceSessionId: string, input: Omit<SessionDialogInput, "cwd">) => unknown;
  changeGroup?: (sessionId: string, group: string) => unknown;
  archiveSession?: (sessionId: string) => unknown;
  backlogSession?: (sessionId: string) => unknown;
  restoreSession?: (sessionId: string) => unknown;
  renameSession?: (sessionId: string, title: string) => unknown;
  syncPiName?: (sessionId: string) => SyncPiNameResult | Promise<SyncPiNameResult>;
  renameGroup?: (from: string, to: string) => unknown;
  reorderSelected?: (delta: -1 | 1) => unknown;
  acknowledge?: () => unknown;
  newFormContext?: () => NewFormContext;
  skills?: () => PickerItem[] | Promise<PickerItem[]>;
  applySkills?: (items: PickerItem[]) => void | Promise<void>;
  skillPoolDir?: () => string | undefined;
  skillPoolDirExtraCount?: () => number;
  saveSkillPoolDir?: (dir: string) => PickerItem[] | Promise<PickerItem[]>;
  mcpServers?: () => PickerItem[] | Promise<PickerItem[]>;
  applyMcpServers?: (items: PickerItem[]) => void | Promise<void>;
  sendMessage?: (tmuxSession: string, message: string) => unknown;
  dashboardShortcuts?: readonly DashboardShortcut[];
  runDashboardShortcut?: (sessionId: string, shortcut: DashboardShortcut) => unknown;
  copy?: (text: string) => void;
  skillCount?: (cwd: string) => number | undefined;
  now?: () => number;
  terminalRows?: () => number;
}

export type SessionDialog = { kind: "help" } | PromptDialog | FormDialog | ConfirmDialog | PickerDialog | NewSessionDialog | RepoPickerDialog;

export interface DialogContext {
  controller: SessionsController;
  actions: SessionsViewActions;
  theme: SessionsTheme | undefined;
  now(): number;
  close(): void;
  setDialog(dialog: SessionDialog): void;
  dialog(): SessionDialog | undefined;
  setMessage(message: string | undefined): void;
  message(): string | undefined;
  flashMessage(text: string): void;
  runAction(action: () => unknown, pending: string, onSuccess?: () => void): void;
  attachSession(session: ManagedSession): void;
  stop(): void;
}

export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
