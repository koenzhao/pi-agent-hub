# app-seams-001 — Close tmux seam and test registry mutation orchestration

## Summary

Closed the remaining tmux attach/switch seams by routing attach argv, switch-client calls, and shell quoting through `src/core/tmux.ts`. Extracted the dashboard registry mutation queue into a small dependency-injected factory with tests, and centralized managed-session theme resolution in `src/tui/theme.ts`.

## Implemented

- Added `switchClient`, `attachSessionCommand`, and exported `shellQuote` from `src/core/tmux.ts`.
- Rewired app attach/switch call sites in `src/app/dashboard.ts`, `src/app/actions.ts`, and `src/app/run-tui.ts` to use tmux helpers.
- Removed the duplicate private `shellQuote` from `src/app/session-commands.ts`.
- Added `createRegistryMutator()` in `src/app/run-tui.ts` to serialize registry mutations while pausing and resuming the refresh loop safely.
- Added `loadManagedSessionTheme()` in `src/tui/theme.ts` and replaced duplicate managed-theme fallback logic in run-tui and session commands.
- Added tests for tmux helper argv/quoting, registry mutator ordering/serialization/failure behavior, and managed-session theme resolution.

## Validation

- `npm test` passed: 432 tests.
- `git diff --check` passed.
- Final artifact scan found no temporary tests, debug residue, or scratch files requiring cleanup.

## Discovered Work

None.
