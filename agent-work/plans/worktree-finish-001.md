**Feature:** worktree-finish-001 → When finishing a Hub-owned worktree would conflict with its base branch, offer an explicit assisted flow that keeps the managed session alive, reuses its Pi conversation context to resolve conflicts under strict guardrails, validates the result, and only then completes the merge and cleanup.
**Session:** e8711f27-4a0-white-aleph

# Existing-session worktree conflict resolution

## Goal

Turn a failed worktree finish from a dead end into a safe, observable recovery flow. If a single-repo Hub-owned worktree cannot merge cleanly into its recorded base branch, Hub should detect that before stopping tmux, offer to resolve the conflict in the same managed Pi conversation that implemented the feature, keep the shared base worktree untouched, and finish only after the user reviews and confirms the resolved result.

The existing Pi session is the resolver because it already has the task history, project instructions, model choice, and feature worktree cwd. A fresh SDK/RPC agent is not part of the first version.

## Confirmed product decisions

- Detect merge conflicts before stopping the parent or subagent tmux cascade.
- Assisted resolution is explicit; Hub never silently invokes the agent after a failed finish.
- Resolve by merging the recorded base branch into the feature branch inside the Hub-owned worktree.
- Reuse the existing managed Pi conversation as the resolver.
- If the managed session is stopped, restart its saved conversation before delivering the request.
- Open/switch to the resolver session so the user can observe work and answer approval prompts.
- Initially permit agent edits only to Git-unmerged files.
- Pi may request explicit user approval to add existing tracked integration or test files to the edit scope.
- Resolver validation may invoke exact npm scripts declared in the worktree-root `package.json` without per-script confirmation. The prompt must emphasize that repository scripts are trusted arbitrary code and can run nested commands or create side effects. Hub exposes no arbitrary npm command, extra arguments, or raw shell tool and validates resulting tracked changes afterward.
- Resolver tools expose no direct commit, push, reset, clean, checkout/switch, file-delete, install, or finish/remove operation. Declared npm scripts are the explicit trust exception: they can execute arbitrary nested repository code, so prompt guidance and post-run local-state validation reduce but cannot sandbox remote or external side effects.
- Hub independently validates the resolution and shows a compact review summary.
- A final explicit confirmation lets Hub commit the base-into-feature integration, merge the now-compatible feature branch into the clean base, and remove the worktree/session.
- If Pi fails, reports that broader/destructive work is required, or the user rejects the result, abort the integration merge and restore the original clean feature HEAD.
- The first version supports one repository per worktree session only.
- If the saved original session cannot be restarted or contacted, stop with manual recovery guidance; do not spawn a fresh agent.

## Scope boundaries

### In scope

- Non-mutating single-repo merge conflict assessment.
- A TUI conflict/review state within the existing finish dialog.
- Preparing `base → feature` conflict state inside the Hub-owned worktree.
- Restarting and opening the original managed session when needed.
- A Hub extension request poll/acknowledgment bridge that injects the resolution task into the existing conversation.
- Temporary resolver-only tool policy, scope approval, package-script validation, and a structured completion signal.
- Cross-process request state under Hub global state, not the registry.
- Deterministic abort, final integration commit, existing finish merge, and cleanup.
- Focused tests for Git state, extension guardrails, TUI transitions, restart/handoff, validation, and rollback.

### Out of scope

- Multi-repo assisted conflict resolution.
- Fresh or fallback SDK/RPC resolver agents.
- Automatic conflict resolution without an explicit user choice.
- Automatic push of the feature branch or base branch.
- Direct Hub/agent dependency-install, deployment, release, or publication commands. A user-chosen declared validation script remains trusted repository code even if it performs nested side effects; those effects are subject to post-run review/validation.
- File deletion, creation of new files, or edits outside conflicted/approved existing tracked files.
- Resolving conflicts directly in the shared base worktree.
- Persisting resolver state in `registry.json` or Pi conversation files.
- General-purpose Git conflict management outside Hub-owned finish flows.

## Existing behavior and constraints

