# split-view-002 — Sidebar workspace v2: stacked side panes

## Summary

Implemented two stateless Hub-owned side panes beside the dashboard sidebar. `o` targets the visually top content pane, `O` targets the visually bottom content pane, either key opens the first pane when none exists, `O` splits a single content pane vertically, and pressing either key on a session already visible in any side pane closes that pane so a session is never shown twice in the dashboard window.

The sidebar workspace remains tmux-native and registry-free. Hub discovers content panes live from the dashboard window, owns only panes whose tty maps to a nested client attached to a `pi-agent-hub-*` session, derives top/bottom slots from `#{pane_top}`, and leaves user-created panes untouched. Native tmux keys continue to handle focus, zoom, pane close, and pane swaps. `Enter` full-screen behavior remains unchanged and closes only a side pane showing the target session first to avoid tmux size flapping.

A quit-cleanup bug was fixed in the same reviewed work: dashboard `q` now closes all Hub-owned side panes before stopping the TUI, preventing nested attach panes from being stranded while preserving user panes.

## Changed areas

- `src/core/tmux.ts`: extended `listWindowPanes()` with `pane_top`; added `splitPaneBelowAttach()`.
- `src/app/side-pane.ts`: added slot-aware open/retarget/toggle logic, multi-pane discovery, full-screen close lookup, and all-owned-pane quit cleanup.
- `src/tui/dialog.ts`, `src/tui/sessions-view.ts`, `src/app/run-tui.ts`: threaded `top`/`bottom` slot actions and wired `o`/`O`.
- `src/core/dashboard-shortcuts.ts`: reserved `O` as a built-in dashboard key.
- `src/tui/render-model.ts`, `docs/FEATURES.md`, `docs/STRUCTURE.md`, `README.md`, `AGENTS.md`: updated user/developer guidance for the stacked side-pane model and cleanup behavior.
- Tests updated for tmux parsing, side-pane decision table, quit cleanup, shortcut conflicts, footer/help text, and TUI key dispatch.

## Follow-up

- `split-view-003` tracks a polish request to show which sessions are currently rendered in top/bottom side panes from live tmux state.

## Validation

- `npm run typecheck` passed before and after implementation.
- `npm test` passed after stacked-pane work: 454 passing.
- `npm test` passed after quit-cleanup fix: 457 passing.
- `git diff --check` clean.
- Local tmux smoke passed for stacked side-pane open/retarget/toggle/close behavior with no temporary sessions left behind.
- Local tmux smoke passed for quit cleanup: only Hub-owned side panes were closed and no temporary sessions remained.
- Review and docs-review subagents returned LGTM.
