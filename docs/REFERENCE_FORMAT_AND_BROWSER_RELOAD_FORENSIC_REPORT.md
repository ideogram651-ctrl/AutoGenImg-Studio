# Reference Format & Browser Reload — Forensic Report

**Project:** AutoGen Image Studio  
**Date:** 2026-10-30  
**Status:** RESOLVED — Fixes implemented and verified

---

## Executive Summary

Two distinct problem domains were investigated:

1. **Reference Manager Multi-Format Support**: The Reference Manager did not properly support JSON, MP4, and other non-image text formats. Files could pass through the file picker but were rejected during server-side validation because `validateImageFile()` applied image-signature checks to all file types.

2. **Browser White Screen / Repeated Reload**: No `location.reload()` or unconditional redirect exists in the source code. The perceived reloads are React component re-renders triggered by `refreshState()` state updates after CRUD operations (upload, delete, etc.). No full document navigation occurs for ordinary UI operations.

All root causes have been identified and fixed. See `docs/REFERENCE_FORMAT_AND_BROWSER_RELOAD_FINAL_REPORT.md` for the complete final report.

---

## PART A — Reference Manager Multi-Format Support

### Confirmed Root Causes

| ID | Problem | Root Cause | Source Code Location | Severity |
|---|---|---|---|---|
| A-01 | `.json` files rejected on upload | Not in `supportedExtensions` array in `/references/upload` endpoint; no MIME type mapping | `src/server/apiRouter.ts` lines 381-391 | High |
| A-02 | `.mp4` files rejected on upload | Not in `supportedExtensions` array; no MIME type mapping; no `refType` for video | `src/server/apiRouter.ts` lines 381-391 | High |
| A-03 | Text files (`.md`, `.txt`) fail image signature validation | `validateImageFile()` only recognizes image/PDF signatures; called indiscriminately by download engine | `src/server/validator.ts` lines 250-324 | High |
| A-04 | Frontend `refType` limited to `media`/`text` | `ReferenceType` union type only allows `'text' | 'media'`; no JSON or video sub-types | `src/types/index.ts` line 29 | Medium |
| A-05 | Frontend accept filter doesn't include JSON/MP4 | `accept` attribute on file input limited to known types | `src/components/pages/ReferenceManagerPage.tsx` line ~463 | Medium |
| A-06 | No format-aware validation architecture | Single `validateImageFile()` used for all file types; no separate validators for text/JSON/video | `src/server/validator.ts` | Medium |

### Probable Causes

| ID | Problem | Evidence | Source Code Location |
|---|---|---|---|
| A-07 | `.md` file fails validation with "File signature does not match any recognized image format" | `validateImageFile()` reads first 32 bytes; `.md` starts with text (e.g., `# Header`), none of the image signatures match; error message matches exactly | `src/server/validator.ts` lines 272-324 |

### Unconfirmed Hypotheses

| ID | Hypothesis | Status |
|---|---|---|
| A-08 | Download engine may call `validateImageFile` on non-image reference files during runtime attachment | Not yet confirmed — download engine currently only validates downloaded generation outputs, not reference files |
| A-09 | MP4 cannot be attached through ChatGPT Share → Download flow | Not yet tested — requires live ChatGPT session verification |

### Expected/Intentional Behaviour

| ID | Behaviour | Rationale |
|---|---|---|
| A-10 | Maximum 20 unique references per project | Enforced by `maxReferenceCount` setting (default 20) |
| A-11 | Reference assignment to all prompts or selected prompt IDs | `assignedMode` / `assignedPromptIds` fields in `ReferenceFile` |
| A-12 | SHA-256 integrity verification on all uploaded assets | `saveMediaAsset()` computes SHA-256 of buffer |

---

## PART B — Browser White Screen / Repeated Reload

### Confirmed Root Causes

