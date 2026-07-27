# cleanup epic: Behavior-preserving simplification audit

- **Objective:** Remove proven dead code, duplicate/ad-hoc logic, excessive branching, and safe inefficiencies across session, tmux, TUI, persistence, extension, MCP, and Skills code without changing business behavior, public contracts, error ordering, or concurrency semantics.
- **Process:** Seven tracked tickets followed ticket-init → plan → execute → review → reflect → commit on `main`; no worktree or dependency changes were introduced. Existing product tickets and earlier cleanup work were excluded.
- **Completed tickets:**
  - `cleanup-001` — removed four proven-dead symbols and recorded package-surface cleanup.
  - `cleanup-002` — reused `readJsonOr` for four tmux return-binding readers.
  - `cleanup-003` — shared TUI cursor rendering and Enter-key recognition.
  - `cleanup-004` — reused one per-refresh tmux presence snapshot for archive pruning.
  - `cleanup-005` — shared tmux dashboard/managed status-bar option assembly while preserving exact arrays.
  - `cleanup-006` — shared config-property removal and unified dashboard shutdown sequencing.
  - `cleanup-007` — removed the unused singular skill-pool setter wrapper.
- **Verification:** Every ticket received focused tests, typecheck, review, reflection, and an ephemeral source-compiled full suite. Final HEAD verification passed `npm run typecheck`, `git diff --check`, and **615/615** tests. The worktree was clean before final closeout, and all cleanup tickets are done with archived plans.
- **Documentation:** `docs/STRUCTURE.md` was updated only for the refresh snapshot invariant; all other changes were private implementation cleanup covered by existing guidance.
