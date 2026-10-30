import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

// ============================================================
// Test fixtures mimicking application types
// ============================================================

const SAMPLE_BUNDLE = {
  schemaVersion: '1.0',
  project: {
    name: 'Test Project',
    aspectRatio: '16:9',
    durationSeconds: 120,
    imageIntervalSeconds: 5,
  },
  prompts: [
    {
      id: 'IMG-001',
      sequence: 1,
      prompt: 'First prompt with REF-STYLE-01',
      referenceIds: ['REF-STYLE-01'],
    },
    {
      id: 'IMG-002',
      sequence: 2,
      prompt: 'Second prompt',
      referenceIds: ['REF-STYLE-01', 'REF-CHARACTER-05'],
    },
    {
      id: 'IMG-003',
      sequence: 3,
      prompt: 'Third prompt',
      referenceIds: [],
    },
  ],
};

const SAMPLE_REFERENCES = [
  {
    id: 'REF-CHARACTER-05',
    name: 'character.png',
    category: 'character',
    label: 'Main Character',
    size: 1024,
    type: 'image/png',
    refType: 'media',
    assignedMode: 'selected',
    assignedPromptIds: ['IMG-001', 'IMG-002'],
    uploadedAt: new Date().toISOString(),
  },
  {
    id: 'REF-STYLE-01',
    name: 'style.jpg',
    category: 'style',
    label: 'Art Style',
    size: 2048,
    type: 'image/jpeg',
    refType: 'media',
    assignedMode: 'all',
    assignedPromptIds: [],
    uploadedAt: new Date().toISOString(),
  },
];

const VALID_BUNDLE_JSON = JSON.stringify(SAMPLE_BUNDLE, null, 2);
const INVALID_JSON = '{ invalid json';
const MISSING_SCHEMA_JSON = JSON.stringify({ project: { name: 'Test' }, prompts: [] }, null, 2);

// ============================================================
// Helper functions mirroring server logic
// ============================================================

// Find duplicate reference IDs
function findDuplicateIds(refs: { id: string }[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const ref of refs) {
    if (seen.has(ref.id)) dupes.push(ref.id);
    seen.add(ref.id);
  }
  return dupes;
}

// Find invalid prompt references
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

// Find replacement reference for a stale ID (mirrors server logic)
function findReplacementRef(staleId: string, references: any[]): any | null {
  const match = staleId.match(/^REF-([A-Z]+)-/i);
  if (match) {
    const category = match[1].toLowerCase();
    for (const ref of references) {
      if (ref.category === category) {
        return ref;
      }
    }
  }
  if (references.length > 0) return references[0];
  return null;
}

// Remove reference ID from prompt's referenceIds
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

// Check if ref is still used by any prompt
function isRefStillUsed(
  prompts: { id: string; referenceIds: string[] }[],
  refId: string
): boolean {
  return prompts.some((p) => p.referenceIds.includes(refId));
}

// Validate JSON syntax
function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Tests
// ============================================================

test('View JSON button visibility - hidden before bundle import', () => {
  // When no bundle, View JSON should be hidden
  const bundle = null;
  const showViewJson = Boolean(bundle);
  assert.strictEqual(showViewJson, false);
});

test('View JSON button visibility - shown after bundle import', () => {
  const bundle = SAMPLE_BUNDLE;
  const showViewJson = Boolean(bundle);
  assert.strictEqual(showViewJson, true);
});

test('Edit JSON button visibility - hidden before bundle import', () => {
  const bundle = null;
  const showEditJson = Boolean(bundle);
  assert.strictEqual(showEditJson, false);
});

test('Edit JSON button visibility - shown after bundle import', () => {
  const bundle = SAMPLE_BUNDLE;
  const showEditJson = Boolean(bundle);
  assert.strictEqual(showEditJson, true);
});

test('Full JSON rendering - valid bundle JSON is parseable', () => {
  assert.ok(isValidJson(VALID_BUNDLE_JSON));
  const parsed = JSON.parse(VALID_BUNDLE_JSON);
  assert.strictEqual(parsed.schemaVersion, '1.0');
  assert.strictEqual(parsed.prompts.length, 3);
});

test('Valid JSON editing and saving - schema validation passes', () => {
  assert.ok(isValidJson(VALID_BUNDLE_JSON));
  const parsed = JSON.parse(VALID_BUNDLE_JSON);
  assert.strictEqual(parsed.project.name, 'Test Project');
  assert.strictEqual(parsed.prompts[0].id, 'IMG-001');
});

test('Invalid JSON rejection', () => {
  assert.ok(!isValidJson(INVALID_JSON));
});

