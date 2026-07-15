# dashboard-scanability-006 — Pane fade attempt

## Outcome

Abandoned after live evaluation. The proposed theme-derived tmux `window-style` / `window-active-style` background treatment did not behave as expected, so all implementation and test changes were reverted.

## Explored approach

The plan proposed a window-level inactive-pane background tint derived from the dashboard anchor theme while leaving the active pane at `bg=default`. This would have covered managed panels and the sidebar through tmux focus semantics without hooks or polling.

## Validation and disposition

Automated color derivation, tmux command lifecycle tests, and an isolated tmux option smoke test passed, but they could not validate the actual rendered experience. Live use showed the result was unsuitable. The feature remains unimplemented and should not be revived without first reproducing the visual behavior in the real dashboard.
