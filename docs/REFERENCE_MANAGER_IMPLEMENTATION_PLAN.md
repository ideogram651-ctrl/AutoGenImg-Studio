# REFERENCE MANAGER IMPLEMENTATION PLAN
## OpenGen Image Studio — Reference-to-Generation Pipeline Overhaul

**Investigation Date:** 2026-10-30
**Status:** Ready for approval — no code changes made yet
**Based On:** PROJECT_LOG_FORENSIC_INVENTORY.md, REFERENCE_MANAGER_FORENSIC_AUDIT.md, MASTER_PROBLEM_CORRELATION_MATRIX.md

---

## 1. EXECUTIVE SUMMARY

This plan addresses 12 identified problems in the reference-to-generation pipeline, grouped into 4 root cause areas:

| Priority | Root Cause Area | Problems Addressed | Effort |
|----------|----------------|-------------------|--------|
| 1 | Attachment Pipeline Rework | P-001, P-003, P-004, P-006, P-008 | High |
| 2 | Generation Timeout & State Detection | P-002, P-005 | Medium |
| 3 | Composer State & Regeneration | P-007, P-010 | Medium |
| 4 | Observability & Logging | P-011 | Low |

**No user data will be deleted or modified.** All changes are additive or corrective within existing code files.

---

## 2. REFERENCE MANAGEMENT (Section 3.1)

### 2.1 Reference File Limits

- **Maximum 20 unique active reference assets** per project
- Attempt to add reference #21 → clear error message
- Existing references unaffected

### 2.2 Supported Formats

| Format | MIME Type | Handling |
|--------|-----------|----------|
| PNG | image/png | Attach as file |
| JPG/JPEG | image/jpeg | Attach as file |
| WEBP | image/webp | Attach as file |
| SVG | image/svg+xml | Attach as file (documented limitation) |
| PDF | application/pdf | Text content in prompt (not file attachment) |
| MD/MARKDOWN | text/markdown | Text content in prompt |
| TXT | text/plain | Text content in prompt |

**Video formats explicitly excluded** — rejected at validation.

### 2.3 Reference Identity

- Unique reference IDs (e.g., REF-STYLE-01)
- Auto-generated if not provided: `REF-{CATEGORY}-{NN}`
- Duplicate ID rejection with clear error
- SHA-256 checksum computed on upload
- Original file preservation — files are copied to project references dir, never modified

### 2.4 Assignment Model

- `assignedMode: 'all'` — reference delivered to every prompt
- `assignedMode: 'selected'` — reference delivered only to listed prompt IDs
- Same reference can be assigned to multiple prompts (e.g., Character.png → IMG-001, IMG-005, IMG-006)
- Unassigned references never delivered

### 2.5 Persistence

- References saved to `project-data/references.json`
- Files stored in `project-data/references/` or `project-data/assets/`
- Survives restart via `openProject()` → loads from disk

---

## 3. REFERENCE RESOLUTION (Section 3.2)

### 3.1 Per-Prompt Resolution

Already implemented correctly in `queueOrchestrator.ts` `resolveReferencesForPrompt()`:

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

**No changes needed** — verified working via log evidence (manifest items contain only assigned referenceIds).

### 3.2 Reference Categories Supported

- `character` — Character visual references
- `style` — Style/appearance references
- `environment` — Environment/background references
- `object` — Object/prop references
- `custom` — General references

---

## 4. ATTACHMENT ENGINE (Section 3.3)

### 4.1 Design: Sequential Single-File Attachment

**Do not** use `setInputFiles([path1, path2, ...])` — ChatGPT's input is single-file.

**Do** iterate sequentially:
```
for each media reference:
  1. Call setInputFiles([singlePath])
  2. Wait for attachment chip to appear (poll up to timeout)
  3. Verify chip is present before next file
  4. Log attachment status
```

### 4.2 Timeout Calculation

Based on file size:
- Base: 5 seconds per file
- Plus: 2 seconds per MB
- Maximum: 60 seconds per file

Example: 5MB file → 5 + (5 × 2) = 15 seconds

### 4.3 Attachment State Machine

