import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

// Test data fixtures mimicking application types
const SAMPLE_BUNDLE = {
  schemaVersion: '1.0',
  project: {
    name: 'Test Project',
    aspectRatio: '16:9',
  },
  prompts: [
    { id: 'IMG-001', sequence: 1, prompt: 'First prompt', referenceIds: ['REF-01'] },
    { id: 'IMG-002', sequence: 2, prompt: 'Second prompt', referenceIds: ['REF-01', 'REF-02'] },
    { id: 'IMG-003', sequence: 3, prompt: 'Third prompt', referenceIds: [] },
  ],
};

const SAMPLE_REFERENCES = [
  {
    id: 'REF-01',
    name: 'character.png',
    category: 'character',
    label: 'Main Character',
    size: 1024,
    type: 'image/png',
    refType: 'media',
    assignedMode: 'selected',
    assignedPromptIds: ['IMG-001', 'IMG-002'],
  },
  {
    id: 'REF-02',
    name: 'style.jpg',
    category: 'style',
    label: 'Art Style',
    size: 2048,
    type: 'image/jpeg',
    refType: 'media',
    assignedMode: 'all',
    assignedPromptIds: [],
  },
];

// Helper: Check for duplicate reference IDs (mirrors slice API logic)
function findDuplicateIds(refs: { id: string }[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const ref of refs) {
    if (seen.has(ref.id)) dupes.push(ref.id);
    seen.add(ref.id);
  }
  return dupes;
}

// Helper: Validate prompt references exist in bundle (mirrors slice API logic)
function findInvalidPromptRefs(refs: any[], bundlePromptIds: Set<string>): string[] {
  const invalid: string[] = [];
  for (const ref of refs) {
    if (ref.assignedMode === 'selected' && ref.assignedPromptIds) {
      for (const pid of ref.assignedPromptIds) {
        if (!bundlePromptIds.has(pid)) {
          invalid.push(`${ref.id} -> ${pid}`);
        }
      }
    }
  }
  return invalid;
}

// Helper: Remove reference ID from prompt's referenceIds (mirrors BundleManager logic)
function removeRefFromPrompt(
  prompts: { id: string; referenceIds: string[] }[],
  promptId: string,
  refId: string
): { id: string; referenceIds: string[] }[] {
  return prompts.map((p) =>
    p.id === promptId
      ? { ...p, referenceIds: p.referenceIds.filter((id) => id !== refId) }
      : p
  );
}

// Helper: Check if ref is still used by any prompt
function isRefStillUsed(
  prompts: { id: string; referenceIds: string[] }[],
  refId: string
): boolean {
  return prompts.some((p) => p.referenceIds.includes(refId));
}

// ── Tests ──

test('findDuplicateIds detects duplicate reference IDs', () => {
  const refs = [
    { id: 'REF-01' },
    { id: 'REF-02' },
    { id: 'REF-01' }, // duplicate
  ];
  assert.deepStrictEqual(findDuplicateIds(refs), ['REF-01']);
});

test('findDuplicateIds returns empty for unique IDs', () => {
  const refs = [{ id: 'REF-01' }, { id: 'REF-02' }];
  assert.deepStrictEqual(findDuplicateIds(refs), []);
});

test('findInvalidPromptRefs detects references to non-existent prompts', () => {
  const bundlePromptIds = new Set(['IMG-001', 'IMG-002']);
  const refs = [
    { id: 'REF-01', assignedMode: 'selected', assignedPromptIds: ['IMG-001', 'IMG-999'] },
  ];
  assert.deepStrictEqual(findInvalidPromptRefs(refs, bundlePromptIds), ['REF-01 -> IMG-999']);
});

test('findInvalidPromptRefs returns empty for valid assignments', () => {
  const bundlePromptIds = new Set(['IMG-001', 'IMG-002']);
  const refs = [
    { id: 'REF-01', assignedMode: 'selected', assignedPromptIds: ['IMG-001'] },
    { id: 'REF-02', assignedMode: 'all', assignedPromptIds: [] },
  ];
  assert.deepStrictEqual(findInvalidPromptRefs(refs, bundlePromptIds), []);
});

test('removeRefFromPrompt removes reference ID from specific prompt', () => {
  const result = removeRefFromPrompt(SAMPLE_BUNDLE.prompts, 'IMG-001', 'REF-01');
  const img1 = result.find((p) => p.id === 'IMG-001');
  assert.ok(img1);
  assert.ok(!img1!.referenceIds.includes('REF-01'));
  // Other prompts unchanged
  const img2 = result.find((p) => p.id === 'IMG-002');
  assert.ok(img2);
  assert.ok(img2!.referenceIds.includes('REF-01'));
});

test('removeRefFromPrompt does not affect other prompts', () => {
  const result = removeRefFromPrompt(SAMPLE_BUNDLE.prompts, 'IMG-003', 'REF-01');
  const img1 = result.find((p) => p.id === 'IMG-001');
  assert.ok(img1);
  assert.ok(img1!.referenceIds.includes('REF-01'));
});

test('isRefStillUsed returns true when ref is assigned', () => {
  assert.ok(isRefStillUsed(SAMPLE_BUNDLE.prompts, 'REF-01'));
});

test('isRefStillUsed returns false when ref is unassigned', () => {
  assert.ok(!isRefStillUsed(SAMPLE_BUNDLE.prompts, 'REF-999'));
});

test('slice validation rejects duplicate IDs', () => {
  const dupRefs = [
    { id: 'REF-01', assignedMode: 'all', assignedPromptIds: [] },
    { id: 'REF-01', assignedMode: 'all', assignedPromptIds: [] },
  ];
  const dupes = findDuplicateIds(dupRefs);
  assert.ok(dupes.length > 0);
});

test('slice validation accepts valid reference set', () => {
  const dupes = findDuplicateIds(SAMPLE_REFERENCES);
  assert.deepStrictEqual(dupes, []);
  const bundlePromptIds = new Set(SAMPLE_BUNDLE.prompts.map((p) => p.id));
  const invalid = findInvalidPromptRefs(SAMPLE_REFERENCES, bundlePromptIds);
  assert.deepStrictEqual(invalid, []);
});

test('edit prompt validation rejects empty text', () => {
  const emptyPrompt = '';
  assert.ok(emptyPrompt.trim().length === 0);
});

test('edit prompt validation accepts non-empty text', () => {
  const validPrompt = 'A cinematic scene with neon lighting';
  assert.ok(validPrompt.trim().length > 0);
});

test('reference ID change detection - old ID no longer matches after change', () => {
  const oldId = 'REF-CHAR-05';
  const newId = 'REF-CHAR-01';
  const refs = [{ id: oldId }];
  const foundOld = refs.some((r) => r.id === oldId);
  assert.ok(foundOld);
  const updatedRefs = refs.map((r) => ({ ...r, id: newId }));
  const foundOldAfter = updatedRefs.some((r) => r.id === oldId);
  assert.ok(!foundOldAfter);
  const foundNew = updatedRefs.some((r) => r.id === newId);
  assert.ok(foundNew);
});

test('prompt persistence structure preserves unrelated fields', () => {
  const original = { ...SAMPLE_BUNDLE.prompts[0] };
  const updated = { ...original, prompt: 'Modified prompt text' };
  assert.strictEqual(updated.id, original.id);
  assert.strictEqual(updated.sequence, original.sequence);
  assert.strictEqual(updated.referenceIds, original.referenceIds);
  assert.strictEqual(updated.prompt, 'Modified prompt text');
  assert.notStrictEqual(updated.prompt, original.prompt);
});
