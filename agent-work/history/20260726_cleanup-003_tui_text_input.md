# cleanup-003: Share TUI text-input primitives

- **Feature:** Centralize cursor-aware inline rendering and exact Enter-key recognition across TUI input paths without changing output, key handling, dialog transitions, or form/picker behavior.
- **Branch:** `main`
- **Implementation:** Added `renderTextInput(input, marker?)` and `isEnterKey(data)` to `src/tui/text-input.ts`. Reused rendering in prompt footers, two-column and repo picker searches, skill-pool input, and width-aware form values while keeping form truncation local. Replaced equivalent Enter expressions in prompt, picker, form, new-session, dashboard-shortcut, and sessions-view handlers.
- **Preserved:** Unicode code-point cursor handling, custom blinking prompt markers, picker default cursors, form width/start/end truncation, exact Enter sequences, and branch ordering.
- **Tests:** Added helper tests for Unicode/custom markers/clamping/Enter sequences and mid-string cursor assertions for both picker types.
- **Verification:** Focused TUI tests passed **203/203**; ephemeral source-compiled suite passed **613/613**; `npm run typecheck` and `git diff --check` passed; code review and second opinion returned LGTM.
- **Reflection:** No durable documentation changes required; existing `docs/STRUCTURE.md` already documents shared text-input and TUI rendering conventions.
- **Discovered work:** `cleanup-005` and `cleanup-006` remain separate cleanup tickets.
