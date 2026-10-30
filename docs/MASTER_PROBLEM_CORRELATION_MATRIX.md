# MASTER PROBLEM CORRELATION MATRIX
## OpenGen Image Studio — Reference-to-Generation Pipeline

**Investigation Date:** 2026-10-30
**Sources Correlated:**
- A: Complete project-wide log investigation (PROJECT_LOG_FORENSIC_INVENTORY.md)
- B: User-reported problems (Requirements A-H)
- C: Source code and architecture investigation

---

## 1. PROBLEM SUMMARY

| Problem ID | Title | Confidence | Impact | Shared Root Cause With |
|------------|-------|------------|--------|------------------------|
| P-001 | Multiple file attachment fails with "Non-multiple file input" | Confirmed | Critical | — |
| P-002 | Generation timeout too short; item sent to review while still generating | Confirmed | High | P-005 |
| P-003 | No upload progress tracking for large files | Confirmed | Medium | P-004 |
| P-004 | Send button disabled state not handled during upload | Confirmed | Medium | P-003 |
| P-005 | Generation state detection doesn't distinguish "still generating" from "failed" | Confirmed | High | P-002 |
| P-006 | No MIME/type validation before reference attachment | Confirmed | Medium | P-008 |
| P-007 | Regeneration doesn't clear composer state | Confirmed | Medium | — |
| P-008 | No pre-upload integrity checking (hash/signature) | Confirmed | Medium | P-006 |
| P-009 | No SVG special handling for ChatGPT compatibility | Unconfirmed | Low | P-006 |
| P-010 | No PDF/MD/TXT actual file attachment (only text in prompt) | Unconfirmed | Low | — |
| P-011 | No browser console/network logs captured | Confirmed | Low | — |
| P-012 | Preflight error for missing reference file REF-STYLE-01 | Confirmed | High | P-006 |

---

## 2. DETAILED PROBLEM ENTRIES

### P-001: Multiple File Attachment Fails

| Field | Value |
|-------|-------|
| **Problem ID** | P-001 |
| **Title** | Multiple file attachment fails with "Non-multiple file input" |
| **Log Evidence** | `stickman/runs/run-1793337205282-ctar/logs/run.log`, line 5: `[2026-10-30T05:13:30.486Z] [INFO] [ADAPTER_PREPARING] [IMG-001] Validating and attaching 2 media reference file(s)...` → line 6: `[2026-10-30T05:13:30.544Z] [ERROR] [SUBMISSION_FAILED] [IMG-001] Failed to submit prompt IMG-001: ... Non-multiple file input can only accept single file` |
| **User Report** | Requirement A: "The Reference Manager allows multiple references to be selected, but actual ChatGPT attachment currently fails in some cases. Known error: Non-multiple file input can only accept single file" |
| **Source Code Evidence** | `src/server/adapters/chatgptAdapter.ts`, line 308: `await fileInput.setInputFiles(validPaths);` — passes array of paths to a single-file `<input type="file">` element |
| **Root Cause** | ChatGPT's file input element does not support multiple files via Playwright's `setInputFiles()` with an array. The adapter attempts to attach all media references in a single call. |
| **Confidence** | Confirmed |
| **Impact** | Critical — Any prompt with 2+ media references cannot be submitted |
| **Dependencies** | ChatGPT DOM structure, Playwright file input API |
| **Proposed Fix** | Sequential attachment: iterate over `validPaths`, call `setInputFiles([path])` one at a time, wait for attachment chip after each |
| **Regression Risk** | Low — Single-file attachment still works; sequential adds ~500ms per additional file |

---

### P-002: Generation Timeout Too Short

