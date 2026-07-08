# split-view-007 — Sidebar resize repair

## Outcome

Implemented two protections for dashboard side-pane resize collapse: the dashboard survives very narrow pane widths by rendering a width-safe notice, and the side-pane presence loop repairs a collapsed sidebar when Hub-owned side panes exist and the window is wide enough again.

## Changes

- `src/tui/sessions-view.ts`
  - Added a single render guard for widths below 40 columns.
  - Renders a plain truncated narrow-pane notice and clears mouse hit state so clicks no-op while collapsed.
  - Leaves normal layout unchanged at 40 columns and above.
- `src/core/tmux.ts`
  - Extended `listWindowPanes()` to parse pane width and window width from tmux.
  - Added `resizePaneWidth()` for targeted sidebar repair.
- `src/app/side-pane.ts`
  - Centralized the 42-column sidebar width.
  - Added `sidePaneStatus()` to return managed side-pane sessions plus dashboard/window dimensions from the same live pane inspection.
  - Added `sidebarRepairWidth()` to repair only collapsed sidebars below 40 columns and only when at least 40 columns remain for content.
- `src/app/run-tui.ts`
  - Reused the existing side-pane presence loop to reapply sidebar width when repair criteria are met.
  - Avoided tmux hooks and `select-layout`, preserving user pane arrangements and manual sidebar widths of 40 columns or more.

## Verification

- Added width-safety tests for 10, 25, and 38 columns, dialog guarding, mouse no-op while narrow, and normal rendering at 40 columns.
- Added tmux parsing/argv tests for pane dimensions and `resizePaneWidth()`.
- Added side-pane status and repair-decision tests covering collapsed/wide, collapsed/too-small, and manual-width cases.
- Validation passed with `npm run typecheck`, full `npm test`, and `git diff --check`.
- Parent-side isolated tmux smoke passed: with one/two side panes, externally shrinking the dashboard pane to 12 columns repaired it to 42 columns; manually resizing the sidebar to 60 columns stayed at 60.

## Remaining external verification

The WSL machine where the original collapse was observed still needs a manual shrink/grow smoke because this session ran on macOS.
