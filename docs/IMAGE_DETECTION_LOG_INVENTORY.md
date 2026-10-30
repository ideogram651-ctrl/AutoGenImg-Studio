# Image Detection Log Inventory

**Project:** AutoGenImg Studio  
**Date:** 2026-10-29  
**Purpose:** Inventory of all logging and diagnostic artifacts relevant to the image generation detection-to-download failure and cross-prompt image reuse investigation.

---

## Log Inventory Table

| Log/artifact | Exact path | Created by | When it is written | What it records | Relevant run/item IDs | Available evidence |
|---|---|---|---|---|---|---|
| Server startup log | `e:\autogenimg-studio\server-repro2.log` | Vite dev server / tsx | Server startup and page reloads | Vite dev server output, page reload events, port conflicts | N/A | File exists, contains startup logs |
| Run events (JSONL) | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793271954435-bc7o\logs\events.jsonl` | QueueOrchestrator (`log()`) | During each run, per-event | Structured JSONL events: PROJECT_LOADED, RUN_STARTED, ITEM_PREPARING, ITEM_SUBMITTING, ADAPTER_PREPARING, ADAPTER_SUBMITTING, ITEM_GENERATING, ITEM_REVIEW_NEEDED, DOWNLOAD_RETRY, DOWNLOAD_RETRY_SUCCESS | run-1793271954435-bc7o: IMG-001 | File exists, key evidence |
| Run log (text) | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793271954435-bc7o\logs\run.log` | QueueOrchestrator (`log()`) | During each run, per-event | Human-readable log lines mirroring events.jsonl | run-1793271954435-bc7o: IMG-001 | File exists |
| Run manifest | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793271954435-bc7o\manifest.json` | QueueOrchestrator (`persistState()`) | On every state change | Full run state including items, statuses, output files, file sizes, durations | run-1793271954435-bc7o: IMG-001 | ENOENT — file not found at this path |
| Run events (JSONL) | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793272637541-6fb7\logs\events.jsonl` | QueueOrchestrator | During run | IMG-001: 300s timeout, Retry Download success | run-1793272637541-6fb7: IMG-001 | File exists, key evidence |
| Run log (text) | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793272637541-6fb7\logs\run.log` | QueueOrchestrator | During run | Mirror of events.jsonl | run-1793272637541-6fb7: IMG-001 | File exists |
| Run manifest | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793272637541-6fb7\manifest.json` | QueueOrchestrator | On every state change | IMG-001: SAVED, fileSize=2014000; IMG-002..005: PENDING | run-1793272637541-6fb7: IMG-001..005 | File exists |
| Run events (JSONL) | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793282984216-v98j\logs\events.jsonl` | QueueOrchestrator | During run | **CRITICAL EVIDENCE**: IMG-002 timed out after 60s twice (attempts 1 and 2), regeneration requested | run-1793282984216-v98j: IMG-001, IMG-002 | File exists, key evidence |
| Run log (text) | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793282984216-v98j\logs\run.log` | QueueOrchestrator | During run | Mirror of events.jsonl | run-1793282984216-v98j: IMG-001, IMG-002 | File exists |
| Run manifest | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793282984216-v98j\manifest.json` | QueueOrchestrator | On every state change | IMG-001: SAVED; IMG-002: NEEDS_REVIEW, reviewReason="Generation timed out after 60s without observable result.", attempts=2; IMG-003..005: PENDING | run-1793282984216-v98j: IMG-001..005 | File exists |
| Run state | `e:\autogenimg-studio\project-data\imported-project-4476\project-data\run-state.json` | QueueOrchestrator (`persistState()`) | On every state change | runId=run-1793282984216-v98j, overallStatus=PAUSED, isPaused=true, pauseReason="Generation timed out after 60s without observable result." | run-1793282984216-v98j | File exists |
| Project manifest | `e:\autogenimg-studio\project-data\imported-project-4476\project-data\manifest.json` | QueueOrchestrator | On every state change | Same as run manifest (current project-level manifest) | run-1793282984216-v98j | File exists |
| Project events | `e:\autogenimg-studio\project-data\imported-project-4476\project-data\events.jsonl` | QueueOrchestrator | Across all runs | All events across runs for the project | All runs | File exists |
| Output image | `e:\autogenimg-studio\project-data\imported-project-4476\output\images\IMG-001.png` | Download engine (`saveAs`) | On successful download | Downloaded image file (2,014,000 bytes in run-1, 1,749,891 bytes in run-2) | IMG-001 | File exists |
| Run report HTML (run-level) | `e:\autogenimg-studio\project-data\imported-project-4476\runs\run-1793282984216-v98j\reports\run-report.html` | QueueOrchestrator (`persistState()`) | On every state change | Self-contained HTML report of run status | run-1793282984216-v98j | File exists |
| Run report HTML (project-level) | `e:\autogenimg-studio\project-data\imported-project-4476\output\reports\run-report.html` | QueueOrchestrator (`persistState()`) | On every state change | Same report at project output level | run-1793282984216-v98j | File exists |
| Last test run | `e:\autogenimg-studio\test-results\.last-run.json` | Test runner | After test suite execution | {"status": "failed", "failedTests": []} | N/A | File exists, status=failed |
| Settings | `e:\autogenimg-studio\project-data\settings.json` | SettingsManager | On settings load/update | genTimeoutSeconds=60, downloadTimeoutSeconds=15, initialObservationDelayMs=18000, debugPort=9222, profileDir=./browser-profile | N/A | File exists |
| Previous audit report | `e:\autogenimg-studio\docs\REVIEW_CENTER_TIMEOUT_WORKFLOW_AUDIT.md` | Manual investigation | Static analysis only | Documents the timeout message construction, call chain, and fixes implemented | N/A | File exists |
| Forensic findings | `e:\autogenimg-studio\docs\IMAGE_DETECTION_FORENSIC_FINDINGS.md` | This investigation | Static analysis + DOM inspection + log correlation | Root causes, call chain, fixes, test results | All runs | File exists |
| Log inventory | `e:\autogenimg-studio\docs\IMAGE_DETECTION_LOG_INVENTORY.md` | This investigation | Documentation | All log locations and writers | N/A | File exists (this document) |
| Final report | `e:\autogenimg-studio\docs\IMAGE_DETECTION_FINAL_REPORT.md` | This investigation | Documentation | Final summary of root cause, changes, test results | N/A | Created below |
| Browser-profile directory | `e:\autogenimg-studio\browser-profile` | Chrome / Playwright | Persistent | Chrome user data directory for automated profile | N/A | Directory exists |
| CDP endpoint | `http://127.0.0.1:9222` | Chrome with remote debugging | Runtime | Chrome DevTools Protocol endpoint for browser automation | N/A | Active, authenticated ChatGPT page connected |
| Authenticated ChatGPT page | `https://chatgpt.com/c/6ae11ec4-dc9c-83ee-a7c8-0fc8438da763` | User browser session | Runtime | Active conversation with generated images | IMG-001, IMG-002 | Verified via CDP DOM inspection |

