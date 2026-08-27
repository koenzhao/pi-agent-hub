# FRD: `pi-hub add` — `-t <title>` and `--prompt <text>`

**Status:** Draft (requirements only — not implemented)
**Date:** 2026-08-27
**Requester:** Koen Zhao
**Driver use case:** `mail-scan` skill spawns `claude --bg` sessions per Jira TM ticket; each should get a mirror pi-hub session with identical title, group, working directory, and initial task prompt — created atomically from a script, with no dashboard interaction and no tmux paste race.

---

## 1. Background

`pi-hub add <cwd>` creates and auto-starts a managed Pi session. Two gaps block fully-scripted session creation:

1. **`-t <title>` is advertised but not implemented.** Top-level `--help` prints `pi-hub add <cwd> [-t title] [-g group] [--add-cwd path ...]`, but `src/cli.ts add()` parses only `-g/--group` and `--add-cwd`. Titles always fall back to `provisionalSessionTitle(cwd)` (repo basename). The only way to set a title today is the interactive dashboard rename (`R`).

   Related, as of 2026-08-27 (`feat/auto-name-on-start`, commit `d3c7330`): hub passes Pi's native `--name <provisional-title>` on fresh starts (config `session.nameOnStart`, default true; resume never re-passes `--name`). That auto-name is always the repo basename — caller-chosen titles are still impossible, and a custom title must also drive `--name` or hub title and Pi display name diverge.
2. **Initial prompt is unreachable.** `buildPiArgs()` in `src/core/pi-process.ts` already accepts `initialPrompt` and appends it as a positional argv element (Pi CLI treats positional args as the first user message), but no caller passes a value. The only way to deliver a task to a new session is to paste text into the tmux pane after boot (the dashboard `p` key path: `set-buffer` + `paste-buffer` + `send-keys Enter`), which races with session prelude + Pi TUI startup.

## 2. Goals

- G1: Allow a script to create a managed session with a caller-chosen title in one CLI call.
- G2: Allow a script to deliver an initial user message atomically at first Pi start — no tmux paste, no boot-readiness polling.
- G3: Zero behavioral change to existing start/restart/revive/fork flows when the new flags are absent.

## 3. Non-goals

- No new interactive dashboard fields (dashboard creation form unchanged).
- No persistent per-session "startup prompt" config. The prompt is a one-shot creation-time input, not session state.
- No changes to the fork path's prompt semantics (fork inherits conversation; `--prompt` on fork is out of scope for this FRD).
- No `--prompt` support on `pi-hub start` / `restart` / `revive`.

## 4. Functional requirements

### FR-1: `-t <title>` on `pi-hub add`

- FR-1.1: `pi-hub add <cwd> [-t <title>] [-g <group>] [--add-cwd path ...]` accepts `-t` and `--title` (both forms, plus `--title=<value>`).
- FR-1.2: When provided and non-empty, the session record's `title` is the given value, overriding `provisionalSessionTitle(cwd)`.
- FR-1.3: When absent or empty string, current behavior is unchanged (repo-basename provisional title).
- FR-1.4: The supplied title must flow to `configureManagedSessionStatusBar` so the tmux status bar matches the dashboard sidebar.
- FR-1.5: Title must be treated as data, never interpolated into a shell command string (titles routinely contain `:`, spaces, `/`).
- FR-1.6: The supplied title must also become the Pi `--name` value on first start (interacting with `session.nameOnStart`): when `-t` is given, `buildPiArgs` receives `name: <title>` instead of the provisional basename. When `-t` is absent, name-on-start behavior is unchanged.

### FR-2: `--prompt <text>` on `pi-hub add`

- FR-2.1: `pi-hub add` accepts `--prompt <text>` and `--prompt=<text>`. Text may contain spaces and slash-commands (e.g. `--prompt "/start-task TM-3402"`).
- FR-2.2: The prompt is passed to Pi exactly once, on the **first start of a freshly created session**, via the existing `initialPrompt` parameter of `buildPiArgs()` (positional argv, after all flags).
- FR-2.3: The prompt must **never be persisted** on the session record and must **never** be re-delivered on `start`, `restart`, `revive`, or dashboard-initiated restarts. It travels only through the in-memory add → first-start call chain.
- FR-2.4: If session creation or first start fails, the prompt is discarded with the session (current `addManagedSessionImpl` cleanup semantics apply). No retry queue.
- FR-2.5: When `--prompt` is absent, launch argv is byte-identical to today.

