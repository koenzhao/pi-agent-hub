# split-view-006 — Height-bounded dashboard layout

## Outcome

Implemented a height-bounded dashboard render path so the TUI no longer emits more lines than the terminal pane height when `model.height` is known. This fixes the WSL short-pane class of issues where overflowing output pushed the visible viewport away from rendered line 0, causing mouse row misalignment and repeated full redraw flicker.

## Changes

- `src/tui/layout.ts`
  - Capped dashboard body rows to the terminal height budget instead of treating height as only a minimum.
  - Added a scroll window for the left session list that keeps the selected row visible.
  - Added `↑/↓ N more` indicator rows for hidden session rows; indicators are not mouse-targetable.
  - Kept no-height rendering unchanged for normal wide/tall terminal behavior.
- `src/tui/render-model.ts`
  - Added `listScrollTop` plumbing so the view can preserve scroll position across renders.
- `src/tui/sessions-view.ts`
  - Stores the applied list scroll offset and feeds it back into the render model.
  - Clips help/dialog output to terminal height with a resize marker.
- `src/app/run-tui.ts`
  - Clears the screen before first TUI render so dashboard row 0 starts at terminal row 1.

## Verification

- Added render-model coverage for height-capped output, scroll indicators, selected-row visibility, exact/overflow capacity edges, and minimal scroll movement.
- Added SessionsView coverage for short-pane line counts, visible-row mouse clicks, indicator clicks, wheel movement, and short help clipping.
- Validation passed with `npm run typecheck`, full `npm test`, and `git diff --check`.
- Parent-side isolated tmux smoke passed in a short pane: rendered output stayed bounded, scroll indicators appeared, keyboard scrolling kept selection visible, clicking a visible row selected the exact row, and idle view showed a single dashboard frame.

## Remaining external verification

WSL-specific confirmation remains user-run: collect `tmux -V`, `$TERM`, Windows Terminal version, and pane size, then repeat click-alignment and idle-flicker smoke on the affected WSL machine.