| Field | Value |
|-------|-------|
| **Problem ID** | P-002 |
| **Title** | Generation timeout too short; item sent to review while still generating |
| **Log Evidence** | `stickman/runs/run-1793339994404-8r4i/logs/run.log`: `[2026-10-30T06:01:18.653Z] [WARN] [ITEM_REVIEW_NEEDED] [IMG-001] Item IMG-001 placed in review: Generation exceeded timeout of 60s while ChatGPT is still actively generating.` → `[2026-10-30T06:01:58.439Z] [INFO] [DOWNLOAD_RETRY] [IMG-001] Retrying visible download for IMG-001` → `[2026-10-30T06:01:58.439Z] [SUCCESS] [DOWNLOAD_RETRY_SUCCESS] [IMG-001] File successfully downloaded on retry` |
| **User Report** | Requirement H: "The logs show that the application sometimes marks an item for review after 60 seconds even when ChatGPT is still actively generating. A timeout must not automatically mean generation failure." |
| **Source Code Evidence** | `src/server/adapters/chatgptAdapter.ts`, `waitForGeneration()`: Returns `{outcome: 'AMBIGUOUS', stillGenerating: true}` when timeout fires while stop button is visible. `src/server/queueOrchestrator.ts`, `processItem()` lines 725-739: AMBIGUOUS → NEEDS_REVIEW, then if stillGenerating → pauseRun(). `project-data/settings.json`: `genTimeoutSeconds: 120` but logs show 60s timeout (possible config mismatch or hardcoded value elsewhere) |
| **Root Cause** | The generation timeout (observed 60s, configured 120s) is shorter than ChatGPT's typical image generation time. When timeout fires while ChatGPT is still actively generating, the item is incorrectly classified as failed/needs-review instead of waiting. |
| **Confidence** | Confirmed |
| **Impact** | High — Items incorrectly placed in review, requiring manual retry |
| **Dependencies** | `genTimeoutSeconds` setting, `waitForGeneration()` timeout parameter, ChatGPT generation time |
| **Proposed Fix** | 1. Increase default timeout to match ChatGPT's typical generation time (2-5 minutes)<br>2. When `stillGenerating: true`, do NOT place in NEEDS_REVIEW — instead pause and wait for user action or auto-extend<br>3. Make timeout configurable per-provider |
| **Regression Risk** | Medium — Longer waits increase total run time; must ensure pause/resume works correctly |

---

### P-003: No Upload Progress Tracking

| Field | Value |
|-------|-------|
| **Problem ID** | P-003 |
| **Title** | No upload progress tracking for large files |
| **Log Evidence** | No upload progress log entries exist in any log file. The only attachment log is "Validating and attaching N media reference file(s)" with no progress indicators. |
| **User Report** | Requirement D: "Uploading larger reference files can take approximately 20–30 seconds or longer. The automation currently appears to attempt prompt submission before all files are ready." |
| **Source Code Evidence** | `src/server/adapters/chatgptAdapter.ts`, lines 312-334: Polls for attachment chips for max 6 seconds (12 × 500ms). No progress percentage, no file size tracking, no upload completion detection beyond chip presence. |
| **Root Cause** | The attachment poll uses a fixed 6-second window with no awareness of file size, upload speed, or ChatGPT's file processing time. Large files may not finish uploading within this window. |
| **Confidence** | Confirmed |
| **Impact** | Medium — Large files may not be fully attached before prompt submission |
| **Dependencies** | ChatGPT attachment chip DOM, file size, network speed |
| **Proposed Fix** | 1. Extend poll timeout based on file size (e.g., 10s per MB)<br>2. Poll for upload completion indicators (progress bar disappearance, chip stabilization)<br>3. Add upload progress logging |
| **Regression Risk** | Low — Longer wait only affects large files |

---

### P-004: Send Button Disabled State Not Handled

| Field | Value |
|-------|-------|
| **Problem ID** | P-004 |
| **Title** | Send button disabled state not handled during upload |
| **Log Evidence** | No Send button state log entries exist. |
| **User Report** | Requirement E: "The Send button temporarily becomes disabled during file uploads. The automation must understand this state. Do not rely exclusively on button color." |
| **Source Code Evidence** | `src/server/adapters/chatgptAdapter.ts`, lines 365-372: Checks `sendButton.isEnabled()` then clicks. No waiting for disabled→enabled transition. No `aria-disabled` check. No upload indicator detection. |
| **Root Cause** | The adapter checks Send button state once at submission time. If ChatGPT disables the button during file processing, the click may fail silently or the Enter keypress may not trigger submission. |
| **Confidence** | Confirmed |
| **Impact** | Medium — Prompt may not be submitted if Send button is disabled |
| **Dependencies** | ChatGPT Send button DOM attributes, upload processing time |
| **Proposed Fix** | 1. Wait for Send button to be enabled (poll `isEnabled()` and `aria-disabled`)<br>2. Detect upload completion indicators before clicking Send<br>3. Add Send button state logging |
| **Regression Risk** | Low |