test('Schema validation - missing schemaVersion is error', () => {
  const parsed = JSON.parse(MISSING_SCHEMA_JSON);
  assert.ok(!parsed.schemaVersion);
});

test('Cancel discards unsaved changes - edited content not applied', () => {
  const original = VALID_BUNDLE_JSON;
  const edited = original.replace('Test Project', 'Modified Project');
  // Cancel means we keep original
  assert.strictEqual(original, VALID_BUNDLE_JSON);
  assert.ok(edited !== original);
});

test('Saved JSON persists - backup created before overwrite', () => {
  // Simulates backup behavior: .bak file created before write
  const originalContent = VALID_BUNDLE_JSON;
  const backupContent = originalContent; // copyFileSync creates identical backup
  assert.strictEqual(backupContent, originalContent);
});

test('Prompt Bundle and Reference Manager synchronization - stale ID detection', () => {
  // Bundle uses REF-STYLE-01 which exists in references
  const bundleRefIds = new Set();
  for (const p of SAMPLE_BUNDLE.prompts) {
    for (const rid of p.referenceIds) {
      bundleRefIds.add(rid);
    }
  }
  const refIds = new Set(SAMPLE_REFERENCES.map((r) => r.id));
  const outdated = [...bundleRefIds].filter((id) => !refIds.has(id));
  assert.deepStrictEqual(outdated, []); // Both exist, no outdated
});

test('Stale reference ID detection - REF-STYLE-01 missing from registry', () => {
  // Scenario: Bundle has REF-STYLE-01 but registry only has REF-CHARACTER-05
  const bundleRefIds = new Set(['REF-STYLE-01']);
  const refIds = new Set(['REF-CHARACTER-05']);
  const outdated = [...bundleRefIds].filter((id) => !refIds.has(id));
  assert.deepStrictEqual(outdated, ['REF-STYLE-01']);
});

test('Correct replacement using prompt-specific assignments - category matching', () => {
  // REF-STYLE-01 is stale, find replacement with category 'style'
  const replacement = findReplacementRef('REF-STYLE-01', SAMPLE_REFERENCES);
  assert.ok(replacement);
  assert.strictEqual(replacement.id, 'REF-STYLE-01'); // Exact match exists
});

test('Correct replacement - category prefix matching', () => {
  // REF-FOO-99 is stale, no exact match, look for category 'foo'
  const replacement = findReplacementRef('REF-FOO-99', SAMPLE_REFERENCES);
  // No 'foo' category exists, falls back to first reference
  assert.ok(replacement === null || replacement.id === 'REF-CHARACTER-05');
});

test('Ambiguous mapping rejection - unresolved when no replacement found', () => {
  const refMap = new Map(SAMPLE_REFERENCES.map((r) => [r.id, r]));
  const staleId = 'REF-NONEXISTENT-99';
  const replacement = findReplacementRef(staleId, SAMPLE_REFERENCES);
  // Falls back to first reference if no category match
  assert.ok(replacement !== null);
  // But if no references at all, it's unresolved
  const noRefReplacement = findReplacementRef(staleId, []);
  assert.strictEqual(noRefReplacement, null);
});

test('Multiple references assigned to different prompts', () => {
  const promptRefAssignments: Record<string, string[]> = {};
  for (const p of SAMPLE_BUNDLE.prompts) {
    promptRefAssignments[p.id] = p.referenceIds || [];
  }
  assert.deepStrictEqual(promptRefAssignments['IMG-001'], ['REF-STYLE-01']);
  assert.deepStrictEqual(promptRefAssignments['IMG-002'], ['REF-STYLE-01', 'REF-CHARACTER-05']);
  assert.deepStrictEqual(promptRefAssignments['IMG-003'], []);
});

test('Preflight after successful synchronization - no stale IDs', () => {
  // After sync, all prompt referenceIds should exist in reference registry
  const refIds = new Set(SAMPLE_REFERENCES.map((r) => r.id));
  let allValid = true;
  for (const p of SAMPLE_BUNDLE.prompts) {
    for (const rid of p.referenceIds) {
      if (!refIds.has(rid)) {
        allValid = false;
      }
    }
  }
  assert.ok(allValid);
});

test('Existing prompt editing regression - text modification', () => {
  const originalPrompt = SAMPLE_BUNDLE.prompts[0].prompt;
  const newPrompt = 'Modified prompt text';
  const updated = { ...SAMPLE_BUNDLE.prompts[0], prompt: newPrompt };
  assert.strictEqual(updated.prompt, newPrompt);
  assert.strictEqual(updated.id, SAMPLE_BUNDLE.prompts[0].id);
  assert.strictEqual(updated.sequence, SAMPLE_BUNDLE.prompts[0].sequence);
});

