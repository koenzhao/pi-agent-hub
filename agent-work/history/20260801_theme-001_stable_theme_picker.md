**Feature:** theme-001 — Stable dashboard theme picker
**Session:** 019fa202-bade-758e-99cd-80e116427156
**Branch:** `main`
**Worktree:** none

## Outcome

Replaced session-following dashboard colors with a stable dashboard-owned theme setting. Pressing `t` opens a Pi-like picker over built-in and globally available Pi themes, supports fixed themes and Pi 0.83 Automatic light/dark pairs, previews without persistence, and restores on `Escape`.

Pi global theme synchronization is enabled by default. Users can disable it to persist an independent Hub override, then re-enable it to push the visible Hub setting back to Pi. Confirmed synchronized themes are also applied once to live managed parent sessions without tmux text injection; subagents and unmanaged Pi processes are excluded.

## Final Design

### Source of truth

- `dashboard.themeSync` defaults to `true`.
- Synchronized mode reads Pi's global theme setting directly and keeps no mirrored Hub value.
- Detached mode reads `dashboard.theme`; if a manually edited detached config has no override, it falls back to Pi global, then dark.
- Saving a synchronized preference clears `dashboard.theme`; saving a detached preference stores the visible fixed or Automatic setting.
- Obsolete `dashboard.themeSessionId` data is ignored and removed on the next theme preference write.

### Theme catalog and Automatic behavior

- Pi 0.83+ `SettingsManager` owns global setting reads/writes and observable flush errors.
- `DefaultResourceLoader` supplies global custom/package themes; project-local themes are excluded.
- The dashboard catalog is cached for the process while the selected custom source file may refresh.
- Automatic settings retain Pi's `<light>/<dark>` string. Dashboard appearance resolves once at startup from `COLORFGBG` using Pi-compatible linear-sRGB luminance, with dark fallback.
- Unknown or unavailable selections render with Hub's bounded dark fallback without rewriting the persisted value.

### Dialog and stable chrome

- `src/tui/theme-dialog.ts` owns the dedicated dialog state and width-safe renderer.
- Movement previews the TUI, dashboard status bar, and active sidebar borders only.
- `Space` toggles synchronization without changing the selected fixed/Automatic setting.
- `Enter` saves; `Escape` restores the opening setting.
- Effective-theme polling is suspended during preview, including discarding a load that became in-flight before suspension.
- Session selection, entry, panel assignment, and heartbeat changes never recolor the dashboard.

### Persistence and live managed sessions

Synchronized confirmation occurs in this order:

1. Save and flush Pi global settings; abort on recorded load/write errors.
2. Save Hub preference and clear the detached override.
3. Atomically publish `theme-command.json` with a unique revision, original setting, resolved concrete name, and timestamp.
4. Apply dashboard and managed tmux chrome locally.

If Hub persistence fails after Pi succeeds, the dialog reports the partial outcome and remains retryable. Detached confirmation writes Hub config only.

Managed parent extensions poll the command at most once per second and on lifecycle events. A command must be strictly newer than extension process start. The extension resolves a Pi `Theme` object, applies it once with `ctx.ui.setTheme(theme)`, and immediately refreshes its heartbeat. Missing/malformed commands, unavailable themes, headless contexts, unmanaged processes, older/equal timestamps, repeated revisions, and `pi-tmux-subagents` children are bounded no-ops. Timers are cleared at shutdown.

## Reuse and Scope

- Reused `src/core/atomic-json.ts` for atomic state.
- Reused `SessionsTheme`, existing theme JSON fallback, tmux chrome helpers, refresh-loop ownership, and the `SessionDialog` module pattern.
- Centralized ANSI foreground/background parsing in `src/core/theme-color.ts`.
- Added only two feature-specific modules: `src/tui/theme-dialog.ts` and `src/core/theme-command.ts`.
- Kept managed-session heartbeat themes for each session's own footer/chrome.
- Added no theme library, terminal framework, slash-command propagation, project-local catalog support, or continuous live enforcement.

## Compatibility

- Minimum Pi peer/development version: 0.83.0.
- Minimum Node.js version: 22.19.0, matching Pi 0.83.
- Matching `@earendil-works/pi-tui` 0.83 dependency retained one installed TUI version.

## Verification

- `npm run typecheck` passed.
- Full temporary-output suite passed after review: 651 tests, 0 failures.
- `npm run package:check` passed from an ephemeral repository copy to avoid rebuilding the actively linked checkout.
- Isolated tmux smoke testing confirmed:
  - preview/cancel without writes;
  - detached Automatic persistence as `light/dark`;
  - re-synchronization to Pi global settings;
  - one command with the resolved concrete dark theme;
  - no detached Pi/command side effects;
  - visible Sync state at 40 columns.
- Final code-critic review: LGTM.

## Durable Documentation

Updated:

- `README.md` and `docs/DEVELOPMENT.md` requirements.
- `docs/CONFIG.md` source-of-truth, persistence, Automatic, catalog, and propagation behavior.
- `docs/FEATURES.md` theme workflow and `t` shortcut.
- `docs/STRUCTURE.md` stable dashboard ownership and the managed extension command bridge.

## Follow-up Boundary

Per-session acknowledgements or delivery counts for one-way theme commands remain a possible future feature only if operational failures justify the added state. They were deliberately excluded here.