---

### P-005: Generation State Detection Ambiguity

| Field | Value |
|-------|-------|
| **Problem ID** | P-005 |
| **Title** | Generation state detection doesn't distinguish "still generating" from "failed" |
| **Log Evidence** | Same as P-002. Items with `stillGenerating: true` are placed in NEEDS_REVIEW instead of being retried or waited on. |
| **User Report** | Requirement H: "A timeout must not automatically mean generation failure." |
| **Source Code Evidence** | `src/server/adapters/chatgptAdapter.ts`, `waitForGeneration()`: Detects `stillGenerating` via stop button visibility. Returns `AMBIGUOUS` with `stillGenerating: true`. `src/server/queueOrchestrator.ts`, line 725-738: Treats AMBIGUOUS as terminal failure (NEEDS_REVIEW) even when `stillGenerating: true`. |
| **Root Cause** | The queue orchestrator treats `AMBIGUOUS` outcome as a terminal state regardless of `stillGenerating`. It should distinguish between "generation failed" and "generation still in progress." |
| **Confidence** | Confirmed |
| **Impact** | High — Items incorrectly sent to review, queue paused unnecessarily |
| **Dependencies** | P-002 (timeout), adapter `waitForGeneration()` return value |
| **Proposed Fix** | When `genResult.stillGenerating === true`, keep item in GENERATING state and continue waiting (or pause with explicit "still generating" reason) rather than placing in NEEDS_REVIEW |
| **Regression Risk** | Medium — Changes queue state machine behavior |

---

### P-006: No MIME/Type Validation Before Attachment

| Field | Value |
|-------|-------|
| **Problem ID** | P-006 |
| **Title** | No MIME/type validation before reference attachment |
| **Log Evidence** | PREFLIGHT_ERROR for missing `cinematic_anamorphic_35mm.png` (REF-STYLE-01) in `new_law` project logs — file was assigned but not on disk. No MIME validation logs exist. |
| **User Report** | Requirement B: "The application should support mixed references in the same format: PNG, JPG, JPEG, WEBP, SVG, PDF, MD, MARKDOWN, TXT. Video formats are explicitly excluded." |
| **Source Code Evidence** | `src/server/adapters/chatgptAdapter.ts`, lines 278-298: Only checks `fs.existsSync(ref.path)`. No MIME validation. `src/server/validator.ts`: `validateImageFile()` exists with signature checking but is NOT called before attachment. |
| **Root Cause** | The adapter validates file existence but not file type. `validateImageFile()` exists but is only used for download verification, not upload validation. |
| **Confidence** | Confirmed |
| **Impact** | Medium — Invalid file types could be attached, causing ChatGPT errors |
| **Dependencies** | `validateImageFile()` in validator.ts, ReferenceFile.type field |
| **Proposed Fix** | Call `validateImageFile()` (or a reference-specific validator) before attachment. Reject video formats explicitly. Allow PNG, JPG, JPEG, WEBP, SVG, PDF, MD, TXT. |
| **Regression Risk** | Low — Only adds validation, doesn't change existing valid behavior |

---

### P-007: Regeneration Doesn't Clear Composer State

| Field | Value |
|-------|-------|
| **Problem ID** | P-007 |
| **Title** | Regeneration doesn't clear composer state |
| **Log Evidence** | `stickman/runs/run-1793337257227-47z5/logs/run.log`: `[2026-10-30T05:15:39.019Z] [INFO] [REGENERATION_REQUESTED] [IMG-001]` followed by re-submission. No composer cleanup logs. |
| **User Report** | Requirement G: "Previous prompt content and attachments may remain in the ChatGPT composer after regeneration." |
| **Source Code Evidence** | `src/server/adapters/chatgptAdapter.ts`, `submitPrompt()` lines 159-165: Only closes "Close dialog" buttons. Does not clear file attachments or prompt text. `queueOrchestrator.ts`, `regeneratePrompt()` lines 799-817: Resets item status but doesn't clear adapter state. |
| **Root Cause** | The adapter doesn't clear ChatGPT's composer (file attachments, text) before re-submitting a prompt during regeneration. |
| **Confidence** | Confirmed |
| **Impact** | Medium — Duplicate or stale references may be sent with regenerated prompt |
| **Dependencies** | ChatGPT composer DOM structure |
| **Proposed Fix** | Add composer cleanup at start of `submitPrompt()`: clear file inputs (if possible), clear prompt textarea, remove attachment chips |
| **Regression Risk** | Medium — DOM manipulation of ChatGPT's composer may break if ChatGPT changes their UI |

