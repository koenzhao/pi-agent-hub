# dashboard-scanability-010 — Attention-first ordering

## Outcome

Improved dashboard scanability for Active and Backlog sessions:

- Groups remain stable: `default` first, then alphabetical.
- Rows sort as errors, unacknowledged waiting, running/starting, acknowledged idle, stopped.
- Waiting and idle tiers sort newest-first by `lastActivityAt`.
- Group headers show derived unacknowledged-waiting counts.
- Archived remains globally chronological.
- Context compaction reports transient `running`, restores the pre-compaction state, and keeps retrying work running until `agent_start`.

## Implementation

- `src/core/session-order.ts` now owns acknowledgement-sensitive row priority and stable group ordering while preserving exact-tie manual reorder behavior.
- `src/extension/index.ts` handles Pi compaction lifecycle events with an extension-local snapshot, bounded watchdog, retry cleanup, and serialized heartbeat writes to prevent stale restores from overwriting newer lifecycle states.
- `src/tui/render-model.ts` derives `RenderSession.needsAttention` and `RenderGroup.attentionCount` from visible projections without persistence or parent-state promotion.
- `src/tui/layout.ts` renders warning/muted group badges with existing width-safe helpers and preserves row attention alongside selection.
- Tests cover ordering, controller navigation, heartbeat state/activity semantics, compaction lifecycle and watchdog behavior, group projections, stage grouping, and narrow layouts.
- Durable contracts are documented in `AGENTS.md`, `docs/FEATURES.md`, and `docs/STRUCTURE.md`.

## Validation

- Build/typecheck passed.
- Targeted feature tests passed: 350 tests.
- Smoke script passed.
- Full suite ran with 694 passing tests and one unrelated pre-existing failure in `test/dashboard.test.ts` concerning dashboard theme configuration.

## Deferred

- A dedicated Attention filter or top-level attention summary remains separate scope.
- Persisted, user-reorderable groups remain out of scope; groups stay implicit labels.
