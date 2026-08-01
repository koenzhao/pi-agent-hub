# Dashboard side-pane lifecycle

**Feature:** architecture-002
**Status:** Completed
**Branch:** `architecture-002`
**PR target:** `main`

## Outcome

Dashboard side-pane orchestration now lives behind the functional `createSidePaneLifecycle()` interface in `src/app/side-pane-lifecycle.ts`. The lifecycle owns transient slots and focus, serialized intents, presence polling and reconciliation, pane mutation transactions, full-screen handoff, chrome synchronization, and teardown. `src/app/run-tui.ts` supplies focused session, theme, render, runtime, and execution dependencies and forwards TUI intents.

The change preserves sparse four-slot behavior, sidebar focus, tmux geometry and command contracts, live pane repair, status/footer transitions, return bindings, theme behavior, polling semantics, errors, and shutdown ordering. Panel state remains derived from live tmux and is never persisted.

## Architecture

- `src/app/side-pane-lifecycle.ts` is the stateful app-level coordinator.
- `src/app/side-pane.ts` remains the authoritative stateless implementation for pane inspection, geometry, repair, assign/reset/close/focus operations, and result contracts.
- `src/core/tmux.ts` remains the sole tmux command implementation, reused directly through the existing `TmuxExec` seam.
- `src/app/run-tui.ts` retains dashboard composition, controller ownership, global theme confirmation, render hooks, general producer shutdown, mouse cleanup, and final TUI termination.
- No class hierarchy, event bus, duplicate pane adapter, persistence layer, dependency, public package export, or generic lifecycle framework was added.

## Preserved lifecycle contracts

### Startup and presence

`start()` queues managed-session chrome synchronization before immediate presence inspection. Reconciliation inspects and repairs live panes, repairs sidebar width and pane titles, updates first/last-pane dashboard chrome, reconciles sidebar bindings, restores removed footers before hiding added footers, commits slot/focus state, and renders only on observable change. Polling remains immediate, non-overlapping, error-suppressing, and drainable.

### Pane intents

Assign and reset resolve the current session inside the serialized transition, acknowledge waiting sessions before mutation, prepare first-pane chrome, reuse low-level pane operations, reconcile actual panes after failures, roll back empty/too-narrow first opens, and configure managed chrome only for mutation results that opened or moved a target. Assign, reset, and explicit close retain sidebar focus; only explicit focus selects a managed pane.

Close pauses and drains presence polling around the serialized mutation and reconciliation. Focus joins the operation queue without pausing polling. Full-screen handoff restores the target footer, removes sidebar bindings, delegates pre-size/switch/reset and return bindings to `switchClientWithReturn()`, then closes only the pane showing the target.

### Theme and shutdown

Panel-border preview, per-session chrome synchronization, and confirmed global theme propagation remain distinct paths. General dashboard producers stop before lifecycle teardown, while mouse and terminal/TUI cleanup remain outside it under `.finally(finish)`.

The reviewed implementation tracks complete public lifecycle intents, not only operations that have already entered the internal queue. Shutdown prevents new close mutations, drains already-started intents and polling, restores switch/sidebar bindings, restores paneled session footers best-effort, closes Hub-owned panes, restores dashboard status, and clears pane-border mode. This prevents teardown from racing a close intent that is still waiting for presence polling to drain.

## Tests and verification

Added `test/side-pane-lifecycle.test.ts` with an event-recording `TmuxExec` and isolated binding state. Durable coverage includes:

- startup ordering, sparse presence adoption, width/title repair, and footer transition order;
- waiting acknowledgement, assignment/reset outcomes, first-open rollback, and narrow-window refusal;
- survivor and final-pane close behavior, focus serialization, and rejection recovery;
- exact handoff return context, target-only close, and post-switch reset failure;
- distinct theme hooks, binding restoration, best-effort teardown, idempotence, poll draining, and shutdown races.

Final verification:

- `npm run typecheck` passed.
- Focused side-pane/run-TUI/tmux tests passed 95/95.
- Complete suite passed 663/663.
- `git diff --check` passed.
- Final `code-critic` review returned LGTM.
- `docs/STRUCTURE.md` now records the lifecycle/low-level module boundary and shutdown drain rule.

## Follow-up candidates

- Registry write freshness remains a separate architecture candidate.
- Refresh observation/persistence separation remains a separate architecture candidate.
- A broader `SessionsViewActions` capability split remains tracked as `tui-dialogs-002`.