- `finishWorktreeSession()` in `src/app/worktree-session.ts` currently preflights cleanliness, kills the parent/subagent tmux cascade, and only then calls `finishOwnedWorktrees()`.
- `finishOne()` in `src/core/worktree.ts` checks out the base branch in the base repo and runs `git merge --no-ff --no-edit <feature>`. A conflict is aborted and surfaced after the managed session has already been stopped.
- The finish dialog in `src/tui/confirm-dialogs.ts` has one confirm/busy path and displays thrown errors in place.
- `src/app/run-tui.ts` can restart managed sessions and switch/open sessions with the existing return binding. Ordinary `sendTextToSession()` only pastes into Pi's editor and is not a reliable control protocol for resolver activation.
- Every managed Pi process already loads `src/extension/index.ts`, which can register tools, call `pi.sendUserMessage()`, gate `tool_call`, change active tools, and react to the currently supported `agent_end` event.
- Pi's own `examples/extensions/git-merge-and-resolve.ts` demonstrates the key same-session pattern: detect Git conflicts and inject a follow-up resolution request into the current conversation.
- Hub state JSON must use `src/core/atomic-json.ts`; resolver state must not be copied into registry rows.
- The base branch may move between assessment and finalization. Every mutating step must compare expected feature/base HEADs and stop on drift.
- Existing normal finish/discard behavior, multi-repo finish ordering, Pi session-file retention, and worktree ownership checks remain authoritative.

## Alternatives considered

### 1. Spawn a fresh Pi process through SDK, RPC, or print mode

Rejected for the first version. Pi supports all three approaches, but a new process loses the original conversation context and adds model/session selection, process supervision, tool restriction, cancellation, and completion-protocol surface. It remains a possible later fallback.

### 2. Send an ordinary dashboard `p` message or slash command through tmux

Rejected. It reuses context but has no reliable delivery/acknowledgment contract: tmux paste can append to an unsent draft or become steering text. The Hub extension instead polls authenticated request state while the managed session is waiting, acknowledges activation in that state file, and injects the task directly with `pi.sendUserMessage()`.

### 3. Resolve the final feature-to-base merge in the base worktree

Rejected. It exposes a shared directory used by other normal Hub sessions to an unmerged index and conflict markers. Resolve `base → feature` in the isolated Hub worktree; then the final feature-to-base merge is clean.

### 4. Let the agent use its normal tools unrestricted

Rejected. Existing context is valuable, but conflict resolution is a bounded operation. Temporarily activate only read/search, guarded file mutation, scope-request, fixed Git-status, safe npm-validation, and completion tools.

### 5. Rely only on the final diff review for safety

Rejected. Review is necessary but does not prevent destructive Git commands or unrelated edits before review. Enforce path/tool restrictions during the run and validate again afterward.

### 6. Persist a resolver phase on `ManagedSession`

Rejected. Conflict resolution is transient cross-process coordination, not durable session identity. Store one versioned request file per managed session under Hub state and remove it after finish or abort.

## Design direction

Keep the flow inside the existing `Finish worktree` dialog and existing theme vocabulary. Add no permanent footer shortcut and no new color literals.

### Initial confirmation

```text
Finish worktree

target   Archive Sidebar UX Enhancements
branch   white-aleph
merge    white-aleph → main
cleanup  remove hub-owned worktree, prune, delete merged branch

▶ w finish and merge
  Esc cancel
```

### Conflict detected before tmux stop

```text
Finish worktree

Merge conflicts with main in 6 files.
  README.md
  agent-work/features.yaml
  docs/STRUCTURE.md
  src/tui/layout.ts
  src/tui/render-model.ts
  +1 more · f show all

▶ Enter resolve in this session's Pi
  Esc cancel — worktree unchanged
```

### Resolution in progress

```text
Finish worktree

Resolving 6 conflicts in Archive Sidebar UX Enhancements.
Pi can edit conflict files; broader scope requires approval.

▶ Enter open resolver session
  w check resolution status
  Esc close — resolution continues
```

### Review ready

```text
Finish worktree

Resolution ready · 6 conflicts · 1 approved extra file
checks   typecheck ✓ · test ✓
changes  8 files · +124 −37
merge    white-aleph → main
cleanup  remove worktree and merged local branch

▶ w commit, merge, and remove
  a reject and abort resolution
  Esc review later
```

### Design rules

- Reuse `renderDialog()`, `confirmLine()`, `hintLine()`, and existing `warning`, `error`, and `dim` theme tokens.
- `w` remains the final merge/cleanup confirmation.
- `Enter` starts or reopens the resolver; do not overload global `r` restart muscle memory inside the dialog.
- `f` only expands the displayed conflict-file list; it never expands edit permission.
- Keep conflict-file expansion ephemeral in `ConfirmDialog` state.
- Truncate paths and summary lines with existing width-safe dialog/layout helpers.
- Do not display full diffs in the dashboard. The user observes the resolver session; the review dialog shows files/checks/diffstat and can reopen the session for detail.
- Clearly distinguish `Esc` (leave/review later) from `a` (reject and deterministically abort a ready resolution).

## Proposed architecture

### Data flow

