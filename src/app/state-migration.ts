import { rm } from "node:fs/promises";
import { sessionMetadataDir } from "../core/paths.js";

/** Removes the retired latest-snapshot sidecar transport. Debug history is separate and user-owned. */
export async function cleanupRetiredSessionMetadata(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await rm(sessionMetadataDir(env), { recursive: true, force: true });
}