```
SELECTED → VALIDATING → UPLOADING → WAITING_FOR_UPLOAD → VERIFYING → ATTACHED → FAILED
```

- **SELECTED**: File chosen in UI
- **VALIDATING**: MIME type, size, existence check
- **UPLOADING**: `setInputFiles()` called, waiting for chip
- **WAITING_FOR_UPLOAD**: Extended wait for large files
- **VERIFYING**: Confirm chip is present and stable
- **ATTACHED**: Verified, ready for next file
- **FAILED**: Any step failed, error logged

---

## 5. UPLOAD STATE MACHINE (Section 3.4)

### 5.1 States

| State | Description | Entry Condition | Exit Condition |
|-------|-------------|-----------------|----------------|
| SELECTED | File chosen by user | User selects file | Validation starts |
| VALIDATING | MIME/type/size check | Validation starts | Validation passes/fails |
| UPLOADING | setInputFiles() called | Validation passes | Chip detected or timeout |
| WAITING_FOR_UPLOAD | Extended wait for large file | Chip not yet detected | Chip detected or extended timeout |
| VERIFYING | Chip stability check | Chip detected | Chip stable for 1s |
| ATTACHED | File confirmed attached | Verification passes | Next file or submit |
| FAILED | Any error | Validation/upload/verify failure | User retry or skip |

### 5.2 State Transitions

```
SELECTED --[validate ok]--> VALIDATING --[validate ok]--> UPLOADING
VALIDATING --[validate fail]--> FAILED
UPLOADING --[chip detected]--> VERIFYING
UPLOADING --[timeout]--> WAITING_FOR_UPLOAD
WAITING_FOR_UPLOAD --[chip detected]--> VERIFYING
WAITING_FOR_UPLOAD --[extended timeout]--> FAILED
VERIFYING --[stable]--> ATTACHED
VERIFYING --[chip lost]--> UPLOADING
ATTACHED --[all files done]--> Ready for Submit
ANY --[error]--> FAILED
```

---

## 6. SUBMISSION STATE MACHINE (Section 3.5)

### 6.1 States

| State | Description |
|-------|-------------|
| PREPARING | Capturing baseline, locating input |
| ATTACHING | Attaching all media references |
| WAITING_FOR_UPLOAD | Waiting for all uploads to complete |
| VERIFYING_ATTACHMENTS | Confirming all chips present |
| WAITING_FOR_SEND | Waiting for Send button to be enabled |
| SUBMITTED | Prompt text entered, Send clicked |
| GENERATING | Waiting for generation result |
| DOWNLOADING | Download activated |
| SAVED | File verified on disk |
| REVIEW_REQUIRED | Needs manual review |
| FAILED | Submission or generation failed |

### 6.2 Key Rules

- **Prevent duplicate submission**: Check for active stop button before submitting
- **Do not proceed while uploads incomplete**: All attachments must be ATTACHED before Send
- **Wait for Send button enabled**: Poll `isEnabled()` and `aria-disabled` before clicking

---

## 7. IMAGE AND FILE INTEGRITY (Section 3.6)

### 7.1 Pre-Upload Validation

Before any file is attached to ChatGPT:

1. **Existence check**: `fs.existsSync(ref.path)`
2. **Signature check**: `validateImageFile()` — verify file header matches claimed type
3. **MIME check**: File extension matches MIME type
4. **Hash computation**: SHA-256 computed and stored in `ReferenceFile.checksum`
5. **Size check**: File not 0 bytes, reasonable maximum

### 7.2 Supported Format Validation

