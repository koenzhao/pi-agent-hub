# dashboard-scanability-004 — Pane title badge

Focused pane titles now use a padded reverse-color accent badge, separating pane chrome from ANSI-rich session content. Inactive titles remain muted and existing accent/muted border cues remain intact.

A tmux pane-background fade was rejected after live validation because it replaced default theme backgrounds rather than compositing a safe overlay.

Verification: theme derivation, exact tmux formatting, typecheck, and the full test suite passed.
