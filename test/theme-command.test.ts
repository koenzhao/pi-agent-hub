import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadThemeCommand, publishThemeCommand, themeCommandPath } from "../src/core/theme-command.js";

test("theme command publication atomically replaces the latest command", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-theme-command-"));
  const env = { PI_AGENT_HUB_DIR: root };
  const first = await publishThemeCommand("light/dark", "dark", env, { now: 100, revision: "one" });
  const second = await publishThemeCommand("light", "light", env, { now: 200, revision: "two" });

  assert.equal(first.revision, "one");
  assert.deepEqual(second, { version: 1, revision: "two", themeSetting: "light", resolvedTheme: "light", updatedAt: 200 });
  assert.deepEqual(await loadThemeCommand(env), second);
  assert.equal(themeCommandPath(env), join(root, "theme-command.json"));
});

test("theme command loading treats missing as empty and rejects malformed state", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-theme-command-"));
  const env = { PI_AGENT_HUB_DIR: root };
  assert.equal(await loadThemeCommand(env), undefined);

  for (const value of [
    {},
    { version: 2, revision: "r", themeSetting: "dark", resolvedTheme: "dark", updatedAt: 1 },
    { version: 1, revision: "", themeSetting: "dark", resolvedTheme: "dark", updatedAt: 1 },
    { version: 1, revision: "r", themeSetting: "broken/", resolvedTheme: "dark", updatedAt: 1 },
    { version: 1, revision: "r", themeSetting: "dark", resolvedTheme: "light/dark", updatedAt: 1 },
    { version: 1, revision: "r", themeSetting: "dark", resolvedTheme: "dark", updatedAt: Number.NaN },
  ]) {
    await writeFile(themeCommandPath(env), JSON.stringify(value), "utf8");
    await assert.rejects(() => loadThemeCommand(env), /Invalid theme command/);
  }
});