---

### P-008: No Pre-Upload Integrity Checking

| Field | Value |
|-------|-------|
| **Problem ID** | P-008 |
| **Title** | No pre-upload integrity checking (hash/signature) |
| **Log Evidence** | Reference files have `checksum` field in `references.json` (e.g., `5f1bc34b704a21b7f5582f5f80800fd444fdddec975edadaecd2c0386e8e5a83`), but no log shows checksum verification during upload. |
| **User Report** | Requirement F: "The original reference must reach the provider without unintended modification whenever supported." |
| **Source Code Evidence** | `src/context/AppContext.tsx`, `uploadReferenceMedia()` lines 466-532: Reads file as base64, sends to server. No hash computation before upload. `src/server/validator.ts`: `validateImageFile()` exists but not used for upload validation. |
| **Root Cause** | No integrity check is performed on reference files before they are uploaded to ChatGPT. Corrupted files could be attached without detection. |
| **Confidence** | Confirmed |
| **Impact** | Medium — Corrupted references could cause generation failures |
| **Dependencies** | `validateImageFile()`, SHA-256 computation |
| **Proposed Fix** | Compute SHA-256 before upload, store in ReferenceFile.checksum. Verify file signature via `validateImageFile()` before attachment. |
| **Regression Risk** | Low |

---

### P-009: No SVG Special Handling

| Field | Value |
|-------|-------|
| **Problem ID** | P-009 |
| **Title** | No SVG special handling for ChatGPT compatibility |
| **Log Evidence** | No SVG-specific logs exist. |
| **User Report** | Requirement B: SVG is in the required format list. |
| **Source Code Evidence** | `src/server/validator.ts`: SVG is recognized by `validateImageFile()`. `chatgptAdapter.ts`: No SVG-specific handling. |
| **Root Cause** | SVG files are accepted but may not render correctly in ChatGPT. No sanitization or conversion to PNG is performed. |
| **Confidence** | Unconfirmed |
| **Impact** | Low — SVG may or may not work depending on ChatGPT's support |
| **Dependencies** | ChatGPT SVG support |
| **Proposed Fix** | Document SVG limitation. Optionally convert SVG to PNG before attachment if a conversion library is available. |
| **Regression Risk** | Low |

---

### P-010: PDF/MD/TXT Not Attached as Files

| Field | Value |
|-------|-------|
| **Problem ID** | P-010 |
| **Title** | PDF/MD/TXT not attached as files (only text in prompt) |
| **Log Evidence** | Text references are handled by appending content to prompt text (`textRefDescriptions` in chatgptAdapter.ts lines 338-341). No file attachment for non-image types. |
| **User Report** | Requirement B: PDF, MD, MARKDOWN, TXT should be supported. |
| **Source Code Evidence** | `chatgptAdapter.ts` lines 278-284: Text references (refType !== 'media' and no path) are converted to text descriptions and prepended to the prompt. They are NOT attached as files. |
| **Root Cause** | ChatGPT's file attachment may not support PDF/MD/TXT in the same way as images. The workaround is to include text content in the prompt. |
| **Confidence** | Unconfirmed |
| **Impact** | Low — Text content reaches ChatGPT but not as an attachable file |
| **Dependencies** | ChatGPT file attachment capabilities |
| **Proposed Fix** | Document that text references are included in prompt text. If ChatGPT supports file attachments for these types, add file attachment support. |
| **Regression Risk** | Low |

---

### P-011: No Browser Console/Network Logs Captured

