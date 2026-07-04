# pi-agent-hub Agent Notes

## Product Boundaries

- Keep Hub Pi-native and small: Pi is the agent runtime, tmux is the durable process substrate, and Agent Deck architecture stays out unless explicitly requested.
- Groups and lifecycle buckets are dashboard labels, not first-class records/projects. Custom dashboard shortcuts stay config-driven Pi text sends, not shell commands, macros, or event systems.

## Names and State Paths

- `pi-hub` is the primary CLI; `pi-agent-hub` remains a compatibility alias. Keep package/runtime/tmux state names as `pi-agent-hub` unless a full rename is requested.
- Keep global state under `PI_AGENT_HUB_DIR` or `<PI_CODING_AGENT_DIR>/pi-agent-hub`; never use `<PI_CODING_AGENT_DIR>/sessions`, which belongs to Pi conversations.
- Multi-repo workspaces live under `<PI_AGENT_HUB_DIR>/workspaces/<session-id>` and contain symlinks only. Repo picker history is one bounded `<PI_AGENT_HUB_DIR>/repo-history.json` file with no filesystem scanning.
- Hub-owned worktrees live under `<PI_AGENT_HUB_DIR>/worktrees`; support only explicit create/finish/discard flows, including one branch name across multi-repo sessions, unless broader Git management is requested.

## Dashboard Behavior

- Groups are implicit session labels: `g` moves the selected session, `G` renames its current group globally, and no empty-group lifecycle should be added unless the model changes.
- Active/Backlog/Archived are optional per-session buckets: `A`/`B`/`U` only reorganize rows and must not stop tmux/Pi; subagent rows follow their parent.
- Row order is user-controlled via `src/core/session-order.ts`; do not reintroduce status/title sorting or a separate stopped section. `K`/`J` reorder within the current group and lifecycle section.
- Preserve common shortcuts: `r` opens restart choices (`r` selected, `n` new conversation, `a` all), `R` renames, `N` syncs from Pi `/name`, `e` is a hidden rename alias, and `Alt+N` is a sync-name compatibility alias.

## TUI Rules

- Keep rendering pure/testable and ANSI width-safe through theme/layout helpers; reserve width for right-side badges/counts in left/right columns.
- Route dialogs through `SessionDialog` in `src/tui/dialog.ts` and the small `src/tui/*-dialog.ts` modules. Use `src/tui/text-input.ts` and `src/tui/form.ts`/`renderForm()` for editable inputs instead of one-off state.
- For themed footers, prefer Pi `statusLineBg` before `border` so Catppuccin border/accent colors do not become unreadable full-bar backgrounds.

## Persistence, Skills, and MCP

- Use `src/core/atomic-json.ts` for JSON state: `loadStore`, `updateStore`, `writeJsonAtomic`, and `isErrno`; avoid local errno helpers and parallel per-item read-modify-write loops.
- For Skills/MCP project state, write the final selection once. Pickers target the selected session's primary `cwd`, or dashboard cwd when nothing is selected; multi-repo sessions attach Skills/MCP only to the primary repo.
- Skill pool path editing lives in the `s` picker on `Alt+E`; `←`/`→` switch columns, `Tab` remains an alias, and printable keys including `e` must remain available for picker search.

## Tmux and Extension Behavior

- Clipboard is optional best-effort; attach/switch flows must always display the exact tmux command.
- Keep inside-tmux attach tmux-native with `src/core/tmux.ts`; do not stop/restart the TUI or add PTY attach unless outside-tmux return semantics are explicitly requested.
- Preserve `dashboardEnv()` for any tmux return path that can recreate the dashboard so custom `PI_*` dirs survive.
- `Alt+R` rename-from-session intentionally round-trips through the dashboard action handoff and explicit rename dialog; do not add a parallel in-session rename UI to hide the flash.
- Tmux chrome must override both `*-style` and `*-format` options. Themes can embed ANSI/style directives in formats, not just styles.
- The extension can load via both `pi install` and managed-session `--extension`; keep registration idempotent and clear active guards on `session_shutdown`.
- `session.prelude` belongs in global `config.json` and runs only before managed `pi`; do not hardcode macOS keychain/SSH/direnv behavior or run it for dashboard/direct TUI.

## Lifecycle Safety

- Delete sessions through `src/app/delete-session.ts`, pause any active refresh loop first, and never delete Pi conversation/session files.
- Normal delete must not remove hub-owned worktree directories; finish/discard through `src/app/worktree-session.ts`.
- For worktree finish/discard, preflight Git cleanliness before stopping parent/subagent tmux sessions, process additional repos before the primary repo, and keep workspace `.pi` pointed at the source repo.
- Archive pruning is dashboard-only: prune only after every row in the session/subagent cascade is confirmed missing from tmux; keep rows when tmux presence is unknown.

## Compatibility Metadata

- Optional `kind: "subagent"` registry rows are owned by `pi-tmux-subagents`: keep them nested and short in the left pane, keep task text in details/filtering, and disable normal session lifecycle/group/order actions on them.
- Optional `session-metadata/<session-id>.json` files are extension-owned transient display state: do not persist them into `registry.json`, do not use them for liveness/status counts/title sync, and clean them up with deletion.

## Validation

- Do not run `npm test` and `npm run package:check` concurrently because both rebuild `dist`.
- If the user is actively using an installed/linked `pi-hub`, avoid build/package commands unless approved; prefer `npm run typecheck` for non-disruptive validation.
