import {
  IProviderAdapter,
  AdapterGenerationResult,
  AdapterDownloadResult,
  SessionInitOptions,
} from './baseAdapter.ts';
import { PromptItem, ReferenceFile } from '../../types/index.ts';
import { ChromeSessionManager, defaultChromeSessionManager } from '../browser/chromeSessionManager.ts';
import { ChatGPTDownloadEngine } from './chatgptDownloadEngine.ts';
import fs from 'node:fs';
import path from 'path';
import crypto from 'node:crypto';
import { validateImageFile, validateReferenceFile } from '../validator.ts';

export class ChatGPTAdapter implements IProviderAdapter {
  public readonly id = 'chatgpt';
  public readonly name = 'ChatGPT (DALL-E 3 / Image Gen)';
  public readonly isDemo = false;

  private sessionManager: ChromeSessionManager;
  private context: any = null;
  private page: any = null;
  private conversationUrl = '';

  private baselineDownloadCount = 0;
  private baselineTurnsCount = 0;
  private baselineImageCount = 0;
  private baselineAssistantTurnIds = new Set<string>();
  private seenImageSrcs = new Set<string>();
  private preSubmissionImageSrcs: string[] = [];
  private submissionTurnKey: string | null = null; // The user's turn key for this submission
  private respondingTurnKey: string | null = null; // The assistant turn that responds to our submission
  private isGenerating = false;
  private lastReadySignature = '';
  private stableSince = 0;
  private currentPromptId = '';
  private currentPromptSequence = 0;
  private submissionTimestamp = 0;
  private initialObservationDelayMs = 18000; // 18s default observation delay
  private downloadEngine: ChatGPTDownloadEngine | null = null;
  private loggedPreExistingSrcs = new Set<string>(); // Track which pre-existing images have been logged
  private lastLoggedImageCount: number | null = null; // Track last logged image count to avoid repetitive polling logs

  // Comparison UI recovery wait stages (max recovery stages, not unconditional delays)
  private static readonly COMPARISON_RECOVERY_WAITS = [5000, 10000, 15000, 20000];
  // Track accepted image hashes per prompt to prevent duplicate downloads
  private acceptedResultHashes = new Map<string, string>(); // promptId -> sha256
  private lastAcceptedHash: string | null = null; // Last accepted image hash for duplicate detection
  constructor(sessionManager?: ChromeSessionManager) {
    this.sessionManager = sessionManager || defaultChromeSessionManager;
  }

  private ensurePage(): any {
    if (!this.page || this.page.isClosed()) {
      const smPage = this.sessionManager.getPage();
      if (smPage && !smPage.isClosed()) {
        this.page = smPage;
        this.context = this.sessionManager.getContext();
      }
    }
  }

  /**
   * Detect ChatGPT's image comparison / preference-selection interface.
   * Uses multiple signals: UI text, DOM structure, image count, and positioning.
   * Returns true if the comparison UI is detected.
   */
  private async detectComparisonUI(): Promise<boolean> {
    if (!this.page || this.page.isClosed()) return false;

    try {
      const result = await this.page.evaluate(() => {
        try {
          const body = document.body;
          if (!body) return { detected: false, signals: [], imageCount: 0 };
          const bodyText = (body.innerText || '').toLowerCase();
          const signals: string[] = [];

          // Signal 1: Visible UI text containing comparison phrases
          const comparisonPhrases = [
            'which image do you like better',
            'which image do you prefer',
            'which do you prefer',
            'which one do you like',
            'choose your favorite',
            'pick your favorite',
          ];
          for (const phrase of comparisonPhrases) {
            if (bodyText.includes(phrase)) {
              signals.push(`text:${phrase}`);
            }
          }

          // Signal 2: "Image 1" and "Image 2" labels present together
          const hasImage1Label =
            bodyText.includes('image 1') || bodyText.includes('image1');
          const hasImage2Label =
            bodyText.includes('image 2') || bodyText.includes('image2');
          if (hasImage1Label && hasImage2Label) {
            signals.push('labels:Image1+Image2');
          }

          // Signal 3: DOM structure - comparison container elements
          const comparisonContainers = document.querySelectorAll(
            '[data-testid*="comparison"], [class*="comparison"], [class*="preference"], [aria-label*="compare"], [aria-label*="preference"]'
          );
          if (comparisonContainers.length > 0) {
            signals.push(`dom:comparisonContainer(${comparisonContainers.length})`);
          }

          // Signal 4: Preference-selection buttons near images
          const preferenceButtons = document.querySelectorAll(
            'button[aria-label*="like"], button[aria-label*="prefer"], button[aria-label*="select"], button[data-testid*="preference"], button[data-testid*="select-image"]'
          );
          const imagePreviews = document.querySelectorAll('[data-testid="generated-image-preview"]');
          if (preferenceButtons.length > 0 && imagePreviews.length >= 2) {
            signals.push(`dom:preferenceButtons(${preferenceButtons.length})`);
          }

          const detected = signals.length >= 2;
          return { detected, signals, imageCount: imagePreviews.length };
        } catch {
          return { detected: false, signals: [], imageCount: 0 };
        }
      });

      console.log(
        `[chatgptAdapter/detectComparison] promptId=${this.currentPromptId} detected=${result.detected} signals=${result.signals.join(', ')} imageCount=${result.imageCount}`
      );
      return result.detected;
    } catch (err: any) {
      console.log(`[chatgptAdapter/detectComparison] Error: ${err.message}`);
      return false;
    }
  }

