**Feature:** workflow-board-002 — Focus mode display
**Completed:** 2026-07-25

# Focus mode display

## Outcome

Rules focus mode is visible in `pi-agent-hub` as a transient modifier of the active Execute step. Focused sessions display the producer-owned `FOC` short code, remain in the `EXECUTE` board lane, and show `Focus · turn N` only in expanded details. Ending focus restores `EX`; stopped or untrusted sessions suppress stale focus decoration while retaining the base Execute workflow snapshot.

This ticket was implemented on the reviewed, uncommitted `workflow-board-001` foundation because both tickets modify the producer workflow contract and Hub board/rendering files.

## Product decisions

- Focus is an Execute mode, not a workflow step, lane, lifecycle state, filter, or ordering tier.
- Rules owns the mode vocabulary and publishes generic display metadata; Hub does not inspect Rules' private execution state or hardcode focus vocabulary.
- Hub does not animate the marker or provide focus controls.
- Compact rows and rails use `FOC`; expanded details alone show the producer label/detail.
- Board cards prefer `FOC · group`, then `FOC`, then no adornment. The group is dropped before it can truncate an otherwise displayable title.
- Stopped sessions render the retained base step as `EX`, omit mode detail, and remain in the `EXECUTE` lane.

## Architecture

### Rules producer

`extensions/workflow-runtime/core.ts` defines the generic `WorkflowModeDisplay` contract and shared `FOCUS_MODE_DISPLAY` vocabulary. `withWorkflowDefinition()` derives:

```json
{
  "activeStep": "execute",
  "activeMode": {
    "id": "focus",
    "short": "FOC",
    "label": "Focus",
    "detail": "turn 4"
  }
}
```

The ordered base workflow still contains `{ "id": "execute", "short": "EX" }`. The Pi rail composes its existing pulse glyph from the shared `FOC` short, preventing vocabulary drift without publishing pulse phase. Ending focus naturally omits `activeMode`.

### Hub bridge and retention

Hub validates optional `activeMode` independently from the base producer workflow. Nonblank `id` and `short` are required; `label` and `detail` are optional. Malformed mode decoration is omitted without discarding a valid base rail or board card.

`ManagedSession.workflow` retains only the base `WorkflowSnapshot`. `SessionsController` keeps mode display in a private transient map and merges it into `RuntimeSession.workflow` only when the heartbeat is fresh, non-shutdown, and tmux presence is confirmed. Stale, missing, shutdown, or unknown runtime evidence clears the mode. `activeMode` never enters `registry.json`.

The producer's workflow `updatedAt` is a state-change timestamp and can advance within Execute as focus turns complete; heartbeat `updatedAt` remains the independent liveness timestamp.

### Rendering

Rendering resolves an effective active short without mutating producer steps. The mode substitutes display text only at `activeIndex`; workflow identity and board lane selection continue to use ordered base step ids. Existing theme tokens and ANSI-width helpers provide accent styling and width safety.

## Main implementation surfaces

### pi-agent-hub

- `src/core/types.ts`
- `src/extension/index.ts`
- `src/core/status.ts`
- `src/app/controller.ts`
- `src/tui/render-model.ts`
- `src/tui/layout.ts`
- `test/extension.test.ts`
- `test/status.test.ts`
- `test/controller.test.ts`
- `test/render-model.test.ts`

### rules

- `extensions/workflow-runtime/core.ts`
- `extensions/workflow-runtime/index.ts`
- `tests/workflow_runtime.test.mjs`

## Verification

- Hub typecheck passed.
- Complete Hub suite passed through an ephemeral compile: **592 tests**.
- Rules Python suite passed: **54 tests**.
- Rules workflow runtime suite passed: **16 tests**.
- Independent UI inspection passed at 40, 60, and 110 columns, including ANSI width bounds, Execute-lane stability, expanded-only detail, narrow-card fallback, and stopped-session behavior.
- Registry tests confirmed mode metadata is not persisted.
- `git diff --check` passed in both repositories.

## Review and documentation

Code review found one narrow-card issue: `FOC · group` could truncate a title that fit with `FOC` alone. The renderer now drops the group first, with a regression test.

Durable documentation records the generic mode contract, transient retention boundary, Execute-lane behavior, producer ownership, and state timestamp semantics in Hub configuration/features/structure docs and Rules README/structure docs.
