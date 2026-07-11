# Sidebar Panel UX Refinements

**Feature:** split-view-008
**Completed:** 2026-07-10

## Outcome

Refined the stateless tmux sidebar workspace into a four-slot workflow:

- `1`–`4` assign, replace, move, or close side panels; requests beyond the next available slot auto-append.
- Successful assignment focuses the actual landed panel. Close, narrow-width refusal, and `o` reset remain sidebar-focused.
- `Shift+1`–`Shift+4` and layout-neutral `F` then `1`–`4` focus existing panels without reassignment.
- `Ctrl+Q` returns from a focused panel to the sidebar through a guarded, restored tmux root binding.
- Rows show live `◫1`–`◫4` slot indicators and pane borders show matching numbered titles.
- Layout growth is refused when resulting panels would be narrower than 40 columns.
- A single sidebar click selects; a same-row double-click within 400 ms opens, switches, or restarts.

Canonical layouts remain computed from live tmux state rather than persisted in the registry: one full pane, two stacked panes, a three-pane main-left layout, and a 2×2 grid.

## Implementation

- `src/app/side-pane.ts`: slot clamping, canonical rebuilds, width guard, pane focus/titles, reset behavior, and visual ordering.
- `src/app/run-tui.ts`: ordered presence state, serialized inspection/mutation/focus, pane chrome, binding lifecycle, and race-safe shutdown/full-screen handoff.
- `src/core/tmux.ts`: pane geometry parsing, directional split helpers, pane title/border helpers, and guarded sidebar-return binding state.
- `src/tui/sessions-view.ts`: panel shortcuts, focus chord, result messages, and single-select/double-click mouse behavior.
- `src/tui/dialog.ts`, `src/tui/render-model.ts`, `src/tui/layout.ts`, and `src/core/dashboard-shortcuts.ts`: typed action results, numbered indicators, footer/help text, and reserved keys.
- `src/cli.ts`: sidebar-return state in `pi-hub doctor`.

The side-pane presence loop and all panel operations share one queue. Full-screen switching stops and drains polling before entering the serialized operation, preventing inspection, rebuild, focus, and shutdown races.

## Durable Decisions

- Panel slots are derived from live pane geometry and nested client tty mappings; no panel records are persisted.
- Out-of-sequence requests append instead of failing.
- Panel assignment is a direct select-to-work action; `Ctrl+Q` provides the return loop.
- The guarded sidebar binding yields to the existing full-screen return binding and restores the user's previous key binding.
- Mouse double-click state is bounded to one row and cancelled by timeout, keyboard, wheel, non-row input, or a different row.

## Verification

- `npm test`: 529 tests passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- Isolated real-tmux smoke passed auto-append, width refusal, four-slot ordering/titles, assignment focus, sidebar-focused close/guard/reset, `Ctrl+Q`, and previous-binding restoration.
- SessionsView interaction smoke passed realistic SGR press/release, timeout/cancellation, different-row, restart, and triple-click behavior.
- Final code and documentation critics reported no remaining blocking findings.
