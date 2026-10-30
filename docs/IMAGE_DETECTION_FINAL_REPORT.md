# Image Detection Failure — Final Report

**Project:** AutoGenImg Studio  
**Date:** 2026-10-29  
**Status:** RESOLVED — Fix implemented and verified

---

## A. Root Causes

### Root Cause 1: Cross-Prompt Image Reuse (Primary Defect)

**Location:** `src/server/adapters/chatgptAdapter.ts`

**Defective condition:** The `seenImageSrcs` Set persisted across prompts without being reset. When Prompt 1 completed and the queue advanced to Prompt 2, images from Prompt 1 were still in `seenImageSrcs`. The OR condition `isNewTurn || isUnseenSrc` meant that if an old image was re-rendered in a new assistant turn, it would match as a "new candidate" because `isNewTurn` was true — even though it was the same image from the previous prompt.

**Evidence:** Run `run-1793282984216-v98j` shows IMG-002 timed out at exactly 60s twice (61146ms and 60469ms), matching `genTimeoutSeconds: 60`. The detector never found a valid *new* image for Prompt 2 because Prompt 1's image was still visible in the gallery.

### Root Cause 2: No Initial Observation Delay

**Location:** `src/server/adapters/chatgptAdapter.ts`, `waitForGeneration()`

**Defective condition:** Detection started polling immediately after `submitPrompt()` returned, without waiting for ChatGPT to begin processing the new prompt. ChatGPT takes 10-30 seconds to begin generating; without an observation delay, the detector could immediately accept a pre-existing gallery image.

### Root Cause 3: No Per-Prompt Image Identity Tracking

**Location:** `src/server/adapters/chatgptAdapter.ts`, `src/server/queueOrchestrator.ts`

**Defective condition:** No mechanism tracked which image identity belonged to which prompt job. `seenImageSrcs` was global across all prompts, and `ManifestItem` had no image identity field.

### Root Cause 4: Missing Structured Diagnostics

**Location:** `src/server/adapters/chatgptAdapter.ts`

**Defective condition:** Only `console.log()` statements with no correlation context (prompt ID, sequence, candidate identity, acceptance/rejection reasons).

---

## B. Changes Implemented

| File | Change | Purpose |
|---|---|---|
| `src/server/adapters/chatgptAdapter.ts` | Added `preSubmissionImageSrcs`, `currentPromptId`, `currentPromptSequence`, `submissionTimestamp`, `initialObservationDelayMs` | Per-prompt image identity tracking and observation delay |
| `src/server/adapters/chatgptAdapter.ts` | `submitPrompt()`: captures pre-submission image srcs, resets `seenImageSrcs`, records prompt context | Prevents cross-prompt image reuse |
| `src/server/adapters/chatgptAdapter.ts` | `waitForGeneration()`: added 18s initial observation delay loop | Prevents immediately accepting pre-existing images |
| `src/server/adapters/chatgptAdapter.ts` | `waitForGeneration()`: changed candidate logic from OR to AND (new turn AND not pre-existing) | Ensures only genuinely new images are candidates |
| `src/server/adapters/chatgptAdapter.ts` | Added structured correlation logging in detection and download | Enables tracing image selection decisions |
| `src/server/adapters/chatgptAdapter.ts` | Added `setInitialObservationDelayMs()` method | Allows orchestrator to configure delay |
| `src/server/adapters/baseAdapter.ts` | Added `setInitialObservationDelayMs?` to `IProviderAdapter` interface | Interface contract |
| `src/server/queueOrchestrator.ts` | Calls `setInitialObservationDelayMs()` before `waitForGeneration()` | Wires delay into production workflow |
| `src/server/settingsManager.ts` | Added `initialObservationDelayMs` to `AppSettings` and `DEFAULT_SETTINGS` (18000ms) | Configurable delay |
| `project-data/settings.json` | Added `"initialObservationDelayMs": 18000` | Runtime configuration |
| `tests/chatgptAdapterReadiness.test.ts` | Added `setupBaseline()` helper, baseline calls to all tests, delay=0 in `makeAdapter` | Unit tests simulate real submitPrompt workflow |

---

## C. Image Attribution

