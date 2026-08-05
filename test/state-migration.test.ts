import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupRetiredSessionMetadata } from "../src/app/state-migration.js";

async function missing(path: string): Promise<boolean> {
  try { await access(path); return false; } catch { return true; }
}

test("startup migration removes retired latest sidecars without touching debug history", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-agent-hub-migration-"));
  const env = { PI_AGENT_HUB_DIR: root } as NodeJS.ProcessEnv;
  const latestDir = join(root, "session-metadata");
  const debugDir = join(root, "metadata-history");
  await mkdir(latestDir, { recursive: true });
  await mkdir(debugDir, { recursive: true });
  await writeFile(join(latestDir, "session.json"), "{}", "utf8");
  await writeFile(join(debugDir, "session.jsonl"), "debug\n", "utf8");

  await cleanupRetiredSessionMetadata(env);
  await cleanupRetiredSessionMetadata(env);

  assert.equal(await missing(latestDir), true);
  assert.equal(await readFile(join(debugDir, "session.jsonl"), "utf8"), "debug\n");
});
