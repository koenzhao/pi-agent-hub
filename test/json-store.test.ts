import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { isErrno, loadStore, updateStore, withFileLock, writeJsonAtomic, type JsonStore } from "../src/core/atomic-json.js";

interface ListStore {
  version: 1;
  items: string[];
}

async function tempPath(name: string) {
  const dir = await mkdtemp(join(tmpdir(), "pi-agent-hub-json-store-"));
  return join(dir, name);
}

function listStore(path: string, parse?: (value: ListStore) => ListStore): JsonStore<ListStore> {
  return { path, empty: () => ({ version: 1, items: [] }), parse };
}

test("loadStore returns empty state when missing and parses existing state", async () => {
  const path = await tempPath("state.json");
  assert.deepEqual(await loadStore(listStore(path)), { version: 1, items: [] });

  await writeJsonAtomic(path, { version: 1, items: ["a"] });
  const loaded = await loadStore(listStore(path, (value) => ({ ...value, items: value.items.map((item) => item.toUpperCase()) })));
  assert.deepEqual(loaded, { version: 1, items: ["A"] });
});

test("loadStore propagates parse errors", async () => {
  const path = await tempPath("state.json");
  await writeJsonAtomic(path, { version: 1, items: [] });

  await assert.rejects(() => loadStore(listStore(path, () => {
    throw new Error("bad store");
  })), /bad store/);
});

test("updateStore persists and returns returned, in-place, and async mutations", async () => {
  const path = await tempPath("state.json");
  const store = listStore(path);

  const replaced = await updateStore(store, (value) => ({ ...value, items: [...value.items, "a"] }));
  assert.deepEqual(replaced.items, ["a"]);

  const inPlace = await updateStore(store, (value) => {
    value.items.push("b");
  });
  assert.deepEqual(inPlace.items, ["a", "b"]);

  const asyncNext = await updateStore(store, async (value) => {
    value.items.push("c");
  });
  assert.deepEqual(asyncNext.items, ["a", "b", "c"]);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { version: 1, items: ["a", "b", "c"] });
});

test("updateStore serializes concurrent writers", async () => {
  const path = await tempPath("state.json");
  const store = listStore(path);

  await Promise.all(Array.from({ length: 10 }, (_, i) => updateStore(store, (value) => {
    value.items.push(String(i));
  })));

  const loaded = await loadStore(store);
  assert.deepEqual(loaded.items.sort(), Array.from({ length: 10 }, (_, i) => String(i)).sort());
});

test("withFileLock waits for an existing lock and times out on a stuck lock", async () => {
  const path = await tempPath("state.json");
  const lockDir = `${path}.lock`;
  await mkdir(lockDir);

  const release = setTimeout(() => {
    void rm(lockDir, { recursive: true, force: true });
  }, 100);
  try {
    assert.equal(await withFileLock(path, async () => "ok", 1000), "ok");
  } finally {
    clearTimeout(release);
  }

  await mkdir(lockDir);
  try {
    await assert.rejects(() => withFileLock(path, async () => "late", 200), /Timed out waiting for file lock/);
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
});

test("isErrno detects errno codes safely", () => {
  assert.equal(isErrno(Object.assign(new Error("missing"), { code: "ENOENT" }), "ENOENT"), true);
  assert.equal(isErrno(Object.assign(new Error("exists"), { code: "EEXIST" }), "ENOENT"), false);
  assert.equal(isErrno("ENOENT", "ENOENT"), false);
  assert.equal(isErrno(null, "ENOENT"), false);
});
