# cleanup-006: Simplify config and shutdown branches

- **Feature:** Remove duplicate session-config property cleanup and dashboard shutdown branching while preserving persisted JSON, cleanup order, failure handling, and terminal shutdown.
- **Branch:** `main`
- **Implementation:** Added private typed `withoutSessionProperty()` in `src/core/config.ts` and reused it for both session setting unsetters. Unified `runTui()` shutdown into one chain with side-pane stages conditional on `ownPane`.
- **Preserved:** Empty-session pruning, unrelated config fields, validation and atomic writes; drain/binding restoration, managed footer restoration, pane close, dashboard visibility, border reset, mouse disable, existing catches, rejection short-circuiting, `.finally(finish)`, and one terminal stop.
- **Tests:** Added persisted JSON assertions for final-property removal, multi-property preservation, and session-less configs.
- **Verification:** Focused config/lifecycle tests passed **50/50**; ephemeral source-compiled suite passed **615/615**; `npm run typecheck` and `git diff --check` passed; code critic and second opinion returned LGTM.
- **Reflection:** No durable documentation changes required; existing docs cover config and dashboard lifecycle rules.
- **Discovered work:** None; cleanup epic is ready for final completion audit.
