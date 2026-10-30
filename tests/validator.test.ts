import { describe, it, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validatePromptBundle, calculateExpectedImageCount } from '../src/server/validator.ts';

test('calculateExpectedImageCount calculates exact intervals', () => {
  assert.equal(calculateExpectedImageCount(120, 5), 24);
  assert.equal(calculateExpectedImageCount(60, 5), 12);
});

test('calculateExpectedImageCount handles remainder partial intervals', () => {
  assert.equal(calculateExpectedImageCount(122, 5), 25);
  assert.equal(calculateExpectedImageCount(1, 5), 1);
  assert.equal(calculateExpectedImageCount(0, 5), 0);
  assert.equal(calculateExpectedImageCount(100, 0), 0);
});

test('validatePromptBundle accepts valid canonical bundle', () => {
  const validBundle = {
    schemaVersion: '1.0',
    project: {
      name: 'Cyberpunk Noir Video',
      durationSeconds: 10,
      imageIntervalSeconds: 5,
      aspectRatio: '16:9',
      styleDescription: 'Dark cinematic neo-noir',
    },
    prompts: [
      {
        id: 'IMG-001',
        sequence: 1,
        startSeconds: 0,
        endSeconds: 5,
        prompt: 'Detective standing under neon rain in alleyway',
        referenceIds: ['REF-STYLE-01'],
      },
      {
        id: 'IMG-002',
        sequence: 2,
        startSeconds: 5,
        endSeconds: 10,
        prompt: 'Holographic billboard flickering over crowded street',
        referenceIds: [],
      },
    ],
  };

  const refs = [
    {
      id: 'REF-STYLE-01',
      name: 'noir_palette.png',
      category: 'style' as const,
      label: 'Neon Noir Palette',
      size: 1024,
      type: 'image/png',
      assignedMode: 'all' as const,
      assignedPromptIds: [],
    },
  ];

  const result = validatePromptBundle(validBundle, refs);
  assert.equal(result.valid, true);
  assert.equal(result.promptCount, 2);
  assert.equal(result.calculatedImageCount, 2);
  assert.equal(result.errors.length, 0);
});

test('validatePromptBundle catches duplicate prompt IDs', () => {
  const duplicateBundle = {
    schemaVersion: '1.0',
    project: { name: 'Test' },
    prompts: [
      { id: 'IMG-001', sequence: 1, prompt: 'First' },
      { id: 'IMG-001', sequence: 2, prompt: 'Second' },
    ],
  };

  const result = validatePromptBundle(duplicateBundle);
  assert.equal(result.valid, false);
  const dupError = result.errors.find((e) => e.message.includes('Duplicate Prompt ID'));
  assert.ok(dupError, 'Should report duplicate ID');
});

test('validatePromptBundle catches empty prompt text and invalid sequence', () => {
  const invalidBundle = {
    schemaVersion: '1.0',
    project: { name: 'Test' },
    prompts: [
      { id: 'IMG-001', sequence: 0, prompt: '' },
    ],
  };

  const result = validatePromptBundle(invalidBundle);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === 'sequence'));
  assert.ok(result.errors.some((e) => e.field === 'prompt'));
});

test('validatePromptBundle catches invalid time ranges', () => {
  const invalidTimeBundle = {
    schemaVersion: '1.0',
    project: { name: 'Test' },
    prompts: [
      { id: 'IMG-001', sequence: 1, prompt: 'Valid prompt', startSeconds: 10, endSeconds: 5 },
    ],
  };

  const result = validatePromptBundle(invalidTimeBundle);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === 'endSeconds'));
});

import {
  validateTextFile,
  validateJsonFile,
  validateVideoFile,
  validateReferenceFile,
  validateImageFile,
} from '../src/server/validator.ts';
import fs from 'node:fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';

function writeTempFile(dir: string, name: string, content: Buffer | string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function makeValidPng(): Buffer {
  // Minimal valid PNG (8-byte signature + IHDR + IEND)
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]); // length + type
  const ihdrData = Buffer.alloc(13, 0); // 1x1 image, 8-bit, RGB
  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return Buffer.concat([sig, ihdr, ihdrData, iend]);
}

function makeValidMp4(): Buffer {
  // Minimal MP4 with ftyp box
  const ftypSize = Buffer.from([0x00, 0x00, 0x00, 0x14]); // 20 bytes
  const ftypType = Buffer.from('ftyp', 'ascii');
  const majorBrand = Buffer.from('isom', 'ascii');
  const minorVersion = Buffer.alloc(4, 0);
  const compatibleBrands = Buffer.alloc(0);
  return Buffer.concat([ftypSize, ftypType, majorBrand, minorVersion, compatibleBrands]);
}

