# PROJECT LOG FORENSIC INVENTORY
## OpenGen Image Studio — Complete Logging System Audit

**Investigation Date:** 2026-10-30
**Project Root:** `e:\autogenimg-studio`
**Status:** Complete — all log sources discovered and catalogued

---

## 1. LOGGING SYSTEM OVERVIEW

| # | Logging System | Format | Status | Location |
|---|---------------|--------|--------|----------|
| 1 | Application Console Log | `console.log/warn/error` | Active | Source code + stdout |
| 2 | Structured Event Log | JSONL (`events.jsonl`) | Active | Per-project + per-run directories |
| 3 | Plain Text Run Log | Timestamped text (`run.log`) | Active | Per-project + per-run directories |
| 4 | Vite Dev Server Log | Console output | Active | `server-repro2.log` |
| 5 | Browser Console (via Playwright/CDP) | Not persisted | Active | Not captured to disk |
| 6 | SSE Event Stream | `text/event-stream` | Active | Runtime only (not persisted) |
| 7 | Crashpad (Chrome) | Binary | Inactive | `browser-profile/Crashpad/reports` |
| 8 | Chrome LevelDB logs | Binary | Active | `browser-profile/Default/*/*.log` |

---

## 2. DETAILED LOG INVENTORY

### 2.1 Application Root Log

| Field | Value |
|---|---|
| **Filename** | `server-repro2.log` |
| **Location** | `e:\autogenimg-studio\server-repro2.log` |
| **Component** | Vite dev server + Express server startup |
| **Format** | ANSI-colored console output |
| **Coverage** | 2026-10-29 ~10:27 AM to ~10:55 AM |
| **Lines** | ~69 lines |
| **Inspected** | Complete |
| **Key Findings** | - Vite config warning about `__dirname` usage<br>- WebSocket port conflict (24678 already in use)<br>- Server running on port 3001<br>- Repeated page reload events for test report pages |

---

### 2.2 Project-Level Run Logs (plain text)

Each project has a project-level `run.log` that aggregates all run events for that project.

#### 2.2.1 `new_law` project run log

| Field | Value |
|---|---|
| **Filename** | `run.log` |
| **Location** | `e:\autogenimg-studio\project-data\imported-project-4476\output\logs\run.log` |
| **Component** | QueueOrchestrator (all runs for `new_law` project) |
| **Format** | `[ISO_TIMESTAMP] [SEVERITY] [TYPE] [PROMPT_ID] message` |
| **Coverage** | 2026-10-29T11:17:04Z to 2026-10-29T19:21:09Z |
| **Lines** | 184 lines |
| **Inspected** | Complete |
| **Key Findings** | - Two successful runs: `run-1793272637541-6fb7` (300s timeout on IMG-001, then retry success) and `run-1793282984216-v98j` (user pause, then completion)<br>- One long successful run completing all 5 images (IMG-001 through IMG-005)<br>- Two PREFLIGHT_ERROR entries for missing reference file `cinematic_anamorphic_35mm.png` (REF-STYLE-01) |

#### 2.2.2 `stickman` project run log

| Field | Value |
|---|---|
| **Filename** | `run.log` |
| **Location** | `e:\autogenimg-studio\project-data\stickman\output\logs\run.log` |
| **Component** | QueueOrchestrator (all runs for `stickman` project) |
| **Format** | `[ISO_TIMESTAMP] [SEVERITY] [TYPE] [PROMPT_ID] message` |
| **Coverage** | 2026-10-30T05:09:45Z to 2026-10-30T06:07:40Z |
| **Lines** | 101 lines |
| **Inspected** | Complete |
| **Key Findings** | - Run `run-1793337205282-ctar`: SUBMISSION_FAILED on IMG-001 (multiple references error)<br>- Run `run-1793337257227-47z5`: Completed 4 of 5 prompts (IMG-001 timed out after 60s, IMG-002 through IMG-005 saved)<br>- Run `run-1793339994404-8r4i`: All 5 prompts saved despite 60s timeout warnings on IMG-001 and IMG-002 |

---

### 2.3 Run-Specific Logs

Each individual run has its own `run.log` in its run directory.

| # | File | Run ID | Project | Lines | Key Events |
|---|------|--------|---------|-------|------------|
| 1 | `imported-project-4476/runs/run-1793271954435-bc7o/logs/run.log` | run-1793271954435-bc7o | new_law | 1 | PROJECT_LOADED only |
| 2 | `imported-project-4476/runs/run-1793296402831-07c5/logs/run.log` | run-1793296402831-07c5 | new_law | 42 | Full successful run, 5 images saved |
| 3 | `stickman/runs/run-1793337205282-ctar/logs/run.log` | run-1793337205282-ctar | stickman | 7 | SUBMISSION_FAILED on IMG-001 (multiple refs) |
| 4 | `stickman/runs/run-1793337257227-47z5/logs/run.log` | run-1793337257227-47z5 | stickman | 48 | IMG-001 timeout, IMG-002..005 saved |
| 5 | `stickman/runs/run-1793339994404-8r4i/logs/run.log` | run-1793339994404-8r4i | stickman | 43 | Timeouts on IMG-001/002, all saved via retry |

