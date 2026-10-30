import fs from 'node:fs';
import path from 'path';
import crypto from 'node:crypto';
import { validateImageFile } from '../validator.ts';
import { LogEvent } from '../../types/index.ts';

/**
 * Explicit download workflow stages (PDF Steps A-G).
 * Separate from generation readiness: a prompt can be GENERATION_READY
 * without having been downloaded yet.
 */
export type DownloadStage =
  | 'IMAGE_READY'
  | 'SHARE_OPENING'
  | 'SHARE_OPEN'
  | 'DOWNLOAD_STARTED'
  | 'DOWNLOAD_COMPLETED'
  | 'FILE_VERIFIED'
  | 'SHARE_CLOSED'
  | 'PROMPT_COMPLETED'
  | 'FAILED';

export interface DownloadEngineOptions {
  /** Max number of download attempts (default: 3) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 2000) */
  retryDelayMs?: number;
  /** Timeout for waiting for share dialog to open in ms (default: 10000) */
  shareDialogTimeoutMs?: number;
  /** Timeout for download event in ms (default: 30000) */
  downloadTimeoutMs?: number;
  /** Timeout for share close in ms (default: 5000) */
  shareCloseTimeoutMs?: number;
  /** Directory to save diagnostic screenshots */
  diagnosticsDir?: string;
  /** Callback for stage transitions */
  onStageChange?: (stage: DownloadStage, message: string) => void;
  /** Callback for log events */
  onLog?: (event: LogEvent) => void;
}

export interface DownloadEngineResult {
  success: boolean;
  stage: DownloadStage;
  filePath?: string;
  fileSize?: number;
  sha256?: string;
  promptId: string;
  retryCount: number;
  error?: string;
  errorDetails?: string;
  downloadDurationMs?: number;
  artifactType?: 'genuine_image' | 'simulation_artifact';
}

/**
 * Minimal Playwright page interface subset used by the download engine.
 * Allows mocking in tests.
 */
export interface DownloadEnginePage {
  url(): string | Promise<string>;
  evaluate<R>(func: string | Function, arg?: any): Promise<R>;
  $(selector: string): Promise<any | null>;
  $$(selector: string): Promise<any[]>;
  waitForSelector(selector: string, options?: { state?: string; timeout?: number }): Promise<any | null>;
  waitForEvent(event: string, options?: { timeout?: number }): Promise<any>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer>;
}

const DEFAULT_OPTIONS: Required<DownloadEngineOptions> = {
  maxRetries: 3,
  retryDelayMs: 2000,
  shareDialogTimeoutMs: 10000,
  downloadTimeoutMs: 30000,
  shareCloseTimeoutMs: 5000,
  diagnosticsDir: '',
  onStageChange: () => {},
  onLog: () => {},
};

/**
 * Logs a diagnostic event through the optional callback and console.
 */
function logEvent(
  options: Required<DownloadEngineOptions>,
  type: LogEvent['type'],
  severity: LogEvent['severity'],
  message: string,
  promptId?: string,
  durationMs?: number,
  outputPath?: string,
): void {
  const event: LogEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    runId: undefined,
    promptId,
    type,
    severity,
    message,
    durationMs,
    outputPath,
  };
  options.onLog(event);
  console.log(`[chatgptDownloadEngine] ${type}: ${message}`);
}

/**
 * Captures a diagnostic screenshot if a diagnostics directory is configured.
 */
async function captureScreenshot(
  page: DownloadEnginePage,
  options: Required<DownloadEngineOptions>,
  label: string,
): Promise<string | null> {
  if (!options.diagnosticsDir) return null;
  try {
    if (!fs.existsSync(options.diagnosticsDir)) {
      fs.mkdirSync(options.diagnosticsDir, { recursive: true });
    }
    const fileName = `download-diag-${label}-${Date.now()}.png`;
    const filePath = path.join(options.diagnosticsDir, fileName);
    const buf = await page.screenshot({ path: filePath, fullPage: true });
    return buf ? filePath : null;
  } catch {
    return null;
  }
}

/**
 * Sleeps for the given ms.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * chatgptDownloadEngine — coordinates the Share → Download → Verify → Close
 * sequence for ChatGPT-generated images.
 *
 * Designed as a standalone module injected into the existing ChatGPT adapter.
 * Uses native Playwright download handling (Priority 1) with DOM-based UI
 * interaction (Priority 2). No visual recognition dependencies.
 */
export class ChatGPTDownloadEngine {
  private page: DownloadEnginePage;
  private options: Required<DownloadEngineOptions>;

