import test from "node:test";
import assert from "node:assert/strict";
import { addRepo, createNewForm, cycleCwdSuggestion, editNewForm, removeFocusedRepo, setFocus, setRepoValue, submission, toggleWorktree, validateNewForm, type NewFormState } from "../src/tui/new-form.js";

const LEFT = "\u001b[D";
const BACKSPACE = "\u007f";

test("new form defaults group to primary cwd basename and title to random slug", () => {
  const state = createNewForm({ cwd: "/repo/api" });

  assert.equal(state.fields.group.value, "api");
  assert.match(state.fields.title.value, /^[a-z]+-[a-z]+$/);
  assert.deepEqual(state.order, ["repo:0", "group", "title"]);
});

test("new form keeps random title while group auto-updates until edited", () => {
  let state = createNewForm({ cwd: "/repo/api", knownCwds: ["/repo/api", "/repo/web"], titleGenerator: () => "black-aleph" });

  state = setFocus(state, "repo:0");
  state = cycleCwdSuggestion(state, 1);

  assert.equal(state.fields.group.value, "web");
  assert.equal(state.fields.title.value, "black-aleph");
});

test("new form adds removes and submits dynamic repo rows", () => {
  let state = createNewForm({ cwd: "/repo/api", titleGenerator: () => "api" });
  state = addRepo(state);
  state = typeText(state, "/repo/web");
  state = addRepo(state);
  state = typeText(state, "/repo/shared");

  assert.deepEqual(state.order, ["repo:0", "repo:1", "repo:2", "group", "title"]);
  assert.deepEqual(submission(state), { cwd: "/repo/api", group: "api", title: "api", additionalCwds: ["/repo/web", "/repo/shared"] });

  state = removeFocusedRepo(state);
  assert.deepEqual(state.order, ["repo:0", "repo:1", "group", "title"]);
  assert.deepEqual(submission(state), { cwd: "/repo/api", group: "api", title: "api", additionalCwds: ["/repo/web"] });
});

test("new form supports worktree mode with additional repos", () => {
  let state = createNewForm({ cwd: "/repo/api", titleGenerator: () => "api" });
  state = addRepo(state);
  state = typeText(state, "/repo/web");
  state = toggleWorktree(state);
  for (let i = 0; i < "api".length; i += 1) state = editNewForm(state, BACKSPACE)!;
  state = typeText(state, "feature/multi");

  const result = validateNewForm(state);

  assert.equal(result.ok, true);
  assert.deepEqual(submission(result.state), { cwd: "/repo/api", group: "api", title: "feature/multi", additionalCwds: ["/repo/web"], worktree: { branch: "feature/multi" } });
});

test("new form omits blank extra repo rows", () => {
  const state = addRepo(createNewForm({ cwd: "/repo/api", titleGenerator: () => "api" }));

  assert.deepEqual(submission(state), { cwd: "/repo/api", group: "api", title: "api" });
});

test("new form cycles cwd suggestions on focused extra repo rows", () => {
  let state = createNewForm({ cwd: "/repo/api", knownCwds: ["/repo/api", "/repo/web", "/repo/shared"] });
  state = addRepo(state);
  state = cycleCwdSuggestion(state, 1);
  assert.equal(state.fields["repo:1"].value, "/repo/api");
  state = cycleCwdSuggestion(state, 1);
  assert.equal(state.fields["repo:1"].value, "/repo/web");
});

test("new form sets repo values through picker selection", () => {
  let state = createNewForm({ cwd: "/repo/api", knownCwds: ["/repo/api", "/repo/web"], titleGenerator: () => "api" });
  state = setRepoValue(state, "repo:0", "/repo/web");

  assert.equal(state.fields["repo:0"].value, "/repo/web");
  assert.equal(state.fields.group.value, "web");
});

test("editNewForm mirrors focused edit side effects", () => {
  let state = createNewForm({ cwd: "/repo/api", knownCwds: ["/repo/api", "/repo/web"], titleGenerator: () => "api" });
  state = setFocus(state, "repo:0");
  for (const char of "/repo/api".split("")) state = editNewForm(state, BACKSPACE)!;
  for (const char of "/repo/web") state = editNewForm(state, char)!;

  assert.equal(state.fields["repo:0"].value, "/repo/web");
  assert.equal(state.fields["repo:0"].cycleIndex, 1);
  assert.equal(state.fields.group.value, "web");

  const moved = editNewForm(state, LEFT)!;
  assert.equal(moved.fields["repo:0"].cursor, state.fields["repo:0"].cursor! - 1);
  assert.equal(moved.fields.group.value, "web");
});

function typeText(state: NewFormState, text: string): NewFormState {
  for (const char of text) state = editNewForm(state, char)!;
  return state;
}