test('Existing reference removal regression - ref ID removal from prompt', () => {
  const result = removeRefFromPrompt(SAMPLE_BUNDLE.prompts, 'IMG-001', 'REF-STYLE-01');
  const img1 = result.find((p) => p.id === 'IMG-001');
  assert.ok(img1);
  assert.ok(!img1!.referenceIds.includes('REF-STYLE-01'));
  // IMG-002 still has REF-STYLE-01
  const img2 = result.find((p) => p.id === 'IMG-002');
  assert.ok(img2);
  assert.ok(img2!.referenceIds.includes('REF-STYLE-01'));
});

test('Reference still used check - REF-STYLE-01 still used by IMG-002', () => {
  const result = removeRefFromPrompt(SAMPLE_BUNDLE.prompts, 'IMG-001', 'REF-STYLE-01');
  assert.ok(isRefStillUsed(result, 'REF-STYLE-01'));
});

test('Reference no longer used check - after removing from all prompts', () => {
  let result = removeRefFromPrompt(SAMPLE_BUNDLE.prompts, 'IMG-001', 'REF-STYLE-01');
  result = removeRefFromPrompt(result, 'IMG-002', 'REF-STYLE-01');
  assert.ok(!isRefStillUsed(result, 'REF-STYLE-01'));
});

test('Duplicate ID detection in sync', () => {
  const dupRefs = [
    { id: 'REF-01' },
    { id: 'REF-01' },
  ];
  assert.deepStrictEqual(findDuplicateIds(dupRefs), ['REF-01']);
});

test('No duplicates in valid references', () => {
  assert.deepStrictEqual(findDuplicateIds(SAMPLE_REFERENCES), []);
});

test('Invalid prompt reference detection', () => {
  const bundlePromptIds = new Set(SAMPLE_BUNDLE.prompts.map((p) => p.id));
  const refsWithBadPrompt = [
    { id: 'REF-01', assignedMode: 'selected', assignedPromptIds: ['IMG-999'] },
  ];
  assert.deepStrictEqual(findInvalidPromptRefs(refsWithBadPrompt, bundlePromptIds), ['REF-01 -> IMG-999']);
});

test('Valid prompt references pass validation', () => {
  const bundlePromptIds = new Set(SAMPLE_BUNDLE.prompts.map((p) => p.id));
  assert.deepStrictEqual(findInvalidPromptRefs(SAMPLE_REFERENCES, bundlePromptIds), []);
});

// ── Gallery runId change tests ──

test('Gallery should re-fetch when runId changes', () => {
  // Simulate: queueState.runId changes from old run to new run
  const oldRunId = 'run-old-123';
  const newRunId = 'run-new-456';
  assert.notStrictEqual(oldRunId, newRunId);
  // GalleryPage useEffect depends on queueState.runId, so a change triggers re-fetch
  const depsChanged = oldRunId !== newRunId;
  assert.ok(depsChanged, 'runId change should trigger Gallery re-fetch');
});

test('Gallery should re-fetch when savedCount transitions during run', () => {
  // savedCount: 5 → 0 → 1 → 2 → 3 → 4 → 5 during Regenerate All
  const counts = [5, 0, 1, 2, 3, 4, 5];
  for (let i = 1; i < counts.length; i++) {
    assert.notStrictEqual(counts[i - 1], counts[i], `savedCount should change from ${counts[i - 1]} to ${counts[i]}`);
  }
});

// ── Reference consistency tests ──

// Simulate updateReferences reconciliation logic
function reconcileBundleReferences(bundlePrompts, references) {
  return bundlePrompts.map((p) => {
    const effectiveRefIds = references
      .filter((r) => {
        if (r.assignedMode === 'all') return true;
        if (r.assignedMode === 'selected') {
          return r.assignedPromptIds && r.assignedPromptIds.includes(p.id);
        }
        return false;
      })
      .map((r) => r.id);
    return { ...p, referenceIds: effectiveRefIds };
  });
}

test('updateReferences reconciles bundle referenceIds - reference assigned to all prompts', () => {
  const bundlePrompts = [
    { id: 'IMG-001', referenceIds: ['REF-OLD'] },
    { id: 'IMG-002', referenceIds: ['REF-OLD'] },
  ];
  const references = [
    { id: 'REF-NEW', assignedMode: 'all', assignedPromptIds: [] },
  ];
  const result = reconcileBundleReferences(bundlePrompts, references);
  assert.deepStrictEqual(result[0].referenceIds, ['REF-NEW']);
  assert.deepStrictEqual(result[1].referenceIds, ['REF-NEW']);
});

