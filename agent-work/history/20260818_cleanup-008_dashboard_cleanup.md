# Dashboard cleanup

- **Feature:** `cleanup-008`
- **Branch:** `main`
- **Worktree:** none

## Outcome

Preserved dashboard behavior while reducing repeated projection work, tmux probes, side-pane writes, and broad TUI action plumbing.

## Implemented

- Added a pure structural dashboard projection shared by `buildRenderModel()` and `SessionsView` navigation. Cached structural data excludes volatile selection, time, skill, and side-pane overlays.
- Replaced per-session refresh probes with one `tmux list-sessions` presence snapshot. Preserved present, missing, unknown, and no-server semantics, including unknown error text and freshness checks.
- Extended `createSessionTreeIndex()` with cached descendant traversal and reused it for cascade pruning.
- Made side-pane reconciliation change-driven. Pane titles, sidebar titles, binding-state fingerprints, footers, and lifecycle operations now avoid unchanged work while retaining repair and shutdown behavior.
- Added tab-safe pane-title parsing and canonical side-pane result contracts.
- Added grouped dialog capability contexts while retaining the flat action bag only at the composition boundary. Shared async-action and framing helpers reduce duplicate TUI plumbing.
- Updated `docs/STRUCTURE.md` with the projection, tmux snapshot, side-pane, and capability-boundary contracts.
- Marked stale `worktree-setup-003` metadata as superseded.

## Verification

- `npm run typecheck`
- `npm test` — 704 passed
- `git diff --check`
