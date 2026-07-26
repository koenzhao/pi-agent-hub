# workflow-board-001 — Rich workflow board

**Completed:** 2026-07-25  
**Repositories:** `pi-agent-hub`, `pi-session-summary`, `rules`  
**Worktree:** none

## Outcome

Replaced the existing `v` stages presentation with a responsive, read-only workflow board. Hub now projects producer-owned workflow lanes, synthetic `OTHER ACTIVE`, nested groups, compact selected cards, explicit attention, deterministic plan progress, collapsed subagent trees, filter-driven context, and running-subagent counts without persisting board state or parsing repository plans.

Workflow position, runtime liveness, attention, plan progress, disclosure, and worker count remain independent. Base workflow definitions come from `rules`' `workflow-runtime`; transient plan and attention metadata come from `pi-session-summary`; Hub remains a generic consumer. Focus mode decorates Execute without changing its lane or progress semantics.

Plan progress is emphasized as `Phase X/Y · A/B tasks` only during the producer's base `execute` step. Other producer steps and workflowless cards retain the exact values as dim `plan X/Y · A/B tasks`; full context remains in details.

## Producer contracts

- `workflow-runtime` publishes ordered step `id`/`short`/`label` definitions and stable update timestamps, and normalizes resumed state.
- `pi-session-summary` publishes bounded `plan.feature`, phase/task fractions, deterministic next actions, semantic attention, and metadata update logs. Explicit tickets persist across ordinary follow-up prompts.
- Same-level helper headings remain scoped to their surrounding numbered plan phase.
- Hub validates transient metadata and never writes display metadata into `registry.json`.

## Board behavior

- Existing `v` toggles groups and board views; canonical Active trees occupy producer lanes and all other Active trees appear once in `OTHER ACTIVE`.
- Parent groups are nested in lanes; counts are parent-only. Subagent trees start collapsed, `Space` toggles ephemeral disclosure, filters reveal matching context without mutating expansion, and collapsing repairs descendant selection to its parent.
- Selected cards preserve a visible border at all widths and contain at most attention, exact progress, one action, and closing border. Unselected rows remain one line; full feature/phase/action context stays in the details pane.
- Attention uses explicit `ready`/`question`/`blocked` evidence only for waiting/idle rows. Running state suppresses attention but never valid plan progress.

## Verification

- Hub: typecheck; 606 complete ephemeral tests; focused render/session-view coverage; 40/60/100-column interaction and ANSI-width smoke tests; live dashboard capture after build/install/restart.
- `pi-session-summary`: `npm run check`; 101 tests; dry-run package; direct live-plan parsing.
- `rules`: 54 Python tests and 14 workflow-runtime tests.
- `git diff --check` passed in affected repositories.
- Final code review and documentation review returned LGTM after coverage and wording corrections.

## Follow-up observation

A screenshot showed `Run /reflect` remaining as semantic `nextStep` while the workflow lane had already moved to Reflect. This is producer metadata timing/ownership, not board rendering; investigate separately whether workflow commands should clear or replace stale semantic next actions.