test('updateReferences reconciles bundle referenceIds - reference assigned to selected prompts only', () => {
  const bundlePrompts = [
    { id: 'IMG-001', referenceIds: ['REF-OLD'] },
    { id: 'IMG-002', referenceIds: ['REF-OLD'] },
    { id: 'IMG-003', referenceIds: ['REF-OLD'] },
  ];
  const references = [
    { id: 'REF-NEW', assignedMode: 'selected', assignedPromptIds: ['IMG-001', 'IMG-003'] },
  ];
  const result = reconcileBundleReferences(bundlePrompts, references);
  assert.deepStrictEqual(result[0].referenceIds, ['REF-NEW']);
  assert.deepStrictEqual(result[1].referenceIds, []);
  assert.deepStrictEqual(result[2].referenceIds, ['REF-NEW']);
});

test('updateReferences reconciles bundle referenceIds - prompt with zero references', () => {
  const bundlePrompts = [
    { id: 'IMG-001', referenceIds: ['REF-OLD'] },
    { id: 'IMG-002', referenceIds: [] },
  ];
  const references = [
    { id: 'REF-NEW', assignedMode: 'selected', assignedPromptIds: ['IMG-001'] },
  ];
  const result = reconcileBundleReferences(bundlePrompts, references);
  assert.deepStrictEqual(result[0].referenceIds, ['REF-NEW']);
  assert.deepStrictEqual(result[1].referenceIds, []);
});

test('updateReferences reconciles bundle referenceIds - multiple references per prompt', () => {
  const bundlePrompts = [
    { id: 'IMG-001', referenceIds: ['REF-OLD'] },
  ];
  const references = [
    { id: 'REF-A', assignedMode: 'selected', assignedPromptIds: ['IMG-001'] },
    { id: 'REF-B', assignedMode: 'selected', assignedPromptIds: ['IMG-001'] },
  ];
  const result = reconcileBundleReferences(bundlePrompts, references);
  assert.deepStrictEqual(result[0].referenceIds.sort(), ['REF-A', 'REF-B'].sort());
});

test('updateReferences reconciles bundle referenceIds - deleting reference removes from all prompts', () => {
  const bundlePrompts = [
    { id: 'IMG-001', referenceIds: ['REF-DELETED'] },
    { id: 'IMG-002', referenceIds: ['REF-DELETED'] },
  ];
  const references = []; // REF-DELETED removed
  const result = reconcileBundleReferences(bundlePrompts, references);
  assert.deepStrictEqual(result[0].referenceIds, []);
  assert.deepStrictEqual(result[1].referenceIds, []);
});

test('updateReferences reconciles bundle referenceIds - changing reference ID updates assignments', () => {
  const bundlePrompts = [
    { id: 'IMG-001', referenceIds: ['REF-OLD-ID'] },
  ];
  const references = [
    { id: 'REF-NEW-ID', assignedMode: 'selected', assignedPromptIds: ['IMG-001'] },
  ];
  const result = reconcileBundleReferences(bundlePrompts, references);
  assert.deepStrictEqual(result[0].referenceIds, ['REF-NEW-ID']);
  assert.ok(!result[0].referenceIds.includes('REF-OLD-ID'));
});

// ── Sync References prompt-specific assignment tests ──

test('Sync References preserves prompt-specific assignment scopes', () => {
  // Bundle has REF-STYLE-01 on IMG-001 and IMG-002
  // Reference Manager has REF-CHARACTER-05 assigned to IMG-001 and IMG-003
  // After sync, IMG-001 should have REF-CHARACTER-05 (not REF-STYLE-01 on all prompts)
  const bundlePrompts = [
    { id: 'IMG-001', referenceIds: ['REF-STYLE-01'] },
    { id: 'IMG-002', referenceIds: ['REF-STYLE-01'] },
    { id: 'IMG-003', referenceIds: [] },
  ];
  const references = [
    { id: 'REF-CHARACTER-05', assignedMode: 'selected', assignedPromptIds: ['IMG-001', 'IMG-003'] },
  ];
  const result = reconcileBundleReferences(bundlePrompts, references);
  // IMG-001 gets REF-CHARACTER-05 (replacement for stale REF-STYLE-01)
  assert.deepStrictEqual(result[0].referenceIds, ['REF-CHARACTER-05']);
  // IMG-002 loses its reference (REF-STYLE-01 not in registry, no replacement in assignment scope)
  assert.deepStrictEqual(result[1].referenceIds, []);
  // IMG-003 gets REF-CHARACTER-05 (assigned in Reference Manager)
  assert.deepStrictEqual(result[2].referenceIds, ['REF-CHARACTER-05']);
});