---

### 2.4 Structured Event Logs (JSONL)

Structured `LogEvent` records with `id`, `timestamp`, `runId`, `promptId`, `type`, `severity`, `message`, optional `durationMs` and `outputPath`.

| # | File | Project | Lines | Format |
|---|------|---------|-------|--------|
| 1 | `imported-project-4476/project-data/events.jsonl` | new_law | 184 | JSONL (one JSON object per line) |
| 2 | `imported-project-4476/runs/run-1793271954435-bc7o/logs/events.jsonl` | new_law | 1 | JSONL |
| 3 | `imported-project-4476/runs/run-1793296402831-07c5/logs/events.jsonl` | new_law | 42 | JSONL |
| 4 | `stickman/project-data/events.jsonl` | stickman | 7 | JSONL |
| 5 | `stickman/runs/run-1793337205282-ctar/logs/events.jsonl` | stickman | 7 | JSONL |
| 6 | `stickman/runs/run-1793337257227-47z5/logs/events.jsonl` | stickman | 48 | JSONL |
| 7 | `stickman/runs/run-1793339994404-8r4i/logs/events.jsonl` | stickman | 43 | JSONL |

---

### 2.5 Chrome Profile Logs (Browser internals)

These are Chrome's internal LevelDB/extension logs, NOT application logs. Listed for completeness.

| Location | Description |
|---|---|
| `browser-profile/Default/*/000003.log` | Chrome LevelDB log files (multiple) |
| `browser-profile/Default/IndexedDB/https_chatgpt.com_0.indexeddb.leveldb/000039.log` | ChatGPT IndexedDB log |
| `browser-profile/Default/Local Storage/leveldb/000016.log` | Local storage LevelDB log |
| `browser-profile/Crashpad/reports/` | Crashpad crash reports (directory exists, may be empty) |
| `browser-profile/Crashpad/settings.dat` | Crashpad settings |
| `browser-profile/CrashpadMetrics-active.pma` | Crashpad metrics |
| `browser-profile/.autogenimg-session.json` | Application session marker |

---

### 2.6 Test Result Logs

| # | File | Description |
|---|------|-------------|
| 1 | `test-results/.last-run.json` | Last test execution results |
| 2 | `test_output.txt` | Test output capture |

---

## 3. LOG FORMAT SPECIFICATION

### 3.1 Plain Text Run Log Format

```
[YYYY-MM-DDTHH:mm:ss.sssZ] [SEVERITY] [TYPE] [PROMPT_ID] message
```

**Severity levels:** INFO, WARN, ERROR, SUCCESS

**Event types observed:**
- `PROJECT_LOADED` — Project configuration loaded
- `RUN_STARTED` — Queue run started
- `ITEM_PREPARING` — Prompt preparation started
- `ITEM_SUBMITTING` — Prompt submission to UI started
- `ADAPTER_PREPARING` — Adapter baseline capture / attachment
- `ADAPTER_SUBMITTING` — Prompt text entry
- `ITEM_GENERATING` — Waiting for generation result
- `ITEM_DOWNLOADING` — Download activated
- `ITEM_SAVED` — Image saved successfully
- `ITEM_REVIEW_NEEDED` — Item placed in review (timeout or failure)
- `DOWNLOAD_RETRY` — Download retry attempted
- `DOWNLOAD_RETRY_SUCCESS` — Download retry succeeded
- `RUN_PAUSED` — Run paused
- `RUN_RESUMED` — Run resumed
- `RUN_STOPPED` — Run stopped by user
- `RUN_COMPLETED` — Run completed
- `SESSION_ERROR` — Browser session initialization failed
- `PREFLIGHT_ERROR` — Reference validation failed before run
- `SUBMISSION_FAILED` — Prompt submission failed
- `REGENERATION_REQUESTED` — User requested regeneration
- `ITEM_SKIPPED` — Item skipped by user

### 3.2 Structured Event Log Format (JSONL)

```json
{
  "id": "evt-<timestamp>-<random>",
  "timestamp": "ISO-8601",
  "runId": "<run-id or empty>",
  "promptId": "<prompt-id or absent>",
  "type": "<event-type>",
  "severity": "info\|warn\|error\|success",
  "message": "<human-readable>",
  "durationMs": <optional>,
  "outputPath": "<optional file path>"
}
```

---

