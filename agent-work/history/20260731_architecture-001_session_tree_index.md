# Session-tree ownership index

**Feature:** architecture-001
**Status:** Complete
**Branch:** `main`

## Objective

Centralize session ancestry lookup in `src/core/session-tree.ts` and reuse one index per behaviorally meaningful projection scope. Preserve ordering, filtering, lifecycle inheritance, board lanes, grouping, depth, descendant counts, selection behavior, persisted data, and exported call shapes.

## Implemented

- Added `createSessionTreeIndex()` with last-entry-wins ID lookup and cached ancestry traces.
- Exposed terminal owner, resolved owner, found parents, generic linked-parent IDs, missing-parent state, and cycle state through the trace.
- Migrated render depth, archive lifecycle/disclosure, board lane ownership, board expansion, lane grouping, descendant statistics, and board selection repair to the shared index.
- Kept separate indices for filtered rows, active rows, projected rows, lane-local rows, raw session snapshots, and controller snapshots because scope affects observable behavior.
- Left `sessionCascadeIds()` unchanged to preserve its generic `parentId` fixpoint behavior.
- Added regression coverage for deep nesting, missing links, self/closed/entering cycles, duplicate IDs, mixed main/subagent links, orphan board rows, archive lifecycle, and descendant statistics.

## Preserved behavior

| Consumer | Missing parent | Cycle |
| --- | --- | --- |
| Render depth | Returns accumulated partial depth | Stops before a repeated parent ID |
| Archive lifecycle | Falls back to the row | Uses the terminal cycle member |
| Board lane/expansion ownership | Omits the ownerless subagent | Omits the ownerless subagent |
| Board grouping | Uses the terminal row's group | Uses the terminal cycle member's group |
| Descendant statistics | Records every reachable linked parent ID, including an absent ID | Counts each reachable ID once |

Duplicate IDs retain last-entry-wins parent lookup. Generic parent links continue through main rows for descendant statistics, while ownership and depth stop at the first main owner.

## Verification

- `npm run typecheck`
- Full ephemeral source-compiled suite: **626/626 tests passed**
- Review-focused suite: **275/275 tests passed**
- `git diff --check`
- `code-critic`: **LGTM**
- `docs-critic` feedback incorporated

No dependency, persisted-format, public package export, or user-visible behavior change was introduced.

## Documentation

`docs/STRUCTURE.md` now identifies `src/core/session-tree.ts` as the canonical ancestry interface, requires one index per meaningful row scope, and records the operation-specific orphan and cycle policies.

## Deferred architecture candidates

Registry write freshness, refresh observation/persistence separation, and side-pane lifecycle orchestration remain separate architecture candidates and were not included in this ticket.
