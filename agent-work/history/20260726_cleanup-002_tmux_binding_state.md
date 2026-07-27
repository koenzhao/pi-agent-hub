# cleanup-002: Deduplicate tmux binding state loading

- **Feature:** Consolidate switch/sidebar return-binding state reads while preserving missing-file, stale-owner, legacy-key, lock, error, and tmux-command behavior.
- **Branch:** `main`
- **Scope:** Reused `readJsonOr<T>(path, undefined)` from `src/core/atomic-json.ts` in switch/sidebar inspection, sidebar cleanup, and switch restoration. Family-specific policies and the distinct restoration bodies remain separate.
- **Tests:** Added malformed-JSON propagation coverage for all four readers, verified no cleanup/restoration tmux calls and sidebar lock release, added missing-state cleanup no-op coverage, and asserted legacy sidebar inspection defaults `keys` to `[returnKey]`.
- **Verification:** Focused tmux tests passed; `npm run typecheck` passed; ephemeral source-compiled suite passed **609/609**; `git diff --check` passed.
- **Reflection:** No durable documentation changes required; the change is private implementation cleanup.
- **Discovered work:** `cleanup-003`, `cleanup-005`, and `cleanup-006` remain separate tickets.
