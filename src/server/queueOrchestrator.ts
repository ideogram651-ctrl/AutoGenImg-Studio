import {
  ProjectConfig,
  PromptBundle,
  PromptItem,
  ReferenceFile,
  RunManifest,
  ManifestItem,
  QueueProgressState,
  LogEvent,
  QueueOverallStatus,
  PromptStatus,
} from '../types/index.ts';
import { ProjectManager } from './projectManager.ts';
import { SettingsManager } from './settingsManager.ts';
import { generateHtmlReport } from './reportGenerator.ts';
import { IProviderAdapter } from './adapters/baseAdapter.ts';
import { SimulationAdapter } from './adapters/simulationAdapter.ts';
import { ChatGPTAdapter } from './adapters/chatgptAdapter.ts';
import { GeminiAdapter } from './adapters/geminiAdapter.ts';
import { defaultChromeSessionManager } from './browser/chromeSessionManager.ts';
import fs from 'node:fs';
import path from 'path';

export class QueueOrchestrator {
  private projectManager: ProjectManager;
  private settingsManager: SettingsManager;
  private currentProject: ProjectConfig | null = null;
  private currentBundle: PromptBundle | null = null;
  private currentReferences: ReferenceFile[] = [];
  private activeManifest: RunManifest | null = null;
  private adapter: IProviderAdapter;

  private overallStatus: QueueOverallStatus = 'IDLE';
  private runId = '';
  private currentItemIndex = -1;

  // Single-flight queue worker state & cancellation flags
  private isLoopRunning = false;
  private activeLoopPromise: Promise<void> | null = null;
  private isPaused = false;
  private isPauseRequested = false;
  private pauseReason = '';
  private isStopped = false;
  private isStopRequested = false;

  private activeProcessingStart = 0;
  private totalActiveProcessingMs = 0;
  private runStartTimestamp = 0;

  // SSE Subscribers
  private sseClients: Set<(event: string, data: any) => void> = new Set();

  constructor(projectManager: ProjectManager, settingsManager?: SettingsManager) {
    this.projectManager = projectManager;
    this.settingsManager = settingsManager || new SettingsManager();
    this.adapter = new ChatGPTAdapter(); // Production default: real browser provider
  }

  public getSettingsManager(): SettingsManager {
    return this.settingsManager;
  }

  public subscribeSSE(client: (event: string, data: any) => void): () => void {
    this.sseClients.add(client);
    client('state', this.getProgressState());
    return () => {
      this.sseClients.delete(client);
    };
  }

  private broadcast(event: string, data: any) {
    for (const client of this.sseClients) {
      try {
        client(event, data);
      } catch {}
    }
  }

  public getAdapter(): IProviderAdapter {
    return this.adapter;
  }

  public setAdapter(type: string): IProviderAdapter {
    if (type === 'chatgpt') {
      this.adapter = new ChatGPTAdapter();
    } else if (type === 'gemini') {
      this.adapter = new GeminiAdapter();
    } else {
      this.adapter = new SimulationAdapter();
    }
    return this.adapter;
  }

  public getCurrentProject(): ProjectConfig | null {
    return this.currentProject;
  }

  public getCurrentBundle(): PromptBundle | null {
    return this.currentBundle;
  }

  public getCurrentReferences(): ReferenceFile[] {
    return this.currentReferences;
  }

  public getActiveManifest(): RunManifest | null {
    return this.activeManifest;
  }

  public setProject(project: ProjectConfig, bundle?: PromptBundle, references?: ReferenceFile[]) {
    this.currentProject = project;
    if (bundle) this.currentBundle = bundle;
    if (references) this.currentReferences = references;

    // Reset run-scoped state so switching projects never leaks a previous
    // project's manifest, status, or counters into the newly opened project.
    this.activeManifest = null;
    this.overallStatus = 'IDLE';

    // Configure matching adapter
    this.setAdapter(project.provider);

    // Save initial configuration and track as active project
    this.projectManager.saveProjectConfig(project, this.currentBundle, this.currentReferences);
    this.projectManager.setActiveProjectRecord(project.id, project.outputPath);

    // Try loading existing manifest or run state for resume/recovery
    const existingManifest = this.projectManager.loadManifest(project.outputPath);
    if (existingManifest) {
      this.activeManifest = this.projectManager.reconcileFilesWithManifest(
        project.outputPath,
        existingManifest
      );
      this.overallStatus = this.activeManifest.overallStatus;
    }

    this.log('PROJECT_LOADED', 'info', `Project "${project.name}" configured at ${project.outputPath}`);
    this.broadcast('state', this.getProgressState());
  }

