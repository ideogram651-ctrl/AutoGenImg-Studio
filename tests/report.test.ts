import test from 'node:test';
import assert from 'node:assert/strict';
import { generateHtmlReport, escapeHtml, formatDuration } from '../src/server/reportGenerator.ts';
import { RunManifest } from '../src/types/index.ts';

test('escapeHtml prevents XSS injection', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml('prompt & "quotes"'), 'prompt &amp; &quot;quotes&quot;');
});

test('formatDuration formats milliseconds cleanly', () => {
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(undefined), '—');
  assert.equal(formatDuration(500), '500ms');
  assert.equal(formatDuration(4500), '4.5s');
  assert.equal(formatDuration(125000), '2m 5s');
});

test('generateHtmlReport produces valid self-contained HTML with exact item count', () => {
  const manifest: RunManifest = {
    runId: 'run-test-01',
    projectId: 'proj-123',
    projectName: 'Demo Project',
    provider: 'simulation',
    conversationUrl: 'https://demo.local',
    outputPath: '/tmp/demo',
    startTime: '2026-10-27T12:00:00.000Z',
    endTime: '2026-10-27T12:02:00.000Z',
    overallStatus: 'COMPLETED',
    totalPrompts: 3,
    processedCount: 3,
    savedCount: 2,
    reviewCount: 1,
    failedCount: 0,
    skippedCount: 0,
    cancelledCount: 0,
    pauseCount: 0,
    wallClockDurationMs: 120000,
    activeProcessingDurationMs: 110000,
    items: [
      {
        id: 'IMG-001',
        sequence: 1,
        prompt: 'Scene one description',
        status: 'SAVED',
        outputFile: '/tmp/demo/output/images/IMG-001.svg',
        fileSize: 2048,
        referenceIds: ['REF-STYLE-01'],
        generationDurationMs: 3000,
        downloadDurationMs: 400,
        totalDurationMs: 3400,
        attempts: 1,
      },
      {
        id: 'IMG-002',
        sequence: 2,
        prompt: 'Scene two ambiguous description',
        status: 'NEEDS_REVIEW',
        outputFile: null,
        fileSize: null,
        referenceIds: [],
        reviewReason: 'Generation ended with ambiguity warning',
        suggestedAction: 'Inspect provider chat',
        attempts: 1,
      },
      {
        id: 'IMG-003',
        sequence: 3,
        prompt: 'Scene three description',
        status: 'SAVED',
        outputFile: '/tmp/demo/output/images/IMG-003.svg',
        fileSize: 2100,
        referenceIds: [],
        generationDurationMs: 3200,
        downloadDurationMs: 350,
        totalDurationMs: 3550,
        attempts: 1,
      },
    ],
  };

  const html = generateHtmlReport(manifest);
  assert.ok(html.includes('<!doctype html>'), 'Must start with doctype');
  assert.ok(html.includes('Demo Project'), 'Must include project name');
  assert.ok(html.includes('run-test-01'), 'Must include run ID');
  assert.ok(html.includes('IMG-001'), 'Must include prompt IMG-001');
  assert.ok(html.includes('IMG-002'), 'Must include prompt IMG-002');
  assert.ok(html.includes('IMG-003'), 'Must include prompt IMG-003');
  assert.ok(html.includes('NEEDS_REVIEW'), 'Must show NEEDS_REVIEW badge');
  assert.ok(html.includes('Saved Images'), 'Must have summary metrics');
  assert.ok(html.includes('REF-STYLE-01'), 'Must show reference pills');
});
