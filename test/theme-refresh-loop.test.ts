import test from "node:test";
import assert from "node:assert/strict";
import { startThemeRefreshLoop } from "../src/app/run-tui.js";
import { darkTheme, type SessionsTheme } from "../src/tui/theme.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await wait(5);
}

test("theme refresh loop applies changed themes and skips load errors", async () => {
  const changed: SessionsTheme = { ...darkTheme, accent: "#010203" };
  const applied: SessionsTheme[] = [];
  let calls = 0;
  const stop = startThemeRefreshLoop({
    initialTheme: darkTheme,
    intervalMs: 5,
    load: async () => {
      calls += 1;
      if (calls === 1) throw new Error("mid-write");
      return changed;
    },
    apply: (theme) => { applied.push(theme); },
  });

  try {
    await waitFor(() => applied.length === 1);
  } finally {
    stop();
  }

  assert.ok(calls >= 2);
  assert.deepEqual(applied, [changed]);
});

test("theme refresh loop ignores unchanged tokens", async () => {
  const applied: SessionsTheme[] = [];
  const stop = startThemeRefreshLoop({
    initialTheme: darkTheme,
    intervalMs: 5,
    load: async () => ({ ...darkTheme }),
    apply: (theme) => { applied.push(theme); },
  });

  try {
    await wait(20);
  } finally {
    stop();
  }

  assert.deepEqual(applied, []);
});

test("theme refresh loop does not load or advance its key while preview is suspended", async () => {
  const changed: SessionsTheme = { ...darkTheme, accent: "#010203" };
  const applied: SessionsTheme[] = [];
  let suspended = true;
  let calls = 0;
  const stop = startThemeRefreshLoop({
    initialTheme: darkTheme,
    intervalMs: 5,
    suspended: () => suspended,
    load: async () => { calls += 1; return changed; },
    apply: (theme) => { applied.push(theme); },
  });

  try {
    await wait(20);
    assert.equal(calls, 0);
    suspended = false;
    await waitFor(() => applied.length === 1);
  } finally {
    stop();
  }

  assert.deepEqual(applied, [changed]);
});

test("theme refresh loop discards an in-flight load when preview becomes suspended", async () => {
  const changed: SessionsTheme = { ...darkTheme, accent: "#040506" };
  const applied: SessionsTheme[] = [];
  let suspended = false;
  let calls = 0;
  let release: (() => void) | undefined;
  const firstLoad = new Promise<void>((resolve) => { release = resolve; });
  const stop = startThemeRefreshLoop({
    initialTheme: darkTheme,
    intervalMs: 5,
    suspended: () => suspended,
    load: async () => {
      calls += 1;
      if (calls === 1) await firstLoad;
      return changed;
    },
    apply: (theme) => { applied.push(theme); },
  });

  try {
    await waitFor(() => calls === 1);
    suspended = true;
    release?.();
    await wait(20);
    assert.deepEqual(applied, []);
    suspended = false;
    await waitFor(() => applied.length === 1);
  } finally {
    stop();
  }

  assert.ok(calls >= 2);
  assert.deepEqual(applied, [changed]);
});

test("theme refresh loop does not apply in-flight themes after stop", async () => {
  const applied: SessionsTheme[] = [];
  let release: (() => void) | undefined;
  let stop = () => {};
  const loadStarted = new Promise<void>((resolve) => {
    stop = startThemeRefreshLoop({
      initialTheme: darkTheme,
      intervalMs: 1,
      load: async () => {
        resolve();
        await new Promise<void>((done) => { release = done; });
        return { ...darkTheme, accent: "#010203" };
      },
      apply: (theme) => { applied.push(theme); },
    });
  });

  await loadStarted;
  stop();
  release?.();
  await wait(5);

  assert.deepEqual(applied, []);
});
