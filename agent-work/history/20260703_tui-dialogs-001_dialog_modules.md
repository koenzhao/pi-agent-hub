# tui-dialogs-001 — Collapse sessions-view dialog machine into dialog modules

## Summary

Refactored the dashboard TUI dialog handling from one large `SessionsView` mode machine into a single `SessionDialog` union routed through small per-family modules, while preserving the existing public `SessionsView` contract and behavior. `src/tui/sessions-view.ts` now owns normal-mode routing, attach/restart/reorder/bucket/sync/shortcut actions, flash/message state, and help/footer helpers; prompt, form, confirm, picker, and new-session dialog state/input/rendering live in dedicated `src/tui/*-dialog.ts` modules.

## Implemented

- Added `src/tui/dialog.ts` for shared dialog types, `DialogContext`, `SessionsViewActions`, `SessionDialogInput`, and shared `isPromise`/`errorMessage` helpers.
- Extracted dialog families:
  - `prompt-dialog.ts`: filter, footer rename, and send prompts.
  - `form-dialogs.ts`: fork, move-group, rename-session form, and rename-group form dialogs.
  - `confirm-dialogs.ts`: delete and finish confirmations plus restart dialog rendering.
  - `picker-dialog.ts`: Skills/MCP picker flow, picker search, and skill-pool path editing.
  - `new-session-dialog.ts`: new-session form and repo picker round-trip.
- Folded help into the `SessionDialog` union and removed the old `mode` field and per-dialog nullable fields from `SessionsView`.
- Centralized single-line edit key handling in `src/tui/text-input.ts` via `editKey()` and `editTextInput()`.
- Added `editField()` in `src/tui/form.ts` and `editNewForm()` in `src/tui/new-form.ts`; removed the exported per-op form/new-form edit wrappers.
- Updated tests for shared edit behavior and added regression coverage for synchronous skill-pool saves in the picker dialog.
- Updated durable guidance in `docs/STRUCTURE.md` and `AGENTS.md` to describe the dialog-module pattern.

## Review fix

Review found that synchronous `saveSkillPoolDir` results in `picker-dialog.ts` could be dropped by the async identity guard before the pending dialog was installed. The save path now returns the saved/error dialog directly for synchronous saves and only uses the guarded callback path for promises. `test/picker-dialog.test.ts` covers this regression.

## Verification

- `npx tsc -p tsconfig.json --noEmit` passed.
- `npm test` passed: 413 tests.
- `npm run build` passed.
- Real tmux TUI smoke passed with an isolated temporary hub state, driving `/`, `n` + repo picker/worktree, `f`, `g`, `R`, `G`, `p`, `r`, `d`, `w`, `s`, `m`, `?`, and `v` flows.
- `test/sessions-view.test.ts` stayed behaviorally unchanged.
- Size target met: `src/tui/sessions-view.ts` is 618 lines; largest dialog module is 215 lines.

## Follow-up candidates

- `replaceFooter`/`padVisibleLine` duplicate some layout border logic.
- `renderHelp` still duplicates the dashboard key table.
- `tui-dialogs-002` should narrow/regroup the broad `SessionsViewActions` bag.
