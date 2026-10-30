#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { Command } from "commander";
import { ZodError } from "zod";
import { getAppPaths } from "./config.js";
import { parseImageRequest } from "./schema.js";
import { ChatGptImageWorkflow } from "./workflow.js";

const program = new Command();
program
  .name("chatgpt-image")
  .description("Generate and iterate ChatGPT images through an existing Chrome session")
  .version("0.1.0");

program
  .command("doctor")
  .description("Check local dependencies and browser connection configuration")
  .action(async () => {
    const workflow = new ChatGptImageWorkflow();
    const sessions = await workflow.browser.listSessions().catch(() => []);
    writeJson({
      status: "ok",
      node: process.version,
      home: getAppPaths().home,
      extension_token_configured: Boolean(process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN),
      sessions,
    });
  });

program
  .command("connect")
  .description("Connect the named Playwright session to the current Chrome browser")
  .option("--connection <mode>", "extension or cdp", "extension")
  .option("--channel <channel>", "Chrome channel or CDP channel", "chrome")
  .option("--session <name>", "Playwright CLI session name", "chatgpt-image")
  .action(async (options) => {
    const workflow = new ChatGptImageWorkflow();
    await workflow.browser.ensureConnected({
      connection: options.connection,
      channel: options.channel,
      session_name: options.session,
    }, 120_000);
    writeJson({ status: "connected", connection: options.connection, channel: options.channel, session: options.session });
  });

program
  .command("disconnect")
  .description("Detach the Playwright session without closing the user's Chrome")
  .option("--session <name>", "Playwright CLI session name", "chatgpt-image")
  .action(async (options) => {
    const workflow = new ChatGptImageWorkflow();
    await workflow.browser.detach(options.session);
    writeJson({ status: "disconnected", session: options.session });
  });

program
  .command("run")
  .description("Run a new or continue image request")
  .option("-i, --input <file>", "JSON request file; omit to read stdin")
  .action(async (options) => {
    const input = await readJsonInput(options.input);
    const request = parseImageRequest(input);
    const workflow = new ChatGptImageWorkflow();
    const result = await workflow.run(request);
    writeJson(result);
    process.exitCode = exitCodeForStatus(result.status);
  });

program
  .command("resume")
  .description("Resume waiting or downloading without resubmitting the prompt")
  .requiredOption("--task-id <id>", "Existing task ID")
  .action(async (options) => {
    const workflow = new ChatGptImageWorkflow();
    const result = await workflow.resume(options.taskId);
    writeJson(result);
    process.exitCode = exitCodeForStatus(result.status);
  });

program
  .command("status")
  .description("Read a task record without changing browser or task state")
  .requiredOption("--task-id <id>", "Existing task ID")
  .action(async (options) => {
    const workflow = new ChatGptImageWorkflow();
    await workflow.store.initialize();
    const record = await workflow.store.load(options.taskId);
    if (!record) throw new Error(`Unknown task_id: ${options.taskId}`);
    writeJson(record.result ?? record);
  });

program
  .command("conversations")
  .description("List only conversations tracked by this CLI")
  .action(async () => {
    const workflow = new ChatGptImageWorkflow();
    writeJson({ status: "ok", conversations: await workflow.listConversations() });
  });

program
  .command("delete")
  .description("Delete one CLI-managed ChatGPT conversation and retain the local task record")
  .requiredOption("--task-id <id>", "Existing task ID with a managed thread")
  .action(async (options) => {
    const workflow = new ChatGptImageWorkflow();
    writeJson({ status: "ok", result: await workflow.deleteConversation(options.taskId) });
  });

program
  .command("prune-tabs")
  .description("Close surplus blank chatgpt.com tabs without touching conversation tabs")
  .option("--connection <mode>", "extension or cdp", "extension")
  .option("--channel <channel>", "Chrome channel or CDP channel", "chrome")
  .option("--session <name>", "Playwright CLI session name", "chatgpt-image")
  .option("--keep <count>", "Number of blank ChatGPT tabs to retain", "1")
  .action(async (options) => {
    const workflow = new ChatGptImageWorkflow();
    const keep = Number(options.keep);
    if (!Number.isInteger(keep) || keep < 0) throw new Error("--keep must be a non-negative integer");
    const result = await workflow.pruneBlankTabs({
      connection: options.connection,
      channel: options.channel,
      session_name: options.session,
    }, keep);
    writeJson({ status: "ok", result });
  });

program.configureOutput({
  writeErr: (text) => process.stderr.write(text),
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const extensionMissing = /Playwright Extension not found/i.test(rawMessage);
  const details = error instanceof ZodError
    ? error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
    : undefined;
  writeJson({
    status: extensionMissing ? "human_action_required" : "failed",
    error: {
      code: extensionMissing ? "browser_extension_not_installed" : error instanceof ZodError ? "invalid_request" : "cli_error",
      message: extensionMissing
        ? "The official Playwright Bridge extension is not installed in the current Chrome profile. Install it manually, then run chatgpt-image connect again."
        : rawMessage,
      install_url: extensionMissing
        ? "https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm"
        : undefined,
      details,
    },
  });
  process.exitCode = extensionMissing ? 11 : 1;
});

async function readJsonInput(filename?: string): Promise<unknown> {
  const text = filename ? await readFile(filename, "utf8") : await readStdin();
  if (!text.trim()) throw new Error("No JSON input was provided");
  return JSON.parse(text);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function exitCodeForStatus(status: string): number {
  switch (status) {
    case "completed": return 0;
    case "login_required": return 10;
    case "human_action_required": return 11;
    case "content_blocked": return 12;
    case "timed_out": return 13;
    case "download_failed": return 14;
    case "ui_changed": return 15;
    default: return 1;
  }
}