## 4. LOGGING CODE PATHS

### 4.1 QueueOrchestrator Logging (`src/server/queueOrchestrator.ts`)

- **`log()` method** (line 278): Creates `LogEvent`, appends to project via `projectManager.appendEvent()`, broadcasts via SSE
- All queue state transitions logged through this method
- Events persisted to `events.jsonl` and `run.log`

### 4.2 ChatGPT Adapter Logging (`src/server/adapters/chatgptAdapter.ts`)

- Uses `console.log()` directly with `[chatgptAdapter/...]` prefix
- Logs baseline capture, attachment, submission, detection, download stages
- **Not routed through the structured LogEvent system** — console-only

### 4.3 Download Engine Logging (`src/server/adapters/chatgptDownloadEngine.ts`)

- Uses `console.log()` with `[chatgptDownloadEngine]` prefix
- Has optional `onLog` callback for structured events
- Forwarded to adapter's `logDownloadStage()` method

### 4.4 ProjectManager Event Persistence (`src/server/projectManager.ts`)

- **`appendEvent()`**: Appends `LogEvent` to `events.jsonl`
- Also writes to `run.log` in plain text format
- Called by QueueOrchestrator's `log()` method

### 4.5 Settings Manager (`src/server/settingsManager.ts`)

- Logs warnings on settings parse failure
- Logs errors on settings save failure
- Uses `console.warn()` / `console.error()`

---

## 5. LOG COVERAGE ANALYSIS

| Area | Logged? | Source | Notes |
|---|---|---|---|
| Project loading | ✅ | QueueOrchestrator | PROJECT_LOADED |
| Bundle loading | ✅ | QueueOrchestrator | BUNDLE_UPDATED |
| Reference resolution | ⚠️ | QueueOrchestrator | Only via resolveReferencesForPrompt (no log) |
| Browser navigation | ⚠️ | Adapter | Console log only |
| File attachment | ✅ | Adapter | ADAPTER_PREPARING log |
| Upload progress | ❌ | — | No upload progress logging |
| Send button state | ❌ | — | No send button state logging |
| Prompt submission | ✅ | Adapter | ADAPTER_SUBMITTING log |
| Generation monitoring | ✅ | Adapter/Orchestrator | ITEM_GENERATING, waitForGeneration polls |
| Image detection | ✅ | Adapter | Console log only |
| Download | ✅ | Orchestrator | ITEM_DOWNLOADING, ITEM_SAVED |
| Download retry | ✅ | Orchestrator | DOWNLOAD_RETRY, DOWNLOAD_RETRY_SUCCESS |
| Review/retry | ✅ | Orchestrator | ITEM_REVIEW_NEEDED |
| Regeneration | ✅ | Orchestrator | REGENERATION_REQUESTED |
| Queue pause/resume | ✅ | Orchestrator | RUN_PAUSED, RUN_RESUMED, RUN_STOPPED |
| Preflight validation | ✅ | Orchestrator | PREFLIGHT_ERROR |
| File integrity (SHA-256) | ✅ | Orchestrator | ITEM_SAVED includes SHA-256 |

---

## 6. MISSING OR INACCESSIBLE LOGS

| # | Log Type | Expected Location | Status | Reason |
|---|----------|-------------------|--------|--------|
| 1 | Browser console errors/warnings | Not persisted | Missing | Playwright console messages not captured to file |
| 2 | Network request/response logs | Not persisted | Missing | No HAR or network logging configured |
| 3 | Upload progress events | Not logged | Missing | No upload progress tracking in adapter |
| 4 | Send button state transitions | Not logged | Missing | No DOM state logging for Send button |
| 5 | Reference file hash on upload | Not logged | Missing | No pre-upload integrity validation |
| 6 | Composer state (dirty/clean) | Not logged | Missing | No composer content tracking |

---

## 7. EXECUTION TIMELINE SUMMARY

### Run `run-1793296402831-07c5` (new_law, fully successful)

| Time | Event | Prompt | Details |
|------|-------|--------|---------|
| 17:53:22.878 | RUN_STARTED | — | Live automation |
| 17:53:22.895 | ITEM_PREPARING | IMG-001 | Preparing references |
| 17:53:22.900 | ITEM_SUBMITTING | IMG-001 | Submitting to UI |
| 17:53:24.512 | ADAPTER_PREPARING | IMG-001 | Baseline capture |
| 17:53:26.167 | ADAPTER_PREPARING | IMG-001 | Attaching 1 media reference |
| 17:53:28.221 | ADAPTER_SUBMITTING | IMG-001 | Entering prompt |
| 17:53:32.167 | ITEM_GENERATING | IMG-001 | Waiting for result |
| 17:54:26.416 | ITEM_DOWNLOADING | IMG-001 | Download activated |
| 17:54:30.883 | ITEM_SAVED | IMG-001 | 1,843,355 bytes |
| ... | ... | IMG-002..005 | Similar pattern, all saved |
| 17:57:30.374 | RUN_COMPLETED | — | Saved: 5, Review: 0, Failed: 0 |