```mermaid
sequenceDiagram
    participant U as User
    participant D as Dashboard TUI
    participant A as Worktree app service
    participant G as Git worktrees
    participant P as Existing managed Pi
    participant X as Hub Pi extension
    participant S as Hub resolution state

    U->>D: w, w
    D->>A: finishWorktreeSession(id)
    A->>G: assert clean + merge-tree(base, feature)
    G-->>A: conflicting paths
    A-->>D: conflict assessment (no tmux stop)
    D-->>U: offer Enter resolve in Pi

    U->>D: Enter
    D->>A: prepareWorktreeResolution(id, assessment)
    A->>G: verify HEADs + merge --no-commit --no-ff base in feature worktree
    A->>S: write versioned prepared request + conflict baseline
    A->>P: restart saved session if needed
    X->>S: poll while Pi is waiting; validate session/cwd/request/HEADs
    X->>S: mark resolving (activation acknowledgment)
    X->>P: activate bounded tools + inject conflict prompt
    A->>S: observe resolving acknowledgment
    D->>P: switch/open with Ctrl+Q return
    P->>X: guarded edits / scope requests / npm checks
    P->>X: hub_resolution_done
    X->>G: stage approved conflict paths + verify
    X->>S: mark ready with checks and diffstat
    X->>P: restore previous active tools

    U->>D: Ctrl+Q, w
    D->>S: read status
    D-->>U: compact review summary
    U->>D: w final confirmation
    D->>A: completeWorktreeResolution(id)
    A->>G: revalidate + commit base→feature integration
    A->>P: stop parent/subagent tmux cascade
    A->>G: merge feature→base, remove worktree, delete local branch
    A->>S: remove request
    A-->>D: finished
```

### Merge assessment and deterministic Git operations

Extend `src/core/worktree.ts` with focused operations rather than shelling from TUI/extension code:

```ts
export type WorktreeMergeAssessment =
  | {
      kind: "clean";
      featureHead: string;
      baseHead: string;
    }
  | {
      kind: "conflict";
      featureHead: string;
      baseHead: string;
      files: string[];
    };

export async function assessWorktreeMerge(
  worktree: ManagedWorktree,
): Promise<WorktreeMergeAssessment>;

export async function beginBaseIntegration(
  worktree: ManagedWorktree,
  expected: { featureHead: string; baseHead: string },
): Promise<{ conflictFiles: string[]; mergeChangedFiles: string[] }>;

export async function abortBaseIntegration(...): Promise<void>;
export async function commitBaseIntegration(...): Promise<string>;
```

`assessWorktreeMerge()` resolves and records the current base and feature commit OIDs, then uses `git merge-tree --write-tree --name-only <baseHead> <featureHead>` and parses NUL-safe output where supported. Exit 0 means the current finish can proceed; exit 1 plus conflict paths enters assisted flow. Other failures surface as ordinary Git errors, not conflicts.

Before any mutation:

- verify the base repo and Hub worktree are clean;
- verify `featureHead` and `baseHead` still match the assessment;
- verify branch names and Hub-owned path metadata;
- reject multi-repo sessions;
- reject an existing unrelated merge/rebase/cherry-pick state.

`beginBaseIntegration()` rechecks both branch refs, then runs `git merge --no-commit --no-ff <baseHead>` from the feature worktree, using the assessed commit OID rather than a movable branch name. Conflict exit is expected only when the resulting unmerged path set exactly matches the assessed request. After inspecting index stages, v1 accepts only ordinary-file content conflicts where the path existed as a regular tracked file at `featureHead` and still exists in the worktree; add/add, modify/delete, rename, mode, symlink, and submodule conflicts abort as unsupported. It records hashes for all auto-merged non-conflict files so later validation can distinguish Git-produced changes from agent edits.

`abortBaseIntegration()` authenticates by request/session identity, runs the deterministic merge abort, and verifies the original feature HEAD and clean feature worktree. Base drift is reported separately but never prevents restoring the feature worktree or recording an aborted/failed terminal state.

`commitBaseIntegration()` rechecks that both branch refs still equal the reviewed OIDs, stages only approved resolved paths, verifies no unmerged entries or conflict markers, creates a fixed merge commit such as `Merge main into white-aleph to resolve worktree finish`, and returns the resulting feature HEAD. It never pushes. Final feature-to-base integration merges that reviewed integration commit OID and conditionally deletes the local feature ref only if it still points at the expected commit.

### Versioned cross-process request state

Add `src/core/worktree-resolution.ts` and a path helper in `src/core/paths.ts`:

```text
<PI_AGENT_HUB_DIR>/worktree-resolutions/<managed-session-id>.json
```

Use `loadStore()`, `updateStore()`, and `writeJsonAtomic()` from `src/core/atomic-json.ts`.

