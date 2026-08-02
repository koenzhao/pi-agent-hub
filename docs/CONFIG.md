# pi-agent-hub Configuration

This page covers runtime state, global config, themes, Skills, and MCP configuration. For dashboard usage, see [Features](FEATURES.md).

## Runtime state

- Global state: `PI_AGENT_HUB_DIR` or `<PI_CODING_AGENT_DIR>/pi-agent-hub` or `~/.pi/agent/pi-agent-hub`
- Config: `config.json` (`skills.poolDirs`, `mcp.catalogPath`, optional managed-session `session.prelude`, `session.worktreeDefault`, dashboard theme sync/override, dashboard shortcuts)
- Registry: `registry.json`
- Heartbeats: `heartbeats/<session-id>.json`
- Latest one-time managed-session theme request: `theme-command.json`
- Optional session metadata: `session-metadata/<session-id>.json`
- Multi-repo workspaces: `workspaces/<session-id>`
- Hub-owned Git worktrees: `worktrees/<repo-name>/<session-id-prefix>-<branch-slug>`
- Recent repo history: `repo-history.json`
- Dashboard tmux session: `pi-agent-hub`
- Managed Pi tmux sessions: `pi-agent-hub-<first-12-session-id-chars>`
- Materialized project skills: `<project>/.pi/skills`
- Project skill state: `<project>/.pi/sessions/skills.json`
- Project MCP state: `<project>/.pi/sessions/mcp.json`
- MCP catalog: `<global-state>/mcp.json` by default, configurable in `config.json`
- MCP pool socket: `<global-state>/pool/pool.sock`
- Temporary tmux return binding state: `return-key/active.json` and `return-key/previous.tmux`

### Session metadata

Extensions can publish dashboard-only semantic metadata, an optional explicit attention reason, and an optional deterministic plan summary for a managed session by writing:

```text
<global-state>/session-metadata/<session-id>.json
```

Hub treats this file as extension-owned transient state: it displays known fields for the selected session, removes the file on session delete, and never uses it for liveness, status counts, ordering, or Hub title changes. It never copies the file into `registry.json`.

```json
{
  "source": "my-extension",
  "goal": "Improve Hub metadata rendering",
  "status": "Generic metadata is visible in the dashboard",
  "nextStep": "Approve rollout order",
  "stage": "waiting",
  "confidence": 0.86,
  "attention": {
    "kind": "question",
    "text": "Choose the rollout order"
  },
  "updatedAt": 1765060000000,
  "plan": {
    "feature": "Rich workflow board",
    "phase": { "title": "Render responsive cards", "index": 3, "count": 4 },
    "tasks": { "completed": 2, "total": 5 },
    "nextStep": "Add junction-card height tests"
  }
}
```

Display rules:

- At least one semantic field (`goal`, `status`, `nextStep`, `stage`, `attention`) or one valid nested `plan` field must be present.
- If `confidence` is present and below `0.5`, Hub hides model-derived semantic fields; valid deterministic `plan` data remains visible. Attention additionally requires an explicit confidence of at least `0.5`.
- Attention accepts only `ready` with stage `complete`, `question` with stage `waiting`, or `blocked` with stage `blocked`, each with nonblank bounded text. It never changes runtime status, workflow position, ordering, lifecycle bucket, or registry state.
- In stage grouping, waiting/idle compact rows reuse their prefix cell for `✓` ready, `?` question, or `!` blocked in both workflow lanes and `OTHER ACTIVE`; junction rows place the same glyph beside their branch. Selected junction cards use a heavy branch plus full-span background. Running/error/stopped rows keep operational presentation, subagent attention stays on its own row, and the complete attention reason remains in details.
- `plan.feature` is the producer-authored one-line junction description beneath the stored Hub title and is omitted when both values match. Plan fields are independently optional. Invalid phase/task pairs are omitted without discarding valid sibling fields; strings are trimmed and bounded. Junction cards combine available plan/workflow progress with semantic status in one recap line, while the details `work` block retains complete published deterministic values. Duplicate attention/goal/status/next rows are suppressed across details blocks.
- `source` and `updatedAt` remain provenance/freshness for all projections.

### Workflow heartbeat bridge

Hub's extension can also surface workflow-stage state from the optional `workflow-runtime` extension (from the `rules` package). On every heartbeat tick it reads the Pi session branch via `sessionManager.getBranch()` and takes the latest custom entry of this shape:

```json
{
  "type": "custom",
  "customType": "workflow-runtime",
  "data": {
    "activeStep": "execute",
    "ticketId": "workflow-board-001",
    "updatedAt": 1765060000000,
    "activeMode": {
      "id": "focus",
      "short": "FOC",
      "label": "Focus",
      "detail": "turn 4"
    },
    "steps": [
      { "id": "plan-md", "short": "PL", "label": "Plan" },
      { "id": "execute", "short": "EX", "label": "Execute" },
      { "id": "review", "short": "RV", "label": "Review" },
      { "id": "reflect", "short": "RF", "label": "Reflect" },
      { "id": "commit", "short": "CM", "label": "Commit" }
    ]
  }
}
```

