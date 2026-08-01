import { sessionWorktrees } from "./worktree.js";
import type { ManagedSession, ManagedWorktree } from "./types.js";

export const WORKTREE_GUIDANCE_MAX_LENGTH = 8_192;
const MAX_WORKTREES = 16;
const MAX_FIELD_LENGTH = 2_048;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;

export function renderWorktreeGuidance(session: ManagedSession): string | undefined {
  if (session.worktreeOwnedByHub !== true) return undefined;
  const worktrees = sessionWorktrees(session);
  if (!validWorktrees(worktrees)) return undefined;

  const ordered = [worktrees.find((item) => item.role === "primary")!, ...worktrees.filter((item) => item.role === "additional")];
  const guidance = [
    "## pi-agent-hub worktree context",
    "",
    "This session runs in Hub-owned Git worktree(s), not the original checkout.",
    ...ordered.flatMap((worktree) => [
      `- ${worktree.role === "primary" ? "Primary" : "Additional"} worktree: ${worktree.path}`,
      `  Original repository: ${worktree.repoRoot}`,
      `  Branch: ${worktree.branch} (based on ${worktree.baseBranch})`,
    ]),
    "",
    "Work in the worktree paths. Do not modify the original repositories for task work or setup.",
    "If required local configuration is missing, you may inspect the original repository for untracked local files such as `.env*` and copy only the required files into the corresponding worktree.",
    "Do not copy secrets unless the task requires them.",
  ].join("\n");

  return guidance.length <= WORKTREE_GUIDANCE_MAX_LENGTH ? guidance : undefined;
}

function validWorktrees(worktrees: ManagedWorktree[]): boolean {
  if (!worktrees.length || worktrees.length > MAX_WORKTREES) return false;
  if (worktrees.filter((item) => item.role === "primary").length !== 1) return false;
  return worktrees.every((item) =>
    (item.role === "primary" || item.role === "additional")
    && validField(item.path)
    && validField(item.repoRoot)
    && validField(item.branch)
    && validField(item.baseBranch));
}

function validField(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= MAX_FIELD_LENGTH
    && !CONTROL_CHARACTER.test(value);
}