```ts
interface WorktreeResolutionRequestV1 {
  version: 1;
  requestId: string;
  sessionId: string;
  status: "prepared" | "resolving" | "cancel_requested" | "ready" | "failed" | "aborted";
  worktreePath: string;
  repoRoot: string;
  branch: string;
  baseBranch: string;
  featureHead: string;
  baseHead: string;
  conflictFiles: string[];
  approvedExtraFiles: string[];
  mergeChangedFiles: string[];
  mergeBaselineHashes: Record<string, string>;
  checks: Array<{ script: string; status: "passed" | "failed"; summary?: string }>;
  activationAcknowledgedAt?: number;
  summary?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
```

Rules:

- One request per managed session; `requestId` is an unguessable correlation token.
- The extension discovers only the request whose `sessionId` matches its managed-session environment; paths and policy come from the validated state file.
- Approval/ready/commit mutations compare `requestId`, session ID, cwd, branch, feature/base HEADs, and current request status. Failure/abort mutations authenticate the request but must remain writable when the base ref drifts so rollback can still be recorded.
- Request updates are locked atomic mutations.
- Finish and completed abort remove the file after the TUI has consumed the terminal result. Delete, discard, fresh restart, archive pruning, and other row lifecycle operations reject an active request until deterministic abort completes; their tests cover request cleanup so no unmerged worktree is orphaned.
- Never write resolver state into `registry.json`, Pi JSONL conversation files, or extension-owned session metadata.

### App orchestration

Refactor `src/app/worktree-session.ts` so conflict assessment occurs before tmux termination:

```ts
type FinishWorktreeSessionResult =
  | { kind: "finished"; value: FinishedWorktreeSession }
  | { kind: "conflict"; assessment: WorktreeMergeAssessment };
```

Add direct app operations for the UI:

```ts
prepareWorktreeResolution(sessionId, assessment): Promise<WorktreeResolutionRequestV1>
readWorktreeResolution(sessionId): Promise<WorktreeResolutionRequestV1 | undefined>
abortWorktreeResolution(sessionId): Promise<void>
completeWorktreeResolution(sessionId): Promise<FinishedWorktreeSession>
```

Responsibilities:

- `finishWorktreeSession()` returns a single-repo conflict result without killing tmux; clean and multi-repo non-conflicting finishes retain current behavior.
- A multi-repo conflict returns concise manual-resolution guidance and starts no request.
- `prepareWorktreeResolution()` revalidates, begins the merge in the feature worktree, writes the request, restarts the saved managed session if missing, and waits for tmux plus a fresh `waiting` heartbeat. The managed extension discovers the request from Hub state, atomically changes `prepared → resolving` as its activation acknowledgment, and injects the prompt directly; the app waits for that acknowledgment before switching the user into the session.
- If restart, waiting-heartbeat, activation acknowledgment, or session switch fails, request cancellation and deterministic abort preserve the registry/worktree.
- `completeWorktreeResolution()` accepts only `ready`, revalidates the request and Git diff, commits the integration, then invokes the existing cleanup sequence through an OID-aware extension of the finish path. If final finish fails after the integration commit, retain the committed feature worktree and surface recovery instructions; do not reset a successful reviewed commit.
- `abortWorktreeResolution()` is accepted from `prepared`, `resolving`, `cancel_requested`, `ready`, or `failed`. For an active resolver it atomically requests cancellation and waits for the extension to abort/restore/acknowledge; if tmux is confirmed missing, the app owns rollback. One idempotent cancellation protocol handles rejection, resolver failure, shutdown, delete/discard/fresh-restart attempts, and timeout recovery.

Do not hold the registry mutation queue or pause refresh while the user is resolving conflicts. Use the existing registry mutator only for bounded restart/final finish operations. All delete, discard, fresh restart, archive/prune, and finish entrypoints must check active resolution state and either invoke the same abort protocol or reject with the exact recovery action; none may orphan an unmerged worktree.

### Existing-session extension bridge

Keep `src/extension/index.ts` small by adding `src/extension/worktree-resolution.ts` and calling one registration function from the main extension. Start one bounded session-scoped request poll (central interval constant, approximately 1s) from `session_start` and clear it idempotently on `session_shutdown`; the existing 15-second heartbeat interval is too slow for handoff acknowledgment. Poll only the request path for the current managed-session ID; add no factory-time watcher or independent process.

Register:

- `hub_resolution_status` tool for fixed Git status/diff information;
- `hub_request_resolution_scope` tool for explicit approval of additional existing tracked files;
- `hub_run_validation_script` tool for exact declared npm scripts;
- `hub_resolution_done` tool for completion/summary;
- a `tool_call` guard active only while a validated request is resolving.

Activation sequence:

