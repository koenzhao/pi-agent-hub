# worktree-setup-002 — Worktree agent guidance

**Completed:** 2026-08-01

**Repositories:** `pi-agent-hub`, `pi-tmux-subagents`

## Outcome

Managed agents now receive a complete mapping from each Hub-owned Git worktree to its original repository. The guidance covers single- and multi-repo parent sessions, child agents, and enabled nested subagents without writing generated files into single-repo worktrees or coupling the two packages.

Agents are instructed to:

- make task and setup changes only in worktrees;
- avoid modifying original repositories;
- inspect original repositories when required local configuration is missing;
- copy only required local files into the matching worktree; and
- avoid copying secrets unless the task requires them.

## Implementation

### `pi-agent-hub`

- Added `src/core/worktree-context.ts` to derive guidance from canonical `ManagedSession` worktree metadata.
- Reused `sessionWorktrees()` for current `worktrees[]` and legacy scalar metadata.
- Required explicit Hub ownership, exactly one primary mapping, valid roles, complete nonblank fields, bounded counts and field lengths, no control characters, and final output no longer than 8,192 characters.
- `startManagedSession()` supplies the same rendered text through:
  - `PI_AGENT_HUB_WORKTREE_GUIDANCE` for the managed parent extension;
  - `PI_TMUX_SUBAGENTS_SYSTEM_PROMPT_APPEND` for optional child inheritance.
- The Hub extension appends valid guidance through `before_agent_start` for parent turns. It skips `pi-tmux-subagents` child processes because their prompt file already contains the appendix.
- Generated multi-repo `AGENTS.md` files include the validated runtime-to-source mapping before embedded repository instructions. Single-repo worktrees remain untouched.

### `pi-tmux-subagents`

- Added the optional `PI_TMUX_SUBAGENTS_SYSTEM_PROMPT_APPEND` boundary with the same 8,192-character limit.
- Child prompt generation trims, bounds, and appends the opaque value after normal child instructions.
- Child launches forward the accepted value in their explicit environment, so enabled nested launches inherit it.
- The package does not parse Hub data, load Hub state, or depend on `pi-agent-hub`; absent guidance preserves normal standalone behavior.

## Review fixes

- Whitespace-only worktree fields now fail closed.
- Subagent launch tests clear and restore the generic prompt-append environment so absence assertions do not depend on the caller environment.
- Code critic re-review returned `LGTM`.
- Documentation critic feedback tightened inheritance and worktree-change wording.

## Verification

- `pi-agent-hub`: typecheck passed; full suite passed with 679 tests.
- `pi-tmux-subagents`: TypeScript no-emit check passed; full suite passed with 104 tests.
- Post-review focused compiled tests passed: Hub 6/6 and subagents 24/24.
- `git diff --check` passed in both repositories.

## Durable documentation

Updated:

- `docs/FEATURES.md`
- `docs/STRUCTURE.md`
- `pi-tmux-subagents/docs/STRUCTURE.md`
