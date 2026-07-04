# dead-code-001 — Delete shallow wrappers and dead MCP/pi-process exports

## Summary

Deleted the shallow `src/core/cli-command.ts` module by moving `cliTuiCommand` into `src/core/tmux.ts`, where tmux/shell command construction already lives. Removed unused public exports `McpTool`, `PiToolDefinition`, and `buildPiCommand` while preserving the live `buildPiArgs`, `McpToolResult`, `normalizeMcpInputSchema`, and `mcpResultToText` APIs.

## Implemented

- Moved `cliTuiCommand({ nodePath, cliPath })` to `src/core/tmux.ts`, reusing the existing private `shellQuote` helper.
- Updated `src/cli.ts` to import `cliTuiCommand` from `./core/tmux.js`; the dashboard still launches the current CLI file's `tui` command instead of PATH-resolving `pi-hub tui`.
- Deleted `src/core/cli-command.ts` and `test/cli-command.test.ts`.
- Moved the dashboard command quoting regression into `test/tmux.test.ts`, updating the expected POSIX quote style to match `tmux.ts`.
- Deleted dead `McpTool` and `PiToolDefinition` interfaces from `src/mcp/adapter.ts`.
- Deleted unused `buildPiCommand` from `src/core/pi-process.ts`.
- Updated `docs/STRUCTURE.md`, `docs/FEATURES.md`, and `CHANGELOG.md` to describe the current CLI-file dashboard launch path and public API removals.

## Discovered Work

None.

## Validation

- Baseline `npm run typecheck` passed before implementation.
- Targeted `npm test -- --test-name-pattern ...` runs passed after the command move and dead export deletion.
- Final validation passed:
  - `npm test`
  - `npm run build`
  - `npm run typecheck`
  - `node dist/cli.js --help`
  - timed `node dist/cli.js tui` smoke
  - grep sweeps confirmed no `cli-command` references in `src/`, `test/`, or `docs/`, and no `McpTool`, `PiToolDefinition`, or `buildPiCommand` references in `src/` or `test/`.
  - `git diff --check`

## Notes

The removed MCP/pi-process symbols were public through the package barrel, so the changelog records the API cleanup. Release versioning remains a publishing-time decision.
