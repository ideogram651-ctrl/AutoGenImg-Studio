import {
  IProviderAdapter,
  AdapterGenerationResult,
  AdapterDownloadResult,
  SessionInitOptions,
} from './baseAdapter.ts';
import { PromptItem, ReferenceFile } from '../../types/index.ts';
import { ChromeSessionManager, defaultChromeSessionManager } from '../browser/chromeSessionManager.ts';
import { validateImageFile } from '../validator.ts';
import path from 'path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export class GeminiAdapter implements IProviderAdapter {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini (Imagen / Workspace)';
  public readonly isDemo = false;

  private sessionManager: ChromeSessionManager;
  private context: any = null;
  private page: any = null;
  private conversationUrl = '';

  private baselineDownloadCount = 0;
  private isGenerating = false;

  constructor(sessionManager?: ChromeSessionManager) {
    this.sessionManager = sessionManager || defaultChromeSessionManager;
  }

  public validateConversationUrl(url: string): { valid: boolean; reason?: string } {
    if (!url || typeof url !== 'string') {
      return { valid: false, reason: 'URL cannot be empty.' };
    }
    if (!url.startsWith('https://gemini.google.com')) {
      return {
        valid: false,
        reason: 'Target URL must start with https://gemini.google.com',
      };
    }
    return { valid: true };
  }

  public async isAvailable(): Promise<{ available: boolean; reason?: string; details?: any }> {
    try {
      const { chromium } = await import('playwright');
      if (!chromium) {
        return {
          available: false,
          reason: 'Playwright library is not importable in this environment.',
        };
      }
    } catch (err: any) {
      return {
        available: false,
        reason: `Playwright library error: ${err.message}`,
      };
    }

    const detection = this.sessionManager.detectChrome();
    if (!detection.found) {
      return {
        available: false,
        reason:
          detection.error ||
          'Installed Google Chrome was not found. Please install Chrome or configure CHROME_PATH in Settings.',
        details: detection,
      };
    }

    return {
      available: true,
      details: {
        chromePath: detection.executablePath,
        source: detection.source,
      },
    };
  }

  public async initializeSession(options: SessionInitOptions): Promise<void> {
    this.conversationUrl = options.conversationUrl;

    const session = await this.sessionManager.launchAndConnect({
      ...options,
      provider: 'gemini',
    });

    this.context = session.context;
    this.page = session.page;

    const readiness = await this.sessionManager.checkProviderReadiness('gemini', this.conversationUrl);
    if (!readiness.ready) {
      if (readiness.state === 'LOGIN_REQUIRED' || readiness.state === 'SECURITY_CHALLENGE') {
        throw new Error(`Authentication required: ${readiness.reason}`);
      } else if (readiness.state === 'PROVIDER_LIMIT') {
        throw new Error(`Provider limit: ${readiness.reason}`);
      } else {
        throw new Error(`Provider not ready (${readiness.state}): ${readiness.reason}`);
      }
    }
  }

  public async submitPrompt(
    item: PromptItem,
    references: ReferenceFile[],
    onProgress?: (stage: string, msg: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.page || this.page.isClosed()) {
      return { success: false, error: 'Browser session is not initialized or was closed.' };
    }

    try {
      // 1. Confirm no prior generation is actively running
      const stopButton = await this.page.$('button[aria-label*="Stop response"], button.stop-button');
      if (stopButton && (await stopButton.isVisible().catch(() => false))) {
        return {
          success: false,
          error: 'A previous generation is still actively running in Google Gemini. Cannot submit new prompt.',
        };
      }

      onProgress?.('PREPARING', `Capturing Gemini baseline state on ${this.conversationUrl}...`);

      // 2. Capture baseline download button count
      const existingButtons = await this.page.$$(
        'button[aria-label*="Download full size"], a[download], button[aria-label*="Download"]'
      );
      this.baselineDownloadCount = existingButtons.length;

      // 3. Locate message input
      const inputSelector =
        'rich-textarea div[contenteditable="true"], textarea[aria-label*="prompt"], div.ql-editor';
      await this.page.waitForSelector(inputSelector, { state: 'visible', timeout: 15000 });

      // Check if disabled
      const isDisabled = await this.page
        .$eval(inputSelector, (el: any) => Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'))
        .catch(() => false);
      if (isDisabled) {
        return {
          success: false,
          error: 'Gemini message input is currently disabled. A previous request may still be resolving.',
        };
      }

      // 4. Handle references attachment (media files and text context)
      const mediaRefs: ReferenceFile[] = [];
      const textRefDescriptions: string[] = [];

      for (const ref of references || []) {
        if (ref.refType === 'media' || (ref.path && fs.existsSync(ref.path))) {
          mediaRefs.push(ref);
        } else if (ref.label || ref.textContent) {
          textRefDescriptions.push(`[Reference ${ref.id} - ${ref.category.toUpperCase()}: ${ref.label}${ref.textContent ? ` - ${ref.textContent}` : ''}]`);
        }
      }

      if (mediaRefs.length > 0) {
        onProgress?.('PREPARING', `Validating and attaching ${mediaRefs.length} media reference file(s)...`);

        const validPaths: string[] = [];
        for (const ref of mediaRefs) {
          if (!ref.path || !fs.existsSync(ref.path)) {
            return {
              success: false,
              error: `Required reference file "${ref.name}" (ID: ${ref.id}) does not exist on disk: ${ref.path || 'undefined'}`,
            };
          }
          validPaths.push(ref.path);
        }

        const fileInput = await this.page.$('input[type="file"]');
        if (!fileInput) {
          return {
            success: false,
            error: 'Reference attachment file input not found in Gemini interface.',
          };
        }

        await fileInput.setInputFiles(validPaths);

        // Bounded poll for upload registration: wait for attachment chips / image preview
        // to appear in the composer. Do NOT infer success from a fixed timeout alone.
        let attachmentRegistered = false;
        for (let i = 0; i < 12; i++) {
          await this.page.waitForTimeout(500);
          try {
            attachmentRegistered = await this.page.evaluate(() => {
              const chips = document.querySelectorAll(
                '[data-testid*="attachment"], [data-testid*="file"], [class*="attachment"], [class*="thumbnail"], button[aria-label*="Remove"]'
              );
              return chips.length > 0;
            });
          } catch {
            attachmentRegistered = false;
          }
          if (attachmentRegistered) break;
        }

        if (!attachmentRegistered) {
          return {
            success: false,
            error: 'Reference attachment did not register in Gemini composer. Image may not have uploaded. Verify the file input and reference file, then retry.',
          };
        }
      }

      // 5. Fill and submit prompt text (including text references)
      let effectivePrompt = item.prompt;
      if (textRefDescriptions.length > 0) {
        effectivePrompt = `${textRefDescriptions.join('\n')}\n\n${effectivePrompt}`;
      }

      onProgress?.('SUBMITTING', `Entering prompt ${item.id}...`);
      await this.page.click(inputSelector);

      try {
        await this.page.fill(inputSelector, effectivePrompt);
      } catch {
        await this.page.evaluate(
          ({ sel, text }: { sel: string; text: string }) => {
            const el: any = document.querySelector(sel);
            if (el) {
              if ('value' in el) el.value = text;
              else el.innerText = text;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          },
          { sel: inputSelector, text: effectivePrompt }
        );
      }
      await this.page.waitForTimeout(300);

      // 6. Click visible send button or press Enter
      const sendButtonSelector =
        'button[aria-label*="Send message"], button.send-button, mat-icon[data-mat-icon-name="send"]';
      const sendButton = await this.page.$(sendButtonSelector);
      if (sendButton && (await sendButton.isEnabled().catch(() => false))) {
        await sendButton.click();
      } else {
        await this.page.keyboard.press('Enter');
      }

      await this.page.waitForTimeout(800);

      const currentUrl = this.page.url ? this.page.url() : '';
      if (currentUrl.includes('accounts.google.com')) {
        return {
          success: false,
          error: 'Authentication required: Gemini redirected to Google login.',
        };
      }

      this.isGenerating = true;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Failed to submit to Gemini: ${err.message}` };
    }
  }

  public async waitForGeneration(
    timeoutMs: number,
    onProgress?: (elapsedMs: number) => void,
    isAbortRequested?: () => boolean
  ): Promise<AdapterGenerationResult> {
    if (!this.page || this.page.isClosed()) {
      return { ready: false, outcome: 'ERROR', reason: 'No active browser page.' };
    }

    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      if (isAbortRequested && isAbortRequested()) {
        const stopBtn = await this.page.$('button[aria-label*="Stop response"], button.stop-button');
        const stillGenerating = stopBtn ? await stopBtn.isVisible().catch(() => false) : false;
        return {
          ready: false,
          outcome: 'AMBIGUOUS',
          reason: 'Generation paused or stopped by user request.',
          stillGenerating,
        };
      }

      const elapsed = Date.now() - startTime;
      onProgress?.(elapsed);

      // Safe page text check
      let pageText = '';
      try {
        pageText = await this.page.evaluate(() => {
          try {
            return document.body ? document.body.innerText || '' : '';
          } catch {
            return '';
          }
        });
      } catch {}

      if (pageText.includes('quota exceeded') || pageText.includes('too many requests')) {
        this.isGenerating = false;
        return {
          ready: false,
          outcome: 'LIMIT',
          reason: 'Gemini rate/quota limit reached.',
          stillGenerating: false,
        };
      }

      if (pageText.includes('Sign in to continue') || pageText.includes('Choose an account')) {
        this.isGenerating = false;
        return {
          ready: false,
          outcome: 'AUTH',
          reason: 'Google Account authentication session expired or prompt required.',
          stillGenerating: false,
        };
      }

      // Check if Gemini is actively streaming
      const stopBtn = await this.page.$('button[aria-label*="Stop response"], button.stop-button');
      const isStillStreaming = stopBtn ? await stopBtn.isVisible().catch(() => false) : false;

      // Check for completed image generation with Download action SCOPED beyond baseline count
      const currentDownloadButtons = await this.page.$$(
        'button[aria-label*="Download full size"], a[download], button[aria-label*="Download"]'
      );

      if (currentDownloadButtons.length > this.baselineDownloadCount) {
        if (!isStillStreaming) {
          this.isGenerating = false;
          return { ready: true, outcome: 'SUCCESS', stillGenerating: false };
        }
      }

      await this.page.waitForTimeout(pollInterval);
    }

    const stopBtn = await this.page.$('button[aria-label*="Stop response"], button.stop-button');
    const stillGenerating = stopBtn ? await stopBtn.isVisible().catch(() => false) : false;

    return {
      ready: false,
      outcome: 'AMBIGUOUS',
      reason: stillGenerating
        ? `Generation exceeded timeout of ${Math.round(timeoutMs / 1000)}s while Gemini is still actively generating.`
        : `Generation timed out after ${Math.round(timeoutMs / 1000)}s without detectable completion.`,
      stillGenerating,
    };
  }

  public async downloadResult(
    promptId: string,
    outputImagesDir: string
  ): Promise<AdapterDownloadResult> {
    if (!this.page || this.page.isClosed()) {
      return { success: false, error: 'No active browser page.' };
    }

    try {
      if (!fs.existsSync(outputImagesDir)) {
        fs.mkdirSync(outputImagesDir, { recursive: true });
      }

      const downloadButtons = await this.page.$$(
        'button[aria-label*="Download full size"], a[download], button[aria-label*="Download"]'
      );

      if (downloadButtons.length <= this.baselineDownloadCount) {
        return {
          success: false,
          error: `No new download button detected for current prompt (current: ${downloadButtons.length}, baseline: ${this.baselineDownloadCount}).`,
        };
      }

      const targetDownloadButton = downloadButtons[downloadButtons.length - 1];
      const tempPath = path.join(outputImagesDir, `.download_${promptId}_${Date.now()}.part`);

      const [download] = await Promise.all([
        this.page.waitForEvent('download', { timeout: 20000 }),
        targetDownloadButton.click(),
      ]);

      const suggestedFilename = download.suggestedFilename() || 'image.png';
      const ext = path.extname(suggestedFilename) || '.png';
      const targetPath = path.join(outputImagesDir, `${promptId}${ext}`);

      await download.saveAs(tempPath);

      if (!fs.existsSync(tempPath)) {
        return { success: false, error: 'Temporary download file was not detected on filesystem.' };
      }

      // Format & signature verification
      const validation = validateImageFile(tempPath);
      if (!validation.valid) {
        try { fs.unlinkSync(tempPath); } catch {}
        return { success: false, error: `Downloaded file signature verification failed: ${validation.error}` };
      }

      // Calculate SHA-256 hash
      const fileBytes = fs.readFileSync(tempPath);
      const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

      // Atomic rename
      if (fs.existsSync(targetPath)) {
        try { fs.unlinkSync(targetPath); } catch {}
      }
      fs.renameSync(tempPath, targetPath);

      const stats = fs.statSync(targetPath);
      return {
        success: true,
        filePath: targetPath,
        fileSize: stats.size,
        sha256,
        artifactType: 'genuine_image',
      };
    } catch (err: any) {
      return { success: false, error: `Gemini download failed: ${err.message}` };
    }
  }

  public async closeSession(): Promise<void> {
    try {
      await this.sessionManager.disconnect();
    } catch {}
    this.page = null;
    this.context = null;
    this.isGenerating = false;
  }
}
