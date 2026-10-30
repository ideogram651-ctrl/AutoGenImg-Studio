# REFERENCE MANAGER FORENSIC AUDIT
## OpenGen Image Studio — Reference-to-Generation Pipeline Analysis

**Investigation Date:** 2026-10-30
**Project Root:** `e:\autogenimg-studio`

---

## 1. REFERENCE MANAGER ARCHITECTURE OVERVIEW

### 1.1 Data Model

**`ReferenceFile`** (`src/types/index.ts` lines 73-90):
```typescript
export interface ReferenceFile {
  id: string;                    // e.g. "REF-STYLE-01"
  name: string;                  // Original filename
  category: ReferenceCategory;   // 'style' | 'character' | 'environment' | 'object' | 'custom'
  label: string;                 // Human-readable label
  size: number;                  // File size in bytes
  type: string;                  // MIME type (e.g., 'image/png', 'application/pdf', 'text/plain')
  refType?: ReferenceType;       // 'text' | 'media'
  assetId?: string;
  path?: string;                 // Local filesystem path (set after upload)
  dataUrl?: string;              // Browser preview data URL
  textContent?: string;          // For text references (MD, TXT)
  checksum?: string;             // SHA-256 checksum
  assignedMode: 'all' | 'selected';
  assignedPromptIds: string[];   // e.g. ['IMG-001', 'IMG-003']
  uploadedAt?: string;
}
```

### 1.2 Reference Assignment Logic

**`resolveReferencesForPrompt()`** (`queueOrchestrator.ts` lines 937-945):
```typescript
public resolveReferencesForPrompt(promptId: string): ReferenceFile[] {
  return this.currentReferences.filter((ref) => {
    if (ref.assignedMode === 'all') return true;
    if (ref.assignedMode === 'selected') {
      return ref.assignedPromptIds && ref.assignedPromptIds.includes(promptId);
    }
    return false;
  });
}
```

**`validateAssignedReferences()`** (`queueOrchestrator.ts` lines 174-239):
- Pre-flight validation before run start
- Checks all `referenceIds` in each `PromptItem` exist in registry
- Checks all effective references (via `resolveReferencesForPrompt`) have files on disk
- Falls back to `projectPath/references/<ref.name>` if `ref.path` is missing
- Returns error if any required file is missing

### 1.3 Reference Upload Flow

**Frontend** (`ReferenceManagerPage.tsx`):
1. User selects file, enters metadata (ID, label, category, mode, prompt IDs)
2. Calls `uploadReferenceMedia(file, meta)` from AppContext
3. FileReader reads file as base64
4. POST to `/api/references/upload` with JSON body

**Backend** (`apiRouter.ts`):
- `/api/references/upload` — receives base64, saves to project references dir
- `/api/references/save` — saves reference metadata list

**Frontend `uploadReferenceMedia()`** (`AppContext.tsx` lines 466-532):
- Reads file as DataURL (base64)
- Sends to server as JSON
- No MIME validation before upload
- No file size limit check
- No hash computation before upload
- No progress tracking

---

## 2. ADAPTER ATTACHMENT FLOW

### 2.1 `submitPrompt()` — Media Reference Attachment

**File:** `src/server/adapters/chatgptAdapter.ts` lines 274-335

```typescript
// 4. Handle references attachment
const mediaRefs: ReferenceFile[] = [];
const textRefDescriptions: string[] = [];

for (const ref of references || []) {
  if (ref.refType === 'media' || (ref.path && fs.existsSync(ref.path))) {
    mediaRefs.push(ref);
  } else if (ref.label || ref.textContent) {
    textRefDescriptions.push(...);
  }
}

if (mediaRefs.length > 0) {
  // Validate all paths exist
  const validPaths: string[] = [];
  for (const ref of mediaRefs) {
    if (!ref.path || !fs.existsSync(ref.path)) {
      return { success: false, error: `Required reference file "${ref.name}" ... does not exist on disk` };
    }
    validPaths.push(ref.path);
  }

  const fileInput = await this.page.$('input[type="file"]');
  // ...
  await fileInput.setInputFiles(validPaths);  // LINE 308 — THE BUG
  
  // Poll for attachment chips (max 6 seconds)
  for (let i = 0; i < 12; i++) {
    await this.page.waitForTimeout(500);
    // Check for attachment chips/thumbnails
  }
}
```

### 2.2 Text Reference Handling

Text references (MD, TXT) are appended to the prompt text:
```typescript
let effectivePrompt = item.prompt;
if (textRefDescriptions.length > 0) {
  effectivePrompt = `${textRefDescriptions.join('\n')}\n\n${effectivePrompt}`;
}
```