| Format | Signature Check | MIME | Max Size | Notes |
|--------|----------------|------|----------|-------|
| PNG | 89 50 4E 47 | image/png | 20MB | — |
| JPEG | FF D8 FF | image/jpeg | 20MB | — |
| WEBP | 52 49 46 46...WEBP | image/webp | 20MB | — |
| SVG | <?xml or <svg | image/svg+xml | 10MB | Documented ChatGPT compatibility unknown |
| PDF | %PDF | application/pdf | 25MB | Text-only handling |
| MD/TXT | N/A | text/* | 5MB | Text content in prompt |

### 7.3 Video Rejection

Files with video signatures or extensions (.mp4, .mov, .avi, .mkv, .webm) are explicitly rejected.

### 7.4 Original File Preservation

- Original files copied to project references/assets directory
- Never modified, recompressed, or converted
- Generated images stored separately in run-isolated directories
- SHA-256 of generated images recorded in manifest

---

## 8. RECOVERY (Section 3.7)

### 8.1 Timeout Categories

| Category | Default | Configurable | Purpose |
|----------|---------|--------------|---------|
| `genTimeoutSeconds` | 120 | Yes | Generation wait (was 60s observed) |
| `downloadTimeoutSeconds` | 15 | Yes | Download wait |
| `startupTimeoutMs` | 30000 | Yes | Browser startup |
| `connectionTimeoutMs` | 15000 | Yes | CDP connection |
| `initialObservationDelayMs` | 18000 | Yes | Pre-detection delay |

### 8.2 Recovery Scenarios

| Scenario | Detection | Recovery Action |
|----------|-----------|-----------------|
| Delayed upload | Attachment chip not appearing | Extended wait (WAITING_FOR_UPLOAD), then FAILED |
| Upload error | Chip never appears, or disappears | FAILED state, user can retry |
| Send button disabled | `isEnabled() === false` or `aria-disabled === true` | Poll until enabled, then submit |
| Uncertain submission | No clear success/failure signal | AMBIGUOUS → pause, allow retry download |
| Generation > timeout | Stop button still visible after timeout | Do NOT mark failed — pause with `stillGenerating: true` |
| Download retry | Download fails | Up to 3 retries with 2s delay |
| Regeneration | User clicks regenerate | Composer cleanup, re-submit |
| Stale composer | Previous attachments present | Clear composer before new submission |
| Queue pause/resume | User pauses/resumes | State persisted, resume from current item |

### 8.3 Generation Timeout Fix

**Current behavior:** Timeout → AMBIGUOUS → NEEDS_REVIEW → pause queue

**New behavior:**
1. If `stillGenerating: true` → keep item in GENERATING, pause queue with explicit reason, allow user to resume and continue waiting
2. If `stillGenerating: false` → AMBIGUOUS → NEEDS_REVIEW (genuinely failed)
3. Increase default `genTimeoutSeconds` from 60 to 120

---

## 9. FILE-LEVEL IMPLEMENTATION PLAN

### 9.1 Files to Modify

| File | Changes | Problems Addressed |
|------|---------|-------------------|
| `src/server/adapters/chatgptAdapter.ts` | Sequential attachment, upload state tracking, Send button wait, composer cleanup, longer timeout, `stillGenerating` handling | P-001, P-002, P-003, P-004, P-005, P-007 |
| `src/server/adapters/chatgptDownloadEngine.ts` | Add upload progress logging | P-003, P-011 |
| `src/server/validator.ts` | Add `validateReferenceFile()` for pre-upload validation | P-006, P-008 |
| `src/server/settingsManager.ts` | Add `maxReferenceCount` setting (default 20) | — |
| `src/server/apiRouter.ts` | Add reference count validation endpoint | — |
| `src/context/AppContext.tsx` | Add reference count tracking, upload progress state | P-003, P-004 |
| `src/components/pages/ReferenceManagerPage.tsx` | Show upload progress, reference count, max limit warning | P-003 |
| `src/types/index.ts` | Add upload status to ReferenceFile, add maxReferenceCount to settings | P-003, P-004 |

### 9.2 Files to Create

| File | Purpose |
|------|---------|
| (none — all changes within existing files) | — |

### 9.3 Files NOT to Modify

- `src/server/queueOrchestrator.ts` — Core queue logic is working; only adapter changes needed
- `src/server/projectManager.ts` — File persistence is working
- `src/server/settingsManager.ts` — Only adding one setting
- `src/components/pages/GalleryPage.tsx` — Already reworked
- `src/components/Sidebar.tsx` — Gallery position already correct
- All test files — Will be updated as needed

---

## 10. IMPLEMENTATION ORDER

### Phase 1: Attachment Pipeline (P-001, P-003, P-004)

1. Modify `chatgptAdapter.ts` `submitPrompt()`:
   - Replace `setInputFiles(validPaths)` with sequential per-file attachment
   - Add upload state tracking per file
   - Add extended timeout based on file size
   - Add Send button enabled-state polling
2. Add `validateReferenceFile()` to `validator.ts`
3. Call validation before attachment in adapter

### Phase 2: Generation Timeout (P-002, P-005)

1. Update `settings.json` `genTimeoutSeconds` to 120
2. Modify `chatgptAdapter.ts` `waitForGeneration()`:
   - Return `stillGenerating` flag more prominently
3. Modify `queueOrchestrator.ts` `processItem()`:
   - If `stillGenerating: true` → pause with reason, do NOT set NEEDS_REVIEW
   - If `stillGenerating: false` → NEEDS_REVIEW (actual failure)

### Phase 3: Composer & Integrity (P-006, P-007, P-008)

1. Add composer cleanup at start of `submitPrompt()`
2. Add SHA-256 computation before upload
3. Add file signature validation via `validateImageFile()` before attachment

### Phase 4: UI & Observability (P-011)

1. Add upload progress display in ReferenceManagerPage
2. Add reference count display (max 20)
3. Add browser console logging in chromeSessionManager

---

## 11. REGRESSION RISKS

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sequential attachment slower than parallel | Medium | Low | Only affects multi-reference prompts; single-file unchanged |
| ChatGPT DOM changes break chip detection | Medium | Medium | Fallback to timeout-based progression |
| Send button polling hangs | Low | Low | Maximum poll timeout with FAILED fallback |
| Longer generation timeout increases total run time | High | Low | Configurable; user can adjust |
| `stillGenerating` pause changes queue behavior | Medium | Medium | Only affects items where generation is still active |
| SVG handling unknown | Low | Low | Documented limitation; no conversion attempted |

---

## 12. TESTING STRATEGY

### 12.1 Required Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Single image reference | Attached and submitted successfully |
| 2 | Multiple image references (2-3) | Each attached sequentially, all submitted |
| 3 | Mixed image, PDF, MD, TXT | Images attached, text included in prompt |
| 4 | WEBP and SVG handling | WEBP attached; SVG attached with warning |
| 5 | Twenty unique references | All 20 accepted |
| 6 | Attempt to add reference #21 | Error: maximum 20 references |
| 7 | Reference assigned to multiple prompts | Reference appears in each assigned prompt only |
| 8 | Prompt-specific reference isolation | Unassigned references not included |
| 9 | Delayed file upload (large file) | Extended wait, attachment confirmed |
| 10 | Send button disabled during upload | Wait for enabled, then submit |
| 11 | Upload failure and recovery | FAILED state, retry option |
| 12 | Generation longer than 60 seconds | StillGenerating → pause, not review |
| 13 | Regeneration with stale composer | Composer cleaned before re-submit |
| 14 | Corrupted image | Rejected at validation |
| 15 | Project restart and persistence | References loaded from disk |
| 16 | Queue pause and resume | State preserved across pause |
| 17 | Download retry and integrity | SHA-256 verified |

### 12.2 Test Evidence Required

For each test:
- Expected result
- Actual result
- Pass/Fail
- Relevant log lines
- Browser evidence (screenshot or Playwright trace)

### 12.3 Browser Testing Requirement

**All attachment and submission tests must be performed against a real Chrome browser via Playwright CDP connection.** Mocked tests are insufficient for validating file input behavior.

---

## 13. APPROVAL CHECKLIST

Before implementation begins, confirm:

- [ ] All 12 problems understood and correlated
- [ ] Root causes identified (not symptoms)
- [ ] Implementation plan reviewed
- [ ] Regression risks accepted
- [ ] Testing strategy approved
- [ ] No data deletion planned
- [ ] No paid APIs introduced
- [ ] No video support added
- [ ] Existing working functionality preserved

---

**READY FOR APPROVAL**

Once approved, implementation will proceed incrementally per the order in Section 10.
