# split-view-004 — Hide duplicate dashboard status bar

Implemented session-scoped dashboard tmux status suppression for sidebar workspaces. When live pane inspection finds Hub-owned side panes, the outer `pi-agent-hub` dashboard status bar is hidden; when no Hub-owned side panes remain, it is restored. Managed-session status bars remain visible and unchanged.

## Changes

- Added `setDashboardStatusBarVisible()` in `src/core/tmux.ts` for targeted `tmux set-option -t <dashboard-session> status on|off` updates.
- Extended `configureDashboardStatusBar()` with `visible?: boolean` so theme/chrome sync can preserve a hidden dashboard status state while still overriding dashboard chrome.
- Updated `src/app/run-tui.ts` to derive dashboard status visibility from live side-pane presence, refresh after direct `o` actions and full-screen switch pane closes, and restore status during dashboard shutdown cleanup.
- Added tmux helper tests covering hidden dashboard chrome configuration and explicit visibility toggles.
- Documented the sidebar workspace status-bar rule in `docs/STRUCTURE.md`.

## Validation

- Baseline `npm run typecheck` passed before implementation.
- Targeted tmux tests passed after Phase 1.
- Targeted `tmux`, `side-pane`, and `run-tui` tests passed after wiring.
- Final `npm run typecheck` passed.
- Final `npm test` passed with 470 tests.
- Final `git diff --check` passed.
- Isolated parent-side tmux smoke verified dashboard status `on → off → on`, nested managed-session status remained visible, and manual pane closes restored status only after the last Hub-owned side pane closed.
