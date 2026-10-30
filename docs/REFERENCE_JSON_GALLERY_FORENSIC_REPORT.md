# Reference JSON Gallery — Forensic Report

**Project:** AutoGen Image Studio  
**Investigation Date:** 2026-10-30  
**Status:** Phase 1 Complete — Root causes identified

---

## Problem A — Gallery Shows Old Images After Regenerate All

### Root Cause

The GalleryPage component in `src/components/pages/GalleryPage.tsx` uses `queueState.overallStatus` and `queueState.savedCount` as `useEffect` dependency triggers for re-fetching gallery data:

```tsx
useEffect(() => {
  fetchGallery();
}, [queueState.overallStatus, queueState.savedCount, fetchGallery]);
```

After Regenerate All completes, both dependency values return to their pre-Regenerate state:
- `queueState.overallStatus`: `'COMPLETED'` (same as before Regenerate All)
- `queueState.savedCount`: `5` (same as before Regenerate All)

Since React `useEffect` compares primitive dependencies by value, the effect does **not** re-trigger when Regenerate All finishes. The GalleryPage stops fetching during the run (when savedCount transitions 5→0→1→2→3→4→5), but once the run completes, the values match the pre-Regenerate state, so no final re-fetch occurs.

**Additional contributing factor:** The `fetchGallery` callback depends only on `currentProject`:

```tsx
const fetchGallery = useCallback(async () => {
  ...
}, [currentProject]);
```

`currentProject` does not change during Regenerate All (same project), so the callback reference is stable. The component has no dependency on `runId` or the active manifest, so it has no way to know a new run has replaced the old one.

### Evidence

- `queueOrchestrator.startRun()` creates a new `activeManifest` with a new `runId` when `regenerateAll: true`
- `GET /api/gallery` reads from `orchestrator.getActiveManifest()` — which correctly returns the new manifest
- But `GalleryPage` doesn't call `GET /api/gallery` after Regenerate All completes because dependencies don't change
- Images ARE physically saved correctly (verified: new run directory contains new images)
- Image serving API correctly finds images in run directories

### Files Involved

| File | Role |
|------|------|
| `src/components/pages/GalleryPage.tsx` | Frontend gallery fetch and display |
| `src/server/apiRouter.ts` | `GET /api/gallery` endpoint |
| `src/server/queueOrchestrator.ts` | `startRun()` creates new manifest on Regenerate All |
| `src/context/AppContext.tsx` | `regenerateAll()` → `POST /api/queue/regenerate-all` |

---

## Problem B — Reference Manager and Prompt Bundle JSON Show Different Assignments

### Root Cause

Two independent data models track reference assignments, and they are not synchronized:

1. **Reference Manager model** (`currentReferences` in AppContext): Each `ReferenceFile` has `assignedMode` ('all' \| 'selected') and `assignedPromptIds` (string[]). This is the **runtime authority** — `resolveReferencesForPrompt()` uses this to determine which references to attach.

2. **Prompt Bundle model** (`currentBundle.prompts` in AppContext): Each `PromptItem` has its own `referenceIds` (string[]). This is stored in `prompt-bundle.json` and displayed in Bundle Manager / View JSON.

When references are assigned/unassigned in Reference Manager:
- `updateReferences()` updates `currentReferences` in AppContext
- BUT `currentBundle.prompts[i].referenceIds` is **NOT updated** to match
- The JSON file on disk still contains stale `referenceIds`
- Bundle Manager and View JSON show stale assignments
- Sync References only repairs stale IDs (IDs not in registry), not prompt-specific assignment scopes

### Evidence

- `resolveReferencesForPrompt()` (queueOrchestrator.ts line 952) correctly uses `currentReferences` → runtime attachment is correct
- `startRun()` creates manifest items using `resolveReferencesForPrompt()` → manifest referenceIds are correct at runtime
- BUT `currentBundle.prompts` and `prompt-bundle.json` are never updated when Reference Manager assignments change
- `updateReferences()` in AppContext only persists references, doesn't touch bundle

### Files Involved

| File | Role |
|------|------|
| `src/context/AppContext.tsx` | `updateReferences()` — only persists references, doesn't update bundle |
| `src/server/apiRouter.ts` | `/references/save` — only sets references in orchestrator |
| `src/server/queueOrchestrator.ts` | `resolveReferencesForPrompt()` — runtime authority (correct) |
| `src/components/pages/ReferenceManagerPage.tsx` | UI for reference assignment |
| `src/components/pages/BundleManagerPage.tsx` | Displays prompt referenceIds from stale bundle |

---

## Phase 2 Fix Plan

### Fix A — Gallery Active-Run Correction

Add `runId` to GalleryPage's `useEffect` dependencies so it re-fetches whenever a new run starts. Also add `manifest.runId` from AppContext as a dependency.

### Fix B — Reference Assignment Consistency

When `updateReferences()` is called in AppContext, reconcile the Prompt Bundle items' `referenceIds` with the current reference assignments:

1. For each prompt in `currentBundle.prompts`:
   - Determine effective references using `resolveReferencesForPrompt()` logic
   - Update `referenceIds` to match current Reference Manager assignments
2. Persist updated bundle via `updateBundle()`
3. This ensures JSON, Bundle Manager, and Reference Manager all show the same assignments

Also improve Sync References to preserve prompt-specific assignment scopes (not just repair stale IDs).

---

## Confirmed Facts vs Hypotheses

| Item | Status | Evidence |
|------|--------|----------|
| Gallery API returns data from active manifest | Confirmed | `apiRouter.ts` GET /api/gallery uses `orchestrator.getActiveManifest()` |
| Regenerate All creates new manifest with new runId | Confirmed | `queueOrchestrator.ts` startRun() lines 336+ |
| Images are saved to run-isolated directories | Confirmed | `queueOrchestrator.ts` line 763-765 |
| Images mirrored to output/images | Confirmed | `queueOrchestrator.ts` line 783-785 |
| GalleryPage doesn't track runId | Confirmed | `GalleryPage.tsx` useEffect deps: only overallStatus, savedCount |
| Reference assignments not synced to bundle | Confirmed | `updateReferences()` in AppContext doesn't update bundle prompts |
| Runtime uses currentReferences (not bundle) | Confirmed | `resolveReferencesForPrompt()` filters currentReferences |

---

## Recommended Fixes

1. **GalleryPage:** Add `queueState.runId` to useEffect dependencies to force re-fetch on new run
2. **AppContext.updateReferences():** Reconcile bundle `referenceIds` with current reference assignments before persisting
3. **Sync References:** Already repairs stale IDs; should also validate and report on assignment scope consistency

---