describe('validateTextFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-validate-text-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('accepts a valid .txt file', () => {
    const filePath = writeTempFile(tmpDir, 'notes.txt', 'Hello world text reference');
    const result = validateTextFile(filePath);
    assert.equal(result.valid, true);
    assert.equal(result.format, 'Text');
    assert.equal(result.mimeType, 'text/plain');
    assert.equal(result.sizeBytes, 26);
  });

  it('accepts a valid .md file', () => {
    const filePath = writeTempFile(tmpDir, 'guide.md', '# Markdown Reference');
    const result = validateTextFile(filePath);
    assert.equal(result.valid, true);
    assert.equal(result.format, 'Markdown');
    assert.equal(result.mimeType, 'text/markdown');
  });

  it('rejects an empty .txt file', () => {
    const filePath = writeTempFile(tmpDir, 'empty.txt', '');
    const result = validateTextFile(filePath);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('empty'));
  });

  it('rejects a whitespace-only .txt file', () => {
    const filePath = writeTempFile(tmpDir, 'spaces.txt', '   \n  \n');
    const result = validateTextFile(filePath);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('no readable content'));
  });

  it('rejects a non-existent file', () => {
    const result = validateTextFile(path.join(tmpDir, 'does-not-exist.txt'));
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('does not exist'));
  });
});

describe('validateJsonFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-validate-json-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('accepts valid JSON', () => {
    const filePath = writeTempFile(tmpDir, 'config.json', JSON.stringify({ style: 'cinematic', palette: ['#000', '#fff'] }));
    const result = validateJsonFile(filePath);
    assert.equal(result.valid, true);
    assert.equal(result.format, 'JSON');
    assert.equal(result.mimeType, 'application/json');
  });

  it('rejects invalid JSON with filename context', () => {
    const filePath = writeTempFile(tmpDir, 'bad.json', '{ invalid json');
    const result = validateJsonFile(filePath);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('bad.json'));
    assert.ok(result.error?.includes('Invalid JSON'));
  });

  it('rejects an empty .json file', () => {
    const filePath = writeTempFile(tmpDir, 'empty.json', '');
    const result = validateJsonFile(filePath);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('empty'));
  });

  it('does not modify the original file content', () => {
    const original = JSON.stringify({ key: 'value', num: 42 });
    const filePath = writeTempFile(tmpDir, 'original.json', original);
    validateJsonFile(filePath);
    const after = fs.readFileSync(filePath, 'utf8');
    assert.equal(after, original);
  });
});

describe('validateVideoFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-validate-video-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('accepts a valid MP4 file', () => {
    const filePath = writeTempFile(tmpDir, 'video.mp4', makeValidMp4());
    const result = validateVideoFile(filePath);
    assert.equal(result.valid, true);
    assert.equal(result.format, 'MP4');
    assert.equal(result.mimeType, 'video/mp4');
  });

  it('rejects a non-MP4 file with .mp4 extension', () => {
    const filePath = writeTempFile(tmpDir, 'fake.mp4', 'this is not mp4');
    const result = validateVideoFile(filePath);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('does not match MP4'));
  });

  it('rejects an empty .mp4 file', () => {
    const filePath = writeTempFile(tmpDir, 'empty.mp4', '');
    const result = validateVideoFile(filePath);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('empty'));
  });

  it('rejects a non-existent file', () => {
    const result = validateVideoFile(path.join(tmpDir, 'does-not-exist.mp4'));
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('does not exist'));
  });
});

describe('validateReferenceFile (dispatcher)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-validate-dispatch-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('dispatches text/plain to validateTextFile', () => {
    const filePath = writeTempFile(tmpDir, 'notes.txt', 'Hello world');
    const result = validateReferenceFile(filePath, 'text/plain');
    assert.equal(result.valid, true);
    assert.equal(result.format, 'Text');
  });

  it('dispatches text/markdown to validateTextFile', () => {
    const filePath = writeTempFile(tmpDir, 'guide.md', '# Guide');
    const result = validateReferenceFile(filePath, 'text/markdown');
    assert.equal(result.valid, true);
    assert.equal(result.format, 'Markdown');
  });

  it('dispatches application/json to validateJsonFile', () => {
    const filePath = writeTempFile(tmpDir, 'data.json', JSON.stringify({ a: 1 }));
    const result = validateReferenceFile(filePath, 'application/json');
    assert.equal(result.valid, true);
    assert.equal(result.format, 'JSON');
  });

  it('dispatches video/mp4 to validateVideoFile', () => {
    const filePath = writeTempFile(tmpDir, 'video.mp4', makeValidMp4());
    const result = validateReferenceFile(filePath, 'video/mp4');
    assert.equal(result.valid, true);
    assert.equal(result.format, 'MP4');
  });

  it('dispatches image/png to validateImageFile', () => {
    const filePath = writeTempFile(tmpDir, 'image.png', makeValidPng());
    const result = validateReferenceFile(filePath, 'image/png');
    assert.equal(result.valid, true);
    assert.equal(result.format, 'PNG');
  });

  it('rejects unsupported MIME type', () => {
    const filePath = writeTempFile(tmpDir, 'file.xyz', 'data');
    const result = validateReferenceFile(filePath, 'application/x-unknown');
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('Unsupported MIME type'));
  });
});

describe('validateImageFile preserves existing behavior', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-validate-image-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('accepts valid PNG', () => {
    const filePath = writeTempFile(tmpDir, 'image.png', makeValidPng());
    const result = validateImageFile(filePath);
    assert.equal(result.valid, true);
    assert.equal(result.format, 'PNG');
  });

  it('rejects a text file with .png extension', () => {
    const filePath = writeTempFile(tmpDir, 'fake.png', 'this is not a png');
    const result = validateImageFile(filePath);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('does not match any recognized image format'));
  });
});