| Field | Value |
|-------|-------|
| **Problem ID** | P-011 |
| **Title** | No browser console/network logs captured |
| **Log Evidence** | No browser console messages in any log file. No HAR files or network traces. |
| **User Report** | General debugging requirement. |
| **Source Code Evidence** | `src/server/browser/chromeSessionManager.ts`: No console event listeners. No network request interception. |
| **Root Cause** | Playwright console and network events are not captured or persisted. |
| **Confidence** | Confirmed |
| **Impact** | Low — Debugging frontend issues requires manual browser inspection |
| **Dependencies** | Playwright Page API |
| **Proposed Fix** | Add console event listener and network request logging to ChromeSessionManager |
| **Regression Risk | Low |

---

### P-012: Preflight Error for Missing Reference File

| Field | Value |
|-------|-------|
| **Problem ID** | P-012 |
| **Title** | Preflight error for missing reference file REF-STYLE-01 |
| **Log Evidence** | `new_law` project logs: `[2026-10-29T19:20:54.133Z] [ERROR] [PREFLIGHT_ERROR] Preflight check failed: Required reference file "cinematic_anamorphic_35mm.png" (ID: "REF-STYLE-01") was not found on disk.` |
| **User Report** | Related to Requirement C — references must exist on disk before assignment. |
| **Source Code Evidence** | `queueOrchestrator.ts`, `validateAssignedReferences()` lines 217-235: Checks `fs.existsSync(ref.path)` for each effective reference. Falls back to `projectPath/references/<ref.name>`. |
| **Root Cause** | Reference file `cinematic_anamorphic_35mm.png` was assigned to prompt IMG-001 but was never uploaded to the project's references directory. |
| **Confidence** | Confirmed |
| **Impact** | High — Run cannot start until missing references are uploaded |
| **Dependencies** | Reference upload workflow, preflight validation |
| **Proposed Fix** | Already working — preflight correctly prevents run start with missing files. User needs to upload the missing file via Reference Manager. |
| **Regression Risk | None — working as designed |

---

## 3. SHARED ROOT CAUSE ANALYSIS

### Root Cause Group 1: Attachment Pipeline (P-001, P-003, P-004, P-006, P-008)

All these problems stem from the same underlying issue: **the attachment pipeline in `chatgptAdapter.ts` `submitPrompt()` is not designed for multi-file, variable-size, variable-type reference uploads.**

- Single `setInputFiles()` call with array → P-001
- Fixed 6-second poll → P-003
- No Send button state waiting → P-004
- No MIME validation → P-006
- No integrity check → P-008

**Common fix:** Rework the attachment pipeline into a state machine with per-file sequential attachment, upload progress detection, MIME validation, and integrity checking.

### Root Cause Group 2: Generation Timeout & State Detection (P-002, P-005)

Both problems stem from **the generation timeout being treated as a terminal failure rather than a conditional state.**

- Timeout too short → P-002
- `stillGenerating` not respected → P-005

**Common fix:** Modify `waitForGeneration()` and `processItem()` to distinguish "still generating" from "failed," and make the timeout configurable and longer.

### Root Cause Group 3: Composer State Management (P-007, P-010)

**No composer cleanup or state tracking between submissions.**

**Common fix:** Add composer cleanup at the start of `submitPrompt()`.

---

## 4. PRIORITIZED PROBLEM LIST

| Priority | Problem ID | Impact | Confidence | Dependencies |
|----------|------------|--------|------------|--------------|
| 1 | P-001 | Critical | Confirmed | — |
| 2 | P-002 | High | Confirmed | P-005 |
| 3 | P-005 | High | Confirmed | P-002 |
| 4 | P-012 | High | Confirmed | P-006 |
| 5 | P-003 | Medium | Confirmed | — |
| 6 | P-004 | Medium | Confirmed | — |
| 7 | P-006 | Medium | Confirmed | validator.ts |
| 8 | P-007 | Medium | Confirmed | — |
| 9 | P-008 | Medium | Confirmed | validator.ts |
| 10 | P-009 | Low | Unconfirmed | — |
| 11 | P-010 | Low | Unconfirmed | — |
| 12 | P-011 | Low | Confirmed | — |

---

## 5. PROBLEMS THAT SHARE COMMON FIXES

| Fix | Addresses |
|-----|-----------|
| Rework attachment pipeline (sequential, state machine) | P-001, P-003, P-004, P-006, P-008 |
| Fix generation timeout & state detection | P-002, P-005 |
| Add composer cleanup | P-007 |
| Add reference validation before upload | P-006, P-008, P-012 |

---

**END OF MATRIX**
