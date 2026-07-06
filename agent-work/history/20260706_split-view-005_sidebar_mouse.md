# split-view-005 — Sidebar mouse support

## Summary

Added additive mouse support to the dashboard sidebar workspace. The dashboard now consumes SGR mouse input so clicking a sidebar row selects it, clicking the already-selected row runs the existing `o` side-pane action, and wheel events move selection. Mouse input is intentionally ignored while dialogs or busy actions are active, with restart choices treating press as dismissal and wheel as no-op.

## Implementation

- Added `src/tui/mouse.ts` with SGR mouse enable/disable constants, sequence recognition, and parsing for left presses and wheel events.
- Changed `renderSessions()` to return a layout object with rendered lines, a row-to-session hit map, and list-column width for precise sidebar hit testing.
- Updated `SessionsView` to store the latest hit map, consume mouse sequences before dialog/text-input dispatch, and route clicks/wheel to existing selection and side-pane behavior.
- Added `setDashboardMouse()` in `src/core/tmux.ts` and wired `runTui()` to enable terminal SGR reporting plus dashboard-session-scoped tmux mouse mode, then disable/unset both on quit.
- Documented the final behavior in `README.md`, `docs/FEATURES.md`, and `docs/STRUCTURE.md`.

## Validation

- Baseline `npm run typecheck` passed before implementation.
- Targeted build/test passes covered `mouse`, `render-model`, `theme`, `sessions-view`, and `tmux` tests during each phase.
- Final validation passed: `npm run typecheck`, `npm test` (483 tests), and `git diff --check`.
- Functional parent-side tmux smoke passed in an isolated server: dashboard `mouse` option enabled, click selection worked, wheel moved selection, selected-row click triggered side-pane behavior, rename prompt consumed mouse input without garbage, and the dashboard mouse override was unset on quit.

## Discovered work

None.