The producer owns step order, ids, short codes, and optional labels. `activeStep`, finite `updatedAt`, and a nonempty `steps` array are required; each step needs a unique nonblank `id` and nonblank `short`, while `label` and `ticketId` are optional. `updatedAt` is the producer's state-change timestamp, so it can advance during one workflow step—for example, when a focus turn completes—independently of heartbeat cadence. Missing or malformed base workflow metadata silently removes the rail and canonical lane placement without affecting process state; an Active session still appears in `OTHER ACTIVE`. The board requires a `workflow-runtime` version from `rules` that publishes `steps` and `updatedAt` for producer-lane placement. Older payloads have no rail and stay in `OTHER ACTIVE`. No fallback step list is mirrored in Hub.

`activeMode` is an optional producer-owned display modifier. It requires nonblank `id` and `short`; `label` and `detail` are optional. Hub validates it independently, so malformed mode metadata is omitted without discarding a valid base workflow. Hub does not interpret Rules' private focus execution state. The mode is runtime-only: the controller exposes it only from a fresh, non-shutdown heartbeat with confirmed tmux presence and never writes it to `registry.json`. Stale, missing, shutdown, or stopped sessions retain the base workflow snapshot but lose the transient mode decoration.

The snapshot drives the per-session rail and canonical lanes in the read-only `v` board. Modes change the active step's display only; pipeline identity and lane placement continue to use the ordered base step ids. When visible Active parents report different ordered-id pipelines, Hub deterministically selects the most prevalent pipeline, treats label/short-only versions as compatible, and uses the newest compatible vocabulary. Incompatible and workflowless Active parent trees render once in synthetic `OTHER ACTIVE`; Backlog/Archived remain footer-only. Because heartbeats fire on agent start/end and every 15 seconds, a producer state change can lag in the dashboard by up to ~15 seconds.

## Global config

Optional global config lives at `config.json` under the global state directory:

```json
{
  "version": 1,
  "skills": {
    "poolDirs": [
      "~/.pi/agent/skills",
      "~/.pi/agent/pi-agent-hub/skills/pool"
    ]
  },
  "mcp": {
    "catalogPath": "~/.pi/agent/pi-agent-hub/mcp.json"
  },
  "session": {
    "prelude": "eval \"$(ssh-agent -s)\" >/dev/null",
    "worktreeDefault": true
  },
  "dashboard": {
    "themeSync": true,
    "shortcuts": [
      {
        "key": "C-n",
        "label": "summarize name",
        "send": "/session-summary name",
        "syncPiNameAfterMs": 1500
      }
    ]
  }
}
```

Use the CLI for common config changes:

```bash
pi-hub config get
pi-hub config set session-prelude '<shell snippet>'
pi-hub config unset session-prelude
pi-hub config set worktree-default true
pi-hub config unset worktree-default
```

## Dashboard shortcuts

`dashboard.shortcuts` binds extra normal-mode dashboard keys to one-line text sent to the selected live session through the same tmux paste/Enter path as `p`. Shortcuts are ignored in filters, forms, pickers, help, and other edit modes. They cannot target stopped, error, or subagent rows.

```json
{
  "version": 1,
  "dashboard": {
    "shortcuts": [
      {
        "key": "C-n",
        "label": "summarize name",
        "send": "/session-summary name",
        "syncPiNameAfterMs": 1500
      }
    ]
  }
}
```

Supported key spelling includes plain single characters, `C-x`/`ctrl+x`, and `M-x`/`alt+x`. Built-in dashboard keys and tmux return/focus keys are reserved, including theme settings `t`, the panel-close prefix `x`, sidebar return `M-q`, and `M-1` through `M-4`; shifted digit characters such as `!` are available for custom shortcuts. `send` must be a single nonblank line; this is not a shell-command or macro facility.

`syncPiNameAfterMs` is a pi-agent-hub-specific post-action for `/session-summary name` workflows: after sending the shortcut, Hub waits that many milliseconds and then syncs the selected dashboard title from Pi's latest `session_info.name`, equivalent to pressing `N` later. `/session-summary name` is not built into Hub; it is provided by the optional [`pi-session-summary`](https://github.com/masta-g3/pi-session-summary) Pi extension.

## New-session worktree default

New-session forms normally open with worktree mode off. Set `session.worktreeDefault` to `true` only to opt into worktree mode for every new form. In the form, focus the Worktree row and press `Space`, or use `Ctrl+T` from any field, to toggle it for an individual session. Omitting, unsetting, or setting the option to `false` preserves the normal-session default.

