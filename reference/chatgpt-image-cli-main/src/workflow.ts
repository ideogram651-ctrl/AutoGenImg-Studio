import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAppPaths, type AppPaths } from "./config.js";
import { PlaywrightCli, PlaywrightCliError } from "./browser/playwright-cli.js";
import {
  collectPageStateScript,
  deleteConversationScript,
  ensureChatModeScript,
  downloadImageScript,
  ensureImageModeScript,
  submitPromptScript,
  uploadReferenceImagesScript,
} from "./browser/scripts.js";
import { finalizeDownloadedImage } from "./image/inspect.js";
import { acquireLock } from "./state/lock.js";
import { TaskStore } from "./state/store.js";
import type {
  ErrorDetails,
  ImageRequest,
  PageState,
  ResultStatus,
  TaskRecord,
  ToolResult,
} from "./types.js";
import {
  assistantText,
  collectPendingImages,
  findWorkedForText,
  imagesAreReady,
  looksContentBlocked,
  newAssistantTurns,
  stableImageSignature,
  userPromptWasSubmitted,
} from "./workflow/state.js";

export class ChatGptImageWorkflow {
  readonly store: TaskStore;
  readonly browser: PlaywrightCli;
  private readonly runtimePageStates = new WeakMap<TaskRecord, PageState>();

  constructor(
    readonly paths: AppPaths = getAppPaths(),
    browser?: PlaywrightCli,
  ) {
    this.store = new TaskStore(paths);
    this.browser = browser ?? new PlaywrightCli();
  }

  async run(request: ImageRequest): Promise<ToolResult> {
    await this.store.initialize();
    await mkdir(request.output_dir, { recursive: true });
    const lock = await acquireLock(this.paths, "browser", { timeoutMs: 60_000 });
    try {
      return await this.runLocked(request);
    } finally {
      await lock.release();
    }
  }

  async resume(taskId: string): Promise<ToolResult> {
    await this.store.initialize();
    const existing = await this.store.load(taskId);
    if (!existing) throw new Error(`Unknown task_id: ${taskId}`);
    // force_resubmit is an instruction for one invocation, not durable task state.
    // A resume must only observe/recover the original submission.
    return await this.run({ ...existing.request, force_resubmit: false });
  }

  async listConversations(): Promise<Array<Record<string, unknown>>> {
    const records = await this.store.list();
    return records.filter((record) => Boolean(record.threadId ?? record.result?.thread_id)).map((record) => ({
      task_id: record.taskId,
      status: record.status,
      stage: record.stage,
      thread_id: record.threadId ?? record.result?.thread_id,
      thread_url: record.threadUrl ?? record.result?.thread_url,
      title: record.actualTitle ?? record.result?.actual_title,
      created_at: record.createdAt,
      deleted_at: record.conversationDeletedAt,
    }));
  }

