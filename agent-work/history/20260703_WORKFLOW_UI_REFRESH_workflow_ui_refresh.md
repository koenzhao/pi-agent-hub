# Workflow-aware UI/UX refresh

## Summary

Implemented a workflow-aware dashboard polish pass for `pi-agent-hub`: sessions can surface workflow-stage state from the optional `workflow-indicator` extension, show compact/full workflow rails, and toggle a stage-lane view with `v`. The visual refresh also adds selected-row background highlighting, rounded chrome, styled footer/help/empty states, and width-safe workflow/status rendering.

## Implemented changes

- Added `WorkflowSnapshot` to core session and heartbeat types.
- Extended the Hub Pi extension heartbeat bridge to read the latest `workflow-indicator` custom branch entry and emit `workflow` when available.
- Persisted workflow snapshots through status refresh so stopped/stale sessions retain their last known stage lane.
- Added render-model support for `groups` and `stages` views, including stage lanes ordered by workflow steps and a `NO WORKFLOW` lane.
- Added `v` as a reserved dashboard key and TUI toggle for groups/stages view.
- Rendered compact workflow rails in rows and full rails in details.
- Kept subagent rows nested under their parent lane and disabled group reordering while in stages view.
- Added `selectedBg` theme support and background styling for selected rows.
- Refreshed visual chrome with rounded borders and themed footer/help/empty-state styling.
- Updated README/domain docs for workflow rail, stages view, and the optional extension contract.
- Added/updated tests for extension heartbeat workflow capture, status persistence, render model lanes, TUI toggling, theme token loading/background styling, and reserved shortcut validation.

## Key constraints kept

- Workflow integration is optional and best-effort; absence or drift of the external extension hides the rail instead of affecting normal dashboard behavior.
- Render logic remains pure and width-safe.
- Existing groups view and dashboard shortcuts remain the default; `v` only toggles the alternate stages view.
- Backlog/Archived sessions are summarized in stages view rather than mixed into active workflow lanes.