### FR-3: Shell quoting safety

- FR-3.1: `managedPiCommand()` builds a shell command string. The prompt must be single-quote escaped (`'` → `'\''`) when embedded, so prompts containing quotes, `$`, backticks, or newlines cannot break the command line or inject shell.
- FR-3.2: A prompt containing a literal newline is rejected with a clear CLI error (one-line messages only, matching the dashboard `p` constraint).

### FR-4: CLI help and doctor

- FR-4.1: `--help` output documents both flags with examples.
- FR-4.2: `pi-hub add` usage error string matches the real grammar (currently it omits `-t`).

## 5. CLI specification

```bash
pi-hub add <cwd> [-t <title>] [-g <group>] [--add-cwd <path> ...] [--prompt <text>]

# Example (mail-scan mirror session):
pi-hub add "$HOME/repo/tegra_top/gpu/diag_dev-t268" \
  -g mailscan \
  -t "mailscan:t268:TM-3402:Bug_5938648" \
  --prompt "/start-task TM-3402"
# stdout: <session-id>   (unchanged — id-only output, script-friendly)
```

Exit codes: 0 on success; non-zero on unknown flag, missing value, newline in prompt, or underlying add failure. Id-output contract on stdout is preserved (scripts capture `ID=$(pi-hub add ...)`).

## 6. Implementation map (for the implementer)

| File | Change |
| --- | --- |
| `src/cli.ts` | `add()`: parse `-t`/`--title`, `--prompt`; fix usage string |
| `src/app/session-lifecycle.ts` | `SessionInput` += `title?: string; initialPrompt?: string`; thread through `addManagedSessionImpl` → `startManagedSessionImpl` |
| `src/app/session-lifecycle.ts` (`startManagedSessionImpl`) | Accept optional `initialPrompt`; pass to `buildPiArgs()` **only when starting a session that has no prior Pi conversation** (fresh `sessionFile`). Also pass `name: <custom title>` to `buildPiArgs()` on that first start when `-t` was given (per FR-1.6) |
| `src/core/pi-process.ts` | No signature change needed (`initialPrompt` already supported); add shell-escape helper if quoting is handled here rather than in `managedPiCommand` |
| `src/core/registry.ts` / types | `createSessionRecord` accepts `title` override |
| Tests | CLI parse tests; argv-shape test proving prompt absent on restart; quoting tests for FR-3.1/FR-3.2; title-override test |

## 7. Edge cases

| Case | Required behavior |
| --- | --- |
| `-t ""` | Fall back to provisional title (FR-1.3) |
| `--prompt` with spaces/colons/slashes | Delivered verbatim as one Pi user message |
| `--prompt` with `'`, `$`, backtick | Shell-escaped per FR-3.1; no injection |
| `--prompt` with newline | CLI error, no session created (FR-3.2) |
| `add` auto-start fails | Record cleanup per existing semantics; prompt discarded |
| `restart` / `revive` later | Prompt NOT re-sent (FR-2.3); conversation resumes normally |
| Session created with `--prompt`, user opens dashboard before Pi finishes booting | No interference — prompt is argv, not a paste |

## 8. Acceptance criteria

1. `pi-hub add /tmp/x -t "My Title" -g test` → `pi-hub list` shows title `My Title`, group `test`; tmux status bar shows `My Title`.
2. `pi-hub add /tmp/x --prompt "echo hello"` → new session's Pi receives `echo hello` as its first user message without any tmux paste.
3. After `pi-hub stop <id>` + `pi-hub start <id>`, the prompt is not re-delivered; the prior conversation resumes.
4. `pi-hub add /tmp/x --prompt $'line1\nline2'` exits non-zero with a clear error and creates no session.
5. `pi-hub add /tmp/x --prompt "it's a \`test\$"` (quoted) starts successfully and the verbatim text reaches Pi.
6. All existing add/start/restart/fork tests pass unchanged (flag-absent behavior identical).
7. `--help` and the `add` usage string document `-t` and `--prompt`.

## 9. Consumer contract (mail-scan)

Once shipped, mail-scan Step 6 mirror-spawn reduces to:

```bash
PIHUB_ID=$(pi-hub add "$WORKDIR" -g mailscan -t "$SNAME" --prompt "/start-task $ARG")
```

No readiness polling, no tmux buffer handling, title matches the Claude bg session name.
