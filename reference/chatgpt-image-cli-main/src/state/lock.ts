import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import type { AppPaths } from "../config.js";

export interface LockHandle {
  release(): Promise<void>;
}

interface LockMetadata {
  ownerToken: string;
  pid: number;
  createdAt: string;
}

export class LockTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockTimeoutError";
  }
}

function parseMetadata(value: string): LockMetadata | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<LockMetadata>;
    if (
      typeof parsed.ownerToken === "string" &&
      parsed.ownerToken.length > 0 &&
      typeof parsed.pid === "number" &&
      Number.isSafeInteger(parsed.pid) &&
      parsed.pid > 0 &&
      typeof parsed.createdAt === "string"
    ) {
      return parsed as LockMetadata;
    }
  } catch {
    // A partial/corrupt record is handled using its mtime below.
  }
  return undefined;
}

async function readMetadata(lockPath: string): Promise<LockMetadata | undefined> {
  return parseMetadata(await readFile(lockPath, "utf8"));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // EPERM means the process exists but this process cannot signal it.
    return code === "EPERM";
  }
}

async function isStale(lockPath: string, staleMs: number): Promise<{ stale: boolean; ownerToken?: string }> {
  const [lockStat, metadata] = await Promise.all([stat(lockPath), readMetadata(lockPath).catch(() => undefined)]);
  const expired = Date.now() - lockStat.mtimeMs > staleMs;

  if (!metadata) return { stale: expired };

  // A live owner wins over timestamps. This prevents a healthy hour-long job
  // from losing the lock even if its heartbeat was temporarily delayed.
  if (isProcessAlive(metadata.pid)) return { stale: false, ownerToken: metadata.ownerToken };

  // A lock whose owner has exited can be reclaimed immediately. The token is
  // checked again immediately before unlinking so another owner is not removed.
  return { stale: true, ownerToken: metadata.ownerToken };
}

async function removeIfOwned(lockPath: string, ownerToken: string): Promise<boolean> {
  try {
    const metadata = await readMetadata(lockPath);
    if (metadata?.ownerToken !== ownerToken) return false;
    await rm(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function acquireLock(
  paths: AppPaths,
  name: string,
  options: { timeoutMs?: number; staleMs?: number; pollMs?: number; heartbeatMs?: number } = {},
): Promise<LockHandle> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  // Longer than the maximum supported one-hour task. Heartbeats normally keep
  // mtime fresh; this also leaves a safe margin if the event loop is delayed.
  const staleMs = options.staleMs ?? 65 * 60_000;
  const pollMs = options.pollMs ?? 250;
  const heartbeatMs = options.heartbeatMs ?? Math.max(10, Math.min(30_000, Math.floor(staleMs / 3)));
  const started = Date.now();
  const safeName = name.replace(/[^A-Za-z0-9._-]/g, "_");
  const lockPath = path.join(paths.locks, `${safeName}.lock`);
  await mkdir(paths.locks, { recursive: true });

  while (true) {
    const ownerToken = randomUUID();
    try {
      const handle = await open(lockPath, "wx");
      const metadata: LockMetadata = { ownerToken, pid: process.pid, createdAt: new Date().toISOString() };
      try {
        await handle.writeFile(JSON.stringify(metadata));
      } finally {
        await handle.close();
      }

      let released = false;
      let heartbeatRunning = false;
      const heartbeat = setInterval(() => {
        if (released || heartbeatRunning) return;
        heartbeatRunning = true;
        void (async () => {
          try {
            const current = await readMetadata(lockPath);
            if (current?.ownerToken !== ownerToken) return;
            const now = new Date();
            await utimes(lockPath, now, now);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
              // A failed heartbeat must not crash the process. A live PID still
              // protects this owner from stale reclamation.
            }
          } finally {
            heartbeatRunning = false;
          }
        })();
      }, heartbeatMs);
      heartbeat.unref();

      return {
        async release() {
          if (released) return;
          released = true;
          clearInterval(heartbeat);
          await removeIfOwned(lockPath, ownerToken);
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const candidate = await isStale(lockPath, staleMs);
        if (candidate.stale && candidate.ownerToken) {
          await removeIfOwned(lockPath, candidate.ownerToken);
          continue;
        }
        if (candidate.stale && !candidate.ownerToken) {
          // Corrupt legacy records have no owner token. Only remove them after
          // they have exceeded the configured stale window.
          const lockStat = await stat(lockPath);
          if (Date.now() - lockStat.mtimeMs > staleMs) {
            await rm(lockPath, { force: true });
            continue;
          }
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }

      if (Date.now() - started >= timeoutMs) {
        throw new LockTimeoutError(`Timed out waiting for lock ${name}`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