1. Poll the current managed session's request file on the bounded resolution interval. Claim `prepared` only when the heartbeat state is `waiting` and `ctx.isIdle()` is true; observe `cancel_requested` in any state so an active resolver can be aborted.
2. Validate managed-session environment ID, canonical cwd, request identity, branch, merge state, and HEADs.
3. Save the previous active tool names and atomically acknowledge `prepared → resolving`.
4. Activate only `read`, `grep`, `find`, `ls`, guarded `edit`/`write`, and the resolver tools.
5. Inject one user message with `pi.sendUserMessage()` describing conflict files, accepted scope, prohibited operations, completion protocol, and declared validation scripts.
6. Set a compact Pi status entry such as `merge: resolving 6 files`. If the idle state raced and injection fails, restore tools and atomically return to `prepared` or fail/abort after the bounded retry budget; never leave a false activation acknowledgment.

Guard policy:

- `edit`/`write` paths must resolve inside the worktree and be in `conflictFiles + approvedExtraFiles`.
- Extra-scope requests accept only paths that exist as regular tracked files in the original `featureHead` tree and still exist as regular files in the worktree. `ctx.ui.confirm()` names the files and rationale before atomic request update. Additions, deletions, renames, directories, symlinks, and mode changes are unsupported in v1.
- No raw `bash` tool is active.
- `hub_resolution_status` executes fixed non-mutating Git commands only.
- `hub_run_validation_script` accepts a script name with no extra arguments, reads the worktree-root `package.json`, and requires that exact script to exist. It executes `npm run <script>` directly without a raw shell tool. Repository scripts are explicitly treated as trusted arbitrary code that may create ignored/generated artifacts or other side effects; there is no sandbox guarantee. The resolver prompt warns the agent to choose them carefully. Arbitrary npm commands and arguments remain unavailable, and post-run validation rejects changed local HEAD/refs, tracked additions/deletions, or modifications outside merge-produced and approved files. External side effects that leave no local evidence cannot be detected.
- Validation output uses Pi truncation utilities and records pass/fail in request state. A failed check does not automatically block `ready`, but its failure remains prominent in review; the completion tool must summarize why the resolution is still defensible or stop.
- `hub_resolution_done` verifies all conflict markers are removed, stages only approved conflict/extra paths through deterministic extension code, ensures no unmerged entries remain, compares non-conflict files to recorded merge baselines, stores summary/checks/diffstat, marks `ready`, and returns `terminate: true`.
- On the currently supported `agent_end` event without a ready completion signal, mark failed, restore tools, abort the integration merge, and report the rollback. Request state—not event timing—is authoritative, so a completion tool that already wrote `ready` wins.
- On successful ready, restore previous active tools but keep the staged merge for dashboard review.
- When polling observes `cancel_requested`, abort the active agent if needed, restore tools/status, abort the integration merge, and acknowledge `aborted`.
- `session_shutdown` during `prepared`/`resolving` performs or records the same idempotent failed/abort transition; it must never leave resolver tools active or silently commit/finish.

### TUI state and actions

Extend `SessionsViewActions` in `src/tui/dialog.ts` with structured finish-resolution actions rather than routing everything through a void callback.

Keep `SessionDialog` unchanged at the top level. Refine `ConfirmDialog` into delete and finish variants, with finish phases:

```ts
type FinishPhase =
  | { kind: "confirm" }
  | { kind: "busy"; action: "finish" | "prepare" | "review" | "abort" }
  | { kind: "conflict"; files: string[]; filesExpanded: boolean }
  | { kind: "resolving"; requestId: string; conflictCount: number }
  | { kind: "review"; requestId: string; summary: ResolutionReview };
```

Interaction:

- Initial `w` opens; second `w` runs preflight.
- Clean result closes as today.
- Conflict result stays in the finish dialog and offers `Enter`.
- `Enter` prepares/restarts/sends, retains the dialog in `resolving`, and switches to the managed session with the existing attach/switch return behavior.
- Returning with `Ctrl+Q` restores the same dashboard dialog. `Enter` reopens the resolver; `w` reloads request status.
- A `ready` request transitions to review. `w` completes; `a` rejects and aborts; `Esc` leaves ready state for later review.
- A failed request reports that the merge was aborted and leaves the worktree/session intact.
- The delete dialog's existing `w` route transitions into this same phased finish dialog rather than calling the old void finish action and closing.
- Delete, discard, fresh restart, and lifecycle actions show that resolution must be aborted first; no alternate route bypasses request-state checks.
- If the dashboard process was recreated and lost dialog state, opening finish and confirming again detects the request file and reconstructs resolving/review state.

The disclosure-selected action guard from archive UX must continue to prevent worktree finish/resolution actions from targeting a stale real session.

## Incremental test-first implementation

### Phase 1 — Conflict assessment before tmux shutdown