```bash
pi-hub config set worktree-default true
pi-hub config unset worktree-default
```

## Session prelude

`session.prelude` is an optional shell snippet that runs before `pi` starts in every new, restarted, or forked managed session. It is useful for machine-local setup such as starting an SSH agent, unlocking an OS credential store, or loading `direnv`; do not store raw secrets in it.

Configure it without editing JSON manually:

```bash
pi-hub config set session-prelude 'eval "$(ssh-agent -s)" >/dev/null'
pi-hub config unset session-prelude
```

On macOS, a machine-local keychain prelude can be configured the same way when needed.

The dashboard itself and direct `pi-hub tui` runs do not run `session.prelude`.

## Skills configuration

If `skills.poolDirs` is omitted, `pi-agent-hub` uses `<global-state>/skills/pool`. Each pool directory contains skill folders, for example `my-skills/prime/SKILL.md`.

The `s` picker lists skills from these directories, shows the active pool path, and lets you edit it with `Alt+E`. The picker edits one pool directory for simplicity; saving replaces `skills.poolDirs` with that single path. Missing or empty directories are allowed and show an empty picker so you can create or populate the pool later.

Applying the picker writes the final project selection to:

```text
<project>/.pi/sessions/skills.json
```

`<project>` is the selected session's primary cwd, or the TUI/dashboard current working directory when no session is selected.

## MCP configuration

Available MCP servers come from the configured catalog path or `<global-state>/mcp.json` by default.

Example catalog:

```json
{
  "version": 1,
  "servers": {
    "filesystem": {
      "type": "stdio",
      "command": "mcp-filesystem",
      "args": ["."],
      "pool": false
    }
  }
}
```

Enable per project:

```json
{
  "version": 1,
  "enabledServers": ["filesystem"]
}
```

The `m` picker writes project MCP state for the selected session's primary cwd, or the TUI/dashboard current working directory when no session is selected:

```text
<project>/.pi/sessions/mcp.json
```

In multi-repo sessions, Skills/MCP state applies to the primary repo only; the runtime workspace exposes that state through its `.pi` symlink.

Servers with `pool: true` require `pi-hub mcp-pool`; they are not started automatically.

```bash
pi-hub mcp-pool
```

## Theme behavior

Press `t` to open dashboard theme settings. The list contains Pi's `dark` and `light` themes plus custom/package themes from global Pi resources. Project-local themes are deliberately excluded because a synchronized choice becomes Pi's global default. Pi 0.83 or newer is required for the matching Automatic light/dark setting.

Moving through fixed themes previews the dashboard immediately. Selecting Automatic exposes separate light and dark choices; `←`/`→` changes the focused choice. `Space` toggles **Sync to Pi**, `Enter` saves, and `Escape` restores the theme active when the dialog opened. Preview updates dashboard ANSI, dashboard status chrome, and sidebar pane borders only—it does not write settings or alter managed Pi sessions.

Synchronization defaults on when `dashboard.themeSync` is absent or `true`. Pi's global `theme` in `<PI_CODING_AGENT_DIR>/settings.json` is then the source of truth; Hub does not mirror it. Confirming saves through Pi's settings manager, clears any detached Hub override, and asks every currently live managed parent session to apply the resolved concrete theme once. New managed and unmanaged Pi processes inherit the saved global setting normally. Existing subagent processes are not targets, and a running session may change its own theme afterward because Hub does not continuously enforce the choice.

Set `dashboard.themeSync` to `false` by toggling Sync off in the dialog. Hub snapshots the visible Pi theme setting into `dashboard.theme` and thereafter uses that independent override without writing Pi settings or changing Pi sessions. Re-enabling sync pushes the visible Hub setting to Pi globally. The old `dashboard.themeSessionId` anchor is obsolete and is removed the next time theme preferences are saved.

Pi represents Automatic as `<light-theme>/<dark-theme>`. Hub resolves the pair once when the dashboard starts using `COLORFGBG` when available and a dark fallback otherwise; it stays visually stable for that dashboard run instead of following later terminal appearance changes. Existing live processes receive the currently resolved concrete theme once, while new/restarted Pi processes retain Pi's normal Automatic behavior from the saved pair.

The dashboard periodically checks the lightweight effective setting and selected source file, but does not rerun package resolution every second. Reopen/reload the dashboard after installing or removing global theme packages. Missing or invalid selected themes render with Hub's bounded dark theme fallback without rewriting the saved setting.

Managed sessions continue publishing their actual `ctx.ui.theme` snapshot through heartbeats for their own tmux footer and chrome. Session entry, panel assignment, selection movement, and heartbeat freshness never choose or recolor the dashboard theme. The dashboard uses `selectedBg` for selected rows, `accent` for focused panel borders/title badges/slot cues, and `border` or `dim` for inactive panel chrome.
