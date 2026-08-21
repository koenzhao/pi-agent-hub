import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { KIND_ENV, PARENT_ID_ENV, SESSION_ID_ENV, STATE_ENV, WORKTREE_GUIDANCE_ENV } from "../core/names.js";
import { WORKTREE_GUIDANCE_MAX_LENGTH } from "../core/worktree-context.js";
import { sessionsStateDir } from "../core/paths.js";
import { loadThemeCommand } from "../core/theme-command.js";
import { colorFromAnsi } from "../core/theme-color.js";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_STALE_MS } from "../core/status.js";
import { registerMcpTools } from "../mcp/register-tools.js";
import { parseSessionContext } from "../core/session-context.js";
import { writeJsonAtomic } from "../core/atomic-json.js";
import type { ActiveThemeSnapshot, ActiveThemeToken, Heartbeat, SessionPlanSummary, WorkflowActivityDisplay, WorkflowModeDisplay, WorkflowRuntimeSnapshot, WorkflowStep } from "../core/types.js";

type PiTheme = {
  name?: string;
  sourcePath?: string;
  getFgAnsi?: (token: string) => string;
};

type PiContext = {
  cwd: string;
  hasUI?: boolean;
  ui?: {
    theme?: PiTheme;
    getTheme?: (name: string) => Theme | undefined;
    setTheme?: (theme: string | Theme) => unknown;
  };
  sessionManager?: {
    getSessionFile?: () => string | undefined;
    getSessionId?: () => string | undefined;
    getBranch?: () => unknown[] | undefined;
  };
};

const EXTENSION_KEY = Symbol.for("pi-agent-hub.extension.loaded");
type PiAgentHubGlobal = typeof globalThis & { [EXTENSION_KEY]?: true };

// statusLineBg and selectedBg are background tokens Pi's getFgAnsi cannot
// capture; disk theme resolution supplies them instead.
const THEME_TOKENS: Exclude<ActiveThemeToken, "statusLineBg" | "selectedBg">[] = ["accent", "success", "warning", "error", "muted", "dim", "text", "border"];

// Soft contract with rules/extensions/workflow-runtime. Invalid or absent
// base workflow metadata hides the rail; invalid mode decoration is omitted.
const WORKFLOW_RUNTIME_ENTRY = "workflow-runtime";
const SESSION_CONTEXT_ENTRY = "pi-agent-hub-context";
const STARTUP_HEARTBEAT_DELAYS_MS = [250, 1_000, 3_000];
const SETTLED_HEARTBEAT_DELAYS_MS = [1_000, 3_000, 6_000];
const THEME_COMMAND_INTERVAL_MS = 1_000;
const PLAN_TASK_MAX = 10_000;

