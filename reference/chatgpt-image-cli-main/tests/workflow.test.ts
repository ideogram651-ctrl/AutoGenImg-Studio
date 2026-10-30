import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PlaywrightCli } from "../src/browser/playwright-cli.js";
import type { AppPaths } from "../src/config.js";
import type { ImageRequest, PageState, TaskRecord } from "../src/types.js";
import { ChatGptImageWorkflow } from "../src/workflow.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryPaths(): Promise<AppPaths> {
  const home = await mkdtemp(path.join(os.tmpdir(), "chatgpt-image-workflow-test-"));
  cleanup.push(home);
  return { home, tasks: path.join(home, "tasks"), locks: path.join(home, "locks") };
}

function request(paths: AppPaths, forceResubmit: boolean): ImageRequest {
  return {
    task_id: "workflow-task",
    mode: "continue",
    prompt: "edit the image",
    reference_images: [],
    output_dir: paths.home,
    thread_id: "thread-one",
    timeout_seconds: 60,
    force_resubmit: forceResubmit,
    browser: { connection: "extension", channel: "chrome", session_name: "chatgpt-image" },
  };
}

function taskRecord(imageRequest: ImageRequest): TaskRecord {
  const now = new Date().toISOString();
  return {
    version: 1,
    taskId: imageRequest.task_id,
    request: imageRequest,
    promptHash: "existing-hash",
    status: "timed_out",
    stage: "timed_out",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    promptSubmitted: true,
    baselineTurnIds: ["old-user", "old-assistant"],
    threadId: "thread-one",
    threadUrl: "https://chatgpt.com/c/thread-one",
    downloadedImages: [],
  };
}

function fakeBrowser(state: PageState, runCodeCalls?: string[]): PlaywrightCli {
  return {
    ensureConnected: async () => {},
    tabs: async () => [{
      index: 0,
      current: true,
      title: "Image task",
      url: "https://chatgpt.com/c/thread-one",
    }],
    selectTab: async () => {},
    newTab: async () => {},
    runCode: async (_session: string, code: string) => {
      runCodeCalls?.push(code);
      return state;
    },
    screenshot: async () => {},
  } as unknown as PlaywrightCli;
}

