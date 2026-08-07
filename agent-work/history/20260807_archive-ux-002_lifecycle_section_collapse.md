# archive-ux-002 — Lifecycle section collapse

## Outcome

Backlog and Archived can be independently collapsed in project grouping. Active stays expanded. The preference persists through `ui-state.json` as an optional `collapsedSections` array containing `backlog` and/or `archived`.

## Product contract

- Section headers are synthetic selectable targets.
- `▾` means expanded; `▸` means collapsed.
- `j`/`k`, arrows, wheel, and mouse select headers. `Enter` and double-click toggle them.
- Left/right remain dedicated to subagent-tree expansion.
- Collapsing a selected section hides its session rows but preserves full status counts.
- If the selected session becomes hidden, selection repairs to its section header. Header selection blocks session-only actions.
- Filtering reveals matching rows inside collapsed sections without changing saved state.
- Archived's five-parent preview and its inner older-cascade disclosure remain separate.
- Stage grouping keeps Backlog/Archived summarized and ignores section collapse for rendering.

## Implementation

- `SessionsViewState` accepts optional `collapsedSections`; startup parsing filters unknown values and saves omit the field when empty.
- `BuildRenderModelInput` carries collapse and synthetic-header selection state.
- Project lifecycle projection hides collapsed section rows while retaining counts; filtered projections reveal them.
- `RenderSection` carries collapse/selection metadata. `SessionListTarget` includes `section-header`.
- Header layout uses a fixed two-cell prefix so titles align:

  ```text
  ── ACTIVE
  ─▾ BACKLOG
  ─▸ ARCHIVED
  ```

- Existing theme tokens and width-safe layout helpers remain in use.
- `SessionsView` tracks synthetic section selection, toggles state, repairs selection, persists view state, and guards session actions.

## Tests and docs

Added render-model and SessionsView coverage for independent collapse, persistent saves, filtering, header alignment, keyboard toggling, and inert session actions. Updated `docs/FEATURES.md` and `docs/STRUCTURE.md` with controls, persistence, filtering, selection, and project/stage semantics.

Validation: `npm run typecheck` and `npm test` pass. Final test count at implementation closeout: 689 passing tests.

## Scope

No new dependency, registry state, Pi conversation state, Active collapse, global collapse shortcut, or settings dialog was added. Existing user changes in `CHANGELOG.md`, unrelated source/tests, and `agent-work/decks/session-data-map.html` were preserved.