### Run `run-1793337205282-ctar` (stickman, SUBMISSION_FAILED)

| Time | Event | Prompt | Details |
|------|-------|--------|---------|
| 05:13:25.361 | RUN_STARTED | — | Live automation |
| 05:13:25.432 | ITEM_PREPARING | IMG-001 | Preparing references |
| 05:13:25.438 | ITEM_SUBMITTING | IMG-001 | Submitting to UI |
| 05:13:28.320 | ADAPTER_PREPARING | IMG-001 | Baseline capture |
| 05:13:30.486 | ADAPTER_PREPARING | IMG-001 | **Attaching 2 media reference files** |
| 05:13:30.544 | SUBMISSION_FAILED | IMG-001 | **Non-multiple file input can only accept single file** |
| 05:13:30.581 | RUN_PAUSED | — | Queue halted on submission error |

### Run `run-1793339994404-8r4i` (stickman, timeout then success)

| Time | Event | Prompt | Details |
|------|-------|--------|---------|
| 06:00:18.589 | ADAPTER_SUBMITTING | IMG-001 | Entering prompt |
| 06:00:18.589 | ITEM_GENERATING | IMG-001 | Waiting for result |
| 06:01:18.653 | ITEM_REVIEW_NEEDED | IMG-001 | **Timeout: still actively generating** |
| 06:01:18.696 | RUN_PAUSED | — | Provider still generating |
| 06:01:53.854 | DOWNLOAD_RETRY | IMG-001 | Retrying download |
| 06:01:58.439 | DOWNLOAD_RETRY_SUCCESS | IMG-001 | File downloaded |
| ... | ... | IMG-002..005 | IMG-002 also timed out, all saved |
| 06:07:40.793 | RUN_COMPLETED | — | Saved: 5, Review: 0, Failed: 0 |

---

## 8. LOGGING SYSTEM ASSESSMENT

### Active Logging Systems
1. **QueueOrchestrator → ProjectManager → events.jsonl + run.log**: Complete, structured, persistent
2. **Console.log in adapters**: Real-time debugging, not structured, not persisted to project logs
3. **Vite dev server**: Development only

### Gaps
1. **No upload progress logging** — Critical for Problem D (upload synchronization)
2. **No Send button state logging** — Critical for Problem E
3. **No browser console capture** — Missing frontend error context
4. **No reference file integrity logging on upload** — Missing for Problem F
5. **Adapter logs not integrated into structured event system** — Console-only, not in events.jsonl

---

## 9. SOURCE CODE → LOG MAPPING

| Log Type | Source File | Function/Method | Line Range |
|----------|------------|-----------------|------------|
| PROJECT_LOADED | queueOrchestrator.ts | `setProject()` | 137 |
| RUN_STARTED | queueOrchestrator.ts | `startRun()` | 428 |
| ITEM_PREPARING/SUBMITTING | queueOrchestrator.ts | `processItem()` | 662-673 |
| ADAPTER_PREPARING | chatgptAdapter.ts | `submitPrompt()` | 178, 287 |
| ADAPTER_SUBMITTING | chatgptAdapter.ts | `submitPrompt()` | 343 |
| ITEM_GENERATING | queueOrchestrator.ts | `processItem()` | 688 |
| ITEM_DOWNLOADING | queueOrchestrator.ts | `processItem()` | 744 |
| ITEM_SAVED | queueOrchestrator.ts | `processItem()` | 785 |
| ITEM_REVIEW_NEEDED | queueOrchestrator.ts | `processItem()` | 732 |
| DOWNLOAD_RETRY/SUCCESS | queueOrchestrator.ts | `retryDownload()` / `processItem()` | 824-842 |
| PREFLIGHT_ERROR | queueOrchestrator.ts | `startRun()` / `validateAssignedReferences()` | 324-327, 230 |
| SUBMISSION_FAILED | queueOrchestrator.ts | `processItem()` | 669-673 |
| REGENERATION_REQUESTED | queueOrchestrator.ts | `regeneratePrompt()` | 808 |
| RUN_PAUSED/RESUMED/STOPPED | queueOrchestrator.ts | `pauseRun()`/`resumeRun()`/`stopRun()` | 469, 501, 536 |
| SESSION_ERROR | queueOrchestrator.ts | `startRun()` | 413 |
| Log persistence | projectManager.ts | `appendEvent()` | — |
| Event broadcast | queueOrchestrator.ts | `broadcast()` | 253-259 |

---

**END OF INVENTORY**
