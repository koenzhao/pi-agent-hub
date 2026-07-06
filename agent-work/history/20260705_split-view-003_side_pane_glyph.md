# split-view-003 — Side-pane visibility glyph

Implemented the final sidebar side-pane UX after the initial top/bottom badge design was rejected. Dashboard rows now show a compact accent-styled `◫` immediately after the status symbol when the session is currently visible in any Hub-owned side pane.

## Final behavior

- `o` is the only side-pane key.
- If the selected session is already visible in a side pane, `o` closes that pane.
- With no side panes, `o` opens one right-side nested tmux attach.
- With one side pane, `o` splits below it to create a second stacked content pane.
- With two side panes, `o` retargets the visually bottom nested client and leaves the top pane pinned.
- Opening and retargeting use detached tmux splits and do not select the content pane, so focus remains on the dashboard sidebar.
- Side-pane visibility is live-inspected from tmux panes/clients and mapped to current registry session ids only for rendering. No registry/config schema or persistent pane state was added.
- Uppercase `O` is no longer reserved by the dashboard and can be user-configured.

## Files changed

- `src/app/side-pane.ts`: replaced slot-targeted open behavior with stateless grow-then-rotate behavior and added `listSidePaneSessions()` for binary presence.
- `src/core/tmux.ts`: made side-pane splits detached with `split-window -d`.
- `src/app/run-tui.ts`: added an in-memory side-pane presence refresh loop and action wiring that supplies visible session ids to the TUI.
- `src/tui/dialog.ts`, `src/tui/sessions-view.ts`, `src/tui/render-model.ts`, `src/tui/layout.ts`: replaced slot state with `inSidePane`, rendered the `◫` glyph, and updated footer/help text to `o`-only.
- `src/core/dashboard-shortcuts.ts`: removed `O` from reserved dashboard shortcut keys.
- `README.md`, `docs/FEATURES.md`, `docs/STRUCTURE.md`: updated shortcut and architecture documentation for the one-key side-pane model.
- Tests updated for side-pane behavior, tmux split commands, render model width safety, TUI action wiring, and `O` shortcut configurability.

## Validation

- `npm run typecheck`
- `npm test` — 468 passing
- `git diff --check`
- Parent-side tmux smoke: verified `o` kept focus on the sidebar, grew from zero to one to two panes, retargeted the bottom pane while top stayed pinned, toggled a visible pane closed, and updated `◫` visibility glyphs.
- `code-critic` review: LGTM.

## Follow-up

Created `split-view-004` to address duplicated tmux status bars while side panes are visible.