export default function piAgentHubExtension(pi: ExtensionAPI) {
  const globalState = globalThis as PiAgentHubGlobal;
  if (globalState[EXTENSION_KEY]) return;
  globalState[EXTENSION_KEY] = true;

  const extensionStartedAt = Date.now();
  let currentState: Heartbeat["state"] = "starting";
  let stateSince = extensionStartedAt;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let themeCommandTimer: ReturnType<typeof setInterval> | undefined;
  let startupHeartbeatTimers: ReturnType<typeof setTimeout>[] = [];
  let settledHeartbeatTimers: ReturnType<typeof setTimeout>[] = [];
  let compactionSnapshot: { state: Heartbeat["state"]; stateSince: number } | undefined;
  let compactionWatchdog: ReturnType<typeof setTimeout> | undefined;
  let heartbeatWrite: Promise<void> = Promise.resolve();
  let lastThemeRevision: string | undefined;
  let mcpCleanup: (() => Promise<void>) | undefined;

  async function applyThemeCommand(ctx: PiContext): Promise<boolean> {
    if (!process.env[SESSION_ID_ENV] || process.env.PI_TMUX_SUBAGENTS_JOB_ID || ctx.hasUI === false || !ctx.ui?.getTheme || !ctx.ui.setTheme) return false;
    try {
      const command = await loadThemeCommand();
      if (!command || command.revision === lastThemeRevision) return false;
      lastThemeRevision = command.revision;
      if (command.updatedAt <= extensionStartedAt) return false;
      const theme = ctx.ui.getTheme(command.resolvedTheme);
      if (!theme) return false;
      ctx.ui.setTheme(theme);
      return true;
    } catch {
      return false;
    }
  }

  async function applyThemeAndHeartbeat(state: Heartbeat["state"], ctx: PiContext, message?: string) {
    await applyThemeCommand(ctx);
    await heartbeat(state, ctx, message);
  }

  async function heartbeat(state: Heartbeat["state"], ctx: PiContext, message?: string, stateSinceOverride?: number) {
    // pi-tmux-subagents child bootstrap owns its richer Agent Hub heartbeat.
    if (process.env.PI_TMUX_SUBAGENTS_JOB_ID) return;
    const id = process.env[SESSION_ID_ENV];
    if (!id) return;
    if (state !== currentState || stateSinceOverride !== undefined) {
      currentState = state;
      stateSince = stateSinceOverride ?? Date.now();
    }
    const file = join(process.env[STATE_ENV] ?? sessionsStateDir(), "heartbeats", `${id}.json`);
    const write = heartbeatWrite.then(async () => {
      await writeJsonAtomic(file, {
        managedSessionId: id,
        cwd: ctx.cwd,
        piSessionFile: ctx.sessionManager?.getSessionFile?.(),
        piSessionId: ctx.sessionManager?.getSessionId?.(),
        state,
        stateSince,
        message,
        updatedAt: Date.now(),
        kind: process.env[KIND_ENV] as "subagent" | undefined,
        parentId: process.env[PARENT_ID_ENV],
        agentName: process.env.PI_SUBAGENT_AGENT,
        taskPreview: process.env.PI_SUBAGENT_TASK_PREVIEW,
        resultPath: process.env.PI_SUBAGENT_RESULT_PATH,
        activeTheme: activeTheme(ctx),
        piSessionName: normalizedName(pi.getSessionName?.()),
        context: sessionContextSnapshot(ctx),
        workflow: workflowSnapshot(ctx),
      } satisfies Heartbeat);
    });
    heartbeatWrite = write.catch(() => undefined);
    await write;
  }

  pi.on("before_agent_start", async (event) => {
    if (process.env.PI_TMUX_SUBAGENTS_JOB_ID) return;
    const guidance = process.env[WORKTREE_GUIDANCE_ENV]?.trim();
    if (!guidance || guidance.length > WORKTREE_GUIDANCE_MAX_LENGTH) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${guidance}` };
  });

  pi.on("session_start", async (_event, ctx) => {
    await applyThemeAndHeartbeat("waiting", ctx as PiContext);
    heartbeatTimer = setInterval(() => void heartbeat(currentState, ctx as PiContext), HEARTBEAT_INTERVAL_MS);
    themeCommandTimer = setInterval(() => void applyThemeCommand(ctx as PiContext).then((applied) => applied ? heartbeat(currentState, ctx as PiContext) : undefined), THEME_COMMAND_INTERVAL_MS);
    startupHeartbeatTimers = STARTUP_HEARTBEAT_DELAYS_MS.map((delay) => setTimeout(() => void applyThemeAndHeartbeat(currentState, ctx as PiContext), delay));
    mcpCleanup = await registerMcpTools(pi, (ctx as PiContext).cwd);
  });

  pi.on("session_info_changed", async (_event, ctx) => applyThemeAndHeartbeat(currentState, ctx as PiContext));
  const clearCompaction = () => {
    if (compactionWatchdog) clearTimeout(compactionWatchdog);
    compactionWatchdog = undefined;
    compactionSnapshot = undefined;
  };

  const restoreCompaction = async (ctx: PiContext) => {
    const snapshot = compactionSnapshot;
    clearCompaction();
    if (snapshot) await heartbeat(snapshot.state, ctx, undefined, snapshot.stateSince);
  };

  pi.on("agent_start", async (_event, ctx) => {
    clearCompaction();
    for (const timer of settledHeartbeatTimers) clearTimeout(timer);
    settledHeartbeatTimers = [];
    await applyThemeAndHeartbeat("running", ctx as PiContext);
  });
  pi.on("agent_end", async (_event, ctx) => {
    clearCompaction();
    await applyThemeAndHeartbeat("waiting", ctx as PiContext);
  });
  pi.on("agent_settled", async (_event, ctx) => {
    clearCompaction();
    await applyThemeAndHeartbeat("waiting", ctx as PiContext);
    for (const timer of settledHeartbeatTimers) clearTimeout(timer);
    settledHeartbeatTimers = SETTLED_HEARTBEAT_DELAYS_MS.map((delay) => setTimeout(() => void heartbeat(currentState, ctx as PiContext), delay));
  });
  pi.on("session_before_compact", async (_event, ctx) => {
    if (process.env.PI_TMUX_SUBAGENTS_JOB_ID) return;
    clearCompaction();
    const snapshot = { state: currentState, stateSince };
    compactionSnapshot = snapshot;
    compactionWatchdog = setTimeout(() => {
      if (compactionSnapshot !== snapshot) return;
      void restoreCompaction(ctx as PiContext);
    }, HEARTBEAT_STALE_MS);
    await heartbeat("running", ctx as PiContext, undefined, snapshot.stateSince);
  });
  pi.on("session_compact", async (event, ctx) => {
    if (process.env.PI_TMUX_SUBAGENTS_JOB_ID) return;
    if (event.willRetry) {
      clearCompaction();
      return;
    }
    await restoreCompaction(ctx as PiContext);
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      clearCompaction();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (themeCommandTimer) clearInterval(themeCommandTimer);
      for (const timer of startupHeartbeatTimers) clearTimeout(timer);
      startupHeartbeatTimers = [];
      for (const timer of settledHeartbeatTimers) clearTimeout(timer);
      settledHeartbeatTimers = [];
      await mcpCleanup?.();
      await heartbeat("shutdown", ctx as PiContext);
    } finally {
      delete globalState[EXTENSION_KEY];
    }
  });
}

function workflowSnapshot(ctx: PiContext): WorkflowRuntimeSnapshot | undefined {
  try {
    const entries = ctx.sessionManager?.getBranch?.();
    if (!entries) return undefined;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as { type?: string; customType?: string; data?: unknown } | undefined;
      if (entry?.type !== "custom" || entry.customType !== WORKFLOW_RUNTIME_ENTRY) continue;
      return parseWorkflowSnapshot(entry.data);
    }
  } catch {}
  return undefined;
}

function sessionContextSnapshot(ctx: PiContext) {
  try {
    const entries = ctx.sessionManager?.getBranch?.();
    if (!entries) return undefined;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as { type?: string; customType?: string; data?: unknown } | undefined;
      if (entry?.type !== "custom" || entry.customType !== SESSION_CONTEXT_ENTRY) continue;
      return parseSessionContext(entry.data);
    }
  } catch {}
  return undefined;
}

function parseWorkflowSnapshot(value: unknown): WorkflowRuntimeSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.activeStep !== "string" || !data.activeStep.trim()) return undefined;
  if (typeof data.updatedAt !== "number" || !Number.isFinite(data.updatedAt)) return undefined;
  if (!Array.isArray(data.steps) || !data.steps.length) return undefined;

  const steps: WorkflowStep[] = [];
  const ids = new Set<string>();
  for (const value of data.steps) {
    if (!value || typeof value !== "object") return undefined;
    const step = value as Record<string, unknown>;
    if (typeof step.id !== "string" || typeof step.short !== "string") return undefined;
    const id = step.id.trim();
    const short = step.short.trim();
    if (!id || !short || ids.has(id)) return undefined;
    if (step.label !== undefined && (typeof step.label !== "string" || !step.label.trim())) return undefined;
    ids.add(id);
    steps.push({ id, short, ...(typeof step.label === "string" ? { label: step.label.trim() } : {}) });
  }

  const activeIndex = steps.findIndex((step) => step.id === data.activeStep);
  if (activeIndex < 0) return undefined;
  const ticketId = typeof data.ticketId === "string" ? data.ticketId.trim() : "";
  const currentStepComplete = typeof data.currentStepComplete === "boolean" ? data.currentStepComplete : undefined;
  const activeMode = parseWorkflowMode(data.activeMode);
  const activity = parseWorkflowActivity(data.activity);
  const plan = parseWorkflowPlan(data.plan);
  return {
    steps,
    activeIndex,
    ...(currentStepComplete !== undefined ? { currentStepComplete } : {}),
    ...(activeMode ? { activeMode } : {}),
    ...(activity ? { activity } : {}),
    ...(plan ? { plan } : {}),
    ...(ticketId ? { ticketId } : {}),
    updatedAt: data.updatedAt,
  };
}

function parseWorkflowMode(value: unknown): WorkflowModeDisplay | undefined {
  if (!value || typeof value !== "object") return undefined;
  const mode = value as Record<string, unknown>;
  if (typeof mode.id !== "string" || typeof mode.short !== "string") return undefined;
  const id = mode.id.trim();
  const short = mode.short.trim();
  if (!id || !short) return undefined;
  if (mode.label !== undefined && (typeof mode.label !== "string" || !mode.label.trim())) return undefined;
  if (mode.detail !== undefined && (typeof mode.detail !== "string" || !mode.detail.trim())) return undefined;
  return {
    id,
    short,
    ...(typeof mode.label === "string" ? { label: mode.label.trim() } : {}),
    ...(typeof mode.detail === "string" ? { detail: mode.detail.trim() } : {}),
  };
}

function parseWorkflowActivity(value: unknown): WorkflowActivityDisplay | undefined {
  if (!value || typeof value !== "object") return undefined;
  const activity = value as Record<string, unknown>;
  const id = typeof activity.id === "string" ? activity.id.trim() : "";
  const label = typeof activity.label === "string" ? activity.label.trim() : "";
  if (!id || !label || [...id].length > 80 || [...label].length > 120) return undefined;
  const pass = activity.pass;
  if (pass !== undefined && (!Number.isInteger(pass) || (pass as number) < 1 || (pass as number) > 999)) return undefined;
  return { id, label, ...(typeof pass === "number" ? { pass } : {}) };
}

function parseWorkflowPlan(value: unknown): SessionPlanSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const tasks = parseCount(data.tasks);
  const phase = data.phase && typeof data.phase === "object" ? data.phase as Record<string, unknown> : undefined;
  const title = phase && typeof phase.title === "string" ? phase.title.trim() : "";
  const index = phase?.index;
  const count = phase?.count;
  const parsedPhase = title && positiveInt(index) && positiveInt(count) && index <= count && [...title].length <= 160 ? { title, index, count } : undefined;
  const phases = Array.isArray(data.phases) && data.phases.length <= 100 ? data.phases.map(parseCount) : undefined;
  const parsedPhases = phases?.every(Boolean) ? phases as { completed: number; total: number }[] : undefined;
  const validPhases = parsedPhases && parsedPhases.reduce((sum, item) => sum + item.total, 0) <= PLAN_TASK_MAX
    ? parsedPhases
    : undefined;
  const nextStep = typeof data.nextStep === "string" && data.nextStep.trim() && [...data.nextStep.trim()].length <= 240 ? data.nextStep.trim() : undefined;
  const plan = { ...(parsedPhase ? { phase: parsedPhase } : {}), ...(tasks ? { tasks } : {}), ...(validPhases?.length ? { phases: validPhases } : {}), ...(nextStep ? { nextStep } : {}) };
  return Object.keys(plan).length ? plan : undefined;
}

function parseCount(value: unknown): { completed: number; total: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const count = value as Record<string, unknown>;
  return nonnegativeInt(count.completed) && nonnegativeInt(count.total) && count.completed <= count.total ? { completed: count.completed, total: count.total } : undefined;
}

function positiveInt(value: unknown): value is number { return Number.isInteger(value) && (value as number) > 0 && (value as number) <= 100; }
function nonnegativeInt(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= PLAN_TASK_MAX; }
function normalizedName(value: string | undefined): string | undefined { return value?.trim() || undefined; }

function activeTheme(ctx: PiContext): ActiveThemeSnapshot | undefined {
  if (ctx.hasUI === false) return undefined;
  let theme: PiTheme | undefined;
  try {
    theme = ctx.ui?.theme;
  } catch {
    return undefined;
  }
  if (!theme) return undefined;
  const tokens = activeThemeTokens(theme);
  const snapshot: ActiveThemeSnapshot = {
    name: theme.name,
    sourcePath: theme.sourcePath,
    tokens: Object.keys(tokens).length ? tokens : undefined,
  };
  return snapshot.name || snapshot.sourcePath || snapshot.tokens ? snapshot : undefined;
}

function activeThemeTokens(theme: PiTheme): NonNullable<ActiveThemeSnapshot["tokens"]> {
  const tokens: NonNullable<ActiveThemeSnapshot["tokens"]> = {};
  for (const token of THEME_TOKENS) {
    const value = themeToken(theme, token);
    if (value !== undefined) tokens[token] = value;
  }
  return tokens;
}

function themeToken(theme: PiTheme, token: Exclude<ActiveThemeToken, "statusLineBg">): string | number | undefined {
  try {
    const ansi = theme.getFgAnsi?.(token);
    return ansi ? colorFromAnsi(ansi) : undefined;
  } catch {
    return undefined;
  }
}
