# Cleanup and simplification audit

**Epic:** cleanup → behavior-preserving internal cleanup and safe performance improvements for `pi-agent-hub`.
**Worktree:** none; use the existing clean checkout and current branch.

## Goal and boundaries

Keep session, tmux, TUI, persistence, extension, and MCP/Skills behavior exactly unchanged. Remove only proven dead code, consolidate equivalent logic behind existing natural modules, and optimize independent read-only work only when ordering, errors, and side effects remain equivalent. Do not add dependencies, broad abstractions, new state, or speculative rewrites.

## Planned tickets

- `cleanup-001` — remove symbols proven dead after checking the package barrel and all repository consumers.
- `cleanup-002` — deduplicate tmux return-binding state loading without changing stale/ownership semantics.
- `cleanup-003` — share cursor-aware text-input rendering and compatible Enter-key recognition across TUI inputs.
- `cleanup-004` — reduce repeated/serial dashboard refresh I/O while preserving snapshot and metadata precedence.
- `cleanup-005` — share repeated tmux dashboard/managed status-bar option construction while preserving exact commands.
- `cleanup-006` — simplify repeated configuration-field removal and dashboard shutdown finalization branches.

## Process and gates

Each ticket follows `ticket-init → plan-md → execute → review → reflect → commit`; tests are written first, focused validation follows each change, and full verification is run before the epic is considered complete. Reject candidates whose behavior, public API, error ordering, or concurrency semantics cannot be defended with tests.

## Audit evidence

Initial read-only audit, four scouts, second opinion, and `npm run typecheck` passed before ticket creation. Existing cleanup work (`dead-code-001`, `json-store-001`, `app-seams-001`, `tui-dialogs-001`) and active product tickets are excluded from duplication.
