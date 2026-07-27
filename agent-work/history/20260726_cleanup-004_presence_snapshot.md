# cleanup-004 — Reuse the dashboard refresh presence snapshot

## Summary

`SessionsController.refresh()` now records each registry row's `TmuxPresence` during the main scan and passes that read-only snapshot to archive pruning. Expired archived cascades no longer issue a second tmux presence probe, and the pruning helper is synchronous. Heartbeat/metadata read order, tri-state handling, status reduction, selection, subagent pruning, registry writes, and archive cleanup behavior remain unchanged.

Added controller coverage for both present and missing archived parent/subagent cascades, including one injected presence call per registry row. `docs/STRUCTURE.md` now documents the one-refresh presence-snapshot rule.

## Verification

- `npm run typecheck` passed.
- Test-first regression failed against the old module-level pruning probe, then passed after the change.
- Full ephemeral source-compiled Node suite passed: 607 tests.
- `git diff --check` passed; temporary compilation output was removed.
- Code and documentation critics returned LGTM.

## Follow-up

The remaining cleanup candidates stay tracked as `cleanup-002`, `cleanup-003`, `cleanup-005`, and `cleanup-006`.
