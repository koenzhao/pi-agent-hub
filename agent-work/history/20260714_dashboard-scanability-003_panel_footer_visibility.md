# dashboard-scanability-003 — Panel footer visibility

Managed-session tmux status footers are hidden while their sessions appear in dashboard side panels. Visibility reconciliation restores footers when panels close, before full-session entry, during dashboard shutdown, and across status/theme synchronization.

The behavior remains session-scoped because tmux status visibility is not client-scoped; external clients attached to a paneled session also see its hidden footer.

Verification: focused coverage, typecheck, and the full test suite passed.
