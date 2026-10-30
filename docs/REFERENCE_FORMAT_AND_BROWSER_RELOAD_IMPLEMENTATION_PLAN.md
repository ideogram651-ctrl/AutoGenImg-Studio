# Reference Format & Browser Reload — Implementation Plan

**Project:** AutoGen Image Studio  
**Date:** 2026-10-30  
**Status:** Ready for Implementation

---

## Overview

This plan addresses two problem domains:

1. **Phase 1-3**: Reference Manager multi-format support (JSON, MP4, format-aware validation)
2. **Phase 4-5**: Browser reload investigation (confirmed: no code change needed — React re-render is expected behavior)
3. **Phase 6-7**: Testing and documentation

---

## Phase 1: Reference Format Validation and Storage

### Files to modify:

| File | Change | Why |
|---|---|---|
| `src/types/index.ts` | Add `'json'` and `'video'` to `ReferenceType` union | Allow typed references for JSON and MP4 |
| `src/server/validator.ts` | Add `validateTextFile()`, `validateJsonFile()`, `validateVideoFile()` functions | Format-aware validation separate from image validation |
| `src/server/validator.ts` | Add `validateReferenceFile()` dispatcher that routes by extension/mime | Central validation entry point |
| `src/server/apiRouter.ts` | Add `.json`, `.mp4` to `supportedExtensions`; add MIME mappings; add `refType` for json/video | Allow upload of new formats |
| `src/server/apiRouter.ts` | Call `validateReferenceFile()` after saving asset to verify content | Server-side content validation |

### Details:

**`src/types/index.ts`:**
- Change `ReferenceType = 'text' | 'media'` to `ReferenceType = 'text' | 'media' | 'json' | 'video'`

**`src/server/validator.ts` — new functions:**
- `validateTextFile(filePath)` — validates `.txt`, `.md`: checks readability, non-empty, valid UTF-8
- `validateJsonFile(filePath)` — validates `.json`: parses JSON, reports parse errors with filename
- `validateVideoFile(filePath)` — validates `.mp4`: checks ftyp box signature, reasonable file size
- `validateReferenceFile(filePath, mimeType)` — dispatcher routing to correct validator

**`src/server/apiRouter.ts` POST `/references/upload`:**
- Add `.json` → mime `application/json`, refType `'json'`
- Add `.mp4` → mime `video/mp4`, refType `'video'`
- After `saveMediaAsset()`, call `validateReferenceFile(savedAsset.path, mimeType)`; reject if invalid

---

## Phase 2: Reference Manager UI and File Picker

### Files to modify:

| File | Change | Why |
|---|---|---|
| `src/components/pages/ReferenceManagerPage.tsx` | Replace binary media/text switcher with category-based selector (image, document, text, json, video) | Clear UI for each format category |
| `src/components/pages/ReferenceManagerPage.tsx` | Dynamic `accept` filter based on selected category | Correct file picker filtering |
| `src/components/pages/ReferenceManagerPage.tsx` | Show selected filename, size, category, validation state, upload progress | User feedback |
| `src/components/pages/ReferenceManagerPage.tsx` | Preserve existing `uploadProgress` indicator rendering (already added) | Continuity |

### Details:

**Category options:**
- **Image**: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg` → `refType: 'media'`
- **Document**: `.pdf` → `refType: 'media'`
- **Text**: `.txt`, `.md` → `refType: 'text'`
- **JSON**: `.json` → `refType: 'json'`
- **Video**: `.mp4` → `refType: 'video'`

The accept filter is updated dynamically based on category. Server-side validation remains the source of truth.

---

## Phase 3: Preflight and Runtime Compatibility

### Files to modify:

| File | Change | Why |
|---|---|---|
| `src/server/adapters/chatgptAdapter.ts` | Add `validateReferencesForPrompt(references)` method | Check provider compatibility before queue |
| `src/server/queueOrchestrator.ts` | Call reference validation in preflight | Prevent queue start with incompatible refs |
| `src/server/adapters/chatgptDownloadEngine.ts` | Ensure `validateImageFile` is NOT called on non-image reference files | Prevent false rejection of text/JSON/MP4 |

### MP4 Compatibility:

- Investigate whether ChatGPT Share → Download accepts MP4
- If not: preserve MP4 in project storage, show clear compatibility error, suggest frame extraction alternative
- Do NOT introduce FFmpeg unless already present as a dependency

---

## Phase 4: Browser Reload Root-Cause Fixes

### Investigation Result:

**No code changes required.** Confirmed:
- No `location.reload()`, `location.href`, `location.assign()`, `location.replace()` in source
- No `page.reload()`, `page.goto()` causing navigation
- Browser page/context not unnecessarily recreated
- White flashes are React re-renders from `refreshState()` state updates — expected React behavior
- Delete Project → Dashboard navigation is intentional

### Documentation:

The forensic report (`docs/REFERENCE_FORMAT_AND_BROWSER_RELOAD_FORENSIC_REPORT.md`) documents this finding. No implementation needed for Part B.

---

## Phase 5: Browser Lifecycle and Automation Fixes

Not required — confirmed no defects in browser lifecycle management.

---

## Phase 6: Regression Tests and Browser Verification

### Files to create/modify:

| File | Change |
|---|---|
| `tests/referenceFormat.test.ts` | New test suite for format validation |
| `tests/referenceLifecycle.test.ts` | New test suite for upload/save/reload/delete cycle |

### Test cases:

**Format validation:**
- Valid PNG, JPG, WebP, PDF → pass
- Valid Markdown, TXT → pass (text validator)
- Valid JSON → pass (JSON validator)
- Valid SVG → pass
- Valid MP4 → pass (video validator)
- Invalid JSON → fail with parse error
- Corrupt image → fail
- Wrong extension/content mismatch → fail
- Empty text file → fail
- Unsupported extension → fail
- SHA-256 mismatch → fail

**Reference lifecycle:**
- Upload → save → reload project → references preserved
- Delete reference → state updates without navigation
- Preflight validates reference compatibility

---

## Phase 7: Documentation and Final Audit

### Files to create/modify:

| File | Change |
|---|---|
| `docs/REFERENCE_FORMAT_AND_BROWSER_RELOAD_FINAL_REPORT.md` | Final report after implementation |
| `docs/IMAGE_DETECTION_LOG_INVENTORY.md` | Update if new logging added |

### Final verification:
- Full test suite passes
- `tsc --noEmit` clean in `src/`
- Production build succeeds (`npm run build`)
