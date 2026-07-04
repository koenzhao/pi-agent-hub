# json-store-001 — Shared JSON store and errno helpers

**Feature:** json-store-001
**Status:** done

## Summary

Consolidated JSON persistence behind `src/core/atomic-json.ts` with functional helpers for missing-file defaults, optional version/shape parsing, mkdir-based file locks, locked read-modify-write updates, atomic writes, and shared filesystem errno checks.

## Implemented

- Added `JsonStore<T>`, `loadStore`, `withFileLock`, `updateStore`, and `isErrno` in `src/core/atomic-json.ts`, while preserving existing `readJson`, `readJsonOr`, and `writeJsonAtomic` helpers.
- Migrated registry, repo history, project MCP state, and project skills state to shared store primitives:
  - `src/core/registry.ts` now loads/updates through a registry store config and keeps direct `saveRegistry` for snapshot writes.
  - `src/core/repo-history.ts` now records repo usage through locked updates.
  - `src/mcp/config.ts` now validates catalog and project MCP state through store parsers; single-server toggles happen inside the lock.
  - `src/skills/attach.ts` now loads/updates project skill state through a parser-backed store and performs materialization/removal inside locked updates where needed.
- Replaced duplicated ENOENT/EEXIST helpers and inline `ErrnoException` casts across core/app/tui/mcp/skills code with `isErrno`.
- Documented the shared JSON persistence pattern in `docs/STRUCTURE.md` and `AGENTS.md`.

## Tests and validation

- Added `test/json-store.test.ts` for load defaults, parse errors, mutation return modes, concurrent updates, lock wait/timeout behavior, and `isErrno`.
- Added MCP concurrency and invalid state tests in `test/mcp-config.test.ts`.
- Added missing-detach no-op and invalid state tests in `test/skills.test.ts`.
- Validation passed:
  - `npm test` (423 tests)
  - `npm run build`
  - errno grep sweep found no duplicate errno checks in `src/`
  - `git diff --check`
  - `node dist/cli.js --help`
  - temp-state `node dist/cli.js doctor`

## Follow-up candidates

- Consider whether the removal of `withRegistryLock` from the public `export *` surface needs release-note treatment.
- `src/app/controller.ts` still performs direct registry snapshot writes via `saveRegistry`; evaluate separately if full registry write serialization is needed.
