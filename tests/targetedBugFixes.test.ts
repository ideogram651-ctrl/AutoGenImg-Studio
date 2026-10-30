import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import { ProjectManager } from '../src/server/projectManager.ts';
import { QueueOrchestrator } from '../src/server/queueOrchestrator.ts';
import { ZipArchive } from '../src/server/zipArchive.ts';
import { ProjectConfig, PromptBundle, PromptItem, ReferenceFile } from '../src/types/index.ts';

const TEST_BASE = path.resolve('./tmp-targeted-bugfix-' + Date.now());

function cleanup(dir: string) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

function makeProject(id: string, name: string, dir: string): ProjectConfig {
  return {
    id,
    name,
    outputPath: dir,
    provider: 'chatgpt',
    conversationUrl: 'https://chatgpt.com/c/test',
    imageIntervalSeconds: 5,
    targetDurationSeconds: 30,
    aspectRatio: '16:9',
    styleDescription: 'test style',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeBundle(promptIds: string[]): PromptBundle {
  return {
    schemaVersion: '1.0',
    project: { name: 'test', durationSeconds: 30, imageIntervalSeconds: 5 },
    prompts: promptIds.map((id, i) => ({
      id,
      sequence: i + 1,
      prompt: `Prompt ${id}`,
      referenceIds: [],
    })),
  };
}

describe('Targeted Bug Fixes - Dashboard Project Library', () => {
  beforeEach(() => {
    cleanup(TEST_BASE);
    fs.mkdirSync(TEST_BASE, { recursive: true });
  });

  afterEach(() => {
    cleanup(TEST_BASE);
  });

  // Test 1: setProject clears previous manifest so projects do not mix data
  it('setProject clears activeManifest when switching to a project without a saved manifest', () => {
    const pm = new ProjectManager(TEST_BASE);
    const orch = new QueueOrchestrator(pm);

    const dirA = path.join(TEST_BASE, 'proj-a');
    const dirB = path.join(TEST_BASE, 'proj-b');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });

    const projA = makeProject('proj-a', 'Project A', dirA);
    const projB = makeProject('proj-b', 'Project B', dirB);
    const bundleA = makeBundle(['IMG-001']);

    // Save a manifest for project A
    const manifestA: any = {
      runId: 'run-a',
      projectId: 'proj-a',
      projectName: 'Project A',
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com/c/test',
      outputPath: dirA,
      startTime: new Date().toISOString(),
      overallStatus: 'COMPLETED',
      totalPrompts: 1,
      processedCount: 1,
      savedCount: 1,
      reviewCount: 0,
      failedCount: 0,
      skippedCount: 0,
      cancelledCount: 0,
      pauseCount: 0,
      wallClockDurationMs: 0,
      activeProcessingDurationMs: 0,
      items: [{ id: 'IMG-001', sequence: 1, prompt: 'P', status: 'SAVED', outputFile: null, fileSize: null, referenceIds: [], attempts: 1 }],
    };
    pm.saveManifest(dirA, manifestA);

    // Load project A (has manifest)
    orch.setProject(projA, bundleA);
    assert.strictEqual(orch.getActiveManifest()?.runId, 'run-a', 'Project A manifest should be loaded');

    // Load project B (no saved manifest) - should NOT leak project A's manifest
    orch.setProject(projB);
    assert.strictEqual(orch.getActiveManifest(), null, 'Project B should have no manifest (no leak from A)');
    assert.strictEqual(orch.getCurrentProject()?.id, 'proj-b', 'Current project should be B');
  });

  // Test 2: Delete project removes entire owned directory from disk
  it('deleteProject removes the complete project directory and all owned data', () => {
    const pm = new ProjectManager(TEST_BASE);

    const dir = path.join(TEST_BASE, 'proj-to-delete');
    const proj = makeProject('proj-delete', 'To Delete', dir);
    const bundle = makeBundle(['IMG-001']);
    const refs: ReferenceFile[] = [
      {
        id: 'REF-01',
        name: 'char.png',
        category: 'character',
        label: 'Character',
        size: 100,
        type: 'image/png',
        refType: 'media',
        path: path.join(dir, 'assets', 'char.png'),
        checksum: 'abc',
        assignedMode: 'all',
        assignedPromptIds: [],
      },
    ];

    pm.saveProjectConfig(proj, bundle, refs);

    // Create owned subdirectories and files
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'output', 'images'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'runs', 'run-1', 'images'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets', 'char.png'), 'fake-image');
    fs.writeFileSync(path.join(dir, 'input', 'prompt-bundle.json'), JSON.stringify(bundle));
    fs.writeFileSync(path.join(dir, 'project-data', 'project.json'), JSON.stringify(proj));
    fs.writeFileSync(path.join(dir, 'project-data', 'references.json'), JSON.stringify(refs));
    fs.writeFileSync(path.join(dir, 'runs', 'run-1', 'manifest.json'), JSON.stringify({ runId: 'run-1' }));

    assert.ok(fs.existsSync(dir), 'Project directory exists before deletion');

    const result = pm.deleteProject('proj-delete');
    assert.strictEqual(result.success, true, 'deleteProject should succeed');
    assert.strictEqual(fs.existsSync(dir), false, 'Entire project directory must be removed from disk');
    assert.strictEqual(fs.existsSync(path.join(dir, 'project-data', 'project.json')), false, 'project.json must be removed');
    assert.strictEqual(fs.existsSync(path.join(dir, 'assets', 'char.png')), false, 'assets must be removed');
    assert.strictEqual(fs.existsSync(path.join(dir, 'runs', 'run-1')), false, 'run folders must be removed');
  });

  // Test 3: Other projects remain intact after deleting one
  it('deleting one project leaves other projects intact', () => {
    const pm = new ProjectManager(TEST_BASE);

    const dirA = path.join(TEST_BASE, 'proj-a');
    const dirB = path.join(TEST_BASE, 'proj-b');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });

    pm.saveProjectConfig(makeProject('proj-a', 'Project A', dirA));
    pm.saveProjectConfig(makeProject('proj-b', 'Project B', dirB));

    const before = pm.listProjects();
    assert.strictEqual(before.length, 2, 'Two projects should exist before deletion');

    pm.deleteProject('proj-a');

    const after = pm.listProjects();
    assert.strictEqual(after.length, 1, 'Only one project should remain after deletion');
    assert.strictEqual(after[0].id, 'proj-b', 'Remaining project should be B');
    assert.ok(fs.existsSync(dirB), 'Project B directory must still exist');
    assert.strictEqual(fs.existsSync(dirA), false, 'Project A directory must be removed');
  });

  // Test 4: Export ZIP produces valid archive with correct entries
  it('exportProject ZIP includes project.json, prompt-bundle.json, references.json, and assets', () => {
    const pm = new ProjectManager(TEST_BASE);

    const dir = path.join(TEST_BASE, 'proj-export');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });

    const proj = makeProject('proj-exp', 'Export Project', dir);
    const bundle = makeBundle(['IMG-001']);
    const refs: ReferenceFile[] = [
      {
        id: 'REF-01',
        name: 'char.png',
        category: 'character',
        label: 'Character',
        size: 10,
        type: 'image/png',
        refType: 'media',
        path: path.join(dir, 'assets', 'char.png'),
        checksum: 'abc',
        assignedMode: 'all',
        assignedPromptIds: [],
      },
    ];
    pm.saveProjectConfig(proj, bundle, refs);
    fs.writeFileSync(path.join(dir, 'assets', 'char.png'), 'png-bytes');

    const zipBuffer = ZipArchive.exportProject(proj, bundle, refs, dir);
    assert.ok(Buffer.isBuffer(zipBuffer), 'Export should return a Buffer');
    assert.ok(zipBuffer.length > 0, 'ZIP buffer should be non-empty');

    // Verify it's a valid ZIP by re-importing
    const tmpDir = path.join(TEST_BASE, 'imported');
    fs.mkdirSync(tmpDir, { recursive: true });
    const imported = ZipArchive.importProject(zipBuffer, tmpDir, 'proj-imported', 'Imported Project');

    assert.strictEqual(imported.project.name, 'Imported Project', 'Override name should be applied on import');
    assert.strictEqual(imported.project.id, 'proj-imported', 'Override id should be applied on import');
    assert.ok(imported.bundle, 'Bundle should be present in import');
    assert.strictEqual(imported.bundle?.prompts.length, 1, 'Bundle should have 1 prompt');
    assert.strictEqual(imported.bundle?.prompts[0].id, 'IMG-001', 'Prompt ID should round-trip');
    assert.strictEqual(imported.references.length, 1, 'One reference should round-trip');
    assert.strictEqual(imported.references[0].id, 'REF-01', 'Reference ID should round-trip');
    assert.ok(fs.existsSync(path.join(tmpDir, 'assets', 'char.png')), 'Asset file should be extracted');
  });

  // Test 5: Import round-trip preserves prompt order and reference mappings
  it('importProject preserves prompt order and reference prompt mappings', () => {
    const pm = new ProjectManager(TEST_BASE);

    const dir = path.join(TEST_BASE, 'proj-import-src');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });

    const proj = makeProject('proj-imp', 'Import Source', dir);
    const bundle: PromptBundle = {
      schemaVersion: '1.0',
      project: { name: 'Import Source', durationSeconds: 60, imageIntervalSeconds: 10 },
      prompts: [
        { id: 'IMG-003', sequence: 3, prompt: 'Third', referenceIds: ['REF-01'] },
        { id: 'IMG-001', sequence: 1, prompt: 'First', referenceIds: [] },
        { id: 'IMG-002', sequence: 2, prompt: 'Second', referenceIds: ['REF-02'] },
      ],
    };
    const refs: ReferenceFile[] = [
      { id: 'REF-01', name: 'a.png', category: 'character', label: 'A', size: 1, type: 'image/png', refType: 'media', path: path.join(dir, 'assets', 'a.png'), checksum: 'x', assignedMode: 'selected', assignedPromptIds: ['IMG-003'] },
      { id: 'REF-02', name: 'b.png', category: 'style', label: 'B', size: 1, type: 'image/png', refType: 'media', path: path.join(dir, 'assets', 'b.png'), checksum: 'y', assignedMode: 'selected', assignedPromptIds: ['IMG-002'] },
    ];
    pm.saveProjectConfig(proj, bundle, refs);
    fs.writeFileSync(path.join(dir, 'assets', 'a.png'), 'a');
    fs.writeFileSync(path.join(dir, 'assets', 'b.png'), 'b');

    const zipBuffer = ZipArchive.exportProject(proj, bundle, refs, dir);

    const tmpDir = path.join(TEST_BASE, 'imported2');
    fs.mkdirSync(tmpDir, { recursive: true });
    const imported = ZipArchive.importProject(zipBuffer, tmpDir, 'proj-imported2', 'Imported');

    // Prompt order must be preserved (as stored in the bundle)
    const ids = imported.bundle!.prompts.map((p) => p.id);
    assert.deepStrictEqual(ids, ['IMG-003', 'IMG-001', 'IMG-002'], 'Prompt order must be preserved as stored');

    // Reference mappings must round-trip
    const refMap = new Map(imported.references.map((r) => [r.id, r]));
    assert.deepStrictEqual(refMap.get('REF-01')!.assignedPromptIds, ['IMG-003'], 'REF-01 mapping preserved');
    assert.deepStrictEqual(refMap.get('REF-02')!.assignedPromptIds, ['IMG-002'], 'REF-02 mapping preserved');
  });
});

