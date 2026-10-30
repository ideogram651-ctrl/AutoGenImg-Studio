import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import os from 'os';
import { QueueOrchestrator } from '../src/server/queueOrchestrator.ts';
import { ProjectManager } from '../src/server/projectManager.ts';
import { SettingsManager } from '../src/server/settingsManager.ts';
import { ChromeSessionManager } from '../src/server/browser/chromeSessionManager.ts';
import { IProviderAdapter } from '../src/server/adapters/baseAdapter.ts';
import { ProjectConfig, PromptBundle, RunManifest, ManifestItem, ReferenceFile } from '../src/types/index.ts';

describe('Readiness Probe Safety & Error Handling', () => {
  let tempDir: string;
  let manager: ChromeSessionManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-probe-test-'));
    manager = new ChromeSessionManager(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('checkProviderReadiness safely handles null body and missing DOM without throwing innerText error', async () => {
    const mockPage = {
      isClosed: () => false,
      url: () => 'https://chatgpt.com',
      evaluate: async () => {
        return {
          title: 'ChatGPT',
          text: 'Welcome',
          hasBody: true,
        };
      },
      $: async (selector: string) => {
        if (selector.includes('prompt-textarea')) {
          return { isVisible: async () => true };
        }
        return null;
      },
    } as any;

    (manager as any).page = mockPage;
    (manager as any).client = {};

    const readiness = await manager.checkProviderReadiness('chatgpt');
    assert.strictEqual(readiness.ready, true);
    assert.strictEqual(readiness.state, 'CONVERSATION_READY');
  });

  test('checkProviderReadiness classifies navigation destroy as NAVIGATING rather than LOGIN_REQUIRED', async () => {
    const mockPage = {
      isClosed: () => false,
      url: () => 'https://chatgpt.com',
      evaluate: async () => {
        throw new Error('Execution context was destroyed, most likely because of a navigation.');
      },
      $: async () => null,
    } as any;

    (manager as any).page = mockPage;
    (manager as any).client = {};

    const readiness = await manager.checkProviderReadiness('chatgpt');
    assert.strictEqual(readiness.ready, false);
    assert.strictEqual(readiness.state, 'NAVIGATING');
    // Crucial: Must NOT be falsely classified as login required!
    assert.notStrictEqual(readiness.state, 'LOGIN_REQUIRED');
  });

  test('checkProviderReadiness classifies unknown evaluation error as PROBE_ERROR without false auth error', async () => {
    const mockPage = {
      isClosed: () => false,
      url: () => 'https://chatgpt.com',
      evaluate: async () => {
        throw new Error('Some unexpected DOM failure');
      },
      $: async () => null,
    } as any;

    (manager as any).page = mockPage;
    (manager as any).client = {};

    const readiness = await manager.checkProviderReadiness('chatgpt');
    assert.strictEqual(readiness.ready, false);
    assert.strictEqual(readiness.state, 'PROBE_ERROR');
    assert.ok(readiness.reason.includes('DOM probe error'));
  });

  test('checkProviderReadiness accurately classifies LOGIN_REQUIRED when login controls are detected', async () => {
    const mockPage = {
      isClosed: () => false,
      url: () => 'https://chatgpt.com/auth/login',
      evaluate: async () => {
        return {
          title: 'Log in',
          text: 'Log in to ChatGPT',
          hasBody: true,
        };
      },
      $: async () => null,
    } as any;

    (manager as any).page = mockPage;
    (manager as any).client = {};

    const readiness = await manager.checkProviderReadiness('chatgpt');
    assert.strictEqual(readiness.ready, false);
    assert.strictEqual(readiness.state, 'LOGIN_REQUIRED');
  });

  test('checkProviderReadiness accurately classifies SECURITY_CHALLENGE when Cloudflare or captcha is detected', async () => {
    const mockPage = {
      isClosed: () => false,
      url: () => 'https://chatgpt.com',
      evaluate: async () => {
        return {
          title: 'Just a moment...',
          text: 'Verify you are human. Cloudflare challenge.',
          hasBody: true,
        };
      },
      $: async () => null,
    } as any;

    (manager as any).page = mockPage;
    (manager as any).client = {};

    const readiness = await manager.checkProviderReadiness('chatgpt');
    assert.strictEqual(readiness.ready, false);
    assert.strictEqual(readiness.state, 'SECURITY_CHALLENGE');
  });
});

describe('Strict Sequential Generation & Single-Flight Lock', () => {
  let tempDir: string;
  let projectManager: ProjectManager;
  let settingsManager: SettingsManager;
  let orchestrator: QueueOrchestrator;
  let mockProject: ProjectConfig;
  let mockBundle: PromptBundle;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-queue-test-'));
    projectManager = new ProjectManager(tempDir);
    settingsManager = new SettingsManager(tempDir);
    orchestrator = new QueueOrchestrator(projectManager, settingsManager);

    mockProject = {
      id: 'seq-test-1',
      name: 'Sequential Test Project',
      outputPath: path.join(tempDir, 'output'),
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com',
      imageIntervalSeconds: 60,
      targetDurationSeconds: 180,
      aspectRatio: '16:9',
      styleDescription: 'Test Style',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockBundle = {
      schemaVersion: '1.0',
      project: { name: 'Sequential Test Project' },
      prompts: [
        { id: 'IMG-001', sequence: 1, prompt: 'Prompt 1', referenceIds: [] },
        { id: 'IMG-002', sequence: 2, prompt: 'Prompt 2', referenceIds: [] },
        { id: 'IMG-003', sequence: 3, prompt: 'Prompt 3', referenceIds: [] },
      ],
    };

    fs.mkdirSync(mockProject.outputPath, { recursive: true });
    projectManager.saveProjectConfig(mockProject, mockBundle);
    orchestrator.setProject(mockProject, mockBundle);
  });

  afterEach(async () => {
    await orchestrator.stopRun();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('single-flight lock enforces strict sequence: submit -> wait -> download per item', async () => {
    const events: string[] = [];

    const sequentialAdapter: IProviderAdapter = {
      id: 'mock-chatgpt',
      name: 'Mock ChatGPT',
      isDemo: false,
      validateConversationUrl: () => ({ valid: true }),
      isAvailable: async () => ({ available: true }),
      initializeSession: async () => {
        await new Promise((r) => setTimeout(r, 10));
      },
      submitPrompt: async (item) => {
        events.push(`submit:${item.id}`);
        return { success: true };
      },
      waitForGeneration: async (timeout, onProgress, isAbort) => {
        events.push('wait-start');
        await new Promise((r) => setTimeout(r, 40));
        events.push('wait-done');
        return { ready: true, outcome: 'SUCCESS' };
      },
      downloadResult: async (promptId, outputDir) => {
        events.push(`download:${promptId}`);
        const fakeFile = path.join(outputDir, `${promptId}.png`);
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(fakeFile, Buffer.alloc(512));
        return { success: true, filePath: fakeFile, fileSize: 512 };
      },
      closeSession: async () => {},
    };

    (orchestrator as any).adapter = sequentialAdapter;

    // Call startRun twice rapidly to verify single-flight lock
    const run1Promise = orchestrator.startRun();
    const run2Promise = orchestrator.startRun();

    const [res1, res2] = await Promise.all([run1Promise, run2Promise]);

    // One must succeed, one must be rejected by single-flight lock
    assert.ok(res1.success || res2.success);
    assert.ok(!res1.success || !res2.success);

    // Wait for orchestrator processing loop to settle
    const loopPromise = (orchestrator as any).activeLoopPromise;
    if (loopPromise) {
      await loopPromise;
    }

    const manifest = orchestrator.getActiveManifest();
    assert.ok(manifest);
    assert.strictEqual(manifest.overallStatus, 'COMPLETED');
    assert.strictEqual(manifest.savedCount, 3);

    // Strict sequential execution check
    // IMG-001 must finish download before IMG-002 submits
    const img1DownloadIndex = events.indexOf('download:IMG-001');
    const img2SubmitIndex = events.indexOf('submit:IMG-002');
    const img2DownloadIndex = events.indexOf('download:IMG-002');
    const img3SubmitIndex = events.indexOf('submit:IMG-003');

    assert.ok(img1DownloadIndex !== -1, 'IMG-001 must have downloaded');
    assert.ok(img2SubmitIndex > img1DownloadIndex, 'IMG-002 submit must happen AFTER IMG-001 download');
    assert.ok(img2DownloadIndex > img2SubmitIndex, 'IMG-002 download must happen after IMG-002 submit');
    assert.ok(img3SubmitIndex > img2DownloadIndex, 'IMG-003 submit must happen AFTER IMG-002 download');
  });

  test('updateManifestCounts does not count SUBMITTING or GENERATING items as processed (prevents 20% stuck bug)', () => {
    const items: ManifestItem[] = [
      { id: 'IMG-001', sequence: 1, prompt: 'P1', status: 'SUBMITTING', outputFile: null, fileSize: null, referenceIds: [], attempts: 1 },
      { id: 'IMG-002', sequence: 2, prompt: 'P2', status: 'PENDING', outputFile: null, fileSize: null, referenceIds: [], attempts: 0 },
      { id: 'IMG-003', sequence: 3, prompt: 'P3', status: 'PENDING', outputFile: null, fileSize: null, referenceIds: [], attempts: 0 },
      { id: 'IMG-004', sequence: 4, prompt: 'P4', status: 'PENDING', outputFile: null, fileSize: null, referenceIds: [], attempts: 0 },
      { id: 'IMG-005', sequence: 5, prompt: 'P5', status: 'PENDING', outputFile: null, fileSize: null, referenceIds: [], attempts: 0 },
    ];

    const manifest: RunManifest = {
      runId: 'run-1',
      projectId: 'seq-test-1',
      projectName: 'Test',
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com',
      outputPath: tempDir,
      startTime: new Date().toISOString(),
      overallStatus: 'RUNNING',
      totalPrompts: 5,
      processedCount: 0,
      savedCount: 0,
      reviewCount: 0,
      failedCount: 0,
      skippedCount: 0,
      cancelledCount: 0,
      pauseCount: 0,
      wallClockDurationMs: 0,
      activeProcessingDurationMs: 0,
      items,
    };

    (orchestrator as any).activeManifest = manifest;
    (orchestrator as any).updateManifestCounts();

    // processedCount must be 0 because IMG-001 is in flight (SUBMITTING), not terminal!
    assert.strictEqual(manifest.processedCount, 0, 'In-flight item must not be counted in processedCount');
  });

  test('pauses queue when generation times out and provider is still generating (stillGenerating: true)', async () => {
    let submitCount = 0;

    const timeoutAdapter: IProviderAdapter = {
      id: 'mock-chatgpt',
      name: 'Mock ChatGPT',
      isDemo: false,
      validateConversationUrl: () => ({ valid: true }),
      isAvailable: async () => ({ available: true }),
      initializeSession: async () => {},
      submitPrompt: async () => {
        submitCount++;
        return { success: true };
      },
      waitForGeneration: async () => {
        // Simulate provider generation still actively running after timeout
        return {
          ready: false,
          outcome: 'ERROR',
          reason: 'Generation timed out while provider was still generating.',
          stillGenerating: true,
        };
      },
      downloadResult: async () => ({ success: false, error: 'Should not download' }),
      closeSession: async () => {},
    };

    (orchestrator as any).adapter = timeoutAdapter;

    await orchestrator.startRun();

    const loopPromise = (orchestrator as any).activeLoopPromise;
    if (loopPromise) {
      await loopPromise;
    }

    const manifest = orchestrator.getActiveManifest();
    assert.ok(manifest);
    // Queue must pause rather than proceeding to submit IMG-002!
    assert.strictEqual(manifest.overallStatus, 'PAUSED');
    assert.strictEqual(submitCount, 1, 'Only one prompt should have been submitted before halting');

    const item1 = manifest.items.find((i) => i.id === 'IMG-001');
    // P-002/P-005: When provider is still generating, item stays in GENERATING
    // (not NEEDS_REVIEW) so the queue can pause and resume to wait longer.
    assert.strictEqual(item1?.status, 'GENERATING');
    assert.ok(item1?.reviewReason?.includes('still generating'));

    const item2 = manifest.items.find((i) => i.id === 'IMG-002');
    assert.strictEqual(item2?.status, 'PENDING');
  });
});

describe('Preflight Reference Validation', () => {
  let tempDir: string;
  let projectManager: ProjectManager;
  let settingsManager: SettingsManager;
  let orchestrator: QueueOrchestrator;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-ref-test-'));
    projectManager = new ProjectManager(tempDir);
    settingsManager = new SettingsManager(tempDir);
    orchestrator = new QueueOrchestrator(projectManager, settingsManager);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('halts queue before submission when prompt references a non-existent reference file', async () => {
    const mockProject: ProjectConfig = {
      id: 'ref-test-1',
      name: 'Ref Test',
      outputPath: path.join(tempDir, 'output'),
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com',
      imageIntervalSeconds: 60,
      targetDurationSeconds: 60,
      aspectRatio: '16:9',
      styleDescription: 'Test Style',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Prompt references REF-STYLE-01, with reference metadata registered but file missing on disk
    const mockReferences: ReferenceFile[] = [
      {
        id: 'REF-STYLE-01',
        name: 'missing-file.png',
        category: 'style',
        label: 'Style guide',
        size: 1024,
        type: 'image/png',
        path: path.join(tempDir, 'missing-file.png'),
        assignedMode: 'selected',
        assignedPromptIds: ['IMG-001'],
      },
    ];

    const mockBundle: PromptBundle = {
      schemaVersion: '1.0',
      project: { name: 'Ref Test' },
      prompts: [
        { id: 'IMG-001', sequence: 1, prompt: 'Prompt with missing ref', referenceIds: ['REF-STYLE-01'] },
      ],
    };

    fs.mkdirSync(mockProject.outputPath, { recursive: true });
    projectManager.saveProjectConfig(mockProject, mockBundle, mockReferences);
    orchestrator.setProject(mockProject, mockBundle, mockReferences);

    let submitted = false;
    const testAdapter: IProviderAdapter = {
      id: 'mock-chatgpt',
      name: 'Mock ChatGPT',
      isDemo: false,
      validateConversationUrl: () => ({ valid: true }),
      isAvailable: async () => ({ available: true }),
      initializeSession: async () => {},
      submitPrompt: async () => {
        submitted = true;
        return { success: true };
      },
      waitForGeneration: async () => ({ ready: true, outcome: 'SUCCESS' }),
      downloadResult: async () => ({ success: true, filePath: 'x.png' }),
      closeSession: async () => {},
    };

    (orchestrator as any).adapter = testAdapter;

    const startResult = await orchestrator.startRun();

    assert.strictEqual(startResult.success, false);
    assert.strictEqual(submitted, false, 'Prompt should NOT have been submitted when reference is missing');
    assert.ok(startResult.message.includes('REF-STYLE-01'));
  });
});

describe('Startup & Reload Manifest Reconciliation', () => {
  let tempDir: string;
  let projectManager: ProjectManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-reconcile-test-'));
    projectManager = new ProjectManager(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('reconciles project left in RUNNING with in-flight SUBMITTING items to PAUSED and NEEDS_REVIEW', () => {
    const outputDir = path.join(tempDir, 'output');
    fs.mkdirSync(outputDir, { recursive: true });

    const mockProject: ProjectConfig = {
      id: 'frozen-proj',
      name: 'Frozen Project',
      outputPath: outputDir,
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com',
      imageIntervalSeconds: 60,
      targetDurationSeconds: 180,
      aspectRatio: '16:9',
      styleDescription: 'Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockBundle: PromptBundle = {
      schemaVersion: '1.0',
      project: { name: 'Frozen Project' },
      prompts: [
        { id: 'IMG-001', sequence: 1, prompt: 'P1', referenceIds: [] },
        { id: 'IMG-002', sequence: 2, prompt: 'P2', referenceIds: [] },
      ],
    };

    projectManager.saveProjectConfig(mockProject, mockBundle);

    // Save a manifest simulating an app crash while IMG-001 was SUBMITTING
    const stuckManifest: RunManifest = {
      runId: 'stuck-run-1',
      projectId: 'frozen-proj',
      projectName: 'Frozen Project',
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com',
      outputPath: outputDir,
      startTime: new Date().toISOString(),
      overallStatus: 'RUNNING',
      totalPrompts: 2,
      processedCount: 0,
      savedCount: 0,
      reviewCount: 0,
      failedCount: 0,
      skippedCount: 0,
      cancelledCount: 0,
      pauseCount: 0,
      wallClockDurationMs: 0,
      activeProcessingDurationMs: 0,
      items: [
        { id: 'IMG-001', sequence: 1, prompt: 'P1', status: 'SUBMITTING', outputFile: null, fileSize: null, referenceIds: [], attempts: 1 },
        { id: 'IMG-002', sequence: 2, prompt: 'P2', status: 'PENDING', outputFile: null, fileSize: null, referenceIds: [], attempts: 0 },
      ],
    };

    projectManager.saveManifest(outputDir, stuckManifest);

    // Reconcile
    const recovered = projectManager.reconcileFilesWithManifest(outputDir, stuckManifest);
    assert.ok(recovered);
    assert.strictEqual(recovered.overallStatus, 'PAUSED', 'Overall status should be recovered to PAUSED');

    const item1 = recovered.items.find((i) => i.id === 'IMG-001');
    assert.strictEqual(item1?.status, 'NEEDS_REVIEW', 'Stuck SUBMITTING item without file should be marked NEEDS_REVIEW');
    assert.ok(item1?.reviewReason?.toLowerCase().includes('interrupted'));

    const item2 = recovered.items.find((i) => i.id === 'IMG-002');
    assert.strictEqual(item2?.status, 'PENDING');
  });

  test('recovers in-flight item to SAVED when output image file exists on disk', () => {
    const outputDir = path.join(tempDir, 'output');
    const imagesDir = path.join(outputDir, 'output', 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    // Create an image file on disk in the standard images location
    const savedImagePath = path.join(imagesDir, 'IMG-001.png');
    fs.writeFileSync(savedImagePath, Buffer.alloc(2048));

    const mockProject: ProjectConfig = {
      id: 'saved-proj',
      name: 'Saved Project',
      outputPath: outputDir,
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com',
      imageIntervalSeconds: 60,
      targetDurationSeconds: 60,
      aspectRatio: '16:9',
      styleDescription: 'Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockBundle: PromptBundle = {
      schemaVersion: '1.0',
      project: { name: 'Saved Project' },
      prompts: [{ id: 'IMG-001', sequence: 1, prompt: 'P1', referenceIds: [] }],
    };

    projectManager.saveProjectConfig(mockProject, mockBundle);

    const stuckManifest: RunManifest = {
      runId: 'stuck-run-2',
      projectId: 'saved-proj',
      projectName: 'Saved Project',
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com',
      outputPath: outputDir,
      startTime: new Date().toISOString(),
      overallStatus: 'RUNNING',
      totalPrompts: 1,
      processedCount: 0,
      savedCount: 0,
      reviewCount: 0,
      failedCount: 0,
      skippedCount: 0,
      cancelledCount: 0,
      pauseCount: 0,
      wallClockDurationMs: 0,
      activeProcessingDurationMs: 0,
      items: [
        { id: 'IMG-001', sequence: 1, prompt: 'P1', status: 'DOWNLOADING', outputFile: savedImagePath, fileSize: null, referenceIds: [], attempts: 1 },
      ],
    };

    projectManager.saveManifest(outputDir, stuckManifest);

    const recovered = projectManager.reconcileFilesWithManifest(outputDir, stuckManifest);
    assert.ok(recovered);
    const item1 = recovered?.items.find((i) => i.id === 'IMG-001');
    assert.strictEqual(item1?.status, 'SAVED');
    assert.strictEqual(item1?.fileSize, 2048);
    assert.strictEqual(recovered?.overallStatus, 'COMPLETED');
  });
});
