# cleanup-001 — Remove proven dead symbols

## Summary

Removed four declarations with no repository consumers:

- `sessionDir` from `src/core/paths.ts`
- `tmuxMissing` from `src/core/status.ts`
- `mcpCatalogPath` from `src/mcp/config.ts`
- `removeOwnedWorktree` from `src/core/worktree.ts` (the plural API remains live)

The three barrel-visible removals narrow the package declaration surface intentionally, and `CHANGELOG.md` records the cleanup with SemVer deferred to publishing. No compatibility aliases, runtime changes, or durable docs changes were added.

## Verification

- Baseline and post-change `npm run typecheck` passed.
- Repository-wide reference sweep found no remaining deleted-symbol references in source, tests, docs, README, package metadata, or generated declarations.
- Ephemeral TypeScript compilation and source-compiled Node suite passed: 606 tests.
- Existing `dist/cli.js` was present; CLI subprocess tests that explicitly target it were not counted as source-change evidence.
- `git diff --check` passed, and temporary compilation output was removed.

## Follow-up

The remaining cleanup candidates stay tracked as `cleanup-002` through `cleanup-006`.
