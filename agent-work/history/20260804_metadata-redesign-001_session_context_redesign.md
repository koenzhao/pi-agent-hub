# Metadata redesign

**Feature:** `metadata-redesign-001` — Simplify cross-package session context  
**Completed:** 2026-08-04  
**Repositories:** Pi Agent Hub, Rules, and the retired `pi-session-summary` package

## Outcome

Pi's native session name is now the canonical session title. Rules owns ticket-aware and generated naming, workflow activity, deterministic plan progress, the Pi progress widget, the todo drawer, and bounded final-turn attention. Hub consumes producer-neutral Pi entries through its existing heartbeat and keeps only a provisional or last-known title cache.

`pi-session-summary` is retired. Its continuous semantic summaries, duplicate plan reader, model settings, sidecars, commands, widget, drawer, history tooling, and quality tooling were removed after replacement validation.

```text
features.yaml + Markdown plan
             ↓
      Rules workflow runtime
      ├─ Pi native name
      ├─ workflow-runtime
      └─ pi-agent-hub-context
             ↓
        Hub heartbeat
             ↓
        Hub registry cache + TUI
```

## Final contracts

### Ticket text

New ticket records require:

- `title`: 1–3 words, at most 32 normalized Unicode code points
- `subtitle`: 4–6 words, at most 64 code points
- `description`: one outcome sentence, at most 240 code points
- `id`, `status`, `priority`, and `created_at`

`epic` is registration input for ID allocation but is not persisted. Markdown plans own detailed scope; new ticket records do not contain `steps`. Mechanical normalization removes persisted `epic` and empty/null fields while preserving unknown nonempty history and useful legacy steps until planning migrates them.

### Native naming

- A managed session starts with the primary repository basename as a provisional Hub title.
- An explicit ticket with a title sets Pi's native name deterministically.
- A legacy explicit ticket without a title uses one bounded model input containing ticket ID, subtitle, description, and recent conversation context.
- The combined legacy-ticket naming input is at most 3,000 code points and drops oldest complete messages first so newest context survives.
- An unnamed non-ticket session gets one bounded initial naming call.
- `/session-name refresh` regenerates explicitly; ordinary turns do not rename.
- Naming prefers authenticated Spark, falls back once to Pi's active authenticated model, times out after 2.5 seconds, and has no retry or cache retention.
- Hub `R` sends an exact live Pi `/name`; `N` remains manual persisted-session recovery.

### Generic session context

Rules publishes the latest complete snapshot as a versioned `pi-agent-hub-context` custom entry:

```ts
interface PiAgentHubContextV1 {
  version: 1;
  updatedAt: number;
  ticket?: {
    id: string;
    subtitle?: string;
    description?: string;
  };
  attention?: {
    kind: "ready" | "question" | "blocked";
    text: string;
  };
}
```

The Pi name carries the title. Hub validates the generic shape, ignores unknown fields, transports it through heartbeat, and never imports Rules or persists runtime context in `registry.json`. A workflow/context ticket mismatch suppresses subtitle and description rather than combining unrelated data.

### Workflow runtime

Rules' producer-owned `workflow-runtime` entry now carries:

- ordered workflow steps and active position
- optional fixed activity with critic pass count
- optional deterministic plan projection
- optional active mode
- optional `currentStepComplete`

Workflow markers describe position, not audited execution. Earlier positions are checked, an incomplete current position is active, a completed current position is checked, and later positions are pending. Direct later-step invocation therefore checks earlier positions. Commit completion remains private to guarded `complete_workflow` and retains the all-check terminal state until replacement or explicit clear.

Plan, Review, Reflect, and Commit publish concise fixed activities. Execute intentionally omits activity so consumers show deterministic plan progress. Exact Plan questions and matched tmux critic launches automate only observable transitions; tmux management actions do not count as critic passes.

Hub remains producer-neutral. It validates generic activity and plan fields without knowing Rules step IDs, activity IDs, tools, or critic agents. Plan task counts are bounded at 10,000; at most 100 phase counts are accepted and their aggregate total must remain at or below 10,000. Rendering uses separated, flat, then ten-cell ratio forms without constructing grids that cannot fit.

### Managed project root

Every managed parent launch exports:

```text
PI_AGENT_HUB_PRIMARY_CWD=ManagedSession.cwd
```

Rules uses this optional bounded absolute path for ticket and plan reads. This fixes resumed or fork-origin conversations whose Pi header cwd points at a source checkout while the managed session works in a Hub worktree or multi-repo workspace. The value is process-local, is not persisted, never points at `workspaceCwd` or an additional repo, and does not change normal conversation-fork or Git-worktree behavior.

## Package changes

### Rules

- Added canonical ticket schema enforcement and safe normalization.
- Added ticket/context parsing with top-level folded-YAML support and nested-field protection.
- Added one Spark-first authenticated model helper shared by separate naming and attention prompts.
- Added native naming, exact rename support, final-turn attention, generic context publication, and stale-result guards.
- Added fixed workflow activities, critic pass counting, positional completion, and guarded terminal completion.
- Moved plan parsing, progress widget, `/wf-todos`, and `Ctrl+Alt+T` into the workflow runtime.
- Added exact tool-event automation for Plan questions and matched critics.

### Pi Agent Hub

- Added Pi native-name and generic-context heartbeat transport.
- Made registry titles provisional/last-known cache state.
- Removed independent creation/fork title inputs and delayed name-copy behavior.
- Added managed primary-cwd export for normal, multi-repo, worktree, restart, and eligible fork launches.
- Removed legacy session-metadata reading, rendering, deletion paths, and stale latest-sidecar state.
- Added producer-neutral activity, plan, and completion rendering.
- Restored collapsed project/stage subagent-tree controls.
- Kept adaptive plan grids and added bounded large-plan rendering.

### Session Summary

The package is private and retired. It contains only retirement and ownership documentation plus package metadata. Git history preserves the old implementation.

## Dashboard follow-ups completed with this work

- `dashboard-scanability-008`: worktree titles use an accented leading `⎇`; multi-repo rows use a dim `⧉ N`; details keep full branch and repository wording.
- `dashboard-scanability-009`: every visible junction-card line shares mouse selection and double-click behavior with its title. Keyboard navigation retains one session target per card, headings and spacing remain inert, and height windowing retains targets only for visible card lines.

## Review findings fixed

1. Height-clipped selected cards now retain mouse targets on visible continuation lines.
2. Title-less explicit ticket naming includes ticket identity and authored context instead of conversation alone.
3. Oversized producer phase arrays are bounded before rendering, and ratio fallback avoids oversized cell allocation.
4. Combined ticket/transcript naming drops oldest complete messages instead of truncating newest context.

Final code and documentation critic passes returned `LGTM`.

## Verification

- Rules: 63 tests passed.
- Hub: 684 tests passed; TypeScript typecheck passed.
- Session Summary: retirement package dry-run passed.
- Installed Hub artifact and real Pi/tmux smokes passed for worktree cwd resolution, native naming, subtitle/description transport, workflow activity, positional markers, card badges, adaptive progress, and full-card mouse behavior.
- `git diff --check` passed in all three worktrees.
