# dashboard-scanability-002 — Panel focus and selection visibility

Improved dashboard scanability without changing panel lifecycle or keybindings.

## Implemented

- Derived inactive and active pane-border styles plus focus-aware pane-title formatting from the effective Pi theme.
- Applied pane chrome as window-local tmux options when panels open or themes change, and unset all owned options during teardown.
- Extended live side-pane inspection with the geometry-ordered active slot.
- Added a persistent four-slot sidebar strip built from the full session list, including paneled sessions hidden by filters.
- Accented the focused strip entry and matching row `◫N` indicator while muting inactive indicators.
- Replaced the selected-row `▶` with an accent `▌` edge and increased built-in dark-theme `selectedBg` contrast.
- Adjusted height bounds and mouse row maps for the added strip line.

## Verification

- Added focused coverage for theme derivation, tmux option application/teardown, active-slot detection, panel-strip occupancy, filtered sessions, selection rendering, and row offsets.
- Full suite passed: 540 tests.
- Typecheck and diff checks passed.
- Code review returned LGTM; documentation review confirmed the final durable docs after one wording correction.

## Durable documentation

- `docs/FEATURES.md` describes the panel strip and focus cues.
- `docs/CONFIG.md` documents the theme tokens used by selection and pane chrome.
- `docs/STRUCTURE.md` records active-slot plumbing, pane-option lifecycle, and render behavior.