  /**
   * Clears the in-memory active project so a deleted project cannot resurrect
   * on the next state refresh. Does not touch disk; project files are removed
   * separately by projectManager.deleteProject.
   */
  public clearActiveProject() {
    this.currentProject = null;
    this.currentBundle = null;
    this.currentReferences = [];
    this.activeManifest = null;
    this.overallStatus = 'IDLE';
    this.broadcast('state', this.getProgressState());
  }

  public setReferences(references: ReferenceFile[]) {
    this.currentReferences = references;
    if (this.currentProject) {
      this.projectManager.saveProjectConfig(this.currentProject, this.currentBundle, this.currentReferences);
    }
  }

  public setBundle(bundle: PromptBundle) {
    this.currentBundle = bundle;
    if (this.currentProject) {
      this.projectManager.saveProjectConfig(this.currentProject, this.currentBundle, this.currentReferences);
    }
    this.log('BUNDLE_UPDATED', 'info', `Prompt bundle updated with ${bundle.prompts.length} prompts.`);
  }

  /**
   * Preflight validation ensuring all prompt-to-reference assignments resolve to
   * registered references with actual files present on disk before running live automation.
   */
  public validateAssignedReferences(): { valid: boolean; error?: string } {
    if (!this.currentBundle || !this.currentProject) {
      return { valid: false, error: 'No project or prompt bundle configured.' };
    }

    const regMap = new Map<string, ReferenceFile>();
    for (const r of this.currentReferences) {
      regMap.set(r.id, r);
    }

    const isLive = !this.adapter.isDemo;

    for (const p of this.currentBundle.prompts) {
      // 1. Explicitly assigned references in prompt item
      const requiredIds = p.referenceIds || [];
      for (const refId of requiredIds) {
        const ref = regMap.get(refId);
        if (!ref) {
          return {
            valid: false,
            error: `Preflight check failed: Prompt "${p.id}" references "${refId}", which is not registered in the project's reference registry. Please register the reference or update prompt assignments before starting.`,
          };
        }
        if (isLive) {
          let localPath = ref.path;
          if (!localPath || !fs.existsSync(localPath)) {
            const candidateInProj = path.join(this.currentProject.outputPath, 'references', ref.name);
            if (fs.existsSync(candidateInProj)) {
              ref.path = candidateInProj;
              localPath = candidateInProj;
            } else {
              return {
                valid: false,
                error: `Preflight check failed: Required reference file "${ref.name}" (ID: "${ref.id}") was not found on disk. It is assigned to prompt ${p.id}. Please upload this file in Reference Manager before starting live automation.`,
              };
            }
          }
        }
      }

      // 2. References mapped via mode (all or selected)
      const effectiveRefs = this.resolveReferencesForPrompt(p.id);

      if (isLive) {
        for (const ref of effectiveRefs) {
          // Check if path is valid
          let localPath = ref.path;
          if (!localPath || !fs.existsSync(localPath)) {
            // Check project references folder as fallback
            const candidateInProj = path.join(this.currentProject.outputPath, 'references', ref.name);
            if (fs.existsSync(candidateInProj)) {
              ref.path = candidateInProj;
              localPath = candidateInProj;
            } else {
              return {
                valid: false,
                error: `Preflight check failed: Required reference file "${ref.name}" (ID: "${ref.id}") was not found on disk. It is assigned to prompt ${p.id}. Please upload this file in Reference Manager before starting live automation.`,
              };
            }
          }
        }
      }
    }

    return { valid: true };
  }

  public getProgressState(): QueueProgressState {
    const totalPrompts = this.activeManifest?.totalPrompts || this.currentBundle?.prompts.length || 0;
    const processedCount = this.activeManifest?.processedCount || 0;
    const savedCount = this.activeManifest?.savedCount || 0;
    const reviewCount = this.activeManifest?.reviewCount || 0;
    const failedCount = this.activeManifest?.failedCount || 0;
    const skippedCount = this.activeManifest?.skippedCount || 0;

    // Progress percentage strictly represents saved or terminally processed items
    const percentage = totalPrompts > 0 ? Math.round((savedCount / totalPrompts) * 100) : 0;
    const currentItem =
      this.currentItemIndex >= 0 && this.activeManifest
        ? this.activeManifest.items[this.currentItemIndex]
        : null;

    return {
      runId: this.runId,
      projectId: this.currentProject?.id || '',
      overallStatus: this.overallStatus,
      currentPromptId: currentItem?.id || null,
      currentSequence: currentItem?.sequence || 0,
      currentStage: currentItem?.status || 'IDLE',
      totalPrompts,
      processedCount,
      savedCount,
      reviewCount,
      failedCount,
      skippedCount,
      percentage,
      elapsedMs: this.runStartTimestamp > 0 ? Date.now() - this.runStartTimestamp : 0,
      currentItemElapsedMs: 0,
      isPaused: this.isPaused || this.overallStatus === 'PAUSED' || this.overallStatus === 'PAUSED_PROVIDER_LIMIT',
      pauseReason: this.pauseReason,
      isDemoMode: this.adapter.isDemo,
    };
  }