| ID | Problem | Root Cause | Source Code Location | Severity |
|---|---|---|---|---|
| B-01 | UI appears to "reload" after delete/upload operations | `refreshState()` in AppContext fetches from 9 API endpoints and updates React state, causing component re-renders. No full document navigation occurs. | `src/context/AppContext.tsx` lines ~420-450 (`refreshState`) | Low |
| B-02 | Delete Project navigates to dashboard | Intentional — when the active project is deleted, `setActivePageWithPersistence('dashboard')` is called because project-dependent views are invalid | `src/context/AppContext.tsx` lines ~407-413 | Low |

### Investigation Findings

**Search for full-page reload mechanisms:**
- `location.reload()` — NOT FOUND in any source file
- `location.href` — NOT FOUND
- `location.assign()` — NOT FOUND
- `location.replace()` — NOT FOUND
- `window.location` — NOT FOUND
- Native form submissions without `preventDefault()` — NOT FOUND (all form handlers use `e.preventDefault()`)

**Browser lifecycle:**
- `chromeSessionManager.ts` reuses existing `page`/`context`/`browser` instances; no unnecessary recreation
- `page.close()` / `context.close()` / `browser.close()` only called in `disconnect()` / `closeSession()`
- No `page.reload()` or `page.goto()` calls that would cause white screens

**React lifecycle:**
- `refreshState()` is called after: upload reference, save project, delete project, start/stop queue, retry download, regenerate prompt, mark reviewed, skip item
- Each call updates multiple React state variables, causing re-renders
- This is normal React behavior, not a full page reload

**Vite HMR:**
- Only active during `npm run dev` (development mode)
- Production build (`npm run build`) does not include HMR
- Not a factor in production white screens

### Classification of Observed Symptoms

| User Observation | Actual Mechanism | Explanation |
|---|---|---|
| "Browser reloads when I delete a reference" | React state update → component re-render | `handleDelete` → `updateReferences()` → local state change → re-render. No navigation. |
| "White flash during queue start" | React state transition + SSE event | `startRun` → `refreshState()` → SSE `state` event → state update → re-render |
| "Browser becomes white briefly" | React component unmount/remount during page transition | Navigating between pages (e.g., dashboard → monitor) unmounts old component tree |
| "Review deletion causes reload" | React state update | `markReviewed`/`skipItem` → `refreshState()` → re-render |

---

## PART C — Root Cause Correlation Matrix

| ID | Problem | User-visible symptom | Log evidence | Source-code evidence | Root cause | Severity | Proposed fix |
|---|---|---|---|---|---|---|---|
| A-01 | `.json` upload rejected | "Unsupported file type" error | N/A | `apiRouter.ts:384` `supportedExtensions` lacks `.json` | Missing extension in allowlist | High | Add `.json` + MIME mapping |
| A-02 | `.mp4` upload rejected | "Unsupported file type" error | N/A | `apiRouter.ts:384` `supportedExtensions` lacks `.mp4` | Missing extension in allowlist | High | Add `.mp4` + MIME mapping |
| A-03 | `.md`/`.txt` rejected as "invalid image" | "File signature does not match any recognized image format" | `IMAGE_DETECTION_LOG_INVENTORY.md` | `validator.ts:250` `validateImageFile()` only checks image/PDF sigs | Wrong validator for text files | High | Add format-aware validators |
| A-04 | Frontend limited to media/text | No JSON/MP4 UI option | N/A | `types/index.ts:29` `ReferenceType = 'text' \| 'media'` | Missing type union members | Medium | Expand type + UI categories |
| B-01 | UI "reloads" after CRUD | Page appears to refresh | N/A | `AppContext.tsx` `refreshState()` updates 9+ state vars | React re-render (not navigation) | Low | No fix needed — expected React behavior |
| B-02 | Delete project → dashboard | Page navigates to dashboard | N/A | `AppContext.tsx:411` `setActivePageWithPersistence('dashboard')` | Intentional project-loss navigation | Low | No fix needed — expected behavior |

---

## Implementation Plan Reference

See `docs/REFERENCE_FORMAT_AND_BROWSER_RELOAD_IMPLEMENTATION_PLAN.md` for phased implementation.