  async deleteConversation(taskId: string): Promise<Record<string, unknown>> {
    await this.store.initialize();
    const record = await this.store.load(taskId);
    if (!record) throw new Error(`Unknown task_id: ${taskId}`);
    const threadId = record.threadId ?? record.result?.thread_id;
    const threadUrl = record.threadUrl ?? record.result?.thread_url;
    if (!threadId || !threadUrl) throw new Error(`Task has no managed conversation: ${taskId}`);
    if (record.conversationDeletedAt) {
      return { deleted: true, already_deleted: true, task_id: taskId, thread_id: threadId, deleted_at: record.conversationDeletedAt };
    }

    const lock = await acquireLock(this.paths, "browser", { timeoutMs: 60_000 });
    try {
      await this.browser.ensureConnected(record.request.browser, 90_000);
      const session = record.request.browser.session_name;
      const tabs = await this.browser.tabs(session);
      const normalized = threadUrl.replace(/[?#].*$/, "");
      const existing = tabs.find((tab) => tab.url.replace(/[?#].*$/, "") === normalized);
      if (existing) {
        await this.browser.selectTab(session, existing.index);
      } else {
        const blank = tabs.find((tab) => /^https:\/\/chatgpt\.com\/?(?:[?#].*)?$/.test(tab.url));
        if (blank) {
          await this.browser.selectTab(session, blank.index);
          await this.browser.goto(session, threadUrl);
        } else {
          await this.browser.newTab(session, threadUrl);
        }
      }
      const result = await this.browser.runCode<Record<string, unknown>>(
        session,
        deleteConversationScript(threadId),
        60_000,
      );
      record.conversationDeletedAt = new Date().toISOString();
      await this.store.save(record);
      return { ...result, task_id: taskId, thread_id: threadId, deleted_at: record.conversationDeletedAt };
    } finally {
      await lock.release();
    }
  }

  async pruneBlankTabs(browserOptions: ImageRequest["browser"], keep = 1): Promise<Record<string, unknown>> {
    const lock = await acquireLock(this.paths, "browser", { timeoutMs: 60_000 });
    try {
      await this.browser.ensureConnected(browserOptions, 90_000);
      const session = browserOptions.session_name;
      let closed = 0;
      while (true) {
        const tabs = await this.browser.tabs(session);
        const blank = tabs.filter((tab) => /^https:\/\/chatgpt\.com\/?(?:[?#].*)?$/.test(tab.url));
        if (blank.length <= Math.max(0, keep)) break;
        const candidate = blank.find((tab) => !tab.current) ?? blank[blank.length - 1];
        if (!candidate) break;
        await this.browser.closeTab(session, candidate.index);
        closed += 1;
      }
      const remaining = (await this.browser.tabs(session))
        .filter((tab) => /^https:\/\/chatgpt\.com\/?(?:[?#].*)?$/.test(tab.url)).length;
      return { closed, remaining_blank_tabs: remaining };
    } finally {
      await lock.release();
    }
  }

  private async runLocked(request: ImageRequest): Promise<ToolResult> {
    let record = await this.store.load(request.task_id);
    if (record) {
      sanitizePersistedRecord(record);
      await this.store.save(record);
    }
    const promptHash = record && sameRequestInputs(record.request, request) && !request.force_resubmit
      ? record.promptHash
      : await computeRequestHash(request);
    if (record?.result?.status === "completed" && !request.force_resubmit) return record.result;
    if (record && record.promptHash !== promptHash && !request.force_resubmit) {
      return await this.finishFailure(record, "failed", {
        code: "task_id_conflict",
        message: "This task_id already exists with a different prompt or reference image set.",
      }, false);
    }

    if (!record || request.force_resubmit) {
      if (!record || !record.promptSubmitted || request.force_resubmit) await validateReferenceImages(request.reference_images);
      const now = new Date().toISOString();
      record = {
        version: 1,
        taskId: request.task_id,
        request: { ...request, force_resubmit: false },
        promptHash,
        status: "running",
        stage: "created",
        createdAt: record?.createdAt ?? now,
        updatedAt: now,
        startedAt: now,
        promptSubmitted: false,
        baselineTurnIds: [],
        downloadedImages: [],
      };
      await this.store.save(record);
    }

    try {
      const resumeStage = record.stage;
      record.status = "running";
      record.stage = "connecting";
      await this.store.save(record);
      await this.browser.ensureConnected(request.browser, 90_000);
      await this.openTaskPage(record);
      // Image generation must use Chat mode. Work may route through a
      // different execution backend and is intentionally unsupported here.
      await this.browser.runCode(request.browser.session_name, ensureChatModeScript(), 30_000);

      let state = await this.collectState(request.browser.session_name);
      this.rememberPageState(record, state);
      record.threadId = state.threadId ?? record.threadId;
      record.threadUrl = state.threadId ? `https://chatgpt.com/c/${state.threadId}` : record.threadUrl;
      record.actualTitle = state.title || record.actualTitle;
      await this.store.save(record);
      const blocked = await this.classifyImmediateBlock(record, state);
      if (blocked) return blocked;

      if (!record.promptSubmitted) {
        const submissionWasUncertain = resumeStage === "submitting" || record.error?.code === "submission_uncertain";
        if (submissionWasUncertain) {
          if (userPromptWasSubmitted(state, record.baselineTurnIds, request.prompt)) {
            record.promptSubmitted = true;
          } else if (!request.force_resubmit) {
            return await this.finishFailure(record, "human_action_required", {
              code: "submission_uncertain",
              message: "The previous run stopped while submitting. The tool will not resubmit automatically; inspect the visible conversation or retry with force_resubmit=true.",
            }, true);
          }
        }

        if (!record.promptSubmitted) {
          record.stage = "preparing";
          await this.store.save(record);
          if (request.mode === "new") {
            await this.browser.runCode(request.browser.session_name, ensureImageModeScript(), 30_000);
          }
          await this.browser.runCode(
            request.browser.session_name,
            uploadReferenceImagesScript(request.reference_images),
            120_000,
          );
          state = await this.collectState(request.browser.session_name);
          record.baselineTurnIds = state.turns.map((turn) => turn.id);
          record.threadId = state.threadId ?? record.threadId;
          record.threadUrl = state.threadId ? `https://chatgpt.com/c/${state.threadId}` : record.threadUrl;
          record.stage = "submitting";
          this.rememberPageState(record, state);
          await this.store.save(record);

          await this.browser.runCode(
            request.browser.session_name,
            submitPromptScript(request.prompt, request.mode === "new"),
            60_000,
          );
          state = await this.waitForSubmission(record, 60_000);
          record.promptSubmitted = true;
          record.stage = "prompt_submitted";
          record.threadId = state.threadId ?? record.threadId;
          record.threadUrl = state.threadId ? `https://chatgpt.com/c/${state.threadId}` : record.threadUrl;
          record.actualTitle = state.title || record.actualTitle;
          this.rememberPageState(record, state);
          await this.store.save(record);
        }
      }

      record.stage = "waiting_for_image";
      await this.store.save(record);
      const completedState = await this.waitForImages(record, request.timeout_seconds * 1000);
      if (!completedState) {
        return await this.finishFailure(record, "timed_out", {
          code: "generation_timeout",
          message: "Image generation did not reach a stable downloadable state before the timeout.",
        }, true);
      }

      const assistantTurns = newAssistantTurns(completedState, record.baselineTurnIds);
      const pendingImages = collectPendingImages(assistantTurns);
      record.stage = "downloading";
      this.rememberPageState(record, completedState);
      await this.store.save(record);

      for (let index = 0; index < pendingImages.length; index++) {
        const image = pendingImages[index]!;
        const sourceFingerprint = persistentResourceUrl(image.src);
        const existingImage = record.downloadedImages.find((item) =>
          item.source_url === sourceFingerprint ||
          (item.source_url ? persistentResourceUrl(item.source_url) === sourceFingerprint : false)
        );
        if (existingImage && await fileExists(existingImage.path)) continue;
        const temporaryPath = path.join(request.output_dir, `.${request.task_id}_${String(index + 1).padStart(3, "0")}.part`);
        await rm(temporaryPath, { force: true });
        try {
          const downloaded = await this.browser.runCode<{
            source: string;
            contentType: string;
            bytes: number;
            base64: string;
          }>(
            request.browser.session_name,
            downloadImageScript(image.turnId, image),
            90_000,
          );
          if (!downloaded.base64 || downloaded.bytes <= 0) throw new Error("Downloaded image resource was empty");
          const bytes = Buffer.from(downloaded.base64, "base64");
          if (bytes.length !== downloaded.bytes) {
            throw new Error(`Downloaded image byte count mismatch: expected ${downloaded.bytes}, received ${bytes.length}`);
          }
          await writeFile(temporaryPath, bytes);
          const finalized = await finalizeDownloadedImage(
            temporaryPath,
            request.output_dir,
            request.task_id,
            index + 1,
            image.src,
          );
          finalized.source_url = sourceFingerprint;
          record.downloadedImages.push(finalized);
          await this.store.save(record);
        } catch (error) {
          await rm(temporaryPath, { force: true });
          return await this.finishFailure(record, "download_failed", {
            code: "download_failed",
            message: errorMessage(error),
          }, true, pendingImages);
        }
      }

      const result: ToolResult = {
        status: "completed",
        task_id: request.task_id,
        thread_id: record.threadId,
        thread_url: record.threadUrl,
        prompt_sent: request.prompt,
        reference_images: request.reference_images,
        elapsed_seconds: elapsedSeconds(record.startedAt),
        worked_for_text: findWorkedForText(assistantTurns),
        images: record.downloadedImages,
        assistant_text: assistantText(assistantTurns),
        requested_title: request.title,
        actual_title: completedState.title || record.actualTitle,
        stage: "completed",
        can_resume: false,
        prompt_submitted: true,
      };
      record.status = "completed";
      record.stage = "completed";
      record.result = result;
      await this.store.save(record);
      return result;
    } catch (error) {
      return await this.handleUnexpectedError(record, error);
    }
  }

  private async openTaskPage(record: TaskRecord): Promise<void> {
    const { request } = record;
    const session = request.browser.session_name;
    let targetUrl: string | undefined = record.threadUrl ?? request.thread_url;
    if (!targetUrl && (record.threadId ?? request.thread_id)) {
      targetUrl = `https://chatgpt.com/c/${record.threadId ?? request.thread_id}`;
    }

    if (targetUrl) {
      const tabs = await this.browser.tabs(session);
      const normalized = targetUrl.replace(/[?#].*$/, "");
      const existing = tabs.find((tab) => tab.url.replace(/[?#].*$/, "") === normalized);
      if (existing) await this.browser.selectTab(session, existing.index);
      else await this.browser.newTab(session, targetUrl);
    } else if (record.promptSubmitted) {
      const tabs = await this.browser.tabs(session);
      const candidate = tabs.find((tab) => tab.current && /^https:\/\/chatgpt\.com\/c\//.test(tab.url)) ??
        [...tabs].reverse().find((tab) => /^https:\/\/chatgpt\.com\/c\//.test(tab.url));
      if (!candidate) throw new Error("SUBMISSION_UNCERTAIN:submitted task has no recoverable ChatGPT tab URL");
      await this.browser.selectTab(session, candidate.index);
    } else {
      // Reuse one blank ChatGPT tab and navigate it afresh. Opening a new SPA
      // tab for every task eventually leaves several half-initialized home
      // pages where the composer appears ready but submissions are discarded.
      const tabs = await this.browser.tabs(session);
      const blank = tabs.find((tab) => tab.current && /^https:\/\/chatgpt\.com\/?(?:[?#].*)?$/.test(tab.url)) ??
        [...tabs].reverse().find((tab) => /^https:\/\/chatgpt\.com\/?(?:[?#].*)?$/.test(tab.url));
      if (blank) {
        await this.browser.selectTab(session, blank.index);
        await this.browser.goto(session, "https://chatgpt.com/");
      } else {
        await this.browser.newTab(session, "https://chatgpt.com/");
      }
    }
    record.stage = "thread_opened";
    await this.store.save(record);
  }

  private async collectState(sessionName: string): Promise<PageState> {
    return await this.browser.runCode<PageState>(sessionName, collectPageStateScript(), 30_000);
  }

  private async waitForSubmission(record: TaskRecord, timeoutMs: number): Promise<PageState> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.collectState(record.request.browser.session_name);
      this.rememberPageState(record, state);
      if (state.loginRequired || state.humanChallenge) throw new Error(state.loginRequired ? "LOGIN_REQUIRED" : "HUMAN_CHALLENGE");
      if (userPromptWasSubmitted(state, record.baselineTurnIds, record.request.prompt)) return state;
      await delay(750);
    }
    throw new Error("SUBMISSION_UNCERTAIN:could not verify the new user message");
  }

  private async waitForImages(record: TaskRecord, timeoutMs: number): Promise<PageState | undefined> {
    const deadline = Date.now() + timeoutMs;
    let signature = "";
    let stableSince = 0;
    while (Date.now() < deadline) {
      const state = await this.collectState(record.request.browser.session_name);
      this.rememberPageState(record, state);
      record.threadId = state.threadId ?? record.threadId;
      record.threadUrl = state.threadId ? `https://chatgpt.com/c/${state.threadId}` : record.threadUrl;
      record.actualTitle = state.title || record.actualTitle;
      await this.store.save(record);
      if (state.loginRequired) throw new Error("LOGIN_REQUIRED");
      if (state.humanChallenge) throw new Error("HUMAN_CHALLENGE");
      const pageError = actionablePageAlert(state.alerts);
      if (pageError) throw new PageAlertError(pageError);
      const turns = newAssistantTurns(state, record.baselineTurnIds);
      const images = collectPendingImages(turns);
      if (!images.length && turns.length && !state.generating && looksContentBlocked(turns)) {
        throw new Error(`CONTENT_BLOCKED:${assistantText(turns)}`);
      }
      if (imagesAreReady(state, turns, images)) {
        const nextSignature = stableImageSignature(turns, images);
        if (nextSignature !== signature) {
          signature = nextSignature;
          stableSince = Date.now();
        } else if (Date.now() - stableSince >= 4_000) {
          return state;
        }
      } else {
        signature = "";
        stableSince = 0;
      }
      await delay(2_000);
    }
    return undefined;
  }

  private async classifyImmediateBlock(record: TaskRecord, state: PageState): Promise<ToolResult | undefined> {
    if (state.loginRequired) {
      return await this.finishFailure(record, "login_required", {
        code: "login_required",
        message: "ChatGPT is not signed in. Sign in in the visible Chrome window, then resume this task.",
      }, true);
    }
    if (state.humanChallenge) {
      return await this.finishFailure(record, "human_action_required", {
        code: "human_challenge",
        message: "The page requires a CAPTCHA, risk check, or other human verification.",
      }, true);
    }
    return undefined;
  }

  private async handleUnexpectedError(record: TaskRecord, error: unknown): Promise<ToolResult> {
    if (error instanceof PageAlertError) {
      const contentBlocked = looksLikeContentBlock(error.pageText);
      return await this.finishFailure(record, contentBlocked ? "content_blocked" : "failed", {
        code: contentBlocked ? "content_blocked" : "page_error",
        message: error.pageText,
        page_text: error.pageText,
      }, !contentBlocked);
    }
    const message = errorMessage(error);
    if (message.includes("LOGIN_REQUIRED")) {
      return await this.finishFailure(record, "login_required", { code: "login_required", message }, true);
    }
    if (message.includes("HUMAN_CHALLENGE") || message.includes("SUBMISSION_UNCERTAIN")) {
      return await this.finishFailure(record, "human_action_required", {
        code: message.includes("SUBMISSION_UNCERTAIN") ? "submission_uncertain" : "human_challenge",
        message,
      }, true);
    }
    if (message.includes("CONTENT_BLOCKED")) {
      return await this.finishFailure(record, "content_blocked", {
        code: "content_blocked",
        message: message.replace(/^.*CONTENT_BLOCKED:/, "") || "The page blocked the requested content.",
      }, false);
    }
    if (message.includes("UPLOAD_NOT_CONFIRMED")) {
      return await this.finishFailure(record, "failed", {
        code: "upload_not_confirmed",
        message: "ChatGPT did not show every reference image as attached, so the prompt was not submitted.",
      }, true);
    }
    if (message.includes("UPLOAD_FAILED")) {
      const pageText = message.replace(/^.*UPLOAD_FAILED:/, "").trim();
      return await this.finishFailure(record, "failed", {
        code: "upload_failed",
        message: pageText || "ChatGPT reported an error while uploading reference images.",
        page_text: pageText || undefined,
      }, true);
    }
    if (message.includes("UI_CHANGED")) {
      return await this.finishFailure(record, "ui_changed", { code: "ui_changed", message }, true);
    }
    if (error instanceof PlaywrightCliError && /timed out|extension|connect/i.test(message)) {
      const connection = record.request.browser.connection;
      return await this.finishFailure(record, "human_action_required", {
        code: "browser_connection_required",
        message: connection === "extension"
          ? `Could not use the Playwright Chrome extension. Open Chrome, verify the extension connection, and resume. (${message})`
          : `Could not use the Playwright CDP session. Verify Chrome and the attached session, then resume. (${message})`,
      }, true);
    }
    return await this.finishFailure(record, "failed", { code: "unexpected_error", message }, true);
  }

  private async finishFailure(
    record: TaskRecord,
    status: Exclude<ResultStatus, "completed">,
    error: ErrorDetails,
    canResume: boolean,
    resources?: ReturnType<typeof collectPendingImages>,
  ): Promise<ToolResult> {
    const screenshotPath = path.join(record.request.output_dir, `${record.taskId}_${status}.png`);
    await mkdir(record.request.output_dir, { recursive: true });
    await this.browser.screenshot(record.request.browser.session_name, screenshotPath).catch(() => {});
    const screenshotExists = await fileExists(screenshotPath);
    const currentPageState = this.runtimePageStates.get(record) ?? record.latestPageState ?? emptyPageState();
    const turns = newAssistantTurns(currentPageState, record.baselineTurnIds);
    const persistedResources = (resources ?? collectPendingImages(turns)).map((resource) => ({
      ...resource,
      src: persistentResourceUrl(resource.src),
    }));
    const result: ToolResult = {
      status,
      task_id: record.taskId,
      thread_id: record.threadId,
      thread_url: record.threadUrl,
      prompt_sent: record.request.prompt,
      reference_images: record.request.reference_images,
      elapsed_seconds: elapsedSeconds(record.startedAt),
      worked_for_text: findWorkedForText(turns),
      images: record.downloadedImages,
      assistant_text: assistantText(turns),
      requested_title: record.request.title,
      actual_title: record.actualTitle,
      stage: status === "timed_out" ? "timed_out" : canResume ? "needs_human" : "failed",
      can_resume: canResume,
      prompt_submitted: record.promptSubmitted,
      screenshot_path: screenshotExists ? screenshotPath : undefined,
      image_resources: persistedResources,
      error,
    };
    record.status = status;
    record.stage = status === "timed_out" ? "timed_out" : canResume ? "needs_human" : "failed";
    record.error = error;
    record.result = result;
    await this.store.save(record);
    return result;
  }

  private rememberPageState(record: TaskRecord, state: PageState): void {
    this.runtimePageStates.set(record, state);
    record.latestPageState = persistedPageState(state, record.baselineTurnIds);
  }
}

class PageAlertError extends Error {
  constructor(readonly pageText: string) {
    super(pageText);
    this.name = "PageAlertError";
  }
}

async function validateReferenceImages(images: string[]): Promise<void> {
  for (const image of images) await access(image);
}

async function computeRequestHash(request: ImageRequest): Promise<string> {
  const hash = createHash("sha256");
  hash.update(request.mode);
  hash.update("\0");
  hash.update(request.prompt);
  hash.update("\0");
  hash.update(request.thread_id ?? request.thread_url ?? "");
  for (const filename of request.reference_images) {
    hash.update("\0");
    hash.update(path.resolve(filename));
    hash.update("\0");
    hash.update(await readFile(filename));
  }
  return hash.digest("hex");
}

function elapsedSeconds(startedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
}

async function fileExists(filename: string): Promise<boolean> {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyPageState(): PageState {
  return {
    url: "",
    title: "",
    loginRequired: false,
    humanChallenge: false,
    generating: false,
    alerts: [],
    turns: [],
  };
}

function sameRequestInputs(left: ImageRequest, right: ImageRequest): boolean {
  return left.mode === right.mode &&
    left.prompt === right.prompt &&
    (left.thread_id ?? "") === (right.thread_id ?? "") &&
    (left.thread_url ?? "") === (right.thread_url ?? "") &&
    left.reference_images.length === right.reference_images.length &&
    left.reference_images.every((item, index) => path.resolve(item) === path.resolve(right.reference_images[index] ?? ""));
}

function persistedPageState(state: PageState, baselineTurnIds: string[]): PageState {
  const baseline = new Set(baselineTurnIds);
  // Before a submission baseline exists, every turn belongs to conversation
  // history. Once it exists, only retain turns introduced by this task.
  const taskTurns = baseline.size === 0
    ? []
    : state.turns.filter((turn) => !baseline.has(turn.id)).slice(-8);
  return {
    url: state.url,
    title: state.title,
    threadId: state.threadId,
    loginRequired: state.loginRequired,
    humanChallenge: state.humanChallenge,
    generating: state.generating,
    alerts: state.alerts.slice(-10),
    turns: taskTurns.map((turn) => ({
      ...turn,
      images: turn.images.map((image) => ({
        ...image,
        src: persistentResourceUrl(image.src),
      })),
    })),
  };
}

function sanitizePersistedRecord(record: TaskRecord): void {
  if (record.latestPageState) {
    record.latestPageState = persistedPageState(record.latestPageState, record.baselineTurnIds);
  }
  record.downloadedImages = record.downloadedImages.map((image) => ({
    ...image,
    source_url: image.source_url ? persistentResourceUrl(image.source_url) : undefined,
  }));
  if (record.result) {
    // Remove toolbar-only text captured by older page-state collectors.
    if (/^(?:编辑|Edit)$/i.test(record.result.assistant_text.trim())) {
      record.result.assistant_text = "";
    }
    record.result.images = record.result.images.map((image) => ({
      ...image,
      source_url: image.source_url ? persistentResourceUrl(image.source_url) : undefined,
    }));
    record.result.image_resources = record.result.image_resources?.map((image) => ({
      ...image,
      src: persistentResourceUrl(image.src),
    }));
  }
}

function persistentResourceUrl(source: string): string {
  if (/^data:/i.test(source)) {
    const mediaType = source.match(/^data:([^;,]+)/i)?.[1] ?? "application/octet-stream";
    return `data:${mediaType};base64,[redacted]`;
  }
  try {
    const url = new URL(source);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return source.replace(/[?#].*$/, "");
  }
}

function actionablePageAlert(alerts: string[]): string | undefined {
  const errorPattern = /(?:something went wrong|there (?:was|is) an error|error occurred|failed|failure|unable to|could(?:n't| not)|try again|blocked|violat(?:e|ion)|not allowed|出错|错误|失败|无法|不能|重试|被阻止|违规)/i;
  return alerts
    .map((alert) => alert.trim())
    .find((alert) => alert.length > 0 && errorPattern.test(alert));
}

function looksLikeContentBlock(text: string): boolean {
  return /(?:content|request|prompt).*(?:policy|blocked|not allowed|violation)|(?:policy|blocked|not allowed|violation).*(?:content|request|prompt)|内容.*(?:政策|阻止|违规)|(?:政策|阻止|违规).*内容/i.test(text);
}
