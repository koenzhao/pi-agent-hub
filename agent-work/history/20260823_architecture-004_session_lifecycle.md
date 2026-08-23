**Feature:** architecture-004 → Session lifecycle
**Session:** 01a026fc-46e5-7d39-aa04-769f5e17ee10
**Branch:** main
**Completed:** 2026-08-23

# Session lifecycle

## Outcome

Centralized managed-session lifecycle orchestration in `src/app/session-lifecycle.ts`. The module now owns add, start, stop, restart, fresh restart, fork, delete, subagent cleanup, worktree finish/discard, rollback, and partial-failure recovery.

The refactor preserved registry data, CLI/TUI behavior, Pi launch behavior, subagent cascade semantics, worktree safety, cleanup ordering, and concurrent latest-state registry mutations. Lifecycle failures now include operation and resource context without introducing a new error hierarchy.

## Final structure

- `src/app/session-lifecycle.ts` is the implementation seam for managed-session lifecycle operations.
- `src/app/delete-session.ts` remains the explicit safety entry module for delete and subagent-cleanup flows.
- `src/app/worktree-session.ts` remains the explicit safety entry module for worktree finish/discard flows.
- `src/app/session-commands.ts` retains rename and status-bar helpers and re-exports the shared Pi command builder for compatibility.
- `src/cli.ts` and `src/app/run-tui.ts` use the central lifecycle module while preserving the required delete/worktree entry paths.
- Core tmux, Git, registry, workspace, path, and session-tree modules remain lower-level adapters.

## Preserved contracts

- External tmux, filesystem, workspace, heartbeat, theme, and Git work stays outside `updateRegistry()` callbacks.
- Registry callbacks remain short, synchronous latest-state transformations.
- `removeSessions(sessions, path, env)` still kills prepared tmux sessions, removes prepared workspaces, filters only prepared IDs from the latest registry, and then removes heartbeats while ignoring only `ENOENT`.
- Worktree finish/discard preflights Git state before stopping tmux and processes additional repositories before the primary repository.
- Normal delete does not remove Hub-owned worktree directories or Pi conversation files.
- Partial worktree failures remain `PartialWorktreeFailure` instances with `finished` and `remaining` recovery fields, while their messages identify the lifecycle operation.
- Composed lifecycle operations call internal implementations so errors receive context only at the outer public boundary.

## Tests and documentation

Focused lifecycle, delete, and worktree tests cover operation routing, contextual errors, prepared-ID cleanup, latest-row start commits, and partial-worktree recovery. `docs/STRUCTURE.md` documents lifecycle ownership, safety entry modules, cleanup ordering, and the registry-lock boundary.

Verification completed:

- `npm run typecheck`
- `npm test` — 716 tests passed
- `npm run package:check`
- `git diff --check`
- Code critic final result: `LGTM`

## Deferred work

- Split `SessionsController.refresh()` observation, projection, and persistence responsibilities.
- Split `src/core/tmux.ts` by lifecycle, pane, chrome, and return-binding concerns.
- Add cross-resource crash recovery or retry policy only if observed failures justify it.
