import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionMetadataPath } from "../src/core/paths.js";
import { parseSessionMetadata, readSessionMetadata } from "../src/core/session-metadata.js";

async function withTempHub(fn: (dir: string) => Promise<void>): Promise<void> {
  const oldDir = process.env.PI_AGENT_HUB_DIR;
  const dir = await mkdtemp(join(tmpdir(), "pi-agent-hub-metadata-"));
  process.env.PI_AGENT_HUB_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (oldDir === undefined) delete process.env.PI_AGENT_HUB_DIR;
    else process.env.PI_AGENT_HUB_DIR = oldDir;
  }
}

test("sessionMetadataPath points beside heartbeat state", async () => {
  await withTempHub(async (dir) => {
    assert.equal(sessionMetadataPath("abc"), join(dir, "session-metadata", "abc.json"));
  });
});

test("readSessionMetadata accepts generic known metadata fields from any source", async () => {
  await withTempHub(async (dir) => {
    await mkdir(join(dir, "session-metadata"), { recursive: true });
    await writeFile(join(dir, "session-metadata", "abc.json"), `${JSON.stringify({
      source: "any-extension",
      goal: "Ship dashboard metadata.",
      status: "Parser implemented.",
      nextStep: "Render it in details.",
      stage: "implementing",
      confidence: 0.8,
      updatedAt: 123,
      ignored: "field",
    })}\n`, "utf8");

    assert.deepEqual(await readSessionMetadata("abc"), {
      source: "any-extension",
      goal: "Ship dashboard metadata.",
      status: "Parser implemented.",
      nextStep: "Render it in details.",
      stage: "implementing",
      confidence: 0.8,
      updatedAt: 123,
    });
  });
});

test("readSessionMetadata ignores missing malformed fieldless or low-confidence files", async () => {
  await withTempHub(async (dir) => {
    await mkdir(join(dir, "session-metadata"), { recursive: true });
    await writeFile(join(dir, "session-metadata", "bad-json.json"), "{", "utf8");
    await writeFile(join(dir, "session-metadata", "fieldless.json"), JSON.stringify({ source: "any-extension", ignored: "x" }), "utf8");
    await writeFile(join(dir, "session-metadata", "low-confidence.json"), JSON.stringify({ goal: "Maybe wrong", confidence: 0.49 }), "utf8");

    assert.equal(await readSessionMetadata("missing"), undefined);
    assert.equal(await readSessionMetadata("bad-json"), undefined);
    assert.equal(await readSessionMetadata("fieldless"), undefined);
    assert.equal(await readSessionMetadata("low-confidence"), undefined);
  });
});

test("parseSessionMetadata accepts the generic full and partial plan summary", () => {
  assert.deepEqual(parseSessionMetadata({
    source: "pi-session-summary",
    goal: "Ship the workflow board.",
    status: "Rendering cards.",
    nextStep: "Verify widths.",
    confidence: 0.91,
    updatedAt: 1_784_772_000_000,
    plan: {
      feature: " Replace stages with a responsive workflow board. ",
      phase: { title: " Render responsive cards ", index: 3, count: 4 },
      tasks: { completed: 2, total: 5 },
      nextStep: " Add selected-card height tests ",
      ignored: "full checklist",
    },
    ignored: true,
  }), {
    source: "pi-session-summary",
    goal: "Ship the workflow board.",
    status: "Rendering cards.",
    nextStep: "Verify widths.",
    confidence: 0.91,
    updatedAt: 1_784_772_000_000,
    plan: {
      feature: "Replace stages with a responsive workflow board.",
      phase: { title: "Render responsive cards", index: 3, count: 4 },
      tasks: { completed: 2, total: 5 },
      nextStep: "Add selected-card height tests",
    },
  });

  assert.deepEqual(parseSessionMetadata({ plan: { feature: "Feature only" } }), { plan: { feature: "Feature only" } });
  assert.deepEqual(parseSessionMetadata({ plan: { nextStep: "Next only" } }), { plan: { nextStep: "Next only" } });
  assert.equal(parseSessionMetadata({ plan: { feature: "x".repeat(900) } })?.plan?.feature?.length, 800);
});

test("parseSessionMetadata accepts exact producer attention JSON", () => {
  for (const [kind, stage] of [["ready", "complete"], ["question", "waiting"], ["blocked", "blocked"]] as const) {
    assert.deepEqual(parseSessionMetadata({
      source: "pi-session-summary",
      status: "Human action is useful",
      stage,
      confidence: 0.9,
      attention: { kind, text: " Needs a human response ", ignored: true },
      ignored: true,
    })?.attention, { kind, text: "Needs a human response" });
  }
});

test("attention requires confidence, compatible stage, known kind, and bounded text", () => {
  const invalid = [
    { stage: "waiting", confidence: 0.9, attention: { kind: "ready", text: "Mismatch" } },
    { stage: "complete", confidence: 0.9, attention: { kind: "review", text: "Unknown" } },
    { stage: "complete", confidence: 0.9, attention: { kind: "ready", text: "  " } },
    { stage: "complete", confidence: 0.49, attention: { kind: "ready", text: "Uncertain" } },
    { stage: "complete", attention: { kind: "ready", text: "No confidence" } },
  ];
  for (const value of invalid) {
    const parsed = parseSessionMetadata({ status: "Semantic status remains", ...value });
    assert.equal(parsed?.status, value.confidence !== undefined && value.confidence < 0.5 ? undefined : "Semantic status remains");
    assert.equal(parsed?.attention, undefined);
  }

  const bounded = parseSessionMetadata({
    stage: "blocked",
    confidence: 1,
    attention: { kind: "blocked", text: "x".repeat(900) },
  });
  assert.equal(bounded?.attention?.text.length, 800);
  assert.deepEqual(parseSessionMetadata({ stage: "waiting", confidence: 1, attention: { kind: "question", text: "Choose" } }), {
    stage: "waiting",
    confidence: 1,
    attention: { kind: "question", text: "Choose" },
  });
});

test("deterministic plan data is independent from semantic confidence", () => {
  assert.deepEqual(parseSessionMetadata({
    source: "pi-session-summary",
    goal: "Uncertain goal",
    status: "Uncertain status",
    nextStep: "Uncertain next step",
    stage: "editing",
    confidence: 0.2,
    updatedAt: 123,
    plan: { feature: "Grounded feature", tasks: { completed: 1, total: 2 } },
  }), {
    source: "pi-session-summary",
    confidence: 0.2,
    updatedAt: 123,
    plan: { feature: "Grounded feature", tasks: { completed: 1, total: 2 } },
  });
});

test("malformed plan subfields are omitted independently", () => {
  assert.deepEqual(parseSessionMetadata({
    status: "Still valid",
    plan: {
      feature: " Valid feature ",
      phase: { title: "Bad phase", index: 0, count: 2 },
      tasks: { completed: 3, total: 2 },
      nextStep: 42,
    },
  }), { status: "Still valid", plan: { feature: "Valid feature" } });

  const invalidPairs = [
    { phase: { title: "Phase", index: 1.5, count: 2 } },
    { phase: { title: "Phase", index: 3, count: 2 } },
    { tasks: { completed: -1, total: 2 } },
    { tasks: { completed: 0, total: 0 } },
    { tasks: { completed: Number.NaN, total: 2 } },
  ];
  for (const plan of invalidPairs) assert.equal(parseSessionMetadata({ plan }), undefined);
});