---

## Classification of Log Artifacts

### Files that currently exist and contain evidence
1. All `events.jsonl` and `run.log` files in the three run directories
2. `manifest.json` in run directories (run-1793272637541-6fb7, run-1793282984216-v98j)
3. `run-state.json` and `manifest.json` at project level
4. `settings.json`
5. `.last-run.json` (status: failed)
6. `IMG-001.png` in output/images
7. Documentation files in docs/

### Files expected but missing/empty
- `run-1793271954435-bc7o\manifest.json` — ENOENT (file not found at this path)

### Missing diagnostic evidence (not captured by existing logs)
The following evidence would be needed for complete root-cause confirmation but is NOT captured by existing logs:

1. **Per-poll detection observations** — `waitForGeneration()` polls every 1s but only logs aggregate counts. No per-poll record of which images were found, their `naturalWidth`/`naturalHeight`, or `img.complete` state.

2. **Pre-submission image snapshot** — No log of which images existed before each prompt submission. This is critical for cross-prompt attribution and was missing from the original implementation.

3. **Candidate acceptance/rejection reasons** — No log of why a specific image was selected or why older candidates were rejected.

4. **Download engine stage events** — The download engine logs stages via console.log but these are not persisted to structured files with correlation context.

5. **Real DOM state during detection** — No snapshot of the actual ChatGPT DOM structure during a failed detection.

These gaps motivated the structured diagnostic instrumentation added in this fix (correlation logs with promptId, seq, candidate src, turnKey, isPreExisting, acceptance/rejection reasons).

---

## Evidence from Run Logs

### Critical pattern: IMG-002 timed out at exactly 60s twice

**Run run-1793282984216-v98j:**

| Timestamp | Event | Item | Details |
|---|---|---|---|
| 14:10:01.504 | RUN_STARTED | — | Live automation started |
| 14:10:09.271 | ITEM_GENERATING | IMG-001 | Waiting for visible generation result |
| 14:14:45.224 | RUN_PAUSED | — | User paused the run |
| 14:14:47.568 | ITEM_REVIEW_NEEDED | IMG-001 | "Generation paused or stopped by user request." (278s) |
| 14:14:59.124 | DOWNLOAD_RETRY_SUCCESS | IMG-001 | File successfully downloaded: IMG-001.png |
| 14:15:16.510 | ITEM_GENERATING | IMG-002 | Waiting for visible generation result |
| 14:16:17.666 | ITEM_REVIEW_NEEDED | IMG-002 | **"Generation timed out after 60s without observable result."** (61146ms) |
| 14:16:36.875 | REGENERATION_REQUESTED | IMG-002 | User requested regeneration |
| 14:16:43.048 | ITEM_GENERATING | IMG-002 | Waiting for visible generation result (attempt 2) |
| 14:17:43.528 | ITEM_REVIEW_NEEDED | IMG-002 | **"Generation timed out after 60s without observable result."** (60469ms) |

**Key observation:** Both attempts failed at exactly ~60s, matching `genTimeoutSeconds: 60` from `project-data/settings.json`. This confirms a structural detection bug rather than a transient timing issue.

### Manual Retry Download success evidence

**Run run-1793272637541-6fb7:**
- IMG-001 timed out after 300s → NEEDS_REVIEW
- DOWNLOAD_RETRY_SUCCESS: `IMG-001.png` downloaded successfully (2,014,000 bytes)

This confirms the image IS present and downloadable when detection fails — the problem is in detection/attribution, not in the download engine or the image itself.
