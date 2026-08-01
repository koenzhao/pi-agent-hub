import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { isErrno, readJson, writeJsonAtomic } from "./atomic-json.js";
import { sessionsStateDir } from "./paths.js";

export interface ThemeCommand {
  version: 1;
  revision: string;
  themeSetting: string;
  resolvedTheme: string;
  updatedAt: number;
}

export function themeCommandPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(sessionsStateDir(env), "theme-command.json");
}

export async function loadThemeCommand(env: NodeJS.ProcessEnv = process.env): Promise<ThemeCommand | undefined> {
  try {
    return parseThemeCommand(await readJson<unknown>(themeCommandPath(env)));
  } catch (error) {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  }
}

export async function publishThemeCommand(
  themeSetting: string,
  resolvedTheme: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: number; revision?: string } = {},
): Promise<ThemeCommand> {
  const command = parseThemeCommand({
    version: 1,
    revision: options.revision ?? randomUUID(),
    themeSetting,
    resolvedTheme,
    updatedAt: options.now ?? Date.now(),
  });
  await writeJsonAtomic(themeCommandPath(env), command);
  return command;
}

function parseThemeCommand(value: unknown): ThemeCommand {
  if (!isPlainObject(value)
    || value.version !== 1
    || typeof value.revision !== "string" || !value.revision.trim()
    || typeof value.themeSetting !== "string" || !validSetting(value.themeSetting)
    || typeof value.resolvedTheme !== "string" || !value.resolvedTheme.trim() || value.resolvedTheme.includes("/")
    || typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt) || value.updatedAt < 0) {
    throw new Error("Invalid theme command");
  }
  return {
    version: 1,
    revision: value.revision.trim(),
    themeSetting: value.themeSetting.trim(),
    resolvedTheme: value.resolvedTheme.trim(),
    updatedAt: value.updatedAt,
  };
}

function validSetting(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const parts = trimmed.split("/");
  return parts.length === 1 || (parts.length === 2 && parts.every((part) => Boolean(part.trim())));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
