import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppPaths } from "../config.js";
import type { TaskRecord } from "../types.js";

export class TaskStore {
  constructor(private readonly paths: AppPaths) {}

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.paths.tasks, { recursive: true }),
      mkdir(this.paths.locks, { recursive: true }),
    ]);
  }

  taskPath(taskId: string): string {
    return path.join(this.paths.tasks, `${taskId}.json`);
  }

  async load(taskId: string): Promise<TaskRecord | undefined> {
    try {
      return JSON.parse(await readFile(this.taskPath(taskId), "utf8")) as TaskRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async list(): Promise<TaskRecord[]> {
    await this.initialize();
    const files = (await readdir(this.paths.tasks)).filter((file) => file.endsWith(".json"));
    const records = await Promise.all(files.map(async (file) => {
      return JSON.parse(await readFile(path.join(this.paths.tasks, file), "utf8")) as TaskRecord;
    }));
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(record: TaskRecord): Promise<void> {
    await this.initialize();
    record.updatedAt = new Date().toISOString();
    const target = this.taskPath(record.taskId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }
}