- [ ] Add failing `test/worktree.test.ts` cases proving a divergent but cleanly mergeable branch still finishes normally.
- [ ] Add a failing realistic content-conflict test proving finish returns a conflict assessment before any `kill-session` call, base checkout, merge mutation, registry removal, or worktree removal.
- [ ] Add failing tests for sorted conflict-file parsing, unexpected `merge-tree` errors, missing/unsupported Git behavior, base/feature HEAD drift, existing merge state, and dirty base/feature rejection.
- [ ] Add a failing multi-repo conflict test proving no assisted state is created and no repo/tmux mutation begins.
- [ ] Implement `assessWorktreeMerge()` and HEAD/state assertions in `src/core/worktree.ts`.
- [ ] Change `finishWorktreeSession()` to return the structured conflict result before killing tmux while preserving the clean finish path.
- [ ] Refactor only enough shared Git execution/parsing to keep commands deterministic and testable.

**Phase verification**

- Run focused worktree tests against temporary real Git repositories.
- Confirm conflict assessment leaves refs, HEADs, indexes, tracked/untracked worktree status, registry state, and tmux calls unchanged; object-database additions from `merge-tree --write-tree` are allowed.
- Confirm clean single- and multi-repo finish behavior and existing finish ordering remain unchanged.

### Phase 2 — Resolution request state and reversible base integration

- [ ] Add failing tests for versioned request path/load/update/remove behavior using temporary Hub state.
- [ ] Add failing tests proving approval/ready/commit mutations reject stale request IDs, wrong managed-session IDs, cwd mismatch, branch mismatch, changed HEADs, invalid status transitions, and malformed JSON, while authenticated failure/abort transitions remain writable after base drift.
- [ ] Add failing Git tests for `beginBaseIntegration()` producing conflict state only in the feature worktree while the base remains clean, and rejecting/aborting add-add, modify-delete, rename, mode, symlink, and submodule conflicts.
- [ ] Add failing tests capturing conflict paths, all merge-changed paths, and baseline hashes for auto-merged non-conflict files.
- [ ] Add failing abort tests proving failure/rejection restores the original feature HEAD and clean worktree without touching base or registry.
- [ ] Add failing rollback-failure tests proving errors remain visible and are not replaced with a false clean-state claim.
- [ ] Implement `src/core/worktree-resolution.ts`, path helpers, and the small integration helpers in `src/core/worktree.ts`.
- [ ] Implement `prepareWorktreeResolution()`, `readWorktreeResolution()`, and `abortWorktreeResolution()` in `src/app/worktree-session.ts`.

**Phase verification**

- Exercise prepare/abort repeatedly on a realistic conflicting temp repo.
- Confirm request files are atomic, outside source repos, and absent after successful abort.
- Confirm no Pi conversation/session files or registry schema fields change.

### Phase 3 — Existing Pi session handoff and guarded resolver mode

- [ ] Add failing extension tests proving request polling ignores/rejects missing, stale, cross-session, wrong-cwd, wrong-branch, and wrong-HEAD requests.
- [ ] Add failing tests proving only a fresh waiting session claims a valid request, writes an activation acknowledgment, saves active tools, installs the bounded resolver tool set, injects one real user message, and sets visible status.
- [ ] Add table-driven failing `tool_call` tests proving edits/writes outside approved canonical paths are blocked, including absolute paths, `..`, symlinks, and `.git` paths.
- [ ] Add failing scope-request tests for approval, rejection, duplicate paths, untracked/new files, directories, deletions, and atomic request updates.
- [ ] Add failing npm validation tests for exact declared script names, no extra arguments/arbitrary npm commands, output truncation, pass/fail recording, cautionary prompt copy, and rejection of tracked post-script additions/deletions or out-of-scope modifications.
- [ ] Add failing completion tests proving unresolved markers, unmerged entries, out-of-baseline tracked changes, tracked additions/deletions, or missing summary cannot mark ready; failed checks remain recorded and prominent rather than being silently treated as success.
- [ ] Add failing success tests proving deterministic staging is limited to approved paths, request becomes ready with diffstat/check evidence, the completion tool terminates, and previous tools/status are restored.
- [ ] Add failing `agent_end` failure tests proving unresolved runs abort to the original clean feature HEAD and restore tools, while an already-ready request is preserved.
- [ ] Add failing cancellation/shutdown/idempotence tests so `cancel_requested`, duplicate extension loading, reload, and shutdown cannot leave resolver tools/status active, orphan an unmerged worktree, or commit changes.
- [ ] Implement `src/extension/worktree-resolution.ts` and register it idempotently from `src/extension/index.ts`.
- [ ] Keep heartbeat, workflow, theme, and MCP behavior unchanged outside resolver status.

**Phase verification**

- Run extension tests with a fake Pi API plus temporary real Git worktrees.
- Manually verify the resolver prompt appears in the same saved conversation and carries its prior context.
- Confirm no raw bash or unrelated extension tool is active during resolution and all prior tools return afterward.