---

## 3. REFERENCE RESOLUTION IN QUEUE ORCHESTRATOR

### 3.1 Manifest Item Creation

**File:** `queueOrchestrator.ts` lines 344-357
```typescript
const manifestItems: ManifestItem[] = this.currentBundle.prompts.map((p) => {
  const assignedRefs = this.resolveReferencesForPrompt(p.id);
  return {
    id: p.id,
    referenceIds: assignedRefs.map((r) => r.id),  // Only assigned refs stored
    // ...
  };
});
```

### 3.2 Item Processing

**File:** `queueOrchestrator.ts` lines 640-675
```typescript
// 2. SUBMITTING
item.status = 'SUBMITTING';
this.updateItemInManifest(item);

const refsForPrompt = this.resolveReferencesForPrompt(item.id);
const submitResult = await this.adapter.submitPrompt(item, refsForPrompt, ...);
```

Only prompt-assigned references are passed to the adapter. Unassigned references are correctly excluded.

---

## 4. FORMAT SUPPORT ANALYSIS

### 4.1 Application-Level Format Support

**`validateImageFile()`** (`src/server/validator.ts` lines ~230-300):
Supports: PNG, JPEG, WebP, GIF, PDF, SVG (by file signature)

**`AppSettings`** — No format allowlist/blocklist configured

**ReferenceManagerPage upload accept attribute:** Not explicitly restricted in code (the modal accepts any file)

**Validator `allowedMimes` default:** `['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']`

### 4.2 Video Format Exclusion

No explicit video format blocking in the upload path. `validateImageFile()` would reject video files (no matching signature), but this validation is NOT called before attachment — only during download verification.

---

## 5. PROBLEM ANALYSIS BY REQUIREMENT

### Requirement A — Multiple References

**Status: CONFIRMED BUG**

**Log Evidence:**
```
[2026-10-30T05:13:30.486Z] [INFO] [ADAPTER_PREPARING] [IMG-001] Validating and attaching 2 media reference file(s)...
[2026-10-30T05:13:30.544Z] [ERROR] [SUBMISSION_FAILED] [IMG-001] Failed to submit prompt IMG-001: Failed to submit prompt: elementHandle.setInputFiles: Error: Non-multiple file input can only accept single file
[2026-10-30T05:13:30.581Z] [WARN] [RUN_PAUSED] Run pause requested: Queue halted on submission error
```

**Source Code Evidence:**
- `chatgptAdapter.ts` line 308: `await fileInput.setInputFiles(validPaths)` — passes array to a single-file `<input type="file">`
- ChatGPT's file input does not support multiple file selection via Playwright's `setInputFiles()` with an array

**Root Cause:** The adapter attempts to attach all media references in a single `setInputFiles()` call with an array of paths. ChatGPT's file input is a single-file input.

**Fix Required:** Sequential attachment — call `setInputFiles()` once per file, waiting for each attachment to register before attaching the next.

---

### Requirement B — Mixed File Formats

**Status: PARTIAL SUPPORT / LATENT ISSUE**

**Supported formats (via `validateImageFile`):** PNG, JPEG, WebP, GIF, PDF, SVG

**Application support:** ReferenceManagerPage accepts any file type. No MIME validation before upload.

**Adapter support:** No MIME validation before attachment. Only checks `fs.existsSync(ref.path)`.

