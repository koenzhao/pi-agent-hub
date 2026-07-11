# pi-agent-hub Features

`pi-agent-hub` keeps Pi coding-agent sessions alive in tmux and gives them a calm keyboard-driven dashboard.

## Daily loop

```text
pi-hub
  ↓
pick a session
  ↓
Enter to open/switch
  ↓
work in Pi
  ↓
Ctrl+Q returns to the dashboard
```

## Core capabilities

| Capability | How to use it | Why it matters |
| --- | --- | --- |
| Long-running sessions | `n` creates, `Enter` opens | Sessions keep running in tmux instead of disappearing with a terminal. |
| Dashboard return | `Ctrl+Q` inside a managed session | Jump back to the hub without stopping the agent. |
| In-session rename | `Alt+R` inside a managed session | Open the dashboard rename dialog for the current session, then return to it after saving. |
| Direct send | `p` in the dashboard | Paste and submit a one-line message into the selected live session without opening it. |
| Custom dashboard shortcuts | `dashboard.shortcuts` in config | Bind safe Pi slash-command sends, such as `/session-summary name`, to dashboard keys. |
| Stable grouping/order | `g`, `G`, `K`, `J` | Keep sessions organized without status/title resorting. |
| Multi-repo workspaces | `Alt+A` in the new-session form | Work across repos through a symlink workspace without moving or owning source repos. |
| Hub-owned worktree sessions | `Ctrl+T` in the new-session form, `w` to finish | Create Git worktrees under hub state for one or more repos and explicitly finish, forget, or discard them. |
| Project Skills | `s` picker | Attach Pi skills to the selected session's primary repo. |
| Project MCP servers | `m` picker | Enable MCP tools for the selected session's primary repo. |
| Subagent rows | Automatic when `pi-tmux-subagents` reports them | See child agent work nested under the parent session. |
| Workflow rail + stages view | Automatic when the `workflow-indicator` extension reports steps; `v` toggles views | See each session's workflow stage in the row (`EX 4/7`) and details rail, or lane all active sessions by stage. |

## Dashboard keys

| Key | Action |
| --- | --- |
| `n` | Create a new Pi session |
| `Enter` | Open/switch to the selected live session, or restart a stopped/error session |
| `1`–`4` | Target a side-panel slot; requests past the next available slot append there |
| `Shift+1`–`Shift+4` or `F`, then `1`–`4` | Focus the corresponding open panel |
| `o` | Reset side panels to the selected session, or close it when it is the only panel |
| `/` | Filter sessions |
| `p` | Send a one-line message to the selected live session without opening it |
| `?` | Show help and status legend |
| `q` | Quit the dashboard |
| `i` | Toggle compact/full selected-session info |
| `↑↓` / `j` / `k` | Move selection |
| `r` | Open restart choices: `r` restarts selected, `n` starts a new conversation, `a` restarts all active sessions (not Backlog or Archived) |
| `R` | Rename the selected session in the dashboard footer |
| `d` | Delete or forget the selected session |
| `f` | Fork the selected session |
| `a` | Mark the selected waiting session read |
| `A` | Archive the selected session |
| `B` | Move the selected session to Backlog |
| `U` | Restore a Backlog or Archived session to Active |
| `w` | Finish the selected hub-owned worktree session |
| `N` | Sync the selected hub title from Pi's `/name` |
| `g` | Move the selected session to a group; the dialog pre-fills visible existing groups and `Ctrl+N` / `Ctrl+P` cycles them |
| `G` | Rename the selected session's group |
| `K` / `J` | Move the selected session up/down within its group |
| `Shift+Up` / `Shift+Down` | Same as `K` / `J` |
| `s` | Pick project skills |
| `Alt+E` | Edit the Skill pool path while the `s` picker is open |
| `m` | Pick project MCP servers |
| `v` | Toggle groups view ↔ stages view |

## Status vocabulary

```text
● running or starting
◐ waiting for you
○ idle/read
× error
- stopped
```

Zero counts are hidden in the dashboard summaries, so `◐2 ×1` means only waiting and error sessions are currently visible.

The session list is sectioned as Active, Backlog, then Archived when any non-active rows exist. Group headers remain inside each section, and all-active dashboards omit the Active section header to stay compact.

Sessions running the optional `workflow-indicator` extension also show a workflow rail: the compact form `EX 4/7` right-aligned in the list row, and the full rail `NX─PR─PL─▐EX▌─RV─RF─CM · ticket` in the details pane. Pressing `v` switches to the stages view, which lanes active sessions by their current workflow step (with a final `NO WORKFLOW` lane) and shows each row's group name instead of the rail. Backlog and Archived rows are summarized as one dim line in the stages view, subagents stay nested under their parent's lane, and `K`/`J` reordering is groups-view only. Workflow state is remembered for stopped sessions so cards keep their lane.