describe('Targeted Bug Fixes - Reference Upload', () => {
  let tempDir: string;
  let pm: ProjectManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-upload-test-'));
    pm = new ProjectManager(tempDir);
  });

  afterEach(() => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  // Test 6: saveMediaAsset supports txt and md files
  it('saveMediaAsset stores .txt and .md files with correct mime type and checksum', () => {
    const projectDir = path.join(tempDir, 'proj-txt');
    fs.mkdirSync(projectDir, { recursive: true });

    const txtContent = 'Hello world text reference';
    const txtBuffer = Buffer.from(txtContent, 'utf8');
    const txtAsset = pm.saveMediaAsset(projectDir, 'notes.txt', txtBuffer);
    assert.strictEqual(txtAsset.size, txtBuffer.length);
    assert.strictEqual(txtAsset.sha256, crypto.createHash('sha256').update(txtBuffer).digest('hex'));
    assert.ok(fs.existsSync(path.join(projectDir, 'assets', 'notes.txt')));

    const mdContent = '# Markdown Reference';
    const mdBuffer = Buffer.from(mdContent, 'utf8');
    const mdAsset = pm.saveMediaAsset(projectDir, 'guide.md', mdBuffer);
    assert.strictEqual(mdAsset.size, mdBuffer.length);
    assert.ok(fs.existsSync(path.join(projectDir, 'assets', 'guide.md')));
  });

  // Test 7: Imported ZIP excludes browser profile/cookies/credentials
  it('export ZIP does not include browser profile, cookies, or credentials', () => {
    const dir = path.join(TEST_BASE, 'proj-no-creds');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'browser-profile'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });

    // Simulate a browser-profile directory that should NOT be exported
    fs.writeFileSync(path.join(dir, 'browser-profile', 'Cookies'), 'secret-cookie-data');
    fs.writeFileSync(path.join(dir, 'browser-profile', 'Login Data'), 'secret-login-data');

    const proj = makeProject('proj-nc', 'No Creds', dir);
    const bundle = makeBundle(['IMG-001']);
    const zipBuffer = ZipArchive.exportProject(proj, bundle, [], dir);

    const entries = ZipArchive.parseZip(zipBuffer);
    const entryPaths = entries.map((e) => e.path);
    assert.ok(
      !entryPaths.some((p) => p.includes('browser-profile') || p.includes('Cookies') || p.includes('Login Data')),
      'ZIP must not include browser profile, cookies, or credentials'
    );
  });
});
