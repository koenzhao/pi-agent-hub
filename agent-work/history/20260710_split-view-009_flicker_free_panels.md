# split-view-009 — Flicker-free panels and full-screen switching

## Outcome

Eliminated avoidable Pi conversation reflow when opening dashboard panels or switching full-screen. Hub now pre-sizes managed tmux windows while they are off-screen, creates panel panes at their exact final dimensions, and restores `window-size latest` only after layout or switching is complete.

## Changes

- Added pure 1–4 panel geometry matching the canonical sidebar layouts and top pane-border row.
- Rebuilt panels with explicit `split-window -l` dimensions instead of attaching at intermediate sizes and resizing afterward.
- Pre-sized each target window to its final pane content size before nested attach; occupied-slot retargeting uses the same sequence.
- Paused side-pane presence polling and applied dashboard chrome before first-panel layout so fresh panels receive no post-attach geometry changes.
- Pre-sized full-screen targets to the controlling client before `switch-client`, then restored automatic sizing.
- Delayed closing the matching side pane until after full-screen switching so surviving panel redistribution occurs off-screen.
- Preserved return bindings when a post-switch size reset fails, surfaced unexpected reset failures, and attempted all panel resets before reporting an error.

## Validation

- 534 tests passed: 384 non-view tests plus 150 `sessions-view` tests with tmux context.
- `npm run typecheck` passed.
- `git diff --check` passed.
- Isolated real-tmux smoke at 160×60 produced a 42-column sidebar and four 58×29 panels; all target windows remained 58×28 and restored `window-size latest`.

## Remaining manual check

Visually confirm with a long-history Pi conversation that panel opening and full-screen switching paint once without scrolling through prior output.

## Discovered work

None.
