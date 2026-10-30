# Runtime Architecture Engineering Report

**Project:** OpenGen Image Studio  
**Date:** 2026-10-30  
**Status:** COMPLETE

---

## Browser Automation Architecture

### Chrome Session Lifecycle

1. **Detection:** `ChromeSessionManager.detectChrome()` scans standard paths + env var
2. **Launch:** `launchChrome()` spawns Chrome with `--remote-debugging-port`, isolated profile dir
3. **Connect:** `connectOverCDP()` via Playwright to established CDP endpoint
4. **Page Management:** Single page instance reused across prompts
5. **Disconnect:** `disconnect()` closes browser connection without killing Chrome
6. **Stop:** `stopLaunchedBrowser()` kills Chrome process if owned by app

### Queue Orchestration

- **State Machine:** PREPARING → SUBMITTING → GENERATING → RESULT_READY → DOWNLOADING → SAVED
- **Single-Flight:** `isLoopRunning` + `activeLoopPromise` prevent concurrent execution
- **Preflight:** `validateAssignedReferences()` checks all reference files exist before run start
- **Recovery:** Paused/failed items can be retried individually
- **Persistence:** Manifest saved after every item state change

### Generation Monitoring

- **Polling:** 1s interval, checks for new images in DOM
- **Observation Delay:** 18s default before detection begins
- **Stability Check:** Same image observed for 2s → generation complete
- **Timeout:** Configurable (default 60s), distinguishes "still generating" from "failed"
- **Comparison UI Detection:** Multi-signal detection with recovery loop (5s, 10s, 15s, 20s)

### File Management

- **Upload:** Base64 → server → format-aware validation → SHA-256 checksum → save to project references dir
- **Download:** Share dialog → browser download event → .part staging → SHA-256 verification → atomic move → mirror to output/images
- **Integrity:** SHA-256 checksums on all reference files and generated images

### Project Persistence

- **Files:** `project.json`, `prompt-bundle.json`, `references.json`, `manifest.json`, `events.jsonl`, `run-state.json`
- **Location:** `<projectPath>/project-data/` and `<projectPath>/input/`
- **Auto-save:** Debounced 1s after any state change
- **Backup:** `.bak` files created before overwriting canonical bundle

### Error Handling

- **Preflight errors:** Block run start with descriptive message
- **Submission failures:** Pause queue, mark item FAILED
- **Generation timeouts:** Distinguish "still generating" from "failed" (P-002, P-005 fix)
- **Download failures:** Mark NEEDS_REVIEW, allow retry
- **Auth challenges:** Pause with BLOCKED_AUTH status
- **Comparison UI:** Move to review, continue queue

### Logging

- **Structured events:** JSONL format in `events.jsonl`
- **Console logs:** Real-time debugging with `[adapter/detect]` prefixes
- **SSE streaming:** Live state/log/item_update broadcasts
- **Log levels:** info, warn, error, success

### Performance Optimizations

- **SSE throttling:** 300ms throttle on state updates (frontend)
- **Vite watch ignored:** Automation-generated files excluded from HMR
- **Memoized page rendering:** `useMemo` for active page element
- **Poll logging:** Only logs when image count changes
- **Pre-existing image logging:** Only logs once per image

---

## Runtime Improvements Implemented

1. **Frontend re-render prevention** — Vite watch ignored + SSE throttling + memoized rendering
2. **Gallery run-awareness** — `runId` in imageUrl for cache-busting, run-specific directory search
3. **Reference consistency** — `updateReferences()` reconciles bundle referenceIds
4. **Edit JSON sync** — Derives Reference Manager assignments from edited bundle
5. **Comparison UI recovery** — Multi-signal detection, recovery loop, duplicate prevention
6. **Frontend stability** — Throttled SSE, memoized components

## Remaining Considerations

- No database (JSON file persistence) — adequate for current scope
- No error boundary in React — single component error can crash the app
- No structured logging abstraction — ad-hoc console.log calls
- No process manager — Chrome process lifecycle is manual

These are improvements, not blockers. The current architecture is functional and maintainable.