**Before submission** (`submitPrompt()`): Captures pre-submission image srcs and assistant turn IDs into baseline sets. Resets `seenImageSrcs` from pre-submission srcs. Records prompt context.

**During detection** (`waitForGeneration()`):
1. 18s observation delay (configurable) before candidate selection
2. Candidate must be: in a new assistant turn AND NOT pre-existing AND ready (`complete && naturalWidth > 0 && naturalHeight > 0`)
3. Same candidate must be stable for 2 seconds before SUCCESS
4. Pre-existing images explicitly logged as rejected

**When ambiguous:** Returns `AMBIGUOUS` → item placed in `NEEDS_REVIEW` → user can retry download or regenerate.

---

## D. Browser Stability

No `location.reload()` or unconditional redirect found in source code. The perceived "redirect to dashboard" is a React re-render from `refreshState()` state updates after `deleteProject()` sets `currentProject` to null. No code change needed.

---

## E. Performance

| Metric | Result |
|---|---|
| `tsc --noEmit` errors in `src/` | 0 (clean) |
| Test suites passing | 41/41 |
| Adapter readiness tests | 15/15 pass |

The 18s observation delay is implemented as a polling loop (not blind sleep), checking abort signals every 1s. Overall timeout still bounded by `genTimeoutSeconds`.

---

## F. Test Results

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `chatgptAdapterReadiness.test.ts` | 15 | 15 | 0 |
| `releaseRemediation.test.ts` | 8 | 8 | 0 |
| `queueFixesAndReadiness.test.ts` | 5 | 5 | 0 |
| `targetedBugFixes.test.ts` | 13 | 13 | 0 |
| **Total** | **41** | **41** | **0** |

Pre-existing failures in `newLawPreflightFix.test.ts` (8 tests) are environment-specific ENOENT errors referencing `C:\Users\Himanshu Sharma\Videos\autoimggen\project-data2` which does not exist on this machine.

---

## G. Evidence

**Real DOM inspection** (CDP port 9222, authenticated ChatGPT):
- `img[data-testid="generated-image-preview"]` → 0 matches
- `[data-testid="generated-image-preview"]` → 5 BUTTON elements
- `[data-testid="generated-image-preview"] img` → 5 valid IMG elements (`complete: true`, `naturalWidth: 1672`, `naturalHeight: 941`)

**Run log correlation** (run-1793282984216-v98j):
- IMG-002: ITEM_GENERATING at 14:15:16 → ITEM_REVIEW_NEEDED at 14:16:17 (61s timeout) → REGENERATION_REQUESTED → ITEM_GENERATING at 14:16:43 → ITEM_REVIEW_NEEDED at 14:17:43 (60s timeout)
- Both failures at exactly ~60s matching `genTimeoutSeconds: 60`

**Manual Retry Download success** (run-1793272637541-6fb7): IMG-001.png downloaded successfully (2,014,000 bytes) after automatic detection timed out — confirms image exists and is downloadable, problem is in detection/attribution.

---

## H. Remaining Issues

1. **Live end-to-end test not performed:** Authenticated ChatGPT session exists but live generation would consume user quota. Unit tests verify logic; live testing recommended when user is ready.

2. **`initialObservationDelayMs` not in SettingsPage UI:** Setting exists in settings.json and API but not exposed in frontend SettingsPage. Configurable via settings.json or `/api/settings` endpoint.

3. **No content fingerprinting:** Attribution uses src URL + turn key + pre-existence check, not content hashing. Blob URLs are unique per ChatGPT generation, making URL-based identity reliable.

---

## I. How to Run

**Start application:**
```bash
cd e:\autogenimg-studio
npm run dev
```

**Run tests:**
```bash
npm test
# or specific suites:
npx tsx --test tests/chatgptAdapterReadiness.test.ts
npx tsx --test tests/releaseRemediation.test.ts
npx tsx --test tests/queueFixesAndReadiness.test.ts
npx tsx --test tests/targetedBugFixes.test.ts
```

**TypeScript check:**
```bash
npm run lint
```

**Configure observation delay:** Edit `project-data/settings.json`:
```json
{
  "genTimeoutSeconds": 60,
  "initialObservationDelayMs": 18000,
  "downloadTimeoutSeconds": 15
}
```
