**Feature:** architecture-005 — Heartbeat intake
**Session:** 01a026fc-46e5-7d39-aa04-769f5e17ee10
**Branch:** main
**Worktree:** none

# Heartbeat intake

## Outcome

Hub now validates and normalizes heartbeat files through one core intake seam before status or runtime projection. Invalid core envelopes and session-ID mismatches are treated as missing heartbeats. Malformed optional metadata is omitted without hiding valid liveness.

## Implemented architecture

- Added `src/core/heartbeat.ts` for heartbeat file loading, required-envelope validation, expected-session identity checks, optional scalar normalization, active-theme validation, generic context composition, and workflow parsing.
- Kept `readHeartbeat()` publicly available through `src/core/status.ts`; status retains only liveness reduction and stale/shutdown retention.
- Updated `src/app/controller.ts` to consume validated context and workflow data without reparsing it.
- Reused `parseSessionContext()` from `src/core/session-context.ts` rather than creating a second context validator.
- Moved workflow-runtime parsing out of `src/extension/index.ts` while preserving Pi entry lookup, publication timing, atomic serialized writes, compaction behavior, and child-owned heartbeat handling.

## Workflow contracts

Producer custom entries and stored heartbeat snapshots use distinct position forms:

- `parseWorkflowEntry()` accepts producer `activeStep` IDs and resolves them to an index.
- `parseWorkflowSnapshot()` accepts stored numeric `activeIndex` values.
- Both adapters share step, mode, activity, and plan validation.
- Each adapter rejects payloads containing the other known position field, including dual-field payloads.
- Invalid mode, activity, or plan decoration is omitted without dropping a valid base workflow.

## Heartbeat contract

Required fields are a matching nonblank `managedSessionId`, nonblank `cwd`, a known heartbeat state, and finite nonnegative `stateSince` and `updatedAt` values. Unknown fields are ignored.

Optional identity strings and `kind` are kept only when their types are valid. Invalid context or workflow snapshots are omitted independently. Active themes retain only valid names, source paths, and known tokens with string or finite numeric values. Missing files, invalid JSON, invalid root shapes, and identity mismatches return no heartbeat; unexpected filesystem errors still surface.

No cwd-to-registry comparison, schema migration, logging system, validation framework, status change, freshness change, or registry format change was introduced.

## Tests and documentation

- Added focused heartbeat tests for main and child envelopes, malformed required and optional fields, identity mismatches, file failures, theme/context/workflow isolation, and both workflow position forms.
- Added controller regressions for tmux fallback after identity mismatch and valid live status with malformed optional metadata.
- Preserved existing extension, status, concurrency, stale/shutdown, workflow-retention, and integration tests.
- Updated `docs/STRUCTURE.md` with intake ownership and producer/stored workflow boundaries.

## Review

Code review found that each workflow adapter initially ignored the other adapter's position field when both were present. The adapters now reject dual-field payloads, with regression tests. The final code-critic result was `LGTM`.

## Verification

- `npm run typecheck`
- `npm test` — 726 tests passed before review; focused heartbeat, extension, and workflow integration tests passed after the review fix
- `npm run package:check`
- `git diff --check`
