**Feature:** archive-ux-001 — Compact chronological Archived section
**Completed:** 2026-07-12

# Compact chronological Archived section

## Outcome

Archived is now a compact, globally chronological recent-history section:

- Parent session cascades sort newest-first across groups by `bucketChangedAt`.
- The collapsed view shows the newest five parent cascades; nested subagents remain attached and do not count toward the limit.
- A selectable `… N older archived` row expands with `Enter` or double-click and becomes `⌃ show fewer` while expanded.
- Filtering bypasses collapse so matching older archives remain discoverable.
- Archived rows show compact elapsed ages such as `8m`, `4h`, and `2d`; details show archive age and cleanup eligibility.
- Archived sessions cannot be manually reordered. Active and Backlog retain grouped manual ordering.
- Dashboard cleanup eligibility begins after seven days and still requires every tmux session in the parent/subagent cascade to be confirmed missing.

## Implementation

### Ordering and retention

- `src/core/session-order.ts` applies global descending archive-time ordering only within Archived, with stable registry-order fallback for ties or missing timestamps.
- `src/core/session-bucket.ts` defines the seven-day retention threshold and no longer exposes the obsolete expiry helper.
- `src/app/controller.ts` rejects Archived reorder requests while preserving existing conservative cascade pruning and Hub-state-only cleanup.

### Archive presentation

- `src/tui/archive-section.ts` provides the pure five-parent partition and resolves descendants' effective lifecycle/timestamp from their top-level parent without mutating registry rows.
- `src/tui/render-model.ts` keeps Active and Backlog grouped, emits Archived as one flat section, excludes effectively non-active descendants from stages view, and supplies elapsed/retention timing fields.
- `src/tui/layout.ts` renders compact right-aligned ages and models disclosure as a `SessionListTarget` rather than a fake session.

### Interaction safety

- `src/tui/sessions-view.ts` owns ephemeral archive expansion and disclosure selection.
- Keyboard navigation, single-click selection, and double-click toggling include the disclosure row.
- Session-dependent actions are inert while disclosure is selected, while global navigation, help, filtering, panel focus, and new-session creation remain available.
- Selection normalizes after filtering, collapse/expand changes, view changes, refresh, and pruning.

## Product and architecture decisions

- A fixed five-parent preview gives predictable sidebar usage; age-based hiding was rejected.
- Archived is globally chronological rather than grouped because group headers would obscure recent-history order and consume rows.
- Disclosure remains TUI-local and ephemeral so it cannot affect registry state, status counts, persistence, or session actions.
- Late-created subagents inherit their top-level parent's rendered lifecycle and timestamp so cascades stay contiguous.
- Cleanup never stops tmux and never deletes Pi conversation/session files.

## Documentation

Updated:

- `README.md`
- `docs/FEATURES.md`
- `docs/STRUCTURE.md`
- `AGENTS.md`

These documents now describe the five-parent disclosure, chronological Archived ordering, reorder restriction, effective subagent lifecycle, and conservative seven-day cleanup.

## Verification

- `npm run typecheck` passed.
- All 557 compiled tests passed during implementation validation.
- Focused archive/order/controller/render/view suites passed after review fixes.
- Width-safe rendering was validated at the 40-column minimum.
- Independent functional validation confirmed disclosure interaction, filtering, timing labels, stale-action safety, and cascade behavior.
- `git diff --check` passed.

## Review fixes

- Positive retention time below one minute renders as `<1m` rather than claiming cleanup eligibility `now`.
- Dashboard help copy distinguishes grouped Active/Backlog from flat Archived and describes five parent cascades.

## Discovered follow-up

- `worktree-setup-001` was registered as independent pending work for opt-in repository-defined worktree setup hooks. It was not implemented as part of this feature.