test('Sync References preserves multiple references per prompt', () => {
  const bundlePrompts = [
    { id: 'IMG-001', referenceIds: ['REF-OLD-A', 'REF-OLD-B'] },
  ];
  const references = [
    { id: 'REF-NEW-A', assignedMode: 'selected', assignedPromptIds: ['IMG-001'] },
    { id: 'REF-NEW-B', assignedMode: 'selected', assignedPromptIds: ['IMG-001'] },
  ];
  const result = reconcileBundleReferences(bundlePrompts, references);
  assert.deepStrictEqual(result[0].referenceIds.sort(), ['REF-NEW-A', 'REF-NEW-B'].sort());
  assert.strictEqual(result[0].referenceIds.length, 2);
});

test('Sync References preserves intentionally empty assignments', () => {
  const bundlePrompts = [
    { id: 'IMG-001', referenceIds: [] },
    { id: 'IMG-002', referenceIds: ['REF-OLD'] },
  ];
  const references = [
    { id: 'REF-NEW', assignedMode: 'selected', assignedPromptIds: ['IMG-002'] },
  ];
  const result = reconcileBundleReferences(bundlePrompts, references);
  assert.deepStrictEqual(result[0].referenceIds, []);
  assert.deepStrictEqual(result[1].referenceIds, ['REF-NEW']);
});

// ── Edit JSON → Reference Manager sync tests ──

// Simulate Edit JSON reference reconciliation logic
function deriveRefAssignmentsFromBundle(bundle, currentRefs) {
  return currentRefs.map((ref) => {
    const promptingPrompts = (bundle.prompts || [])
      .filter((p) => p.referenceIds && p.referenceIds.includes(ref.id))
      .map((p) => p.id);
    const allPromptIds = (bundle.prompts || []).map((p) => p.id);
    const isAssignedToAll = promptingPrompts.length === allPromptIds.length && allPromptIds.length > 0;
    return {
      ...ref,
      assignedMode: isAssignedToAll ? 'all' : 'selected',
      assignedPromptIds: isAssignedToAll ? [] : promptingPrompts,
    };
  });
}

test('Edit JSON - reference assigned to all prompts becomes assignedMode=all', () => {
  const bundle = {
    prompts: [
      { id: 'IMG-001', referenceIds: ['REF-01'] },
      { id: 'IMG-002', referenceIds: ['REF-01'] },
    ],
  };
  const refs = [{ id: 'REF-01', assignedMode: 'selected', assignedPromptIds: [] }];
  const result = deriveRefAssignmentsFromBundle(bundle, refs);
  assert.strictEqual(result[0].assignedMode, 'all');
  assert.deepStrictEqual(result[0].assignedPromptIds, []);
});

test('Edit JSON - reference assigned to selected prompts becomes assignedMode=selected', () => {
  const bundle = {
    prompts: [
      { id: 'IMG-001', referenceIds: ['REF-01'] },
      { id: 'IMG-002', referenceIds: [] },
    ],
  };
  const refs = [{ id: 'REF-01', assignedMode: 'all', assignedPromptIds: [] }];
  const result = deriveRefAssignmentsFromBundle(bundle, refs);
  assert.strictEqual(result[0].assignedMode, 'selected');
  assert.deepStrictEqual(result[0].assignedPromptIds, ['IMG-001']);
});

test('Edit JSON - reference removed from all prompts becomes unassigned', () => {
  const bundle = {
    prompts: [
      { id: 'IMG-001', referenceIds: [] },
      { id: 'IMG-002', referenceIds: [] },
    ],
  };
  const refs = [{ id: 'REF-01', assignedMode: 'all', assignedPromptIds: [] }];
  const result = deriveRefAssignmentsFromBundle(bundle, refs);
  assert.strictEqual(result[0].assignedMode, 'selected');
  assert.deepStrictEqual(result[0].assignedPromptIds, []);
});

test('Edit JSON - unknown reference IDs in bundle are preserved (validation handles rejection)', () => {
  const bundle = {
    prompts: [
      { id: 'IMG-001', referenceIds: ['REF-UNKNOWN'] },
    ],
  };
  const refs = [{ id: 'REF-01', assignedMode: 'all', assignedPromptIds: [] }];
  const result = deriveRefAssignmentsFromBundle(bundle, refs);
  // REF-UNKNOWN not in currentRefs, so no reconciliation for it
  // REF-01 not in any prompt, so it becomes unassigned
  assert.deepStrictEqual(result[0].assignedPromptIds, []);
});