describe("ChatGptImageWorkflow regressions", () => {
  it("never re-enables force_resubmit when resuming a persisted task", async () => {
    const paths = await temporaryPaths();
    const imageRequest = request(paths, true);
    const state: PageState = {
      url: "https://chatgpt.com/c/thread-one",
      title: "Image task",
      threadId: "thread-one",
      loginRequired: true,
      humanChallenge: false,
      generating: false,
      alerts: [],
      turns: [],
    };
    const calls: string[] = [];
    const workflow = new ChatGptImageWorkflow(paths, fakeBrowser(state, calls));
    await workflow.store.save(taskRecord(imageRequest));

    const result = await workflow.resume(imageRequest.task_id);

    expect(result.status).toBe("login_required");
    expect(result.prompt_submitted).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("name: 'Chat'");
  });

  it("does not resubmit an uncertain new-chat submission with an empty baseline", async () => {
    const paths = await temporaryPaths();
    const imageRequest: ImageRequest = {
      ...request(paths, false),
      mode: "new",
      thread_id: undefined,
    };
    const record = taskRecord(imageRequest);
    record.stage = "submitting";
    record.status = "running";
    record.promptSubmitted = false;
    record.baselineTurnIds = [];
    record.threadId = undefined;
    record.threadUrl = undefined;
    const state: PageState = {
      url: "https://chatgpt.com/",
      title: "ChatGPT",
      loginRequired: false,
      humanChallenge: false,
      generating: false,
      alerts: [],
      turns: [],
    };
    const calls: string[] = [];
    const workflow = new ChatGptImageWorkflow(paths, fakeBrowser(state, calls));
    await workflow.store.save(record);

    const result = await workflow.resume(imageRequest.task_id);

    expect(result).toMatchObject({
      status: "human_action_required",
      error: { code: "submission_uncertain" },
      prompt_submitted: false,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("name: 'Chat'");
  });

  it("returns actionable page alerts and persists only sanitized task-local state", async () => {
    const paths = await temporaryPaths();
    const imageRequest = request(paths, false);
    const signedUrl = "https://images.example.test/generated.png?sig=secret&expires=tomorrow";
    const state: PageState = {
      url: "https://chatgpt.com/c/thread-one",
      title: "Image task",
      threadId: "thread-one",
      loginRequired: false,
      humanChallenge: false,
      generating: false,
      alerts: ["Something went wrong while generating the image. Please try again."],
      turns: [
        { id: "old-user", turn: "user", writing: false, text: "private old conversation", images: [] },
        { id: "old-assistant", turn: "assistant", writing: false, text: "private old answer", images: [] },
        { id: "new-user", turn: "user", writing: false, text: imageRequest.prompt, images: [] },
        {
          id: "new-assistant",
          turn: "assistant",
          writing: false,
          text: "Generation failed",
          images: [{
            src: signedUrl,
            alt: "Generated image",
            complete: false,
            naturalWidth: 0,
            naturalHeight: 0,
          }],
        },
      ],
    };
    const workflow = new ChatGptImageWorkflow(paths, fakeBrowser(state));
    await workflow.store.save(taskRecord(imageRequest));

    const result = await workflow.run(imageRequest);
    const persisted = await workflow.store.load(imageRequest.task_id);
    const rawRecord = await readFile(workflow.store.taskPath(imageRequest.task_id), "utf8");

    expect(result).toMatchObject({
      status: "failed",
      error: {
        code: "page_error",
        page_text: "Something went wrong while generating the image. Please try again.",
      },
    });
    expect(persisted?.latestPageState?.turns.map((turn) => turn.id)).toEqual(["new-user", "new-assistant"]);
    expect(persisted?.latestPageState?.turns[1]?.images[0]?.src).toBe("https://images.example.test/generated.png");
    expect(result.image_resources?.[0]?.src).toBe("https://images.example.test/generated.png");
    expect(rawRecord).not.toContain("private old conversation");
    expect(rawRecord).not.toContain("private old answer");
    expect(rawRecord).not.toContain("sig=secret");
  });

  it("sanitizes signed URLs in an existing completed record before returning it", async () => {
    const paths = await temporaryPaths();
    const imageRequest = request(paths, false);
    const record = taskRecord(imageRequest);
    const signedUrl = "https://images.example.test/generated.png?sig=legacy-secret";
    record.status = "completed";
    record.stage = "completed";
    record.downloadedImages = [{ path: "result.png", width: 1, height: 1, bytes: 1, source_url: signedUrl }];
    record.result = {
      status: "completed",
      task_id: imageRequest.task_id,
      prompt_sent: imageRequest.prompt,
      reference_images: [],
      elapsed_seconds: 1,
      images: record.downloadedImages,
      assistant_text: "编辑",
      image_resources: [{ src: signedUrl, alt: "generated", complete: true, naturalWidth: 1, naturalHeight: 1 }],
    };
    const workflow = new ChatGptImageWorkflow(paths, fakeBrowser({
      url: "",
      title: "",
      loginRequired: false,
      humanChallenge: false,
      generating: false,
      alerts: [],
      turns: [],
    }));
    await workflow.store.save(record);

    await workflow.run(imageRequest);
    const rawRecord = await readFile(workflow.store.taskPath(imageRequest.task_id), "utf8");

    expect(rawRecord).not.toContain("legacy-secret");
    expect(rawRecord).toContain("https://images.example.test/generated.png");
    expect(rawRecord).not.toContain('"assistant_text": "编辑"');
  });

  it("deletes only a task-managed conversation and retains an audit marker", async () => {
    const paths = await temporaryPaths();
    const imageRequest = request(paths, false);
    const calls: string[] = [];
    const state: PageState = {
      url: "https://chatgpt.com/",
      title: "ChatGPT",
      loginRequired: false,
      humanChallenge: false,
      generating: false,
      alerts: [],
      turns: [],
    };
    const workflow = new ChatGptImageWorkflow(paths, fakeBrowser(state, calls));
    await workflow.store.save(taskRecord(imageRequest));

    const result = await workflow.deleteConversation(imageRequest.task_id);
    const persisted = await workflow.store.load(imageRequest.task_id);
    const listed = await workflow.listConversations();

    expect(result).toMatchObject({ task_id: imageRequest.task_id, thread_id: "thread-one" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("managed_thread_not_open");
    expect(persisted?.conversationDeletedAt).toBeTruthy();
    expect(listed[0]).toMatchObject({ task_id: imageRequest.task_id, deleted_at: persisted?.conversationDeletedAt });
  });

  it("does not list failed tasks that never created a conversation", async () => {
    const paths = await temporaryPaths();
    const imageRequest = request(paths, false);
    const record = taskRecord(imageRequest);
    record.threadId = undefined;
    record.threadUrl = undefined;
    const workflow = new ChatGptImageWorkflow(paths, fakeBrowser({
      url: "https://chatgpt.com/", title: "ChatGPT", loginRequired: false,
      humanChallenge: false, generating: false, alerts: [], turns: [],
    }));
    await workflow.store.save(record);
    expect(await workflow.listConversations()).toEqual([]);
  });

  it("prunes only surplus blank ChatGPT tabs", async () => {
    const paths = await temporaryPaths();
    let tabs = [
      { index: 0, current: false, title: "Blank 1", url: "https://chatgpt.com/" },
      { index: 1, current: true, title: "Blank 2", url: "https://chatgpt.com/" },
      { index: 2, current: false, title: "Blank 3", url: "https://chatgpt.com/?temporary-chat=true" },
      { index: 3, current: false, title: "Managed", url: "https://chatgpt.com/c/thread-one" },
    ];
    const closed: number[] = [];
    const browser = {
      ensureConnected: async () => {},
      tabs: async () => tabs,
      closeTab: async (_session: string, index: number) => {
        closed.push(index);
        tabs = tabs.filter((tab) => tab.index !== index);
      },
    } as unknown as PlaywrightCli;
    const workflow = new ChatGptImageWorkflow(paths, browser);

    const result = await workflow.pruneBlankTabs(request(paths, false).browser, 1);

    expect(result).toEqual({ closed: 2, remaining_blank_tabs: 1 });
    expect(closed).toEqual([0, 2]);
    expect(tabs.some((tab) => tab.url.endsWith("/c/thread-one"))).toBe(true);
  });
});