**Gap:** A user could upload a video file (MP4, MOV, etc.) and it would pass the upload flow. It would only be rejected at download time (if it were a generated image, which it isn't). For references, there's no validation that the file is actually an image/document type that ChatGPT can accept.

**Gap:** SVG files — ChatGPT may not support SVG attachments. No special handling.

**Gap:** PDF, MD, TXT — These are text references handled by appending to prompt text. But the adapter doesn't actually attach them as files — it only includes their content in the prompt text.

---

### Requirement C — Prompt-Specific Reference Assignments

**Status: WORKING CORRECTLY**

**Evidence:** `resolveReferencesForPrompt()` correctly filters by `assignedMode` and `assignedPromptIds`.

**Log Evidence from manifest:** Each `ManifestItem` has `referenceIds` containing only the references assigned to that prompt. For example, IMG-001 in the `new_law` project only has `["REF-STYLE-01"]`.

**Gap:** No logging of which references are actually passed to the adapter for each prompt. Debug visibility is limited.

---

### Requirement D — Upload Synchronization

**Status: CONFIRMED GAP**

**Current behavior:**
- After `setInputFiles()`, adapter polls for attachment chips for max 6 seconds (12 × 500ms)
- No detection of upload progress percentage
- No detection of file processing completion (thumbnail generation, virus scan, etc.)
- No waiting for Send button to become enabled

**Log evidence:** No upload progress logs exist. The only attachment-related log is "Validating and attaching N media reference file(s)".

**Gap:** Large files (20-30 second uploads) may not complete within the 6-second poll window. The adapter proceeds to prompt entry regardless.

---

### Requirement E — Send Button State

**Status: CONFIRMED GAP**

**Current behavior:**
- Adapter checks `sendButton.isEnabled()` before clicking (line 368)
- No waiting for Send button to transition from disabled to enabled
- No handling of `aria-disabled` attribute
- No upload indicator detection

**Gap:** If the Send button is disabled during file processing, the adapter may click it while disabled (Playwright click on disabled button may not trigger submission) or proceed to Enter keypress which may also fail.

---

### Requirement F — Image Integrity

**Status: PARTIAL**

**What works:**
- SHA-256 checksum computed on downloaded generated images
- File signature validation via `validateImageFile()` on download
- Original reference files stored at `ref.path` (not modified)

**What's missing:**
- No hash/computation check on reference files before upload
- No MIME type validation before attachment
- No verification that the file attached to ChatGPT is the same file that was uploaded (no post-attachment verification)
- SVG files could be modified by ChatGPT's processing (no control)

---

### Requirement G — Regeneration

**Status: CONFIRMED GAP**

**Current behavior:**
- `regeneratePrompt()` resets item status to PENDING, clears reviewReason
- Calls `processItem(item)` which calls `adapter.submitPrompt()` again
- Adapter closes lingering share dialogs at start of submitPrompt
- Does NOT clear previous file attachments from the composer
- Does NOT clear previous prompt text from the composer

**Gap:** Previous attachments and prompt text may remain in ChatGPT's composer, causing duplicate or incorrect references to be sent.

---

### Requirement H — Generation Timeout

**Status: CONFIRMED BUG / DESIGN ISSUE**

**Log Evidence:**
```
[2026-10-30T06:01:18.653Z] [WARN] [ITEM_REVIEW_NEEDED] [IMG-001] Item IMG-001 placed in review: Generation exceeded timeout of 60s while ChatGPT is still actively generating.
[2026-10-30T06:01:18.696Z] [WARN] [RUN_PAUSED] Run pause requested: Provider is still actively generating. Queue paused to prevent overlapping prompts.
[2026-10-30T06:01:53.854Z] [INFO] [DOWNLOAD_RETRY] [IMG-001] Retrying visible download for IMG-001
[2026-10-30T06:01:58.439Z] [SUCCESS] [DOWNLOAD_RETRY_SUCCESS] [IMG-001] File successfully downloaded on retry
```

**Source Code Evidence:**
- `settings.json`: `genTimeoutSeconds: 120` (120 seconds)
- But the log shows 60s timeout — the timeout may be coming from a different configuration or hardcoded value
- `waitForGeneration()` returns `AMBIGUOUS` with `stillGenerating: true` when timeout fires while generation is active
- QueueOrchestrator `processItem()` (line 725-739): If `AMBIGUOUS` or not ready → `NEEDS_REVIEW`, then if `stillGenerating` → `pauseRun()`

**Root Cause:** The 60-second generation timeout is too short for ChatGPT image generation. When the timeout fires while ChatGPT is still actively generating (`stillGenerating: true`), the item is incorrectly placed in `NEEDS_REVIEW` instead of waiting longer.

**Secondary issue:** Even when the item is placed in review, the download retry succeeds, proving the image was generated successfully — the timeout was premature.

---

## 6. REFERENCE LIFECYCLE GAPS

| Lifecycle Stage | Status | Gap |
|----------------|--------|-----|
| File selection | ✅ | Works in UI |
| File validation | ❌ | No MIME/type validation before upload |
| Hash computation | ❌ | No SHA-256 on upload |
| File storage | ✅ | Saved to project references dir |
| Metadata persistence | ✅ | Saved to references.json |
| Assignment to prompts | ✅ | `assignedMode` + `assignedPromptIds` |
| Reference resolution | ✅ | `resolveReferencesForPrompt()` works correctly |
| Pre-flight validation | ✅ | Checks file existence |
| File attachment | ❌ | Single-file input, no sequential attachment |
| Upload progress | ❌ | No tracking |
| Send button state | ❌ | No disabled-state handling |
| Post-attachment verification | ❌ | No verification file was attached correctly |
| Regeneration cleanup | ❌ | No composer cleanup |
| Integrity verification | ⚠️ | Only on download, not on upload |

---

**END OF AUDIT**