  /**
   * Check if the current page still shows comparison UI (re-check after wait).
   */
  private async isComparisonUIStillPresent(): Promise<boolean> {
    return await this.detectComparisonUI();
  }

  /**
   * Check if a normal, downloadable image result has appeared (not comparison UI).
   * Returns the image src if a valid new result is found, empty string otherwise.
   */
  private async detectNormalImageResult(): Promise<string> {
    if (!this.page || this.page.isClosed()) return '';

    try {
      const result = await this.page.evaluate((preSubmissionSrcs: string[]) => {
        try {
          const imgs = document.querySelectorAll<HTMLImageElement>('[data-testid="generated-image-preview"] img');
          for (const img of imgs) {
            const isReady =
              img.complete &&
              img.naturalWidth > 0 &&
              img.naturalHeight > 0 &&
              Boolean(img.src) &&
              !img.src.includes('data:image');
            const isPreExisting = preSubmissionSrcs.includes(img.src);
            if (isReady && !isPreExisting) {
              return img.src;
            }
          }
          return '';
        } catch {
          return '';
        }
      }, this.preSubmissionImageSrcs);

      return result || '';
    } catch {
      return '';
    }
  }

  /**
   * Select Image 1 from the comparison interface.
   * Returns the image src of Image 1 if successfully identified, empty string otherwise.
   */
  private async selectImage1(): Promise<string> {
    if (!this.page || this.page.isClosed()) return '';

    try {
      const image1Src = await this.page.evaluate(() => {
        try {
          // Look for image 1 label or the first image in comparison layout
          const comparisonImages = document.querySelectorAll('[data-testid="generated-image-preview"]');
          if (comparisonImages.length >= 2) {
            const firstImg = comparisonImages[0].querySelector('img');
            if (firstImg && firstImg.src && !firstImg.src.includes('data:image')) {
              return firstImg.src;
            }
          }

          // Try looking for images with "Image 1" label nearby
          const allImages = document.querySelectorAll<HTMLImageElement>('img');
          for (const img of allImages) {
            const parent = img.parentElement;
            if (parent) {
              const text = (parent.textContent || '').toLowerCase();
              if (text.includes('image 1') && img.src && !img.src.includes('data:image')) {
                return img.src;
              }
            }
          }

          return '';
        } catch {
          return '';
        }
      });

      if (image1Src) {
        console.log(`[chatgptAdapter/selectImage1] Image 1 identified: src=${image1Src}`);
        return image1Src;
      }

      console.log('[chatgptAdapter/selectImage1] Could not identify Image 1 in comparison UI');
      return '';
    } catch (err: any) {
      console.log(`[chatgptAdapter/selectImage1] Error: ${err.message}`);
      return '';
    }
  }

  /**
   * Check if an image hash is a duplicate of a previously accepted result.
   */
  private isDuplicateResult(imageHash: string): boolean {
    if (!imageHash) return false;
    // Check against all previously accepted hashes
    for (const [promptId, hash] of this.acceptedResultHashes) {
      if (hash === imageHash) {
        console.log(
          `[chatgptAdapter/isDuplicate] Duplicate detected: hash=${imageHash.slice(0, 10)}... matches promptId=${promptId}`
        );
        return true;
      }
    }
    // Also check against last accepted hash
    if (this.lastAcceptedHash && this.lastAcceptedHash === imageHash) {
      console.log(
        `[chatgptAdapter/isDuplicate] Duplicate detected: hash=${imageHash.slice(0, 10)}... matches last accepted`
      );
      return true;
    }
    return false;
  }

  /**
   * Record an accepted result hash for a prompt.
   */
  /**
   * Clear accepted result hashes. Called when starting a new run to avoid
   * false positives from previous runs.
   */
  public clearAcceptedResults(): void {
    this.acceptedResultHashes.clear();
    this.lastAcceptedHash = null;
    console.log('[chatgptAdapter/clearAccepted] Accepted result hashes cleared for new run');
  }

  private recordAcceptedResult(promptId: string, imageHash: string): void {
    if (imageHash) {
      this.acceptedResultHashes.set(promptId, imageHash);
      this.lastAcceptedHash = imageHash;
      console.log(
        `[chatgptAdapter/recordAccepted] promptId=${promptId} hash=${imageHash.slice(0, 10)}... recorded`
      );
    }
  }