### Phase 4 — Restart, handoff, and TUI state flow

- [ ] Add failing app tests proving a stopped resolver session restarts the saved conversation, waits for live tmux plus a fresh waiting heartbeat, observes the extension's `resolving` acknowledgment, and only then opens the resolver session.
- [ ] Add failing failure tests for missing saved session metadata, restart timeout, stale/running heartbeat, activation-ack timeout, and switch failure; each must request/complete abort and preserve the worktree/registry.
- [ ] Add failing `test/sessions-view.test.ts` cases for confirm → conflict → resolving → review → finish.
- [ ] Add failing interaction tests for `Enter` start/reopen, `w` status/review/final confirmation, `a` rejection/abort, `f` path expansion, and phase-specific `Esc` behavior.
- [ ] Add failing tests proving multi-repo conflict copy points to manual resolution and offers no assisted action.
- [ ] Add failing narrow-width and terminal-height tests for long paths, many conflicts, validation summaries, and diffstat copy.
- [ ] Add failing tests proving dialogs recover from a recreated dashboard by deriving request status from Hub state.
- [ ] Add failing tests proving delete-dialog `w` enters the same phased finish flow instead of bypassing conflict/review handling.
- [ ] Add failing stale-selection tests proving disclosure/subagent/non-worktree rows cannot initiate or complete a resolution for another session.
- [ ] Extend `SessionsViewActions`, the finish `ConfirmDialog` state, and `src/app/run-tui.ts` wiring with the smallest structured action surface.
- [ ] Reuse current restart, heartbeat, attach/switch, return-binding, registry mutator, and dialog rendering helpers; add no tmux text-control protocol, parallel attach, or prompt UI.

**Phase verification**

- Exercise the full flow from dashboard at normal and 40-column widths.
- Confirm the current session remains alive until final reviewed finish.
- Confirm `Ctrl+Q` returns to the same resolving/review dialog and the resolver can be reopened.
- Confirm ordinary finish, delete, discard, restart, send, panel, and archive disclosure behaviors are unchanged.

### Phase 5 — Reviewed completion, cleanup, and regression validation

- [ ] Add failing finalization tests proving only a `ready` request with matching heads/status/checks can commit.
- [ ] Add failing tests for fixed integration commit creation, no push, clean feature status, clean base merge, worktree removal, local feature-branch deletion, registry/heartbeat/metadata cleanup, and request-file removal.
- [ ] Add failing base/feature-ref race tests proving assessment and integration merge recorded OIDs, and finalization stops before tmux kill/commit if either branch moved after review.
- [ ] Extend `finishOne()` / `finishOwnedWorktrees()` with an expected reviewed feature-commit OID: verify the feature ref before tmux termination, merge the OID rather than the branch name, recheck before cleanup, and delete the local feature branch only when it still points to that expected commit.
- [ ] Add a failing post-integration failure test proving a successfully reviewed feature integration commit is retained with actionable recovery copy if final base merge/cleanup fails.
- [ ] Add failing rejection tests proving `a` uses the cancellation protocol, restores original feature HEAD even when the base ref drifted, removes request state after the terminal result is consumed, restores tools, and keeps the managed session/worktree.
- [ ] Add failing lifecycle tests proving delete, discard, fresh restart, archive/prune, and alternate finish entrypoints cannot bypass or orphan active resolution state.
- [ ] Update finish/help copy without adding permanent footer clutter.
- [ ] Remove any obsolete generic conflict error path that would kill the session before presenting assisted recovery; keep clear manual errors for unsupported cases.
- [ ] Run `npm run typecheck` first.
- [ ] Run focused worktree/resolution/extension/TUI tests, then the full suite serially.
- [ ] Run `git diff --check`.
- [ ] Inspect the final diff for registry schema changes, Pi session-file writes, raw agent shell access, hidden push behavior, destructive fallback, or multi-repo scope creep.

**Phase verification**

- Reproduce the real shape that motivated the feature: both branches modify TUI, docs, and tracked workflow state; same-session Pi resolves the combination; checks pass; review is explicit; final finish removes the worktree.
- Verify failure at every boundary leaves either the original clean feature HEAD or a reviewed integration commit—never an unexplained partial merge.
- Confirm base worktree remains clean until final confirmed finish.

## Verification matrix

