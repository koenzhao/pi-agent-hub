import test from "node:test";
import assert from "node:assert/strict";
import { addRepo, createNewForm, cycleCwdSuggestion, editNewForm, removeFocusedRepo, setFocus, setRepoValue, submission, toggleWorktree, validateNewForm, type NewFormState } from "../src/tui/new-form.js";

const LEFT = "\u001b[D";

test("new form defaults group from cwd and has no title field", () => {
  const state = createNewForm({ cwd: "/repo/api" });
  assert.equal(state.fields.group.value, "api");
  assert.equal(state.worktreeEnabled, false);
  assert.deepEqual(state.order, ["repo:0", "worktree", "group"]);
  assert.deepEqual(submission(state), { cwd: "/repo/api", group: "api" });
});

test("new form keeps branch input in worktree mode", () => {
  let state = createNewForm({ cwd: "/repo/api", worktreeDefault: true });
  assert.deepEqual(state.order, ["repo:0", "worktree", "branch", "group"]);
  state = typeText(setFocus(state, "branch"), "feature/api");
  assert.deepEqual(submission(state), { cwd: "/repo/api", group: "api", worktree: { branch: "feature/api" } });
});

test("new form updates untouched group when primary repo changes", () => {
  let state = createNewForm({ cwd: "/repo/api", knownCwds: ["/repo/api", "/repo/web"] });
  state = cycleCwdSuggestion(setFocus(state, "repo:0"), 1);
  assert.equal(state.fields.group.value, "web");
});

test("new form adds removes and submits dynamic repo rows", () => {
  let state = addRepo(createNewForm({ cwd: "/repo/api" }));
  state = typeText(state, "/repo/web");
  state = addRepo(state);
  state = typeText(state, "/repo/shared");
  assert.deepEqual(submission(state), { cwd: "/repo/api", group: "api", additionalCwds: ["/repo/web", "/repo/shared"] });
  state = removeFocusedRepo(state);
  assert.deepEqual(submission(state), { cwd: "/repo/api", group: "api", additionalCwds: ["/repo/web"] });
});

test("new form validates a worktree branch with additional repos", () => {
  let state = addRepo(createNewForm({ cwd: "/repo/api" }));
  state = typeText(state, "/repo/web");
  state = toggleWorktree(state);
  state = typeText(setFocus(state, "branch"), "feature/multi");
  const result = validateNewForm(state);
  assert.equal(result.ok, true);
  assert.deepEqual(submission(result.state), { cwd: "/repo/api", group: "api", additionalCwds: ["/repo/web"], worktree: { branch: "feature/multi" } });
});

test("new form cycles and picks repo values", () => {
  let state = addRepo(createNewForm({ cwd: "/repo/api", knownCwds: ["/repo/api", "/repo/web"] }));
  state = cycleCwdSuggestion(state, 1);
  assert.equal(state.fields["repo:1"].value, "/repo/api");
  state = setRepoValue(state, "repo:0", "/repo/web");
  assert.equal(state.fields.group.value, "web");
  const moved = editNewForm(setFocus(state, "repo:0"), LEFT)!;
  assert.equal(moved.fields["repo:0"].cursor, state.fields["repo:0"].value.length - 1);
});

function typeText(state: NewFormState, text: string): NewFormState {
  for (const char of text) state = editNewForm(state, char)!;
  return state;
}
