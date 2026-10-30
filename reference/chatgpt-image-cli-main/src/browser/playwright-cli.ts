import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import type { BrowserOptions, CliExecutionResult } from "../types.js";

interface PlaywrightPackageJson {
  bin: Record<string, string> | string;
}

export interface BrowserSessionInfo {
  name: string;
  status: string;
  attached?: boolean;
  compatible?: boolean;
  browserType?: string;
}

export interface BrowserTabInfo {
  index: number;
  current: boolean;
  title: string;
  url: string;
}

export class PlaywrightCliError extends Error {
  constructor(
    message: string,
    readonly execution: CliExecutionResult,
  ) {
    super(message);
    this.name = "PlaywrightCliError";
  }
}

function resolvePlaywrightCli(): string {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve("@playwright/cli/package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as PlaywrightPackageJson;
  const relativeBin = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin["playwright-cli"];
  if (!relativeBin) throw new Error("@playwright/cli does not expose the playwright-cli binary");
  return path.resolve(path.dirname(packagePath), relativeBin);
}

function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    return undefined;
  }
}

export class PlaywrightCli {
  private readonly cliPath = resolvePlaywrightCli();

  constructor(private readonly cwd = process.cwd()) {}

  async execute(
    args: string[],
    options: { timeoutMs?: number; allowFailure?: boolean } = {},
  ): Promise<CliExecutionResult> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    return await new Promise<CliExecutionResult>((resolve, reject) => {
      const child = spawn(process.execPath, [this.cliPath, ...args], {
        cwd: this.cwd,
        env: process.env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => (stdout += chunk));
      child.stderr.on("data", (chunk: string) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout);
        const result: CliExecutionResult = {
          exitCode: code ?? (timedOut ? 124 : 1),
          stdout,
          stderr,
          json: parseJsonOutput(stdout),
        };
        if (timedOut) {
          reject(new PlaywrightCliError(`playwright-cli timed out after ${timeoutMs}ms`, result));
          return;
        }
        if (result.exitCode !== 0 && !options.allowFailure) {
          reject(new PlaywrightCliError(stderr.trim() || stdout.trim() || "playwright-cli failed", result));
          return;
        }
        resolve(result);
      });
    });
  }

  async listSessions(): Promise<BrowserSessionInfo[]> {
    const execution = await this.execute(["list", "--json"]);
    return ((execution.json as { browsers?: BrowserSessionInfo[] } | undefined)?.browsers ?? []);
  }

  async ensureConnected(options: BrowserOptions, timeoutMs = 60_000): Promise<void> {
    const sessions = await this.listSessions();
    const existing = sessions.find((session) => session.name === options.session_name && session.status === "open");
    if (existing?.attached && existing.compatible !== false) return;
    if (existing) await this.execute([`-s=${options.session_name}`, "close", "--json"], { allowFailure: true });

    const attachOption = options.connection === "extension"
      ? `--extension=${options.channel}`
      : `--cdp=${options.channel}`;
    await this.execute([`-s=${options.session_name}`, "attach", attachOption, "--json"], { timeoutMs });
  }

  async detach(sessionName: string): Promise<void> {
    await this.execute([`-s=${sessionName}`, "detach", "--json"], { allowFailure: true });
  }

  async runCode<T>(sessionName: string, code: string, timeoutMs = 30_000): Promise<T> {
    const execution = await this.execute(
      [`-s=${sessionName}`, "run-code", code, "--json"],
      { timeoutMs },
    );
    const outer = execution.json as { result?: unknown } | undefined;
    if (typeof outer?.result === "string") {
      try {
        return JSON.parse(outer.result) as T;
      } catch {
        return outer.result as T;
      }
    }
    return outer?.result as T;
  }

  async tabs(sessionName: string): Promise<BrowserTabInfo[]> {
    const execution = await this.execute([`-s=${sessionName}`, "tab-list", "--json"]);
    const text = String((execution.json as { result?: string } | undefined)?.result ?? "");
    return parseTabList(text);
  }

  async selectTab(sessionName: string, index: number): Promise<void> {
    await this.execute([`-s=${sessionName}`, "tab-select", String(index), "--json"]);
  }

  async closeTab(sessionName: string, index: number): Promise<void> {
    await this.execute([`-s=${sessionName}`, "tab-close", String(index), "--json"]);
  }

  async newTab(sessionName: string, url: string): Promise<void> {
    assertAllowedChatGptUrl(url);
    await this.execute([`-s=${sessionName}`, "tab-new", url, "--json"], { timeoutMs: 60_000 });
  }

  async goto(sessionName: string, url: string): Promise<void> {
    assertAllowedChatGptUrl(url);
    await this.execute([`-s=${sessionName}`, "goto", url, "--json"], { timeoutMs: 60_000 });
  }

  async screenshot(sessionName: string, filename: string): Promise<void> {
    await this.execute(
      [`-s=${sessionName}`, "screenshot", `--filename=${path.resolve(filename)}`, "--json"],
      { timeoutMs: 60_000, allowFailure: true },
    );
  }
}

export function parseTabList(text: string): BrowserTabInfo[] {
  const tabs: BrowserTabInfo[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^-\s+(\d+):\s+(\(current\)\s+)?\[(.*?)]\((.*?)\)\s*$/);
    if (!match) continue;
    tabs.push({
      index: Number(match[1]),
      current: Boolean(match[2]),
      title: match[3] ?? "",
      url: match[4] ?? "",
    });
  }
  return tabs;
}

export function assertAllowedChatGptUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "chatgpt.com") {
    throw new Error(`Refusing to navigate outside https://chatgpt.com: ${url}`);
  }
}
