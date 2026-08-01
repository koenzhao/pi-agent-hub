import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { readJsonOr, writeJsonAtomic } from "./atomic-json.js";
import { validateDashboardShortcuts, type DashboardShortcut } from "./dashboard-shortcuts.js";
import { sessionsStateDir } from "./paths.js";

export interface SessionsConfig {
  version: 1;
  skills?: {
    poolDirs?: string[];
  };
  mcp?: {
    catalogPath?: string;
  };
  session?: {
    prelude?: string;
    worktreeDefault?: boolean;
  };
  dashboard?: {
    themeSync?: boolean;
    theme?: string;
    shortcuts?: DashboardShortcut[];
  };
}

export interface DashboardThemePreference {
  syncPi: boolean;
  theme?: string;
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(sessionsStateDir(env), "config.json");
}

export async function loadSessionsConfig(env: NodeJS.ProcessEnv = process.env): Promise<SessionsConfig> {
  const config = await readJsonOr<SessionsConfig>(configPath(env), { version: 1 });
  validateConfig(config);
  return config;
}

export async function effectiveSkillPoolDirs(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const config = await loadSessionsConfig(env);
  const dirs = config.skills?.poolDirs?.filter((dir) => dir.trim());
  return (dirs?.length ? dirs : [join(sessionsStateDir(env), "skills", "pool")]).map((dir) => expandPath(dir));
}

export async function effectiveMcpCatalogPath(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const config = await loadSessionsConfig(env);
  return expandPath(config.mcp?.catalogPath || join(sessionsStateDir(env), "mcp.json"));
}

export async function effectiveSessionPrelude(env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const prelude = (await loadSessionsConfig(env)).session?.prelude?.trim();
  return prelude || undefined;
}

export async function effectiveWorktreeDefault(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return (await loadSessionsConfig(env)).session?.worktreeDefault ?? false;
}

export async function effectiveDashboardThemePreference(env: NodeJS.ProcessEnv = process.env): Promise<DashboardThemePreference> {
  const dashboard = (await loadSessionsConfig(env)).dashboard;
  const syncPi = dashboard?.themeSync ?? true;
  const theme = dashboard?.theme?.trim();
  return { syncPi, ...(theme ? { theme } : {}) };
}

export async function effectiveDashboardShortcuts(env: NodeJS.ProcessEnv = process.env): Promise<DashboardShortcut[]> {
  return validateDashboardShortcuts((await loadSessionsConfig(env)).dashboard?.shortcuts);
}

export async function setSkillPoolDirs(poolDirs: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const cleaned = poolDirs.map((dir) => dir.trim()).filter(Boolean);
  if (!cleaned.length) throw new Error("skill pool dir cannot be blank");
  const config = await loadSessionsConfig(env);
  await writeJsonAtomic(configPath(env), { ...config, skills: { ...config.skills, poolDirs: cleaned } });
}

export async function setSessionPrelude(prelude: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const trimmed = prelude.trim();
  if (!trimmed) throw new Error("session-prelude cannot be blank");
  const config = await loadSessionsConfig(env);
  await writeJsonAtomic(configPath(env), { ...config, session: { ...config.session, prelude: trimmed } });
}

type SessionConfigKey = keyof NonNullable<SessionsConfig["session"]>;

function withoutSessionProperty(config: SessionsConfig, key: SessionConfigKey): SessionsConfig {
  const next: SessionsConfig = { ...config, session: config.session ? { ...config.session } : undefined };
  if (next.session) {
    delete next.session[key];
    if (!Object.keys(next.session).length) delete next.session;
  }
  return next;
}

export async function unsetSessionPrelude(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = await loadSessionsConfig(env);
  await writeJsonAtomic(configPath(env), withoutSessionProperty(config, "prelude"));
}

export async function setWorktreeDefault(enabled: boolean, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = await loadSessionsConfig(env);
  await writeJsonAtomic(configPath(env), { ...config, session: { ...config.session, worktreeDefault: enabled } });
}

export async function unsetWorktreeDefault(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = await loadSessionsConfig(env);
  await writeJsonAtomic(configPath(env), withoutSessionProperty(config, "worktreeDefault"));
}

export async function setDashboardThemePreference(preference: DashboardThemePreference, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const theme = preference.theme?.trim();
  if (!preference.syncPi && !theme) throw new Error("dashboard theme cannot be blank");
  const config = await loadSessionsConfig(env);
  const dashboard = { ...config.dashboard } as NonNullable<SessionsConfig["dashboard"]> & { themeSessionId?: unknown };
  delete dashboard.themeSessionId;
  dashboard.themeSync = preference.syncPi;
  if (preference.syncPi) delete dashboard.theme;
  else dashboard.theme = theme;
  await writeJsonAtomic(configPath(env), { ...config, dashboard });
}

function validateConfig(config: SessionsConfig): void {
  if (config.version !== 1) throw new Error("Invalid pi-agent-hub config version");
  if (config.skills?.poolDirs && !Array.isArray(config.skills.poolDirs)) throw new Error("Invalid skills.poolDirs in pi-agent-hub config");
  if (config.skills?.poolDirs?.some((dir) => typeof dir !== "string")) throw new Error("Invalid skills.poolDirs in pi-agent-hub config");
  if (config.mcp?.catalogPath !== undefined && typeof config.mcp.catalogPath !== "string") throw new Error("Invalid mcp.catalogPath in pi-agent-hub config");
  if (config.session !== undefined && !isPlainObject(config.session)) throw new Error("Invalid session config in pi-agent-hub config");
  if (config.session?.prelude !== undefined && typeof config.session.prelude !== "string") throw new Error("Invalid session.prelude in pi-agent-hub config");
  if (config.session?.worktreeDefault !== undefined && typeof config.session.worktreeDefault !== "boolean") throw new Error("Invalid session.worktreeDefault in pi-agent-hub config");
  if (config.dashboard !== undefined && !isPlainObject(config.dashboard)) throw new Error("Invalid dashboard config in pi-agent-hub config");
  if (config.dashboard?.themeSync !== undefined && typeof config.dashboard.themeSync !== "boolean") throw new Error("Invalid dashboard.themeSync in pi-agent-hub config");
  if (config.dashboard?.theme !== undefined && typeof config.dashboard.theme !== "string") throw new Error("Invalid dashboard.theme in pi-agent-hub config");
  validateDashboardShortcuts(config.dashboard?.shortcuts);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expandPath(path: string): string {
  const expanded = path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}
