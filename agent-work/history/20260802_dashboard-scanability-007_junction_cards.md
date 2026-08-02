# Junction rail session cards

**Feature:** `dashboard-scanability-007`
**Branches:** `dashboard-scanability-007` in `pi-agent-hub` and `rules`
**PR target:** `main` in both repositories

## Outcome

The dashboard now has two independent display controls:

```text
v: compact rows ↔ all-session junction cards
S: project groups ↔ workflow-stage lanes
```

The obsolete selected boxed-card density was removed. A saved or malformed density other than `all-cards` loads as compact.

Junction density makes every Active main session scannable without losing lifecycle, Hub group, or session boundaries. Existing Hub group labels remain the project source of truth; no project identity is derived from `cwd`.

## Final card contract

- Existing groups own junction rails in project and stage grouping.
- Session starts use `├` or `└`; selection uses heavy `┣` or `┗` plus full-span `selectedBg`.
- Active main sessions adapt from one to four lines:
  1. stored Hub session title and existing runtime adornments;
  2. full workflow ticket ID when available;
  3. one width-truncated, non-duplicate `plan.feature` description;
  4. workflow/plan progress combined with semantic status when available.
- Missing fields collapse without placeholders.
- Backlog, Archived, and subagents remain one line. Archived remains flat and chronological.
- Only title rows receive session or mouse targets. Continuation rows are targetless.
- Valid stage attention remains independent of runtime and workflow state. Compact rows use the prefix cell; junction rows place attention beside the branch.

The intended text hierarchy is:

- Hub session title: 1–3 words.
- Authored ticket title published as `plan.feature`: target 5–7 words, maximum 48 characters, no ticket-ID prefix.
- YAML `description`: retain the full user outcome and context.

No `pi-session-summary` schema change was required. Hub reuses existing workflow ticket, plan, progress, status, and attention metadata.

## Implementation

### Hub

- Added persisted `all-cards` density and direct compact/junction toggling.
- Generalized render projection from selected-only plan data to `plan` data for every Active main session in junction density.
- Reused existing project groups, workflow lanes, row adornments, theme tokens, ANSI-width helpers, and lifecycle ordering.
- Added adaptive junction content and semantic progress/status composition.
- Added full-card selected backgrounds, heavy rails, title-only targets, and 40–60-column wide preview sizing.
- Removed boxed-card-only rendering branches, helpers, state, tests, and documentation.
- Kept attention visible in both compact and junction stage views.

### Height windowing

The junction window always retains the selected title. As capacity permits, it retains selected continuation lines and owning section/group context, then nearby title targets before count indicators. Spare rows restore nearby continuation lines only with their owner title.

Review found and fixed:

- duplicate selected rows in a two-row viewport;
- orphaned continuation lines around compact selections;
- unused viewport rows;
- missing lifecycle/group headings after reconstruction;
- unbounded list-size search cost;
- missing archive-disclosure context;
- one unreachable legacy boxed-card dispatch.

### Rules

`rules/skills/ticket-init/SKILL.md` and the Rules README now distinguish the dashboard-facing authored title from the complete description. The guidance targets 5–7 words and 48 characters for `plan.feature`, while short Hub session labels provide the card title.

## Durable documentation

Updated:

- `AGENTS.md`
- `README.md`
- `CHANGELOG.md`
- `docs/CONFIG.md`
- `docs/FEATURES.md`
- `docs/STRUCTURE.md`
- Rules `README.md`
- Rules `skills/ticket-init/SKILL.md`

The docs record density independence, junction ownership, adaptive fields, lifecycle scope, selection, target safety, metadata roles, and height-window behavior.

## Verification

Hub:

- `npm run typecheck`
- `npm test` — 686 passed
- `git diff --check`
- focused width checks at 40, 60, 80, and 120 columns
- project/stage and short-height render smoke tests
- final `code-critic` review with all actionable findings resolved

Rules:

- `uv run pytest -q` — 54 passed
- `git diff --check`

The reviewed Hub package and Rules skill were installed locally before commit.