The dashboard top line summarizes visible sessions and nonzero status counts in fixed order. Press `?` for the full help/legend and `i` to toggle compact vs full selected-session metadata. The details pane can also show extension-provided session metadata; see [Configuration](CONFIG.md#session-metadata).

## Dashboard tmux behavior

Running `pi-hub` uses one stable tmux session named `pi-agent-hub`:

- outside tmux: create or attach `pi-agent-hub`;
- inside tmux: create it detached if needed, then switch the current client to it.

The dashboard runs the current CLI file's `tui` command inside tmux so it does not recursively create dashboards or depend on a stale `pi-hub` on PATH. It also applies its own tmux status bar instead of inheriting global tmux theme chrome.

When the dashboard is running inside tmux, `Enter` switches the current tmux client to the selected live session and briefly shows the equivalent `tmux switch-client -t <session>` command. On a stopped or error session, `Enter` restarts it instead of attempting to attach. Opening a `waiting` session marks it read before attaching, so it can show `idle` after you return; `a` remains the manual mark-read shortcut.

### Sidebar workspace

Use `1`–`4` in the dashboard to place the selected live session beside the session tree. The number targets the corresponding visual panel: an empty next slot opens it, an occupied slot switches to the selected session, and pressing the selected session's current slot closes it. Requesting a slot beyond the next available position appends at the next position, and moving a session already shown in another slot swaps it into the requested position. The footer reports the actual landed slot. Closing a panel compacts the remaining sessions into the lower-numbered slots.

The dashboard stays as a narrow left sidebar while the content region grows through these layouts:

- one panel: one full content pane;
- two panels: vertically stacked panes;
- three panels: one full-height left pane and two stacked right panes;
- four panels: an even 2×2 grid.

Press `Shift+1`–`Shift+4`, or the layout-neutral chord `F` then `1`–`4`, to focus an open panel without changing its assignment. Press `o` to reset any current arrangement to one panel showing the selected session. If that session is already the sole panel, `o` closes it. A persistent strip below the dashboard summary maps all four slots to panel titles, including sessions hidden by the current filter. The focused slot and its row `◫1`–`◫4` indicator use the theme accent; inactive indicators are muted. Panel borders use matching `[n] <title>` labels, with an accent border and bold title on the focused pane. At sidebar width, the footer labels panel assignment, focus, reset, and help controls.

Successful `1`–`4` assignment, replacement, and move actions focus the resulting panel. Closing a panel, refusing an addition because the window is too narrow, and `o` reset leave focus on the sidebar. Press `Ctrl+Q` from a focused panel to return to the sidebar. A single mouse click selects a session row; a double-click opens/switches to a live session or restarts a stopped/error session. The mouse wheel moves selection. Hub enables tmux mouse mode only on the dashboard session while it is running and unsets that session override on quit.

Native tmux keys also handle the layout: `prefix+←/→/↑/↓` moves focus, `prefix+z` zooms the focused pane to hide/show neighbors, `prefix+x` closes a pane, and `prefix+{` / `prefix+}` swaps panes. If `Enter` opens a session currently shown in any side pane, Hub closes that pane first to avoid tmux size flapping. Hub refuses to grow a layout when the resulting panels would be narrower than 40 columns.

The side panes are stateless and self-healing. Hub inspects the current window live and only owns panes whose tty maps to a nested client attached to a `pi-agent-hub-*` managed session. User-created shell/editor panes are never killed or retargeted. If the terminal is squeezed too narrow, the dashboard shows a compact narrow-pane notice instead of exiting; when side panes exist and the window is wide enough again, Hub restores a collapsed sidebar to its normal width without disturbing manual sidebar widths of 40 columns or more. If a shown session exits, tmux normally closes its nested pane automatically.

If the dashboard tmux session is missing, the temporary return binding recreates it before switching back.

## Return shortcuts

Return shortcuts from a managed `pi-agent-hub-*` session:

| Key | Action |
| --- | --- |
| `Ctrl+Q` | Return to the dashboard |
| `Alt+R` | Return to the dashboard rename dialog for the current session, then switch back after saving |

## New session form

Press `n` to create a session.

| Field | Default |
| --- | --- |
| Primary cwd | Selected session's cwd, or the dashboard cwd if nothing is selected |
| Extra repos | Selected session's extra repos, if any |
| Group | Primary cwd folder name |
| Title | Random two-word slug |

While editing the form:

| Key | Action |
| --- | --- |
| `Alt+A` | Add another repo row |
| `Alt+X` | Remove the focused extra repo row |
| `Ctrl+N` / `Ctrl+P` | Cycle known cwd suggestions |
| `Ctrl+O` | Open the recent-repo picker |
| `Ctrl+T` | Toggle hub-owned worktree mode |

Extra repos are symlinked into one runtime workspace. The primary cwd remains the main project for skills and MCP state.

When worktree mode is enabled, the `branch` field creates the same new local branch in every selected repo and also becomes the session title shown in the dashboard.

## Groups and session actions

Groups are simple labels on sessions. Moving a session to a new label creates that group, and renaming a group updates every session currently using that label. Row order is user-controlled within the current group and lifecycle section; reordering is disabled while a filter is active.

Backlog and Archive are dashboard organization states only: they do not stop tmux or Pi. Subagent rows follow their parent session and cannot be moved directly. Archived rows are automatically removed from the dashboard after 72 hours, but only after the archived session and any subagent rows are confirmed missing from tmux; this cleanup removes Hub registry/heartbeat/metadata/workspace state and does not delete Pi conversation files.

Custom normal-mode dashboard shortcuts can be configured in `config.json`; see [Dashboard shortcuts](CONFIG.md#dashboard-shortcuts). They send one-line text to the selected live session without opening it and are intended for Pi-native commands such as `/session-summary name`, provided by the optional [`pi-session-summary`](https://github.com/masta-g3/pi-session-summary) extension.

## Project-scoped Skills and MCP

Skills and MCP state attach to the selected session's primary repo:

```text
<project>/.pi/sessions/skills.json
<project>/.pi/sessions/mcp.json
```

The `s` picker lists skills from the configured skill pool directories and writes the final project selection once. It also shows the active Skill pool path; press `Alt+E` in the picker to edit that path and reload the available Skills. In Skills/MCP pickers, `↑`/`↓` moves within the current column, `←`/`→` switches between Enabled and Available (`Tab` also works), and `Space` toggles the selected item. The `m` picker writes enabled MCP servers for the selected project. If no session is selected, both pickers fall back to the dashboard current working directory.

For multi-repo sessions, extra repos are available in the runtime workspace, but Skills/MCP still belong to the primary repo. Restart the session after changing Skills or MCP so Pi reloads tools.

## Multi-repo model

Extra repos are symlinked into a per-session runtime workspace:

```text
<PI_AGENT_HUB_DIR>/workspaces/<session-id>/
  primary-repo -> /path/to/primary
  extra-repo   -> /path/to/extra
  .pi          -> /path/to/primary/.pi
```

Source repos are not moved, cloned, or owned by `pi-agent-hub`.

At session start/restart, Hub checks each selected repo root for `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, then `CLAUDE.MD`. When any exist, it writes a generated workspace `AGENTS.md` with labeled sections for each repo so Pi loads the combined instructions from the workspace cwd.

## Worktree model

Worktree sessions are opt-in and hub-owned:

```text
<PI_AGENT_HUB_DIR>/worktrees/<repo-name>/<session-id-prefix>-<branch-slug>/
```

Press `Ctrl+T` in the new-session form to enable worktree mode, then enter the branch name. The branch name is also the session title. If extra repo rows are present, Hub creates one worktree per repo using that same branch name, then starts Pi in the same symlink workspace shape used by normal multi-repo sessions. Workspace `.pi` points at the primary source repo's `.pi`, not a worktree, so project state does not dirty the worktree.

Normal `d` delete is conservative: it removes the dashboard row, workspace, and heartbeat, but keeps hub-owned worktree files. From the delete dialog, `Shift+D` discards clean hub-owned worktrees and branches without merging. Press `w` on a clean hub-owned worktree session to stop its session/subagent tmux processes, merge each worktree branch into its recorded base branch, remove the worktrees, prune Git metadata, delete the merged local branches, and remove the dashboard row. Dirty worktrees or dirty base repos block finish so files are preserved.

## Non-goals

`pi-agent-hub` intentionally stays small:

- no cloud service;
- no custom agent runtime;
- no repo filesystem scanning;
- no broad Git/worktree manager beyond the explicit hub-owned create/finish flow;
- no Agent Deck remotes/tools registry clone.

Pi runs the agents. tmux keeps them alive. The hub gives you one stable place to see and steer them.
