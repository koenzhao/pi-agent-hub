# split-view-001: Sidebar workspace

Implemented a Pi Hub sidebar workspace where the dashboard remains in a narrow left tmux pane and the selected managed session opens interactively in a right content pane via `o`.

## Delivered behavior

- `o` on a live dashboard row opens, retargets, or closes the side content pane:
  - no managed content pane: split the current tmux window and nested-attach the selected session;
  - content pane showing another managed session: retarget the nested client in place;
  - content pane showing the selected session: close it.
- `Enter` keeps full-screen switch behavior unchanged, but closes a side pane showing the same target first to avoid tmux window-size flapping.
- Outside tmux, `o` reports `side pane needs tmux — run pi-hub`.
- Stopped/error rows are blocked; live subagent rows are allowed like `Enter`.
- Waiting sessions opened through `o` are acknowledged through the registry mutator, matching attach/read ordering.
- Native tmux remains responsible for layout control: `prefix+←/→` focus, `prefix+z` zoom/hide sidebar, `prefix+x` close pane.

## Implementation notes

- Added tmux primitives in `src/core/tmux.ts` for live pane/client inspection and safe pane actions:
  - `listWindowPanes`
  - `splitWindowAttach`
  - `switchClientTo`
  - `killPane`
  - `selectPane`
  - `clientSessionsByTty` / `clientSessionByTty`
- Added `src/app/side-pane.ts` for stateless orchestration.
- Ownership is conservative: Hub only kills/retargets non-dashboard panes whose tty maps to a nested client attached to a `pi-agent-hub-*` session. Shell/editor panes and non-managed nested clients are ignored.
- No pane state, registry fields, config, or new session model were added.
- Dashboard wiring added `openSidePane` action support, `o` key handling, shortcut reservation, footer/help discoverability, theme pinning, and status bar sync on open/retarget.

## Documentation

- Updated `docs/FEATURES.md` with the `o` shortcut and Sidebar workspace behavior.
- Updated `docs/STRUCTURE.md` with the side-pane design rule: nested attach, live inspection, no index targets, no managed-session mutation.

## Validation

- `npm test` — 450 passing.
- `git diff --check` — clean.
- `node dist/cli.js --help` — ok.
- tmux smoke test validated split, nested attach tty/client mapping, `switch-client -c` retarget, and `kill-pane` cleanup using temporary `pi-agent-hub-smoke-*` sessions.
- Code review + second-opinion review completed; one repeated `list-clients` lookup issue was fixed before final validation.

## Discovered work

None.
