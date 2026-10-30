import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppPaths } from "../src/config.js";
import { acquireLock, LockTimeoutError } from "../src/state/lock.js";
import { TaskStore } from "../src/state/store.js";
import type { TaskRecord } from "../src/types.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryPaths(): Promise<AppPaths> {
  const home = await mkdtemp(path.join(os.tmpdir(), "chatgpt-image-test-"));
  cleanup.push(home);
  return { home, tasks: path.join(home, "tasks"), locks: path.join(home, "locks") };
}

describe("TaskStore", () => {
  it("atomically saves and reads a task", async () => {
    const paths = await temporaryPaths();
    const store = new TaskStore(paths);
    const now = new Date().toISOString();
    const record: TaskRecord = {
      version: 1,
      taskId: "task-one",
      request: {
        task_id: "task-one",
        mode: "new",
        prompt: "test",
        reference_images: [],
        output_dir: paths.home,
        timeout_seconds: 60,
        force_resubmit: false,
        browser: { connection: "extension", channel: "chrome", session_name: "chatgpt-image" },
      },
      promptHash: "hash",
      status: "running",
      stage: "created",
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      promptSubmitted: false,
      baselineTurnIds: [],
      downloadedImages: [],
    };
    await store.save(record);
    expect(await store.load("task-one")).toMatchObject({ taskId: "task-one", promptHash: "hash" });
  });
});

describe("acquireLock", () => {
  it("serializes the browser critical section", async () => {
    const paths = await temporaryPaths();
    const first = await acquireLock(paths, "browser");
    await expect(acquireLock(paths, "browser", { timeoutMs: 50, pollMs: 10 })).rejects.toBeInstanceOf(LockTimeoutError);
    await first.release();
    const second = await acquireLock(paths, "browser", { timeoutMs: 100 });
    await second.release();
  });

  it("heartbeats a long-running lock and does not reclaim a live owner", async () => {
    const paths = await temporaryPaths();
    const first = await acquireLock(paths, "browser", { staleMs: 40, heartbeatMs: 10 });
    const lockPath = path.join(paths.locks, "browser.lock");
    const initialMtime = (await stat(lockPath)).mtimeMs;

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect((await stat(lockPath)).mtimeMs).toBeGreaterThan(initialMtime);
    await expect(
      acquireLock(paths, "browser", { timeoutMs: 30, staleMs: 20, pollMs: 5 }),
    ).rejects.toBeInstanceOf(LockTimeoutError);
    await first.release();
  });

  it("reclaims a lock owned by an exited process", async () => {
    const paths = await temporaryPaths();
    await mkdir(paths.locks, { recursive: true });
    const lockPath = path.join(paths.locks, "browser.lock");
    await writeFile(
      lockPath,
      JSON.stringify({ ownerToken: "dead-owner", pid: 2_147_483_647, createdAt: new Date().toISOString() }),
    );

    const lock = await acquireLock(paths, "browser", { timeoutMs: 100, pollMs: 5 });
    expect(JSON.parse(await readFile(lockPath, "utf8"))).not.toMatchObject({ ownerToken: "dead-owner" });
    await lock.release();
  });

  it("only releases the lock owned by its handle", async () => {
    const paths = await temporaryPaths();
    const first = await acquireLock(paths, "browser");
    const lockPath = path.join(paths.locks, "browser.lock");
    const replacement = {
      ownerToken: "replacement-owner",
      pid: process.pid,
      createdAt: new Date().toISOString(),
    };
    await writeFile(lockPath, JSON.stringify(replacement));

    await first.release();

    expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual(replacement);
  });

  it("reclaims an expired corrupt lock but preserves a fresh one", async () => {
    const paths = await temporaryPaths();
    await mkdir(paths.locks, { recursive: true });
    const lockPath = path.join(paths.locks, "browser.lock");
    await writeFile(lockPath, "partial");
    await expect(
      acquireLock(paths, "browser", { timeoutMs: 20, staleMs: 1_000, pollMs: 5 }),
    ).rejects.toBeInstanceOf(LockTimeoutError);

    const old = new Date(Date.now() - 2_000);
    await utimes(lockPath, old, old);
    const lock = await acquireLock(paths, "browser", { timeoutMs: 100, staleMs: 1_000, pollMs: 5 });
    await lock.release();
  });
});
