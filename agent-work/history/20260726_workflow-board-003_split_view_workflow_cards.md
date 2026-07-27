# workflow-board-003 — Split view controls and workflow cards

Implemented on `main` in `pi-agent-hub` and `pi-session-summary`.

## Delivered

- Replaced the coupled groups/board toggle with persisted independent state:
  - `S`: project grouping ↔ workflow-stage lanes.
  - `v`: compact rows ↔ selected workflow cards.
  - State lives in `<PI_AGENT_HUB_DIR>/ui-state.json`, with safe defaults for malformed data.
- Redesigned selected cards with workflow ticket, lifecycle markers, phase-separated task grids, width degradation, attention/action windowing, stage badges, and graceful fallback when `plan.phases` is absent.
- Workflow markers use `✓` completed, `◉` active, and `·` pending to avoid ambiguity with runtime status circles.
- Added `plan.phases: [{ completed, total }]` to the `pi-session-summary` producer and Hub parser/rendering. Producer emits whole-plan task totals, caps phase data at 12 entries, and refreshes metadata when phase progress changes.
- Updated help text, README, `docs/STRUCTURE.md`, and `pi-session-summary/README.md` with the final controls, card semantics, persistence path, and metadata contract.

## Verification

- Hub: `npm test` — 606 passed.
- Producer: `npm test` — 103 passed.
- Hub and producer typechecks passed.
- `git diff --check` passed in both repositories.
- Manual/UI smoke validation covered all grouping/density combinations and lifecycle card states.