  constructor(page: DownloadEnginePage, options: DownloadEngineOptions = {}) {
    this.page = page;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Main entry point: download the generated image for the given prompt.
   *
   * Workflow:
   *   IMAGE_READY → SHARE_OPENING → SHARE_OPEN → DOWNLOAD_STARTED →
   *   DOWNLOAD_COMPLETED → FILE_VERIFIED → SHARE_CLOSED → PROMPT_COMPLETED
   *
   * On any failure, retries up to maxRetries times before returning FAILED.
   */
  async downloadGeneratedImage(
    promptId: string,
    outputImagesDir: string,
  ): Promise<DownloadEngineResult> {
    const startTime = Date.now();
    let retryCount = 0;
    let lastResult: DownloadEngineResult | null = null;

    // Ensure output directory exists
    if (!fs.existsSync(outputImagesDir)) {
      fs.mkdirSync(outputImagesDir, { recursive: true });
    }

    while (retryCount <= this.options.maxRetries) {
      if (retryCount > 0) {
        logEvent(
          this.options,
          'DOWNLOAD_RETRY',
          'warn',
          `Retry attempt ${retryCount}/${this.options.maxRetries} for ${promptId}`,
          promptId,
        );
        await sleep(this.options.retryDelayMs);
      }

      const result = await this.downloadAttempt(promptId, outputImagesDir, retryCount);
      lastResult = result;
      if (result.success) {
        result.downloadDurationMs = Date.now() - startTime;
        logEvent(
          this.options,
          'DOWNLOAD_SUCCESS',
          'success',
          `Download completed for ${promptId} at ${result.filePath}`,
          promptId,
          result.downloadDurationMs,
          result.filePath,
        );
        return result;
      }

      retryCount++;
      logEvent(
        this.options,
        'DOWNLOAD_ATTEMPT_FAILED',
        'error',
        `Attempt ${retryCount} failed for ${promptId}: ${result.error}`,
        promptId,
      );
    }

    // All retries exhausted — return the last attempt's result so the
    // caller sees the specific failure stage, not a generic FAILED.
    if (lastResult) {
      return { ...lastResult, retryCount: this.options.maxRetries };
    }

    return {
      success: false,
      stage: 'FAILED' as DownloadStage,
      promptId,
      retryCount: this.options.maxRetries,
      error: 'Download failed after maximum retries',
      errorDetails: 'No download attempts were made',
      downloadDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Single download attempt. Returns success or a stage-specific error.
   */
  private async downloadAttempt(
    promptId: string,
    outputImagesDir: string,
    attempt: number,
  ): Promise<DownloadEngineResult> {
    // --- Stage: IMAGE_READY ---
    this.options.onStageChange('IMAGE_READY', `Waiting for generated image for ${promptId}`);
    logEvent(this.options, 'STAGE', 'info', `Stage: IMAGE_READY for ${promptId}`, promptId);

    const imageCount = await this.countGeneratedImages();
    if (imageCount === 0) {
      await captureScreenshot(this.page, this.options, `no-image-${promptId}`);
      return {
        success: false,
        stage: 'IMAGE_READY',
        promptId,
        retryCount: attempt,
        error: `No generated image found in conversation for ${promptId}`,
        errorDetails:
          'ChatGPT may not have produced an image. [data-testid="generated-image-preview"] returned 0 matches.',
      };
    }

    // --- Stage: SHARE_OPENING ---
    this.options.onStageChange('SHARE_OPENING', `Locating Share control for ${promptId}`);
    logEvent(this.options, 'STAGE', 'info', `Stage: SHARE_OPENING for ${promptId}`, promptId);

    const shareClicked = await this.clickShareButton();
    if (!shareClicked) {
      await captureScreenshot(this.page, this.options, `share-not-found-${promptId}`);
      return {
        success: false,
        stage: 'SHARE_OPENING',
        promptId,
        retryCount: attempt,
        error: `Failed to click Share icon for ${promptId}`,
        errorDetails:
          'No button with aria-label starting "Share generated image" found. Check both image-level and action-row Share controls.',
      };
    }

    // --- Stage: SHARE_OPEN ---
    this.options.onStageChange('SHARE_OPEN', `Waiting for Share dialog for ${promptId}`);
    logEvent(this.options, 'STAGE', 'info', `Stage: SHARE_OPEN for ${promptId}`, promptId);

    const shareDialogVisible = await this.waitForShareDialog();
    if (!shareDialogVisible) {
      await captureScreenshot(this.page, this.options, `share-dialog-not-open-${promptId}`);
      return {
        success: false,
        stage: 'SHARE_OPEN',
        promptId,
        retryCount: attempt,
        error: `Share dialog did not appear for ${promptId}`,
        errorDetails:
          'Share icon was clicked but no dialog with download/share text appeared within timeout.',
      };
    }

    // --- Stage: DOWNLOAD_STARTED ---
    this.options.onStageChange('DOWNLOAD_STARTED', `Clicking Download for ${promptId}`);
    logEvent(this.options, 'STAGE', 'info', `Stage: DOWNLOAD_STARTED for ${promptId}`, promptId);

    const downloadButton = await this.page.$('[role="dialog"] button[aria-label="Download"]');
    if (!downloadButton) {
      await captureScreenshot(this.page, this.options, `download-not-found-${promptId}`);
      return {
        success: false,
        stage: 'DOWNLOAD_STARTED',
        promptId,
        retryCount: attempt,
        error: `Download control not found within Share dialog for ${promptId}`,
        errorDetails:
          'Confirmed Share card is open but [role="dialog"] button[aria-label="Download"] was not found.',
      };
    }

    // Establish download listener BEFORE clicking (Priority 1: native Playwright download)
    const downloadPromise = this.page.waitForEvent('download', {
      timeout: this.options.downloadTimeoutMs,
    });

    try {
      await downloadButton.click();
    } catch (clickErr: any) {
      return {
        success: false,
        stage: 'DOWNLOAD_STARTED',
        promptId,
        retryCount: attempt,
        error: `Failed to click Download button: ${clickErr?.message || String(clickErr)}`,
      };
    }

    let downloadPayload: any = null;
    try {
      downloadPayload = await downloadPromise;
    } catch {
      await captureScreenshot(this.page, this.options, `download-timeout-${promptId}`);
      return {
        success: false,
        stage: 'DOWNLOAD_STARTED',
        promptId,
        retryCount: attempt,
        error: `Browser download event did not fire for ${promptId} within timeout. Download may not have started.`,
      };
    }

    if (!downloadPayload) {
      return {
        success: false,
        stage: 'DOWNLOAD_STARTED',
        promptId,
        retryCount: attempt,
        error: `No download payload received for ${promptId}`,
      };
    }

    // --- Stage: DOWNLOAD_COMPLETED ---
    this.options.onStageChange('DOWNLOAD_COMPLETED', `Download finished for ${promptId}`);
    logEvent(this.options, 'STAGE', 'info', `Stage: DOWNLOAD_COMPLETED for ${promptId}`, promptId);

    // Save to temporary path immediately (before Playwright cleans up temp file)
    const tempPath = path.join(outputImagesDir, `.download_${promptId}_${Date.now()}.part`);
    try {
      await downloadPayload.saveAs(tempPath);
    } catch (saveErr: any) {
      return {
        success: false,
        stage: 'DOWNLOAD_COMPLETED',
        promptId,
        retryCount: attempt,
        error: `Failed to save downloaded file: ${saveErr?.message || String(saveErr)}`,
      };
    }

    const suggestedFilename = (downloadPayload.suggestedFilename?.() || 'image.png') as string;
    const ext = path.extname(suggestedFilename) || '.png';
    const targetPath = path.join(outputImagesDir, `${promptId}${ext}`);

    // Verify file presence and non-emptiness
    if (!fs.existsSync(tempPath)) {
      return {
        success: false,
        stage: 'DOWNLOAD_COMPLETED',
        promptId,
        retryCount: attempt,
        error: 'Temporary download file was not detected on filesystem.',
      };
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(tempPath);
    } catch {
      return {
        success: false,
        stage: 'DOWNLOAD_COMPLETED',
        promptId,
        retryCount: attempt,
        error: 'Could not stat downloaded temporary file.',
      };
    }

    if (stats.size === 0) {
      try { fs.unlinkSync(tempPath); } catch {}
      return {
        success: false,
        stage: 'DOWNLOAD_COMPLETED',
        promptId,
        retryCount: attempt,
        error: 'Downloaded file is empty.',
      };
    }

    // --- Stage: FILE_VERIFIED ---
    this.options.onStageChange('FILE_VERIFIED', `Verifying file signature for ${promptId}`);
    logEvent(this.options, 'STAGE', 'info', `Stage: FILE_VERIFIED for ${promptId}`, promptId);

    const validation = validateImageFile(tempPath);
    if (!validation.valid) {
      try { fs.unlinkSync(tempPath); } catch {}
      await captureScreenshot(this.page, this.options, `invalid-file-${promptId}`);
      return {
        success: false,
        stage: 'FILE_VERIFIED',
        promptId,
        retryCount: attempt,
        error: `Downloaded file signature verification failed: ${validation.error}`,
        errorDetails: `File at ${tempPath} is not a valid image format.`,
      };
    }

    // Calculate SHA-256 hash of verified output
    const fileBytes = fs.readFileSync(tempPath);
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

    // Atomic rename from temporary file to final target filename
    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch {}
    }
    fs.renameSync(tempPath, targetPath);

    const finalStats = fs.statSync(targetPath);

    // --- Stage: SHARE_CLOSED ---
    this.options.onStageChange('SHARE_CLOSED', `Closing Share dialog for ${promptId}`);
    logEvent(this.options, 'STAGE', 'info', `Stage: SHARE_CLOSED for ${promptId}`, promptId);

    // Close dialog: best-effort; download result is preserved even if close fails
    await this.closeShareDialog(promptId);

    // --- Stage: PROMPT_COMPLETED ---
    this.options.onStageChange('PROMPT_COMPLETED', `Download complete for ${promptId}`);
    logEvent(this.options, 'STAGE', 'success', `Stage: PROMPT_COMPLETED for ${promptId}`, promptId);

    return {
      success: true,
      stage: 'PROMPT_COMPLETED',
      filePath: targetPath,
      fileSize: finalStats.size,
      sha256,
      promptId,
      retryCount: attempt,
      artifactType: 'genuine_image',
      downloadDurationMs: Date.now() - Date.now(), // will be overwritten by caller
    };
  }

  /**
   * Count generated image previews on the page.
   */
  private async countGeneratedImages(): Promise<number> {
    try {
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page.waitForTimeout(500);
      return await this.page.evaluate(() => {
        try {
          return document.querySelectorAll('[data-testid="generated-image-preview"]').length;
        } catch {
          return 0;
        }
      });
    } catch {
      return 0;
    }
  }

  /**
   * Click the image-level Share button for the newest generated image.
   */
  private async clickShareButton(): Promise<boolean> {
    try {
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page.waitForTimeout(500);

      return await this.page.evaluate(() => {
        try {
          const shareBtns = document.querySelectorAll('button[aria-label^="Share generated image"]');
          if (shareBtns.length === 0) return false;
          // Click the last (newest) one
          const btn = shareBtns[shareBtns.length - 1] as HTMLElement;
          btn.click();
          return true;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }

  /**
   * Wait for the Share dialog to become visible.
   */
  private async waitForShareDialog(): Promise<boolean> {
    const endTime = Date.now() + this.options.shareDialogTimeoutMs;
    while (Date.now() < endTime) {
      await this.page.waitForTimeout(250);
      try {
        const visible = await this.page.evaluate(() => {
          try {
            const dialogs = document.querySelectorAll(
              '[role="dialog"], [data-testid*="share"], [class*="share-dialog"], [class*="ShareDialog"]',
            );
            for (const d of dialogs) {
              const text = (d.textContent || '').toLowerCase();
              if (text.includes('download') || text.includes('share')) {
                return true;
              }
            }
            return false;
          } catch {
            return false;
          }
        });
        if (visible) return true;
      } catch {
        // keep polling
      }
    }
    return false;
  }

  /**
   * Close the Share dialog using its X / "Close dialog" button.
   * Best-effort: download result is preserved even if closing fails.
   */
  private async closeShareDialog(promptId: string): Promise<void> {
    const endTime = Date.now() + this.options.shareCloseTimeoutMs;
    while (Date.now() < endTime) {
      try {
        const closeBtn = await this.page.$('button:has-text("Close dialog")');
        if (closeBtn) {
          await closeBtn.click().catch(() => {});
          await this.page.waitForTimeout(100);

          const stillOpen = await this.page.evaluate(() => {
            try {
              const dialogs = document.querySelectorAll('[role="dialog"]');
              for (const d of dialogs) {
                const text = (d.textContent || '').toLowerCase();
                if (text.includes('download') || text.includes('share a public link')) {
                  return true;
                }
              }
              return false;
            } catch {
              return false;
            }
          });
          if (!stillOpen) return;
        } else {
          return; // No close button found; assume dialog already closed
        }
      } catch {
        // continue trying
      }
      await this.page.waitForTimeout(100);
    }
  }
}
