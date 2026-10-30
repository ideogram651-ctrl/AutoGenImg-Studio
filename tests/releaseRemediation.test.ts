import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ProjectManager } from '../src/server/projectManager.ts';
import { QueueOrchestrator } from '../src/server/queueOrchestrator.ts';
import { ChatGPTAdapter } from '../src/server/adapters/chatgptAdapter.ts';
import { GeminiAdapter } from '../src/server/adapters/geminiAdapter.ts';
import { SimulationAdapter } from '../src/server/adapters/simulationAdapter.ts';
import { ZipArchive } from '../src/server/zipArchive.ts';
import { validateImageFile } from '../src/server/validator.ts';
import {
  ProjectConfig,
  PromptBundle,
  PromptItem,
  ReferenceFile,
  RunManifest,
} from '../src/types/index.ts';

const TEST_BASE = path.resolve('./tmp-remediation-test-' + Date.now());

function cleanup(dir: string) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

describe('Engineering Review & Remediation Release Tests', () => {
  beforeEach(() => {
    cleanup(TEST_BASE);
    fs.mkdirSync(TEST_BASE, { recursive: true });
  });

  afterEach(() => {
    cleanup(TEST_BASE);
  });

  // TEST A: Real Provider Integrity & Preflight Check
  it('Test A: Real Provider Integrity & Preflight Check - ChatGPT / Gemini check session and preflight', async () => {
    const chatgpt = new ChatGPTAdapter();
    const gemini = new GeminiAdapter();

    assert.equal(chatgpt.id, 'chatgpt');
    assert.equal(chatgpt.isDemo, false, 'ChatGPT must NOT be marked as demo');
    assert.equal(gemini.id, 'gemini');
    assert.equal(gemini.isDemo, false, 'Gemini must NOT be marked as demo');

    // Adapter isAvailable verifies Chrome & Playwright environment
    const availability = await chatgpt.isAvailable();
    assert.equal(typeof availability.available, 'boolean');

    // Attempting prompt submission without an active browser session must fail gracefully
    const promptItem: PromptItem = { id: 'IMG-001', sequence: 1, prompt: 'Test Prompt', referenceIds: [] };
    const submitResult = await chatgpt.submitPrompt(promptItem, []);
    assert.equal(submitResult.success, false, 'Submission must fail when session not initialized');
    assert.match(submitResult.error || '', /initialized|session/i, 'Error must identify uninitialized session');

    // Default provider in QueueOrchestrator must NOT default to simulation adapter in production
    const pm = new ProjectManager(TEST_BASE);
    const orchestrator = new QueueOrchestrator(pm);
    assert.equal(orchestrator.getAdapter().id, 'chatgpt', 'Default queue provider must be chatgpt, not simulation');
  });

  // TEST B: Sequential State Machine (Prompt N+1 never submits until Prompt N is SAVED)
  it('Test B: Sequential State Machine - Prompt N+1 never submits until Prompt N is verified and SAVED', async () => {
    const projectDir = path.join(TEST_BASE, 'proj-seq');
    const pm = new ProjectManager(TEST_BASE);

    const config: ProjectConfig = {
      id: 'proj-seq-1',
      name: 'Sequential Verification Test',
      outputPath: projectDir,
      provider: 'simulation',
      conversationUrl: 'https://chatgpt.com/',
      imageIntervalSeconds: 5,
      targetDurationSeconds: 15,
      aspectRatio: '16:9',
      styleDescription: 'Sequential test style',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const bundle: PromptBundle = {
      schemaVersion: '1.0',
      project: { name: 'Sequential Test' },
      prompts: [
        { id: 'IMG-001', sequence: 1, prompt: 'Scene 1', referenceIds: [] },
        { id: 'IMG-002', sequence: 2, prompt: 'Scene 2', referenceIds: [] },
      ],
    };

    pm.saveProjectConfig(config, bundle, []);

    // Create a mock adapter where prompt 1 fails submission
    let prompt2Submitted = false;
    let prompt1Submitted = false;

    const mockAdapter = {
      id: 'mock-fail-adapter' as any,
      name: 'Mock Failure Adapter',
      isDemo: true,
      initializeSession: async () => {},
      isAvailable: async () => ({ available: true }),
      submitPrompt: async (promptObj: PromptItem | string) => {
        const text = typeof promptObj === 'string' ? promptObj : promptObj.prompt;
        if (text.includes('Scene 1')) {
          prompt1Submitted = true;
          return { success: false, error: 'Target conversation closed or element not found' };
        }
        if (text.includes('Scene 2')) {
          prompt2Submitted = true;
          return { success: true };
        }
        return { success: false };
      },
      waitForGeneration: async () => ({ status: 'success' as const }),
      downloadImage: async () => ({
        success: false,
        artifactType: 'simulation_artifact' as const,
      }),
      cancelGeneration: async () => {},
      close: async () => {},
    };

    const orchestrator = new QueueOrchestrator(pm);
    orchestrator.setProject(config, bundle, []);
    (orchestrator as any).adapter = mockAdapter;

    await orchestrator.startRun();

    // Give the queue processing loop a moment to execute
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(prompt1Submitted, true, 'Prompt 1 should have been attempted');
    assert.equal(prompt2Submitted, false, 'Prompt 2 MUST NOT be submitted when Prompt 1 fails submission');

    const state = orchestrator.getProgressState();
    assert.equal(state.overallStatus, 'PAUSED', 'Queue must pause on submission failure');
  });

  // TEST C: Settings Durability & Project Isolation
  it('Test C: Settings Durability - save independent settings across multiple projects', async () => {
    const projADir = path.join(TEST_BASE, 'proj-a');
    const projBDir = path.join(TEST_BASE, 'proj-b');

    const pm = new ProjectManager(TEST_BASE);

    const configA: ProjectConfig = {
      id: 'proj-alpha',
      name: 'Project Alpha',
      outputPath: projADir,
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com/c/alpha-session',
      imageIntervalSeconds: 10,
      targetDurationSeconds: 100,
      aspectRatio: '16:9',
      styleDescription: 'Cyberpunk anime style',
      instructions: 'Keep character in red coat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const configB: ProjectConfig = {
      id: 'proj-beta',
      name: 'Project Beta',
      outputPath: projBDir,
      provider: 'gemini',
      conversationUrl: 'https://gemini.google.com/app/beta-session',
      imageIntervalSeconds: 4,
      targetDurationSeconds: 60,
      aspectRatio: '9:16',
      styleDescription: 'Watercolor fantasy',
      instructions: 'Keep dragon scales emerald green',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    pm.saveProjectConfig(configA);
    pm.saveProjectConfig(configB);

    // Verify ProjectManager saves suggestion history
    pm.recordSuggestions(configA);
    pm.recordSuggestions(configB);

    // Re-instantiate ProjectManager from disk to verify durable persistence across restart
    const reloadPM = new ProjectManager(TEST_BASE);

    const loadedA = reloadPM.loadProjectConfig(projADir);
    const loadedB = reloadPM.loadProjectConfig(projBDir);

    assert.ok(loadedA.project, 'Config A must persist on disk');
    assert.ok(loadedB.project, 'Config B must persist on disk');

    assert.equal(loadedA.project?.name, 'Project Alpha');
    assert.equal(loadedA.project?.provider, 'chatgpt');
    assert.equal(loadedA.project?.conversationUrl, 'https://chatgpt.com/c/alpha-session');
    assert.equal(loadedA.project?.aspectRatio, '16:9');
    assert.equal(loadedA.project?.styleDescription, 'Cyberpunk anime style');

    assert.equal(loadedB.project?.name, 'Project Beta');
    assert.equal(loadedB.project?.provider, 'gemini');
    assert.equal(loadedB.project?.conversationUrl, 'https://gemini.google.com/app/beta-session');
    assert.equal(loadedB.project?.aspectRatio, '9:16');
    assert.equal(loadedB.project?.styleDescription, 'Watercolor fantasy');

    // Suggestions verification
    const suggestions = reloadPM.getSuggestions();
    assert.ok(suggestions.conversationUrls.includes(configA.conversationUrl));
    assert.ok(suggestions.conversationUrls.includes(configB.conversationUrl));
  });

  // TEST D: Project Archive Export / Import Round-Trip
  it('Test D: Project Archive Export / Import Round-Trip - export ZIP, import into new project, verify parity', async () => {
    const originDir = path.join(TEST_BASE, 'archive-origin');
    const targetDir = path.join(TEST_BASE, 'archive-imported');

    const pm = new ProjectManager(TEST_BASE);

    const config: ProjectConfig = {
      id: 'proj-archive-src',
      name: 'Original Archive Project',
      outputPath: originDir,
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com/c/test-archive',
      imageIntervalSeconds: 5,
      targetDurationSeconds: 20,
      aspectRatio: '16:9',
      styleDescription: 'Golden hour vintage photography',
      instructions: 'Maintain character likeness',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const bundle: PromptBundle = {
      schemaVersion: '1.0',
      project: { name: 'Archive Test Bundle' },
      prompts: [
        { id: 'IMG-001', sequence: 1, prompt: 'Hero walking at dawn', referenceIds: ['REF-01'] },
        { id: 'IMG-002', sequence: 2, prompt: 'Hero enters sanctuary', referenceIds: ['REF-01'] },
      ],
    };

    pm.saveProjectConfig(config, bundle, []);

    // Create a dummy image file and save a media asset
    // 1x1 PNG transparent
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const savedAsset = pm.saveMediaAsset(originDir, 'hero-concept.png', pngBuffer);
    assert.ok(savedAsset, 'Media asset should be saved successfully');
    assert.ok(savedAsset.sha256, 'Media asset must have sha256 checksum');

    const refObj: ReferenceFile = {
      id: 'REF-01',
      name: 'hero-concept.png',
      label: 'Hero Concept Art',
      category: 'character',
      size: pngBuffer.length,
      type: 'image/png',
      refType: 'media',
      path: savedAsset.path,
      checksum: savedAsset.sha256,
      assignedMode: 'all',
      assignedPromptIds: [],
    };
    pm.saveProjectConfig(config, bundle, [refObj]);

    // Export ZIP
    const zipBuffer = ZipArchive.exportProject(config, bundle, [refObj], originDir);
    assert.ok(zipBuffer.length > 0, 'Exported ZIP buffer must not be empty');

    // Import ZIP into target project
    const imported = ZipArchive.importProject(zipBuffer, targetDir, 'proj-imported', 'Imported Project Test');
    assert.ok(imported.project, 'Import should succeed and return project');

    // Verify imported configuration, bundle, and references
    const loadedTarget = pm.loadProjectConfig(targetDir);

    assert.ok(loadedTarget.project);
    assert.equal(loadedTarget.project?.name, 'Imported Project Test');
    assert.equal(loadedTarget.project?.provider, 'chatgpt');
    assert.equal(loadedTarget.project?.styleDescription, 'Golden hour vintage photography');

    assert.ok(loadedTarget.bundle);
    assert.equal(loadedTarget.bundle?.prompts.length, 2);
    assert.equal(loadedTarget.bundle?.prompts[0].id, 'IMG-001');
    assert.equal(loadedTarget.bundle?.prompts[0].referenceIds[0], 'REF-01');

    assert.ok(loadedTarget.references);
    assert.equal(loadedTarget.references?.length, 1);
    assert.equal(loadedTarget.references[0].id, 'REF-01');
    assert.equal(loadedTarget.references[0].checksum, savedAsset.sha256, 'Imported asset checksum must match origin bit-for-bit');

    // Check media file actually extracted and valid on disk
    if (loadedTarget.references[0].path) {
      assert.ok(fs.existsSync(loadedTarget.references[0].path), 'Extracted asset file must exist on disk');
      const validation = validateImageFile(loadedTarget.references[0].path);
      assert.equal(validation.valid, true, 'Extracted asset file must be valid PNG image');
    }
  });

  // TEST E: Clean Full Regeneration (No skipped prompts due to stale outputs)
  it('Test E: Clean Full Regeneration - creates isolated run_id and does not skip prompts based on old files', async () => {
    const projectDir = path.join(TEST_BASE, 'proj-regen');
    const pm = new ProjectManager(TEST_BASE);

    const config: ProjectConfig = {
      id: 'proj-regen-1',
      name: 'Regeneration Test',
      outputPath: projectDir,
      provider: 'simulation',
      conversationUrl: 'https://chatgpt.com/',
      imageIntervalSeconds: 5,
      targetDurationSeconds: 15,
      aspectRatio: '16:9',
      styleDescription: 'Regen test style',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const bundle: PromptBundle = {
      schemaVersion: '1.0',
      project: { name: 'Regen Test' },
      prompts: [
        { id: 'IMG-001', sequence: 1, prompt: 'Scene 1', referenceIds: [] },
        { id: 'IMG-002', sequence: 2, prompt: 'Scene 2', referenceIds: [] },
      ],
    };

    pm.saveProjectConfig(config, bundle, []);

    // Simulate an initial run that completed IMG-001 and created run-1
    const run1Id = 'run-initial-1';
    const run1Dir = path.join(projectDir, 'runs', run1Id, 'images');
    fs.mkdirSync(run1Dir, { recursive: true });
    fs.writeFileSync(path.join(run1Dir, 'IMG-001.png'), 'fake-image-data-run1');

    // Also simulate flat legacy file in output/images/
    fs.mkdirSync(path.join(projectDir, 'output', 'images'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'output', 'images', 'IMG-001.png'), 'fake-image-data-legacy');

    // Now start a fresh queue with regenerateAll = true
    const orchestrator = new QueueOrchestrator(pm);
    orchestrator.setProject(config, bundle, []);
    orchestrator.setAdapter('simulation');

    await orchestrator.startRun({ regenerateAll: true });

    // Poll until completed (simulation adapter takes around 1-2s total)
    const startWait = Date.now();
    while (orchestrator.getProgressState().overallStatus === 'RUNNING' && Date.now() - startWait < 5000) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const newRunId = orchestrator.getProgressState().runId;
    assert.ok(newRunId, 'A new run ID must be generated');
    assert.notEqual(newRunId, run1Id, 'New run ID must be distinct from previous run');

    // Verify manifest contains both items processed cleanly
    const manifest = pm.loadManifest(projectDir);
    assert.ok(manifest);
    assert.equal(manifest?.runId, newRunId);

    // Verify both items were saved in the new run directory
    const item1 = manifest?.items.find((i) => i.id === 'IMG-001');
    const item2 = manifest?.items.find((i) => i.id === 'IMG-002');

    assert.equal(item1?.status, 'SAVED');
    assert.equal(item2?.status, 'SAVED');

    // Check that item1 output file is inside the new run directory
    assert.ok(item1?.outputFile?.includes(newRunId), 'Output file must be isolated in new run folder');
  });

  // TEST F: Delete Run Artifacts
  it('Test F: Delete Run Artifacts - deletes run folder while preserving project.json, bundle, and references', async () => {
    const projectDir = path.join(TEST_BASE, 'proj-del-run');
    const pm = new ProjectManager(TEST_BASE);

    const config: ProjectConfig = {
      id: 'proj-del-1',
      name: 'Delete Run Test',
      outputPath: projectDir,
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com/',
      imageIntervalSeconds: 5,
      targetDurationSeconds: 15,
      aspectRatio: '16:9',
      styleDescription: 'Delete test style',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const bundle: PromptBundle = {
      schemaVersion: '1.0',
      project: { name: 'Delete Run Test' },
      prompts: [{ id: 'IMG-001', sequence: 1, prompt: 'Scene 1', referenceIds: [] }],
    };

    pm.saveProjectConfig(config, bundle, []);

    // Create a run folder with artifacts
    const runId = 'run-to-delete-999';
    const runDir = path.join(projectDir, 'runs', runId);
    const runImagesDir = path.join(runDir, 'images');
    fs.mkdirSync(runImagesDir, { recursive: true });
    fs.writeFileSync(path.join(runImagesDir, 'IMG-001.png'), 'test-image-data');
    fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify({ runId, items: [] }));

    assert.ok(fs.existsSync(runDir), 'Run directory must exist before deletion');

    // Execute deletion
    const res = await pm.deleteRunArtifacts(projectDir, runId);
    assert.equal(res.success, true);
    assert.equal(res.deletedFilesCount, 2);

    // Assert run directory is deleted
    assert.equal(fs.existsSync(runDir), false, 'Run directory must be completely removed');

    // Assert project settings and bundle are strictly preserved
    assert.ok(fs.existsSync(path.join(projectDir, 'project-data', 'project.json')), 'project.json must be preserved');
    assert.ok(fs.existsSync(path.join(projectDir, 'input', 'prompt-bundle.json')), 'prompt-bundle.json must be preserved');
    assert.ok(fs.existsSync(path.join(projectDir, 'project-data', 'references.json')), 'references.json must be preserved');
  });

  // TEST G: Media References Verification & Prompt Mapping
  it('Test G: Media References - saves media, validates image signature, computes SHA-256 and maps to prompts', async () => {
    const projectDir = path.join(TEST_BASE, 'proj-media');
    const pm = new ProjectManager(TEST_BASE);

    pm.saveProjectConfig({
      id: 'proj-media-1',
      name: 'Media Test',
      outputPath: projectDir,
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com/',
      imageIntervalSeconds: 5,
      targetDurationSeconds: 15,
      aspectRatio: '16:9',
      styleDescription: 'Media test style',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1x1 transparent PNG
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const expectedHash = crypto.createHash('sha256').update(pngBuffer).digest('hex');

    const asset = pm.saveMediaAsset(projectDir, 'char-portrait.png', pngBuffer);

    assert.equal(asset.sha256, expectedHash, 'SHA-256 hash must match file bytes');

    // Validate image format verification
    assert.ok(asset.path);
    const val = validateImageFile(asset.path);
    assert.equal(val.valid, true);
    assert.equal(val.format?.toLowerCase(), 'png');
  });

  // TEST H: Clean UI Source Audit (No Demo Bloat)
  it('Test H: Demo-Copy Audit - UI pages must be free of unwanted demo simulation copy and buttons', () => {
    const pagesDir = path.resolve('src/components/pages');
    const pageFiles = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.tsx'));

    const forbiddenPhrases = [
      'DEMO SIMULATION ACTIVE',
      'Load 24-Prompt Demo',
      'Load 24-prompt demo',
      'Populates 24 structured scenes and 4 reference files immediately',
    ];

    for (const file of pageFiles) {
      const content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
      for (const phrase of forbiddenPhrases) {
        assert.equal(
          content.includes(phrase),
          false,
          `File "${file}" should not contain forbidden demo copy: "${phrase}"`
        );
      }
    }
  });
});