  private log(
    type: string,
    severity: LogEvent['severity'],
    message: string,
    promptId?: string,
    durationMs?: number,
    outputPath?: string
  ) {
    const event: LogEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      runId: this.runId,
      promptId,
      type,
      severity,
      message,
      durationMs,
      outputPath,
    };

    if (this.currentProject) {
      this.projectManager.appendEvent(this.currentProject.outputPath, event);
    }

    this.broadcast('log', event);
  }

  /**
   * Starts or restarts a sequential automation run.
   * Single-flight lock prevents duplicate concurrent execution loops.
   */
  public async startRun(options?: { regenerateAll?: boolean }): Promise<{ success: boolean; message: string }> {
    if (!this.currentProject || !this.currentBundle) {
      return { success: false, message: 'No project or prompt bundle configured.' };
    }

    // 1. Single-flight lock check
    if (this.isLoopRunning || this.overallStatus === 'RUNNING') {
      return { success: false, message: 'Queue is already actively running.' };
    }

    // Immediately acquire lock to guard async session initialization
    this.isLoopRunning = true;

    // 2. Preflight reference validation
    const refValidation = this.validateAssignedReferences();
    if (!refValidation.valid) {
      this.isLoopRunning = false;
      this.log('PREFLIGHT_ERROR', 'error', refValidation.error || 'Preflight reference check failed.');
      return { success: false, message: refValidation.error || 'Preflight reference check failed.' };
    }

    this.isPaused = false;
    this.isPauseRequested = false;
    this.isStopped = false;
    this.isStopRequested = false;
    this.pauseReason = '';

    const isRegenAll = Boolean(options?.regenerateAll);

    // Clear accepted result hashes for new run to avoid false positives
    if (isRegenAll || !this.activeManifest || this.activeManifest.overallStatus === 'COMPLETED') {
      const adapter = this.adapter as any;
      if (typeof adapter.clearAcceptedResults === 'function') {
        adapter.clearAcceptedResults();
      }
    }

    // Initialize fresh manifest or resume
    if (isRegenAll || !this.activeManifest || this.activeManifest.overallStatus === 'COMPLETED') {
      this.runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      this.runStartTimestamp = Date.now();
      this.totalActiveProcessingMs = 0;

      const manifestItems: ManifestItem[] = this.currentBundle.prompts.map((p) => {
        const assignedRefs = this.resolveReferencesForPrompt(p.id);
        return {
          id: p.id,
          runId: this.runId,
          sequence: p.sequence,
          prompt: p.prompt,
          status: 'PENDING',
          outputFile: null,
          fileSize: null,
          referenceIds: assignedRefs.map((r) => r.id),
          attempts: 0,
        };
      });

      this.activeManifest = {
        runId: this.runId,
        projectId: this.currentProject.id,
        projectName: this.currentProject.name,
        provider: this.currentProject.provider,
        conversationUrl: this.currentProject.conversationUrl,
        outputPath: this.currentProject.outputPath,
        artifactType: this.adapter.isDemo ? 'simulation_artifact' : 'genuine_image',
        startTime: new Date().toISOString(),
        overallStatus: 'RUNNING',
        totalPrompts: manifestItems.length,
        processedCount: 0,
        savedCount: 0,
        reviewCount: 0,
        failedCount: 0,
        skippedCount: 0,
        cancelledCount: 0,
        pauseCount: 0,
        wallClockDurationMs: 0,
        activeProcessingDurationMs: 0,
        items: manifestItems,
      };
    } else {
      // Resuming existing manifest
      this.activeManifest.overallStatus = 'RUNNING';
      if (!this.runStartTimestamp) this.runStartTimestamp = Date.now();
    }

    // Retrieve backend settings to pass to adapter
    const settings = this.settingsManager.getSettings();

    // 3. Initialize session with adapter before marking queue as running
    try {
      await this.adapter.initializeSession({
        conversationUrl: this.currentProject.conversationUrl,
        profileDir: settings.resolvedProfileDir,
        chromePath: settings.chromePath,
        debugPort: settings.debugPort,
        startupTimeoutMs: settings.startupTimeoutMs,
        connectionTimeoutMs: settings.connectionTimeoutMs,
      });
    } catch (err: any) {
      this.isLoopRunning = false;
      const errMsg = err?.message || String(err);
      const isAuthError =
        errMsg.startsWith('Authentication required') ||
        errMsg.includes('LOGIN_REQUIRED') ||
        errMsg.includes('SECURITY_CHALLENGE');

      this.overallStatus = isAuthError ? 'BLOCKED_AUTH' : 'ERROR';
      if (this.activeManifest) {
        this.activeManifest.overallStatus = this.overallStatus;
      }
      this.log(
        isAuthError ? 'AUTH_REQUIRED' : 'SESSION_ERROR',
        'error',
        `Browser session initialization failed: ${errMsg}`
      );
      this.persistState();
      this.broadcast('state', this.getProgressState());
      return {
        success: false,
        message: `Failed to initialize browser session: ${errMsg}`,
      };
    }

    this.overallStatus = 'RUNNING';
    this.activeProcessingStart = Date.now();

    this.log(
      'RUN_STARTED',
      'info',
      `Run ${this.activeManifest.runId} started (${this.adapter.isDemo ? 'DEMO SIMULATION' : 'LIVE AUTOMATION'})`
    );
    this.persistState();
    this.broadcast('state', this.getProgressState());

    // 4. Launch single-flight processing loop
    this.isLoopRunning = true;
    this.activeLoopPromise = this.processQueueLoop()
      .catch((err) => {
        this.log('QUEUE_ERROR', 'error', `Unexpected queue worker failure: ${err.message}`);
      })
      .finally(() => {
        this.isLoopRunning = false;
        this.activeLoopPromise = null;
      });

    return { success: true, message: 'Queue processing started.' };
  }

  public pauseRun(reason = 'User paused the run'): { success: boolean; message?: string } {
    if (this.overallStatus !== 'RUNNING') {
      return { success: false, message: 'Queue is not running.' };
    }

    this.isPauseRequested = true;
    this.pauseReason = reason;
    this.overallStatus = 'PAUSED';

    if (this.activeManifest) {
      this.activeManifest.pauseCount += 1;
      this.activeManifest.overallStatus = 'PAUSED';
    }

    if (this.activeProcessingStart > 0) {
      this.totalActiveProcessingMs += Date.now() - this.activeProcessingStart;
      this.activeProcessingStart = 0;
    }

    this.log('RUN_PAUSED', 'warn', `Run pause requested: ${reason}`);
    this.persistState();
    this.broadcast('state', this.getProgressState());
    return { success: true, message: 'Run paused.' };
  }

  public resumeRun(): { success: boolean; message?: string } {
    if (
      this.overallStatus !== 'PAUSED' &&
      this.overallStatus !== 'PAUSED_PROVIDER_LIMIT' &&
      this.overallStatus !== 'BLOCKED_AUTH'
    ) {
      return { success: false, message: 'Run is not in a paused or blocked state.' };
    }

    if (this.isLoopRunning) {
      return { success: false, message: 'Queue processing loop is still running.' };
    }

    this.isPaused = false;
    this.isPauseRequested = false;
    this.isStopped = false;
    this.isStopRequested = false;
    this.pauseReason = '';
    this.overallStatus = 'RUNNING';

    if (this.activeManifest) {
      this.activeManifest.overallStatus = 'RUNNING';
    }

    this.activeProcessingStart = Date.now();
    this.log('RUN_RESUMED', 'info', 'Run resumed by user.');
    this.persistState();
    this.broadcast('state', this.getProgressState());

    // Launch single-flight processing loop
    this.isLoopRunning = true;
    this.activeLoopPromise = this.processQueueLoop()
      .catch((err) => {
        this.log('QUEUE_ERROR', 'error', `Unexpected queue worker failure: ${err.message}`);
      })
      .finally(() => {
        this.isLoopRunning = false;
        this.activeLoopPromise = null;
      });

    return { success: true };
  }

  public async stopRun(): Promise<{ success: boolean; message?: string }> {
    this.isStopRequested = true;
    this.isStopped = true;
    this.isPaused = false;
    this.isPauseRequested = false;
    this.overallStatus = 'STOPPED';

    if (this.activeManifest) {
      this.activeManifest.overallStatus = 'STOPPED';
      this.activeManifest.endTime = new Date().toISOString();
      this.updateManifestCounts();
    }

    if (this.activeProcessingStart > 0) {
      this.totalActiveProcessingMs += Date.now() - this.activeProcessingStart;
      this.activeProcessingStart = 0;
    }

    this.log('RUN_STOPPED', 'warn', 'Run stopped by user. All completed outputs preserved.');
    this.persistState();
    this.broadcast('state', this.getProgressState());
    return { success: true, message: 'Run stopped.' };
  }

  /**
   * Main sequential processing loop.
   * Guarantees strict single-flight execution: exactly one prompt in flight at a time.
   */
  private async processQueueLoop() {
    if (!this.activeManifest || !this.currentProject) return;

    const items = this.activeManifest.items;

    try {
      for (let i = 0; i < items.length; i++) {
        if (this.isStopRequested || this.isStopped) break;

        if (this.isPauseRequested || this.isPaused) {
          this.isPaused = true;
          this.log('QUEUE_IDLE', 'info', 'Queue paused, awaiting resume.');
          break;
        }

        const item = items[i];
        // Only process items that are pending or in-flight (never blindly re-process SAVED, SKIPPED, or NEEDS_REVIEW)
        if (item.status === 'SAVED' || item.status === 'SKIPPED' || item.status === 'NEEDS_REVIEW' || item.status === 'FAILED') {
          continue;
        }

        this.currentItemIndex = i;
        await this.processItem(item);

        // Check if paused or stopped during item processing
        if (this.isPauseRequested || this.isPaused || this.isStopRequested || this.isStopped) {
          break;
        }

        // Strict Sequential Orchestration: Prompt N+1 must NEVER start until Prompt N is verified and SAVED
        if ((item.status as string) !== 'SAVED') {
          if (this.overallStatus === 'RUNNING') {
            this.overallStatus = 'PAUSED';
            this.isPaused = true;
            this.pauseReason = item.reviewReason || `Execution paused: Item ${item.id} is in ${item.status} state.`;
            if (this.activeManifest) this.activeManifest.overallStatus = 'PAUSED';
          }
          break;
        }
      }

      // Check terminal completion
      const terminalStatuses = ['SAVED', 'NEEDS_REVIEW', 'FAILED', 'SKIPPED', 'CANCELLED'];
      const allDone = items.every((it) => terminalStatuses.includes(it.status));

      if (allDone && !this.isPaused && !this.isPauseRequested && !this.isStopped && !this.isStopRequested) {
        this.overallStatus = 'COMPLETED';
        if (this.activeManifest) {
          this.activeManifest.overallStatus = 'COMPLETED';
          this.activeManifest.endTime = new Date().toISOString();
          this.updateManifestCounts();
        }

        const isFullySaved = items.every((it) => it.status === 'SAVED');
        this.log(
          'RUN_COMPLETED',
          isFullySaved ? 'success' : 'warn',
          `Run completed. Saved: ${this.activeManifest?.savedCount}, Needs Review: ${this.activeManifest?.reviewCount}, Failed: ${this.activeManifest?.failedCount}`
        );
      }
    } finally {
      this.isLoopRunning = false;
      this.activeLoopPromise = null;
      this.updateManifestCounts();
      this.persistState();
      this.broadcast('state', this.getProgressState());
    }
  }

  /**
   * Processes a single prompt item through the strict sequential lifecycle:
   * PREPARING -> SUBMITTING -> GENERATING -> RESULT_READY -> DOWNLOADING -> SAVED
   */
  private async processItem(item: ManifestItem) {
    if (!this.activeManifest || !this.currentProject) return;

    const settings = this.settingsManager.getSettings();
    const genTimeoutMs = (settings.genTimeoutSeconds || 60) * 1000;

    item.attempts += 1;
    const itemStart = Date.now();
    item.generationStartTime = new Date().toISOString();

    // 1. PREPARING
    item.status = 'PREPARING';
    this.updateItemInManifest(item);
    this.log('ITEM_PREPARING', 'info', `Preparing references and prompt for ${item.id}`, item.id);

    const promptObj: PromptItem = {
      id: item.id,
      sequence: item.sequence,
      prompt: item.prompt,
      referenceIds: item.referenceIds,
    };
    const effectiveRefs = this.resolveReferencesForPrompt(item.id);

    // 2. SUBMITTING
    item.status = 'SUBMITTING';
    this.updateItemInManifest(item);
    this.log('ITEM_SUBMITTING', 'info', `Submitting prompt ${item.id} to visible UI`, item.id);

    const submitResult = await this.adapter.submitPrompt(promptObj, effectiveRefs, (stage, msg) => {
      this.log(`ADAPTER_${stage}`, 'info', msg, item.id);
    });

    if (!submitResult.success) {
      item.status = 'FAILED';
      item.errorDetails = submitResult.error;
      item.reviewReason = `Submission failed: ${submitResult.error}`;
      item.suggestedAction = 'Check browser session or provider status and retry.';
      this.updateItemInManifest(item);
      this.log('SUBMISSION_FAILED', 'error', `Failed to submit prompt ${item.id}: ${submitResult.error}`, item.id);

      const isAuth =
        submitResult.error?.includes('Authentication') ||
        submitResult.error?.includes('login') ||
        submitResult.error?.includes('LOGIN_REQUIRED') ||
        submitResult.error?.includes('SECURITY_CHALLENGE');

      if (isAuth) {
        item.status = 'BLOCKED_AUTH';
        this.overallStatus = 'BLOCKED_AUTH';
        if (this.activeManifest) this.activeManifest.overallStatus = 'BLOCKED_AUTH';
        this.pauseRun(`Authentication required in browser session: ${submitResult.error}`);
      } else {
        // Any submission error halts the sequential queue
        this.pauseRun(`Queue halted on submission error: ${submitResult.error}`);
      }
      return;
    }

    // Check cancellation before generation waiting
    if (this.isPauseRequested || this.isStopRequested) {
      item.status = 'NEEDS_REVIEW';
      item.reviewReason = 'Prompt was submitted to provider, but run was paused/stopped by user before generation finished.';
      this.updateItemInManifest(item);
      return;
    }

    // 3. GENERATING
    item.status = 'GENERATING';
    this.updateItemInManifest(item);
    this.log('ITEM_GENERATING', 'info', `Waiting for visible generation result for ${item.id}...`, item.id);

    // Apply configured initial observation delay before detection begins.
    const obsDelayMs = settings.initialObservationDelayMs ?? 18000;
    if (typeof this.adapter.setInitialObservationDelayMs === 'function') {
      (this.adapter as any).setInitialObservationDelayMs(obsDelayMs);
    }

    const genStart = Date.now();
    const genResult = await this.adapter.waitForGeneration(
      genTimeoutMs,
      (elapsed) => {
        // Heartbeat tick
      },
      () => this.isPauseRequested || this.isStopRequested
    );
    item.generationDurationMs = Date.now() - genStart;

    // Handle Generation Outcomes
    if (genResult.outcome === 'LIMIT') {
      item.status = 'PAUSED_PROVIDER_LIMIT';
      item.reviewReason = genResult.reason || 'Provider usage limit reached.';
      this.updateItemInManifest(item);
      this.pauseRun(genResult.reason || 'Provider usage limit reached');
      this.overallStatus = 'PAUSED_PROVIDER_LIMIT';
      return;
    }

    if (genResult.outcome === 'AUTH') {
      item.status = 'BLOCKED_AUTH';
      item.reviewReason = genResult.reason || 'Authentication or security challenge detected.';
      this.updateItemInManifest(item);
      this.overallStatus = 'BLOCKED_AUTH';
      this.pauseRun(genResult.reason || 'Authentication challenge detected');
      return;
    }

    if (genResult.outcome === 'COMPARISON_UNRESOLVED') {
      // ChatGPT image comparison UI was detected but could not be resolved.
      // Move to review and continue the queue (do not block).
      item.status = 'NEEDS_REVIEW';
      item.reviewReason = genResult.reason || 'ChatGPT image comparison UI remained unresolved.';
      item.suggestedAction = 'Inspect the prompt in ChatGPT manually. If an image was generated, retry download or regenerate.';
      item.totalDurationMs = Date.now() - itemStart;
      this.updateItemInManifest(item);
      this.log('ITEM_REVIEW_NEEDED', 'warn', `Item ${item.id} placed in review: ${item.reviewReason}`, item.id, item.generationDurationMs);
      console.log(`[queueOrchestrator] COMPARISON_RECOVERY_EXHAUSTED promptId=${item.id} seq=${item.sequence}`);
      // Continue to next prompt (do not pause)
      return;
    }

    if (genResult.outcome === 'AMBIGUOUS' || !genResult.ready) {
      // P-002, P-005: Distinguish "still generating" from genuine failure.
      // When ChatGPT is still actively generating, do NOT place the item in
      // NEEDS_REVIEW — that would incorrectly mark a successful generation
      // as failed. Instead, keep the item in GENERATING and pause the queue
      // so the user can resume and allow generation to complete.
      if (genResult.stillGenerating) {
        item.status = 'GENERATING';
        item.reviewReason = genResult.reason || 'Generation still in progress after timeout.';
        item.suggestedAction =
          'Resume the queue to continue waiting for generation. If generation does not complete, use Retry Download or Regenerate.';
        item.totalDurationMs = Date.now() - itemStart;
        this.updateItemInManifest(item);
        this.log('ITEM_REVIEW_NEEDED', 'warn', `Item ${item.id} still generating after timeout: ${item.reviewReason}`, item.id, item.generationDurationMs);

        // Pause the queue to prevent overlapping prompts while generation continues.
        this.pauseRun('Provider is still actively generating. Queue paused to prevent overlapping prompts.');
        return;
      }

      // Genuine failure: no observable result and not still generating.
      item.status = 'NEEDS_REVIEW';
      item.reviewReason = genResult.reason || 'Generation outcome is ambiguous or timed out.';
      item.suggestedAction =
        'Inspect provider conversation directly. If image was generated, retry download or request explicit regeneration.';
      item.totalDurationMs = Date.now() - itemStart;
      this.updateItemInManifest(item);
      this.log('ITEM_REVIEW_NEEDED', 'warn', `Item ${item.id} placed in review: ${item.reviewReason}`, item.id, item.generationDurationMs);
      return;
    }

    // 4. RESULT_READY -> DOWNLOADING
    item.status = 'DOWNLOADING';
    this.updateItemInManifest(item);
    this.log('ITEM_DOWNLOADING', 'info', `Activating visible download action for ${item.id}...`, item.id);

    const dlStart = Date.now();
    // Save into run-isolated images directory to prevent cross-run pollution
    const runImagesDir = path.join(this.currentProject.outputPath, 'runs', this.runId, 'images');
    if (!fs.existsSync(runImagesDir)) fs.mkdirSync(runImagesDir, { recursive: true });
    const imagesDir = runImagesDir;

    const dlResult = await this.adapter.downloadResult(item.id, imagesDir);
    item.downloadDurationMs = Date.now() - dlStart;
    item.totalDurationMs = Date.now() - itemStart;

    if (!dlResult.success || !dlResult.filePath) {
      item.status = 'NEEDS_REVIEW';
      item.reviewReason = `Download failed: ${dlResult.error || 'Unknown error'}`;
      item.suggestedAction =
        'Image was generated in provider UI. Click Retry Download in Review Center without regenerating.';
      this.updateItemInManifest(item);
      this.log('DOWNLOAD_FAILED', 'error', `Download failed for ${item.id}: ${dlResult.error}`, item.id);
      return;
    }

    // Also mirror into default output/images for user convenience
    try {
      const defaultImagesDir = path.join(this.currentProject.outputPath, 'output', 'images');
      if (!fs.existsSync(defaultImagesDir)) fs.mkdirSync(defaultImagesDir, { recursive: true });
      const mirrorTarget = path.join(defaultImagesDir, path.basename(dlResult.filePath));
      fs.copyFileSync(dlResult.filePath, mirrorTarget);
    } catch {}

    // 5. SAVED: Verified on filesystem with cryptographic hash and signature
    item.status = 'SAVED';
    item.outputFile = dlResult.filePath;
    item.fileSize = dlResult.fileSize || 0;
    item.sha256 = dlResult.sha256;
    item.artifactType = dlResult.artifactType || (this.adapter.isDemo ? 'simulation_artifact' : 'genuine_image');
    item.completedAt = new Date().toISOString();
    item.reviewReason = undefined;
    item.suggestedAction = undefined;

    this.updateItemInManifest(item);
    this.log(
      'ITEM_SAVED',
      'success',
      `Image saved successfully: ${path.basename(dlResult.filePath)} (${dlResult.fileSize} bytes, SHA-256: ${dlResult.sha256 ? dlResult.sha256.slice(0, 10) : 'n/a'}...)`,
      item.id,
      item.totalDurationMs,
      dlResult.filePath
    );
  }

  public async regenerateAll(): Promise<{ success: boolean; message: string }> {
    return this.startRun({ regenerateAll: true });
  }

  public async regeneratePrompt(promptId: string): Promise<{ success: boolean; message: string }> {
    if (!this.activeManifest) return { success: false, message: 'No active run.' };
    const item = this.activeManifest.items.find((it) => it.id === promptId);
    if (!item) return { success: false, message: `Prompt ID ${promptId} not found.` };

    item.status = 'PENDING';
    item.reviewReason = undefined;
    item.suggestedAction = undefined;
    this.updateItemInManifest(item);
    this.log('REGENERATION_REQUESTED', 'info', `Explicit user regeneration requested for ${promptId}`, promptId);

    // If currently paused, idle, or completed, process this single item
    if (this.overallStatus !== 'RUNNING') {
      await this.processItem(item);
      this.persistState();
    }

    return { success: true, message: `Prompt ${promptId} queued for regeneration.` };
  }

  public async retryDownload(promptId: string): Promise<{ success: boolean; message: string }> {
    if (!this.activeManifest || !this.currentProject) return { success: false, message: 'No active run.' };
    const item = this.activeManifest.items.find((it) => it.id === promptId);
    if (!item) return { success: false, message: `Prompt ID ${promptId} not found.` };

    this.log('DOWNLOAD_RETRY', 'info', `Retrying visible download for ${promptId}`, promptId);
    const imagesDir = path.join(this.currentProject.outputPath, 'output', 'images');
    const dlResult = await this.adapter.downloadResult(item.id, imagesDir);

    if (dlResult.success && dlResult.filePath) {
      item.status = 'SAVED';
      item.outputFile = dlResult.filePath;
      item.fileSize = dlResult.fileSize || 0;
      item.reviewReason = undefined;
      item.suggestedAction = undefined;
      this.updateItemInManifest(item);
      this.persistState();
      this.log('DOWNLOAD_RETRY_SUCCESS', 'success', `File successfully downloaded on retry: ${path.basename(dlResult.filePath)}`, promptId);
      return { success: true, message: 'Download retry succeeded.' };
    } else {
      item.reviewReason = `Retry download failed: ${dlResult.error}`;
      this.updateItemInManifest(item);
      this.persistState();
      return { success: false, message: `Download retry failed: ${dlResult.error}` };
    }
  }

  public markItemReviewed(promptId: string): { success: boolean } {
    if (!this.activeManifest) return { success: false };
    const item = this.activeManifest.items.find((it) => it.id === promptId);
    if (!item) return { success: false };

    item.suggestedAction = 'Marked as reviewed by user.';
    this.updateItemInManifest(item);
    this.persistState();
    this.log('ITEM_MARKED_REVIEWED', 'info', `Item ${promptId} marked reviewed by user.`, promptId);
    return { success: true };
  }

  public skipItem(promptId: string): { success: boolean } {
    if (!this.activeManifest) return { success: false };
    const item = this.activeManifest.items.find((it) => it.id === promptId);
    if (!item) return { success: false };

    item.status = 'SKIPPED';
    item.reviewReason = 'Skipped by user.';
    this.updateItemInManifest(item);
    this.persistState();
    this.log('ITEM_SKIPPED', 'warn', `Item ${promptId} skipped by user.`, promptId);
    return { success: true };
  }

  private updateItemInManifest(item: ManifestItem) {
    if (!this.activeManifest) return;
    this.updateManifestCounts();
    this.persistState();
    this.broadcast('item_update', item);
    this.broadcast('state', this.getProgressState());
  }

  /**
   * Accurately calculates processed counts.
   * In-flight items (PREPARING, SUBMITTING, GENERATING, DOWNLOADING) are strictly excluded from processedCount.
   */
  private updateManifestCounts() {
    if (!this.activeManifest) return;
    const items = this.activeManifest.items;
    const terminalStatuses = ['SAVED', 'NEEDS_REVIEW', 'FAILED', 'SKIPPED', 'CANCELLED'];

    this.activeManifest.totalPrompts = items.length;
    this.activeManifest.savedCount = items.filter((i) => i.status === 'SAVED').length;
    this.activeManifest.reviewCount = items.filter((i) => i.status === 'NEEDS_REVIEW').length;
    this.activeManifest.failedCount = items.filter((i) => i.status === 'FAILED').length;
    this.activeManifest.skippedCount = items.filter((i) => i.status === 'SKIPPED').length;
    this.activeManifest.cancelledCount = items.filter((i) => i.status === 'CANCELLED').length;
    this.activeManifest.processedCount = items.filter((i) => terminalStatuses.includes(i.status)).length;

    if (this.runStartTimestamp > 0) {
      this.activeManifest.wallClockDurationMs = Date.now() - this.runStartTimestamp;
    }
    this.activeManifest.activeProcessingDurationMs =
      this.totalActiveProcessingMs + (this.activeProcessingStart > 0 ? Date.now() - this.activeProcessingStart : 0);
  }

  private persistState() {
    if (!this.currentProject || !this.activeManifest) return;
    this.updateManifestCounts();

    // 1. Save manifest JSON
    this.projectManager.saveManifest(this.currentProject.outputPath, this.activeManifest);

    // 2. Save run state JSON
    this.projectManager.saveRunState(this.currentProject.outputPath, {
      runId: this.runId,
      overallStatus: this.overallStatus,
      currentItemIndex: this.currentItemIndex,
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
      updatedAt: new Date().toISOString(),
    });

    // 3. Update self-contained HTML report
    try {
      const htmlContent = generateHtmlReport(this.activeManifest);
      const reportsDir = path.join(this.currentProject.outputPath, 'output', 'reports');
      if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
      fs.writeFileSync(path.join(reportsDir, 'run-report.html'), htmlContent, 'utf-8');

      if (this.runId) {
        const runReportsDir = path.join(this.currentProject.outputPath, 'runs', this.runId, 'reports');
        if (!fs.existsSync(runReportsDir)) fs.mkdirSync(runReportsDir, { recursive: true });
        fs.writeFileSync(path.join(runReportsDir, 'run-report.html'), htmlContent, 'utf-8');
      }
    } catch (err: any) {
      console.error('Failed to generate HTML run report:', err);
    }
  }

  public resolveReferencesForPrompt(promptId: string): ReferenceFile[] {
    return this.currentReferences.filter((ref) => {
      if (ref.assignedMode === 'all') return true;
      if (ref.assignedMode === 'selected') {
        return ref.assignedPromptIds && ref.assignedPromptIds.includes(promptId);
      }
      return false;
    });
  }
}
