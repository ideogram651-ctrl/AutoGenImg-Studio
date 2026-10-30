# Architecture 2.0 Audit Report

**Project:** OpenGen Image Studio  
**Date:** 2026-10-30  
**Status:** COMPLETE

---

## Current Architecture Overview

OpenGen Image Studio is a local-first desktop web application with a React frontend, Node.js/Express backend, and Playwright-based browser automation. The architecture follows a layered pattern:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Sidebar   │  │ Header   │  │ Page Components      │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
│         ↓              ↓              ↓                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │              AppContext (single context)          │   │
│  │  state, manifest, logs, queueState, references    │   │
│  └──────────────────────────────────────────────────┘   │
│         ↓ SSE (/api/events)    ↓ REST (/api/*)          │
├─────────────────────────────────────────────────────────┤
│                    Backend (Express)                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │              API Router (apiRouter.ts)            │   │
│  │  /status, /projects, /bundle, /references,        │   │
│  │  /queue, /gallery, /images, /events               │   │
│  └──────────────────────────────────────────────────┘   │
│         ↓                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │           QueueOrchestrator                       │   │
│  │  State machine, run management, SSE broadcast     │   │
│  └──────────────────────────────────────────────────┘   │
│         ↓                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ ChatGPTAdapter│  │ GeminiAdapter │  │ Simulation   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         ↓                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │         ChromeSessionManager (CDP)                │   │
│  │  Browser launch, page management, CDP connection  │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│              Filesystem (project-data/, browser-profile/) │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ ProjectManager│  │ SettingsMgr   │  │ ZipArchive   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### Frontend (`src/`)

| Module | Responsibility | Quality |
|--------|---------------|---------|
| `App.tsx` | Root layout, page routing (switch-based) | Good — memoized page rendering |
| `context/AppContext.tsx` | Global state, SSE, API wrappers | Large (794 lines) — single context |
| `components/pages/*` | Page-level UI components | Good — well-organized |
| `components/Header.tsx` | Top bar with actions | Good |
| `components/Sidebar.tsx` | Navigation | Good |
| `components/CreateProjectModal.tsx` | Project creation | Good |

### Backend (`src/server/`)

| Module | Responsibility | Quality |
|--------|---------------|---------|
| `apiRouter.ts` | Express API routes (995 lines) | Large but well-organized by section |
| `queueOrchestrator.ts` | Queue state machine, run management | Large (961 lines) but well-structured |
| `projectManager.ts` | Project persistence, file I/O | Good — clear responsibilities |
| `settingsManager.ts` | Settings management | Good |
| `validator.ts` | Format-aware validation | Good |
| `zipArchive.ts` | Project import/export | Good |
| `reportGenerator.ts` | HTML report generation | Good |

### Adapters (`src/server/adapters/`)

| Module | Responsibility | Quality |
|--------|---------------|---------|
| `baseAdapter.ts` | Adapter interface | Good — clean contract |
| `chatgptAdapter.ts` | ChatGPT automation (934 lines) | Large but well-structured |
| `geminiAdapter.ts` | Gemini automation | Good |
| `simulationAdapter.ts` | Demo mode | Good |
| `chatgptDownloadEngine.ts` | Download workflow (577 lines) | Good — well-structured stages |

### Browser (`src/server/browser/`)

| Module | Responsibility | Quality |
|--------|---------------|---------|
| `chromeSessionManager.ts` | Chrome launch, CDP connection, session management | Large (1032 lines) but comprehensive |

---

## Architectural Strengths

1. **Adapter Pattern** — Clean `IProviderAdapter` interface with multiple implementations
2. **Queue State Machine** — Well-defined state transitions with proper locking
3. **Run Isolation** — Each run gets its own directory (`runs/{runId}/`)
4. **Format-Aware Validation** — Different validators for different file types
5. **SSE Streaming** — Real-time progress updates
6. **File Integrity** — SHA-256 checksums on downloads
7. **Separation of Concerns** — Frontend, backend, adapters, browser management are well-separated

## Architectural Weaknesses

1. **Single AppContext** — All state in one context causes unnecessary re-renders
2. **Large Files** — `apiRouter.ts` (995 lines), `queueOrchestrator.ts` (961 lines), `chatgptAdapter.ts` (934 lines), `chromeSessionManager.ts` (1032 lines) are large but not unwieldy
3. **No Database** — JSON file persistence is simple but could be slow for large projects
4. **Hardcoded Paths** — Some paths use `path.resolve(process.cwd(), 'projects')` which assumes a specific working directory
5. **No Error Boundary** — React error boundaries are not implemented
6. **No Logging Abstraction** — Logging is ad-hoc `console.log` calls

## Dependency Direction

Dependencies flow correctly:
- Frontend → AppContext → API → Orchestrator → Adapters → Browser → Filesystem
- No circular dependencies detected
- Shared types in `src/types/index.ts` are imported by both frontend and backend

## Data Flow

### Prompt Generation Workflow

```
Prompt Bundle (JSON) → Validation → Reference Resolution → Queue → Browser Adapter → ChatGPT Interaction → Generation Monitoring → Image Detection → Download → Integrity Verification → Gallery → Project Persistence
```

### Reference Assignment Flow

```
Reference Manager (UI) → AppContext.updateReferences() → API /references/save → Orchestrator.setReferences() → resolveReferencesForPrompt() → Browser Attachment
```

### Gallery Data Flow

```
GET /api/gallery → Orchestrator.getActiveManifest() → Filter SAVED items → Map to gallery items → Image serving via /api/images/:projectId/:filename?run=runId
```

## Recommendations

1. **Split AppContext** — Separate queue state from project state to reduce re-renders
2. **Add React Error Boundaries** — Prevent single component errors from crashing the app
3. **Abstract logging** — Create a structured logger instead of ad-hoc console.log
4. **Add database** — Consider SQLite for large projects (optional, not required)
5. **Split large files** — Consider splitting apiRouter.ts and queueOrchestrator.ts into smaller modules

### Priority: Low

These are improvements, not blockers. The current architecture is functional and maintainable for its scope.<|end|>