# cleanup-009: Registry write guard

## Goal

Stop rewriting `registry.json` when its persisted session data is unchanged, while preserving locking, atomic writes, concurrent updates, refresh behavior, and UI behavior.

## Implemented

- Added an optional JSON snapshot comparison to `updateStore()` and enabled it only for the registry.
- Kept unchanged registry updates inside the existing lock without an atomic rewrite.
- Added monotonic `updatedAt` versions for real row changes.
- Removed timestamp churn from stable refreshes and already-satisfied actions.
- Made refresh observations require matching session id, tmux target, and row version.
- Preserved same-target runtime metadata during conflicts and cleared metadata for retargeted, removed, or pruned rows.
- Covered Pi-name refresh changes, workspace updates, ordering, buckets, lifecycle actions, and partial worktree recovery.
- Documented persistence and refresh contracts in `docs/STRUCTURE.md`.

## Verification

- Typecheck passed.
- Full test suite passed: 716 tests.
- `git diff --check` passed.
- Code review and second critic pass returned LGTM.