| Outcome | Evidence |
|---|---|
| Conflict is detected before session stop | tmux-spy test shows zero kill calls on conflict result |
| Existing context is reused | waiting-session extension polling acknowledges and injects into the original saved managed session after restart if needed |
| Base worktree stays safe | Git integration tests show conflict markers/index only in Hub worktree |
| Agent scope is bounded | canonical-path gate and active-tool tests block unrelated writes/raw bash |
| Scope can expand deliberately | Pi UI confirmation tests update only approved existing tracked files |
| Validation is controlled | exact declared-script/no-argument tests plus tracked post-run diff enforcement |
| Completion is structured | `hub_resolution_done` plus independent Git/request validation |
| User retains control | conflict and review dialogs require Enter/w confirmations; rejection aborts |
| Rollback is reliable | original feature HEAD and clean status restored on failure/rejection |
| Final finish remains conservative | clean base, matching heads, then existing tmux/worktree cleanup contracts |
| No hidden persistence | request state exists only under Hub state and is removed on terminal outcomes |
| Unsupported cases are safe | multi-repo/unavailable-session tests stop with manual guidance |

## Context files

### Core

- `src/core/worktree.ts` — merge assessment, base integration, abort, commit, existing finish/remove primitives.
- `src/core/worktree-resolution.ts` — proposed versioned request state, transitions, validation policy, and review summary.
- `src/core/paths.ts` — Hub-owned resolution state path.
- `src/app/worktree-session.ts` — finish assessment, prepare/restart/handoff, abort, and reviewed completion orchestration.
- `src/app/run-tui.ts` — dashboard action wiring, restart/wait/send/switch behavior.
- `src/extension/worktree-resolution.ts` — proposed same-session request polling, guarded tools, scope approval, validation, completion, and cleanup.
- `src/extension/index.ts` — idempotent registration alongside heartbeat/MCP behavior.
- `src/tui/dialog.ts` — structured resolution actions and dialog types.
- `src/tui/confirm-dialogs.ts` — conflict/resolving/review phases and interaction.
- `src/tui/sessions-view.ts` — finish entrypoint/help and stale synthetic-target safety.

### Reference

- `src/core/atomic-json.ts` — locked atomic cross-process state.
- `src/core/session-tree.ts` — parent/subagent cascade IDs.
- `src/core/tmux.ts` — tmux presence, kill, and switch helpers; ordinary text send is explicitly not the resolver control protocol.
- `src/app/session-commands.ts` — managed-session restart with saved Pi context.
- `src/app/delete-session.ts` — registry and Hub-owned state cleanup boundaries.
- `src/app/refresh-loop.ts` — bounded refresh pause/drain behavior.
- `src/tui/form.ts` and `src/tui/layout.ts` — width-safe dialog rendering/theme tokens.
- `test/worktree.test.ts` — temporary real-Git finish/discard contracts.
- `test/extension.test.ts` — current Hub extension idempotence and heartbeat harness.
- `test/sessions-view.test.ts` — modal keyboard/action routing patterns.
- `test/run-tui.test.ts` — app action/loop seams.
- Pi `docs/extensions.md` — `sendUserMessage`, `setActiveTools`, `tool_call`, `agent_end`, session lifecycle, and UI confirmation contracts supported by the installed package API.
- Pi `examples/extensions/git-merge-and-resolve.ts` — same-session conflict injection reference.
- `AGENTS.md` — worktree preflight/order, tmux lifecycle, persistence, and TUI constraints.

## Reflection candidates

Consider during `/reflect`, not implementation:

- `README.md`: describe the assisted same-session recovery option after a conflicting `w` finish.
- `docs/FEATURES.md`: document conflict detection, resolver/review keys, restart behavior, and single-repo limit.
- `docs/STRUCTURE.md`: document transient resolution state, same-session extension bridge, and base-worktree safety invariant.
- `AGENTS.md`: add only a compact guardrail that finish conflicts must be detected before tmux stop and resolved in the Hub worktree, never the shared base.
- `docs/DEVELOPMENT.md`: only if a stable manual smoke-test recipe for assisted resolution is needed.

## Completion criteria

- A single-repo conflicting finish is detected before any tmux, base worktree, registry, or worktree cleanup mutation.
- The user can explicitly hand the conflict to the same saved managed Pi conversation and observe it there.
- The base branch is merged into the isolated feature worktree; the shared base worktree never carries conflict state.
- Resolver tools enforce conflict-file scope, explicit scope expansion, exact declared npm-script execution with tracked post-run diff validation, and no raw shell or direct Git authority.
- Pi produces a structured ready signal; Hub independently validates it.
- The dashboard shows a compact review and requires final confirmation.
- Success commits the integration, finishes into the clean base, removes the local worktree/branch/session, and never pushes automatically.
- Failure or rejection restores the original clean feature HEAD and keeps the session/worktree recoverable.
- Multi-repo and unavailable-original-session cases stop with clear manual guidance.
- No registry migration, Pi conversation mutation, fresh-agent lifecycle, or broad Git manager is introduced.
