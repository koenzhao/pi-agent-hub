# cleanup-005: Deduplicate tmux chrome commands

- **Feature:** Share dashboard and managed-session status/window option construction without changing exact tmux arguments, order, visibility, theme values, formats, or escaping.
- **Branch:** `main`
- **Implementation:** Added private `statusBarArgs()` in `src/core/tmux.ts`. It emits complete `set-option -t` token runs for shared status/window options and preserves caller-supplied side-option order. Dashboard and managed callers retain their distinct status-right text and ordering.
- **Preserved:** One tmux execution per public call, `on`/`off` visibility, theme-derived chrome, fixed lengths, raw window formats, project/title escaping, public APIs, and `TmuxExec` behavior.
- **Tests:** Existing exact command-array coverage remains the behavioral oracle; added dashboard project-path `#` escaping coverage.
- **Verification:** Focused tmux chrome tests passed **8/8**; ephemeral source-compiled suite passed **614/614**; `npm run typecheck` and `git diff --check` passed; code critic and second opinion returned LGTM.
- **Reflection:** No durable documentation changes required; `docs/STRUCTURE.md` already documents centralized tmux chrome behavior.
- **Discovered work:** `cleanup-006` remains a separate configuration/shutdown cleanup ticket.