  public validateConversationUrl(url: string): { valid: boolean; reason?: string } {
    if (!url || typeof url !== 'string') {
      return { valid: false, reason: 'URL cannot be empty.' };
    }
    if (!url.startsWith('https://chatgpt.com') && !url.startsWith('https://chat.openai.com')) {
      return {
        valid: false,
        reason: 'Target URL must start with https://chatgpt.com or https://chat.openai.com',
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

    // Use shared ChromeSessionManager to connect to installed Chrome via CDP
    const session = await this.sessionManager.launchAndConnect({
      ...options,
      provider: 'chatgpt',
    });

    this.context = session.context;
    this.page = session.page;

    // Initialize download engine with the active Playwright page
    this.downloadEngine = new ChatGPTDownloadEngine(this.page, {
      maxRetries: 3,
      retryDelayMs: 2000,
      shareDialogTimeoutMs: 10000,
      downloadTimeoutMs: 30000,
      shareCloseTimeoutMs: 5000,
      diagnosticsDir: path.join(process.cwd(), 'project-data', 'download-diagnostics'),
      onStageChange: (stage, msg) => {
        this.logDownloadStage(stage, msg);
      },
      onLog: (event) => {
        // Forward download engine logs through adapter logging
        console.log(`[downloadEngine] ${event.type}: ${event.message}`);
      },
    });

    // Verify readiness and classify page state
    const readiness = await this.sessionManager.checkProviderReadiness('chatgpt', this.conversationUrl);
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
    this.ensurePage();
    if (!this.page || this.page.isClosed()) {
      return { success: false, error: 'Browser session is not initialized or was closed.' };
    }

    try {
      // 0. Close any lingering Share/download dialogs from a previous attempt so they
      // do not intercept pointer events on the composer input.
      try {
        const closeBtn = await this.page.$('button:has-text("Close dialog")');
        if (closeBtn) {
          await closeBtn.click().catch(() => {});
          await this.page.waitForTimeout(300);
        }
      } catch {}

      // 1. Confirm no prior generation is actively running
      const stopButtonSelector =
        'button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"], button[aria-label*="Stop"]';
      const stopButton = await this.page.$(stopButtonSelector);
      if (stopButton && (await stopButton.isVisible().catch(() => false))) {
        return {
          success: false,
          error: 'A previous generation is still actively running in ChatGPT. Cannot submit new prompt.',
        };
      }

      // 1b. Clear any lingering composer content from a previous attempt so that
      // stale attachments or prompt text are not carried into this submission.
      // This is critical for regeneration idempotency (Requirement G).
      try {
        // Clear file attachment chips by clicking Remove buttons until none remain.
        let removeAttempts = 0;
        while (removeAttempts < 10) {
          const removeBtn = await this.page.$('button[aria-label*="Remove"], button[aria-label*="remove"], [data-testid*="remove-attachment"], [data-testid*="delete-file"]');
          if (!removeBtn) break;
          await removeBtn.click().catch(() => {});
          await this.page.waitForTimeout(200);
          removeAttempts++;
        }
        // Clear the prompt textarea content.
        await this.page.evaluate(() => {
          const sel = '#prompt-textarea, textarea[placeholder*="Message"], div[contenteditable="true"]';
          const el: any = document.querySelector(sel);
          if (el) {
            if ('value' in el) el.value = '';
            else el.innerText = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        await this.page.waitForTimeout(300);
      } catch {
        // Best-effort cleanup; if composer is not accessible, attachment will fail on its own.
      }

      onProgress?.('PREPARING', `Capturing baseline state on ${this.conversationUrl}...`);

      // 2. Capture baseline generated-image previews and conversation turns to prevent matching stale earlier results.
      // ChatGPT does not expose direct Download buttons; generated images use
      // [data-testid="generated-image-preview"] and image-level Share icons.
      // Scroll to bottom to ensure all existing generated images are rendered
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page.waitForTimeout(500);

      this.baselineImageCount = await this.page.evaluate(() => {
        try {
          return document.querySelectorAll('[data-testid="generated-image-preview"]').length;
        } catch {
          return 0;
        }
      });

      const existingTurns = await this.page.$$(
        '[data-turn-key]'
      );
      this.baselineTurnsCount = existingTurns.length;

      // Capture baseline assistant turn IDs so we can attribute newly
      // rendered images to a new assistant turn rather than an old one.
      // Also capture ALL turn keys (user + assistant) so we can identify
      // the user's submission turn after we submit the prompt.
      const allTurnKeys = new Set<string>();
      this.baselineAssistantTurnIds = new Set<string>();
      for (const el of existingTurns) {
        try {
          const turnId = await el.getAttribute('data-turn-key').catch(() => null);
          if (turnId) allTurnKeys.add(turnId);
          const isAssistant =
            (await el.getAttribute('data-turn') === 'assistant') ||
            (await el.evaluate((node: any) => {
              const dt = node.getAttribute?.('data-turn') || node.dataset?.turn;
              return dt === 'assistant';
            }).catch(() => false));
          if (turnId && isAssistant) {
            this.baselineAssistantTurnIds.add(turnId);
          }
        } catch {
          // Best-effort: skip turns that cannot be inspected.
        }
      }
      this.submissionTurnKey = null;
      this.respondingTurnKey = null;

      console.log(
        `[chatgptAdapter/submit] promptId=${this.currentPromptId} seq=${this.currentPromptSequence} baselineImages=${this.baselineImageCount} baselineTurns=${this.baselineTurnsCount} preSubmissionSrcs=${this.preSubmissionImageSrcs.length} allTurnKeys=${allTurnKeys.size}`
      );

      // Capture pre-submission image srcs so we can distinguish images that
      // already existed before this prompt from images that appear during
      // this prompt's generation. This prevents cross-prompt image reuse.
      this.preSubmissionImageSrcs = await this.page.evaluate(() => {
        try {
          const imgs = document.querySelectorAll<HTMLImageElement>(
            '[data-testid="generated-image-preview"] img'
          );
          return Array.from(imgs)
            .map((img) => img.src)
            .filter(Boolean);
        } catch {
          return [];
        }
      }) as string[];

      // Reset seenImageSrcs for this prompt so images from previous prompts
      // are not incorrectly matched as new candidates for this prompt.
      this.seenImageSrcs = new Set(this.preSubmissionImageSrcs);
      this.loggedPreExistingSrcs.clear();

      // Record prompt context for correlation in diagnostics.
      this.currentPromptId = item.id;
      this.currentPromptSequence = item.sequence;
      this.submissionTimestamp = Date.now();

      console.log(
        `[chatgptAdapter/submit] promptId=${this.currentPromptId} seq=${this.currentPromptSequence} baselineImages=${this.baselineImageCount} baselineTurns=${this.baselineTurnsCount} preSubmissionSrcs=${this.preSubmissionImageSrcs.length}`
      );

      // 3. Locate message input selector
      const inputSelector = '#prompt-textarea, textarea[placeholder*="Message"], div[contenteditable="true"]';
      await this.page.waitForSelector(inputSelector, { state: 'visible', timeout: 15000 });

      // Check if disabled
      const isDisabled = await this.page
        .$eval(inputSelector, (el: any) => Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'))
        .catch(() => false);
      if (isDisabled) {
        return {
          success: false,
          error: 'ChatGPT message input is currently disabled. A previous request may still be resolving.',
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
        // 4a. Validate every media reference before attaching any of them.
        // Reject video formats explicitly; allow PNG, JPG, JPEG, WEBP, SVG, PDF, MD, TXT.
        for (const ref of mediaRefs) {
          if (!ref.path || !fs.existsSync(ref.path)) {
            return {
              success: false,
              error: `Required reference file "${ref.name}" (ID: ${ref.id}) does not exist on disk: ${ref.path || 'undefined'}`,
            };
          }

          // File signature + MIME validation using format-aware validator (P-006, P-008)
          const validation = validateReferenceFile(ref.path, ref.type || 'application/octet-stream');
          if (!validation.valid) {
            return {
              success: false,
              error: `Reference file "${ref.name}" (ID: ${ref.id}) failed validation: ${validation.error}`,
            };
          }

          // Compute SHA-256 checksum for integrity tracking (P-008)
          const fileBytes = fs.readFileSync(ref.path);
          const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
          ref.checksum = sha256;

          // Reject video formats explicitly
          const ext = path.extname(ref.name).toLowerCase();
          if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'].includes(ext)) {
            return {
              success: false,
              error: `Reference file "${ref.name}" (ID: ${ref.id}) is a video format, which is not supported.`,
            };
          }
        }

        // 4b. Attach media references sequentially, one file at a time.
        // ChatGPT's file input is single-file; passing an array throws
        // "Non-multiple file input can only accept single file" (P-001).
        onProgress?.('ATTACHING', `Attaching ${mediaRefs.length} media reference file(s) sequentially...`);

        const fileInput = await this.page.$('input[type="file"]');
        if (!fileInput) {
          return {
            success: false,
            error: 'Reference attachment file input not found in ChatGPT interface.',
          };
        }

        for (let i = 0; i < mediaRefs.length; i++) {
          const ref = mediaRefs[i];
          const fileSizeMb = (fs.statSync(ref.path!).size / (1024 * 1024));
          // Timeout: 5s base + 2s per MB, capped at 60s per file (P-003)
          const perFileTimeoutMs = Math.min(5000 + Math.ceil(fileSizeMb * 2) * 1000, 60000);

          onProgress?.('UPLOADING', `Uploading ${ref.name} (${i + 1}/${mediaRefs.length})...`);

          await fileInput.setInputFiles([ref.path!]);

          // Poll for attachment chip to appear for this specific file.
          let attachmentRegistered = false;
          const pollEnd = Date.now() + perFileTimeoutMs;
          while (Date.now() < pollEnd) {
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
              error: `Reference file "${ref.name}" did not register in ChatGPT composer within ${Math.round(perFileTimeoutMs / 1000)}s. Upload may not have completed.`,
            };
          }

          // Brief wait for ChatGPT to finish processing the attached file before next file.
          await this.page.waitForTimeout(500);
        }

        onProgress?.('VERIFYING_ATTACHMENTS', `All ${mediaRefs.length} media reference file(s) attached and verified.`);
      }

      // 5. Fill and submit prompt text (including any text references)
      let effectivePrompt = item.prompt;
      if (textRefDescriptions.length > 0) {
        effectivePrompt = `${textRefDescriptions.join('\n')}\n\n${effectivePrompt}`;
      }

      onProgress?.('SUBMITTING', `Entering prompt ${item.id}...`);
      await this.page.click(inputSelector);

      try {
        await this.page.fill(inputSelector, effectivePrompt);
      } catch {
        // Fallback for contenteditable div if direct fill is rejected
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

      // 6. Wait for Send button to be genuinely enabled, then click it.
      // The button may be disabled during file processing; we must not rely on
      // button color alone (P-004).
      const sendButtonSelector =
        'button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label*="Send"]';
      let sendButtonEnabled = false;
      const sendWaitEnd = Date.now() + 30000; // Up to 30s for Send to become enabled
      while (Date.now() < sendWaitEnd) {
        const btn = await this.page.$(sendButtonSelector);
        if (btn) {
          const isEnabled = await btn.isEnabled().catch(() => false);
          const ariaDisabled = await btn.getAttribute('aria-disabled').catch(() => null);
          if (isEnabled && ariaDisabled !== 'true') {
            sendButtonEnabled = true;
            break;
          }
        }
        await this.page.waitForTimeout(500);
      }

      if (!sendButtonEnabled) {
        return {
          success: false,
          error: 'Send button did not become enabled after waiting. All references may not have uploaded.',
        };
      }

      const btn = await this.page.$(sendButtonSelector);
      if (btn) {
        await btn.click().catch(() => {});
      } else {
        await this.page.keyboard.press('Enter');
      }

      // 7. Verify submission was registered & verify page did not redirect to auth
      await this.page.waitForTimeout(800);

      const currentUrl = this.page.url ? this.page.url() : '';
      if (
        currentUrl.includes('/auth/login') ||
        currentUrl.includes('accounts.google.com') ||
        currentUrl.includes('auth.openai.com')
      ) {
        return {
          success: false,
          error: 'Authentication required: session redirected to login screen.',
        };
      }

      // 8. Identify the user's submission turn so we can attribute the
      //    responding assistant turn (and its images) to this prompt.
      //    After submission, a new user turn appears in the DOM. We capture
      //    its turn-key so that during detection we can require images to be
      //    descendants of the assistant turn that follows it.
      try {
        await this.page.waitForTimeout(500);
        const postTurns = await this.page.$$('[data-turn-key]');
        const postTurnKeys = new Set<string>();
        for (const el of postTurns) {
          try {
            const tk = await el.getAttribute('data-turn-key').catch(() => null);
            if (tk) postTurnKeys.add(tk);
          } catch {}
        }
        // The submission turn is a new user turn that wasn't in the baseline.
        for (const el of postTurns) {
          try {
            const tk = await el.getAttribute('data-turn-key').catch(() => null);
            const turnRole = await el.getAttribute('data-turn').catch(() => null);
            const isUserTurn = turnRole === 'user' || turnRole === null;
            if (tk && !allTurnKeys.has(tk) && isUserTurn) {
              this.submissionTurnKey = tk;
              console.log(
                `[chatgptAdapter/submit] promptId=${this.currentPromptId} seq=${this.currentPromptSequence} submissionTurnKey=${tk}`
              );
              break;
            }
          } catch {}
        }
      } catch {}

      this.isGenerating = true;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Failed to submit prompt: ${err.message}` };
    }
  }

  public async waitForGeneration(
    timeoutMs: number,
    onProgress?: (elapsedMs: number) => void,
    isAbortRequested?: () => boolean
  ): Promise<AdapterGenerationResult> {
    this.ensurePage();
    if (!this.page || this.page.isClosed()) {
      return { ready: false, outcome: 'ERROR', reason: 'No active browser page.' };
    }

    const startTime = Date.now();
    const pollInterval = 1000;

    // Initial observation delay: wait for ChatGPT to begin processing the
    // new prompt before making any candidate-selection decisions. This
    // prevents immediately accepting a pre-existing image from the gallery
    // while the new generation is still being prepared.
    const obsEnd = startTime + this.initialObservationDelayMs;
    while (Date.now() < obsEnd) {
      if (isAbortRequested && isAbortRequested()) {
        const stopBtn = await this.page.$(
          'button[data-testid="stop-button"], button[aria-label*="Stop"]'
        );
        const stillGenerating = stopBtn ? await stopBtn.isVisible().catch(() => false) : false;
        return {
          ready: false,
          outcome: 'AMBIGUOUS',
          reason: 'Generation paused or stopped by user request during observation.',
          stillGenerating,
        };
      }
      const obsElapsed = Date.now() - startTime;
      onProgress?.(obsElapsed);
      await this.page.waitForTimeout(pollInterval);
    }

    console.log(
      `[chatgptAdapter/detect] promptId=${this.currentPromptId} seq=${this.currentPromptSequence} observationDelayMs=${Date.now() - startTime}ms baselineImages=${this.baselineImageCount} preSubmissionSrcs=${this.preSubmissionImageSrcs.length}`
    );

    while (Date.now() - startTime < timeoutMs) {
      // Check cancellation / pause signal
      if (isAbortRequested && isAbortRequested()) {
        const stopBtn = await this.page.$(
          'button[data-testid="stop-button"], button[aria-label*="Stop"]'
        );
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

      // Safe page text check without null dereferencing
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

      // Comparison UI detection: Check if ChatGPT is showing the image
      // comparison/preference-selection interface instead of a normal result.
      const comparisonDetected = await this.detectComparisonUI();
      if (comparisonDetected) {
        console.log(
          `[chatgptAdapter/detect] COMPARISON_UI_DETECTED promptId=${this.currentPromptId} seq=${this.currentPromptSequence} elapsed=${elapsed}ms`
        );

        // Enter recovery loop with controlled waits: 5s, 10s, 15s, 20s
        for (const waitMs of ChatGPTAdapter.COMPARISON_RECOVERY_WAITS) {
          console.log(
            `[chatgptAdapter/detect] COMPARISON_RECOVERY_WAIT promptId=${this.currentPromptId} waitMs=${waitMs} elapsed=${Date.now() - startTime}ms`
          );

          // Wait for the specified duration
          await this.page.waitForTimeout(waitMs);

          // Re-check if comparison UI is still present
          const stillComparison = await this.isComparisonUIStillPresent();
          if (stillComparison) {
            console.log(
              `[chatgptAdapter/detect] Comparison UI still present after ${waitMs}ms wait`
            );
            continue; // Try next wait
          }

          // Comparison UI gone - check if a normal image result appeared
          const normalResultSrc = await this.detectNormalImageResult();
          if (normalResultSrc) {
            console.log(
              `[chatgptAdapter/detect] COMPARISON_UI_RESOLVED promptId=${this.currentPromptId} src=${normalResultSrc}`
            );
            // Comparison resolved - proceed with normal detection
            // Break out of recovery loop and continue normal polling
            break;
          }
        }

        // After all recovery waits, check if comparison UI is still present
        const finalComparisonCheck = await this.detectComparisonUI();
        if (finalComparisonCheck) {
          console.log(
            `[chatgptAdapter/detect] COMPARISON_RECOVERY_EXHAUSTED promptId=${this.currentPromptId} seq=${this.currentPromptSequence}`
          );
          this.isGenerating = false;
          return {
            ready: false,
            outcome: 'AMBIGUOUS',
            reason: 'CHATGPT_IMAGE_COMPARISON_UNRESOLVED: Image comparison UI remained after all recovery waits.',
            stillGenerating: false,
          };
        }

        // Comparison resolved - try to select Image 1 if comparison images are still visible
        const image1Src = await this.selectImage1();
        if (image1Src) {
          console.log(
            `[chatgptAdapter/detect] COMPARISON_IMAGE_1_SELECTED promptId=${this.currentPromptId} src=${image1Src}`
          );
        }
      }

      // Limit check
      if (
        pageText.includes("You've reached your limit") ||
        pageText.includes('rate limit exceeded') ||
        pageText.includes('hourly limit')
      ) {
        this.isGenerating = false;
        return {
          ready: false,
          outcome: 'LIMIT',
          reason: 'ChatGPT usage limit detected in conversation.',
          stillGenerating: false,
        };
      }

      // Security / Auth challenge check
      if (
        pageText.includes('Verify you are human') ||
        pageText.includes('Cloudflare') ||
        pageText.includes('Log in to continue')
      ) {
        this.isGenerating = false;
        return {
          ready: false,
          outcome: 'AUTH',
          reason: 'Authentication or security challenge detected in browser.',
          stillGenerating: false,
        };
      }

      // Check if streaming/generating is actively in progress
      const stopBtn = await this.page.$(
        'button[data-testid="stop-button"], button[aria-label*="Stop"]'
      );
      const isStillStreaming = stopBtn ? await stopBtn.isVisible().catch(() => false) : false;

      // Robust detection: identify newly generated images regardless of count fluctuations.
      // ChatGPT may replace DOM nodes (keeping count same) or remove old images (count decreases),
      // so we cannot rely solely on currentImageCount > baselineImageCount.
      //
      // Strategy: evaluate every generated image for readiness, then classify it as a "new candidate"
      // if it belongs to a new assistant turn that is the response to our submission.
      // We do NOT scroll on every poll — scrolling fights with user inspection of the
      // conversation and can cause old images to lazy-load into the DOM.
      const detectionResult = await this.page.evaluate((baselineTurnIds: string[]) => {
        const imgs = document.querySelectorAll<HTMLImageElement>('[data-testid="generated-image-preview"] img');
        const results: Array<{ src: string; turnKey: string | null; ready: boolean }> = [];
        for (const img of imgs) {
          const ready: boolean =
            img.complete &&
            img.naturalWidth > 0 &&
            img.naturalHeight > 0 &&
            Boolean(img.src) &&
            !img.src.includes('data:image');
          // Find nearest ancestor turn element to attribute the image to an assistant turn.
          let turnKey: string | null = null;
          let ancestor: Element | null = img;
          while (ancestor && ancestor !== document.body) {
            const tk = ancestor.getAttribute?.('data-turn-key');
            if (tk) {
              turnKey = tk;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          results.push({ src: img.src, turnKey, ready });
        }
        return results;
      }, Array.from(this.baselineAssistantTurnIds));

      const currentImageCount = detectionResult.length;
      // Only log poll status when image count changes to avoid repetitive logging
      if (this.lastLoggedImageCount !== currentImageCount) {
        console.log(
          `[chatgptAdapter/detect] poll: baseline=${this.baselineImageCount}, current=${currentImageCount}, elapsed=${Date.now() - startTime}ms promptId=${this.currentPromptId} seq=${this.currentPromptSequence}`
        );
        this.lastLoggedImageCount = currentImageCount;
      }

      // Detect the responding assistant turn: the first assistant turn whose
      // turn-key is not in the baseline and that comes after our submission turn.
      if (this.submissionTurnKey && !this.respondingTurnKey) {
        try {
          // Find the assistant turn that follows our submission turn by checking
          // DOM order: the responding assistant turn should be adjacent after our user turn.
          const respondingTurn = await this.page.evaluate((submissionKey: string) => {
            const allTurns = Array.from(document.querySelectorAll('[data-turn-key]'));
            let foundSubmission = false;
            for (const turn of allTurns) {
              const tk = turn.getAttribute('data-turn-key');
              const role = turn.getAttribute('data-turn');
              if (tk === submissionKey) {
                foundSubmission = true;
                continue;
              }
              if (foundSubmission && role === 'assistant' && tk) {
                return tk;
              }
            }
            return null;
          }, this.submissionTurnKey);
          if (respondingTurn) {
            this.respondingTurnKey = respondingTurn;
            console.log(
              `[chatgptAdapter/detect] promptId=${this.currentPromptId} seq=${this.currentPromptSequence} respondingTurnKey=${respondingTurn}`
            );
          }
        } catch {}
      }

      // Classify images as new candidates: must be in a new assistant turn AND
      // NOT be a pre-existing image from before this prompt's submission.
      // Preference: images in the responding turn (the assistant turn that
      // follows our submission). Fallback: any new turn image that is not pre-existing.
      let newCandidateSrc = '';
      let newCandidateTurnKey = '';
      let candidatePriority = 0; // 0 = none, 1 = new turn fallback, 2 = responding turn

      for (const img of detectionResult) {
        if (!img.ready) continue;
        const isNewTurn = Boolean(img.turnKey) && !this.baselineAssistantTurnIds.has(img.turnKey);
        const isPreExisting = this.preSubmissionImageSrcs.includes(img.src || '');
        const isRespondingTurn = img.turnKey === this.respondingTurnKey;

        if (isNewTurn && !isPreExisting) {
          let priority = isRespondingTurn ? 2 : 1;
          if (priority > candidatePriority) {
            newCandidateSrc = img.src;
            newCandidateTurnKey = img.turnKey || '';
            candidatePriority = priority;
            console.log(
              `[chatgptAdapter/detect] promptId=${this.currentPromptId} seq=${this.currentPromptSequence} new candidate image: src=${img.src}, turnKey=${img.turnKey}, isNewTurn=${isNewTurn}, isPreExisting=${isPreExisting}, isRespondingTurn=${isRespondingTurn}, priority=${priority}`
            );
          }
          break;
        } else if (isPreExisting && img.ready) {
          // Explicitly log rejection of pre-existing images for diagnostics.
          // Only log once per image to avoid repetitive polling logs.
          if (!this.loggedPreExistingSrcs.has(img.src)) {
            console.log(
              `[chatgptAdapter/detect] promptId=${this.currentPromptId} seq=${this.currentPromptSequence} rejecting pre-existing image: src=${img.src}, turnKey=${img.turnKey}`
            );
            this.loggedPreExistingSrcs.add(img.src);
          }
        }
      }

      const newImageDetected = !!newCandidateSrc;
      // Check image readiness for the new candidate.
      let newReadyImageFound = false;
      let newImageSrc = '';
      if (newImageDetected) {
        newReadyImageFound = true;
        newImageSrc = newCandidateSrc;
        console.log(`[chatgptAdapter/detection] ready new image found: src=${newImageSrc}`);
      }

      // Build a stability signature from image count + the ready image src.
      const signature = newReadyImageFound
        ? `count:${currentImageCount}:src:${newImageSrc}`
        : '';

      if (newReadyImageFound) {
        if (signature !== this.lastReadySignature) {
          this.lastReadySignature = signature;
          this.stableSince = Date.now();
        } else if (Date.now() - this.stableSince >= 2000) {
          // Same ready image observed for at least 2 seconds: generation is complete.
          this.isGenerating = false;
          this.lastReadySignature = '';
          this.stableSince = 0;
          console.log(
            `[chatgptAdapter/detection] READY: image stable for 2s, returning SUCCESS after ${Date.now() - startTime}ms`
          );
          return { ready: true, outcome: 'SUCCESS', stillGenerating: false };
        }
      } else {
        // Reset stability tracking when no ready image is currently observed.
        this.lastReadySignature = '';
        this.stableSince = 0;
      }

      // Check if generation finished with an error message bubble.
      // Inspect page-level text for refusal / rate-limit / error signals.
      const lowerPageText = pageText.toLowerCase();
      if (
        lowerPageText.includes("you've reached your limit") ||
        lowerPageText.includes('rate limit exceeded') ||
        lowerPageText.includes('hourly limit')
      ) {
        this.isGenerating = false;
        return {
          ready: false,
          outcome: 'LIMIT',
          reason: 'ChatGPT usage limit detected in conversation.',
          stillGenerating: false,
        };
      }
      if (
        lowerPageText.includes('verify you are human') ||
        lowerPageText.includes('cloudflare') ||
        lowerPageText.includes('log in to continue')
      ) {
        this.isGenerating = false;
        return {
          ready: false,
          outcome: 'AUTH',
          reason: 'Authentication or security challenge detected in browser.',
          stillGenerating: false,
        };
      }
      if (
        lowerPageText.includes('can\'t') ||
        lowerPageText.includes('cannot') ||
        lowerPageText.includes('unable to') ||
        lowerPageText.includes('policy') ||
        lowerPageText.includes('violation') ||
        lowerPageText.includes('blocked')
      ) {
        this.isGenerating = false;
        return {
          ready: false,
          outcome: 'AMBIGUOUS',
          reason: `Generation may have been refused or blocked: ${pageText.slice(0, 200)}`,
          stillGenerating: false,
        };
      }

      // Fallback: page-level error bubble check (existing behavior).
      const errorBubble = await this.page.$('div[class*="text-red"], div[role="alert"]');
      if (errorBubble && (await errorBubble.isVisible().catch(() => false))) {
        const bubbleText = await errorBubble.innerText().catch(() => 'Generation error');
        this.isGenerating = false;
        return {
          ready: false,
          outcome: 'AMBIGUOUS',
          reason: `Generation ended with warning: ${bubbleText.slice(0, 150)}`,
          stillGenerating: false,
        };
      }

      await this.page.waitForTimeout(pollInterval);
    }

    // Timeout expired: inspect whether generation is still running
    console.log(
      `[chatgptAdapter/detect] promptId=${this.currentPromptId} seq=${this.currentPromptSequence} TIMEOUT: baseline=${this.baselineImageCount}, lastReadySignature=${this.lastReadySignature || 'none'}, elapsed=${Date.now() - startTime}ms`
    );
    const stopBtn = await this.page.$(
      'button[data-testid="stop-button"], button[aria-label*="Stop"]'
    );
    const stillGenerating = stopBtn ? await stopBtn.isVisible().catch(() => false) : false;

    return {
      ready: false,
      outcome: 'AMBIGUOUS',
      reason: stillGenerating
        ? `Generation exceeded timeout of ${Math.round(timeoutMs / 1000)}s while ChatGPT is still actively generating.`
        : `Generation timed out after ${Math.round(timeoutMs / 1000)}s without observable result.`,
      stillGenerating,
    };
  }

  /**
   * Set the initial observation delay in milliseconds.
   * Called by the orchestrator from settings before each prompt.
   */
  public setInitialObservationDelayMs(delayMs: number): void {
    this.initialObservationDelayMs = Math.max(0, delayMs);
  }

  public async downloadResult(
    promptId: string,
    outputImagesDir: string
  ): Promise<AdapterDownloadResult> {
    this.ensurePage();
    if (!this.page || this.page.isClosed()) {
      return { success: false, error: 'No active browser page.' };
    }

    if (!this.downloadEngine) {
      return {
        success: false,
        error: 'Download engine not initialized. Call initializeSession() first.',
      };
    }

    // Safety: Check if comparison UI is still present before downloading.
    // If it is, do not download — the result is uncertain.
    const comparisonPresent = await this.detectComparisonUI();
    if (comparisonPresent) {
      console.log(
        `[chatgptAdapter/download] COMPARISON_DUPLICATE_BLOCKED promptId=${promptId} reason=comparison UI still present`
      );
      return {
        success: false,
        error: 'COMPARISON_DUPLICATE_BLOCKED: Image comparison UI is still present. Download blocked to prevent incorrect image association.',
      };
    }

    const dlStart = Date.now();
    console.log(
      `[chatgptAdapter/download] promptId=${promptId} seq=${this.currentPromptSequence} downloadStarted outputDir=${outputImagesDir}`
    );

    try {
      const engineResult = await this.downloadEngine.downloadGeneratedImage(promptId, outputImagesDir);

      if (!engineResult.success) {
        console.log(
          `[chatgptAdapter/download] promptId=${promptId} seq=${this.currentPromptSequence} downloadFailed stage=${engineResult.stage} error=${engineResult.error} durationMs=${Date.now() - dlStart}`
        );
        return {
          success: false,
          error: engineResult.error || `Download failed at stage ${engineResult.stage}`,
          errorDetails: engineResult.errorDetails,
        };
      }

      // Duplicate prevention: Check if the downloaded image hash matches a previously accepted result.
      if (engineResult.sha256 && this.isDuplicateResult(engineResult.sha256)) {
        console.log(
          `[chatgptAdapter/download] COMPARISON_DUPLICATE_BLOCKED promptId=${promptId} reason=duplicate hash ${engineResult.sha256.slice(0, 10)}...`
        );
        return {
          success: false,
          error: `COMPARISON_DUPLICATE_BLOCKED: Downloaded image hash matches a previously accepted result. Possible previous-prompt image reuse.`,
        };
      }

      console.log(
        `[chatgptAdapter/download] promptId=${promptId} seq=${this.currentPromptSequence} downloadSucceeded filePath=${engineResult.filePath} fileSize=${engineResult.fileSize} durationMs=${Date.now() - dlStart}`
      );

      // Record accepted result hash for duplicate prevention
      if (engineResult.sha256) {
        this.recordAcceptedResult(promptId, engineResult.sha256);
      }

      console.log(
        `[chatgptAdapter/download] COMPARISON_DOWNLOAD_ACCEPTED promptId=${promptId} sha256=${engineResult.sha256 ? engineResult.sha256.slice(0, 10) : 'n/a'}...`
      );

      return {
        success: true,
        filePath: engineResult.filePath,
        fileSize: engineResult.fileSize,
        sha256: engineResult.sha256,
        artifactType: 'genuine_image',
      };
    } catch (err: any) {
      console.log(
        `[chatgptAdapter/download] promptId=${promptId} seq=${this.currentPromptSequence} downloadException error=${err.message} durationMs=${Date.now() - dlStart}`
      );
      return { success: false, error: `Download failed: ${err.message}` };
    }
  }

  /**
   * Logs download engine stage transitions through the adapter's logging channel.
   */
  private logDownloadStage(stage: string, message: string): void {
    console.log(`[chatgptAdapter/download] ${stage}: ${message}`);
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
