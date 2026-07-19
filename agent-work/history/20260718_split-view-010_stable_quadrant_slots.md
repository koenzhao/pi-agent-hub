# split-view-010 — Stable quadrant panel slots

## Outcome

Made dashboard side-panel numbers stable screen quadrants: `1` top-left, `2` top-right, `3` bottom-left, and `4` bottom-right. Sparse layouts retain holes and derive row/column geometry from occupied quadrants, so users can choose stacked or side-by-side arrangements without panel numbers changing after close or move.

## Changes

- Replaced count-ordered panel state with fixed sparse slots tagged on live tmux panes through `@pi_hub_slot`; missing or duplicate tags self-heal into the lowest free slots in geometry order.
- Added occupancy-derived geometry for single panes, stacked rows, side-by-side columns, asymmetric three-pane layouts, and 2×2 grids.
- Made bare `1`–`4` non-destructive: assign, replace, move, swap, or focus. Added explicit `x` then digit close and retained `F` then digit focus plus `o` reset.
- Added guarded `Alt+1`–`Alt+4` tmux root bindings that resolve tagged panes at keypress time, pass the original Meta key through outside the dashboard, and restore prior bindings on cleanup or failed installation.
- Rewired TUI presence, footer visibility, panel titles, theme application, and row/strip indicators around sparse slots.
- Reserved the new built-in keys while making shifted digit characters such as `!` available to configured dashboard shortcuts.
- Updated user help, feature/configuration documentation, architecture guidance, agent guardrails, and the changelog.

## Safety and review fixes

- Moving a pane from a stacked layout into a second column now applies the same 40-column minimum-width rule as opening that column.
- Move and swap assignments apply the selected session theme before entering the landed pane.
- Panel rebuilds preserve existing pre-size, vanished-pane tolerance, reset-error surfacing, serialized mutation, and sidebar-focus behavior.
- The binding set stores five keys with one combined atomic restore script; legacy state without the key list still cleans up correctly.

## Validation

- 559 tests passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
- Real tmux smoke validated sparse slots, adding a third quadrant, explicit close without renumbering survivors, and direct TUI startup/exit.

## Discovered work

None.
