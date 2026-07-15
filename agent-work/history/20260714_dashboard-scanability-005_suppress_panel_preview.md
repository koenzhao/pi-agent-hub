# dashboard-scanability-005 — Suppress panel preview

The dashboard now suppresses its built-in details/preview column whenever dynamic tmux side panels are open, leaving those live panels as the only content preview. The built-in preview returns automatically when the panel set becomes empty.

The render model accepts preview suppression independently of terminal width, driven by the existing side-panel session map.

Verification: wide-layout coverage, typecheck, and the full test suite passed.
