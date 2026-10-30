# Professional Restructuring Plan

**Project:** OpenGen Image Studio  
**Date:** 2026-10-30  
**Status:** DESIGN ONLY — No code changes made

---

## 1. Current Repository Tree

```
E:\autogenimg-studio/
├── .aistudio/                    # AI Studio config
├── .vite/                        # Vite dev cache (regenerable)
├── browser-profile/              # Chrome session data (CRITICAL - preserve)
├── dist/                         # Build output (regenerable)
├── docs/                         # Documentation and reports
├── node_modules/                 # Dependencies
├── project-data/                 # User projects (CRITICAL - preserve)
├── public/                       # Static assets
├── reference/                    # External CLI tool (not part of app)
├── server/                       # Empty directory (obsolete)
├── src/                          # Application source
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/               # React components
│   │   ├── pages/                # Page components
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── ...
│   ├── context/                  # React context providers
│   ├── server/                   # Backend server code
│   │   ├── adapters/             # AI provider adapters
│   │   ├── browser/              # Chrome session management
│   │   ├── apiRouter.ts
│   │   ├── projectManager.ts
│   │   ├── queueOrchestrator.ts
│   │   ├── settingsManager.ts
│   │   ├── validator.ts
│   │   └── zipArchive.ts
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility functions
├── tests/                        # Test suites
├── tmp-remediation-test-*/       # Temporary test dirs (obsolete)
├── tmp-targeted-bugfix-*/        # Temporary test dirs (obsolete)
├── *.cjs                         # Temporary dev scripts (obsolete)
├── .env.example                  # Environment template
├── .gitignore                    # Git ignore rules
├── bun.lock                      # Bun lockfile (unused - project uses npm)
├── IMAGE_READINESS_DETECTION_FIX_REPORT.md  # Historical report (duplicate)
├── index.html                    # HTML entry point
├── metadata.json                 # Unknown metadata
├── package.json                  # Package manifest
├── package-lock.json             # npm lock file
├── README.md                     # Project documentation
├── server-repro2.log             # Dev server log
├── server.ts                     # Express server entry
├── test_output.txt               # Test output
├── tsconfig.json                 # TypeScript config
└── vite.config.ts                # Vite configuration
```

---

## 2. Proposed Repository Tree

```
E:\autogenimg-studio/
├── .env.example                  # Environment template
├── .gitignore                    # Git ignore rules (updated)
├── README.md                     # Project documentation (updated)
├── index.html                    # HTML entry point
├── package.json                  # Package manifest (renamed)
├── package-lock.json             # npm lock file
├── server.ts                     # Express server entry
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite configuration
│
├── src/                          # Application source (unchanged structure)
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/               # React components
│   │   ├── pages/                # Page components
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── ...
│   ├── context/                  # React context providers
│   ├── server/                   # Backend server code
│   │   ├── adapters/             # AI provider adapters
│   │   ├── browser/              # Chrome session management
│   │   ├── apiRouter.ts
│   │   ├── projectManager.ts
│   │   ├── queueOrchestrator.ts
│   │   ├── settingsManager.ts
│   │   ├── validator.ts
│   │   └── zipArchive.ts
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility functions
│
├── tests/                        # Test suites (unchanged)
│   ├── *.test.ts
│   └── fixtures/                 # Test fixtures (new)
│
├── public/                       # Static assets
│
├── docs/                         # Documentation (consolidated)
│   ├── README.md                 # Documentation index
│   ├── ARCHITECTURE.md           # Current architecture
│   ├── CURRENT_PROJECT_BASELINE.md
│   ├── TEST_FAILURE_ROOT_CAUSE_REPORT.md
│   ├── PROJECT_CLEANUP_APPROVAL_REPORT.md
│   ├── PROFESSIONAL_RESTRUCTURING_PLAN.md
│   ├── FRONTEND_RENDERING_STABILITY_FINAL_REPORT.md
│   ├── GALLERY_RUN_SYNC_FINAL_REPORT.md
│   ├── JSON_EDITOR_REFERENCE_SYNC_FINAL_REPORT.md
│   ├── PROMPT_REFERENCE_EDITING_FINAL_REPORT.md
│   └── CHATGPT_IMAGE_COMPARISON_RECOVERY_FINAL_REPORT.md
│
├── .aistudio/                    # AI Studio config (keep, gitignore)
├── browser-profile/              # Chrome session (keep, gitignore)
├── dist/                         # Build output (gitignore, regenerable)
├── node_modules/                 # Dependencies (gitignore)
├── project-data/                 # User projects (gitignore, preserve)
├── reference/                    # External CLI tool (keep, consider separate repo)
├── .vite/                        # Vite cache (gitignore, regenerable)
└── test-results/                 # Test output (gitignore, regenerable)
```

---

## 3. Architectural Rationale

### What stays the same

1. **`src/` structure** — The existing separation of `components/`, `context/`, `server/`, `types/`, and `utils/` is clean and appropriate. No changes needed.

2. **Frontend/Backend boundary** — The Express server (`server.ts`) and Vite dev server are co-located. This is appropriate for a local-first application.

3. **Adapter pattern** — The `IProviderAdapter` interface with `ChatGPTAdapter`, `GeminiAdapter`, and `SimulationAdapter` is well-designed. No changes needed.

4. **Test organization** — Tests are in a top-level `tests/` directory, which is standard. No changes needed.

### What should change

1. **Root directory cleanup** — Remove temporary files, logs, and obsolete scripts.
2. **`.gitignore` update** — Add runtime data directories and build artifacts.
3. **Documentation consolidation** — Move the historical report from root to `docs/`.
4. **Package name** — Rename from `react-example` to `opengen-image-studio`.
5. **Clean script** — Fix the Unix-specific `rm -rf` command.

### What should NOT change

1. **Source code structure** — The existing `src/` layout is well-organized.
2. **User data locations** — `project-data/` and `browser-profile/` must remain where they are to preserve existing projects and browser sessions.
3. **Test structure** — Tests are well-organized in `tests/`.
4. **Dependencies** — No unnecessary package changes.

---

## 4. Files and Directories to Move

| Source | Destination | Reason |
|--------|-------------|--------|
| `IMAGE_READINESS_DETECTION_FIX_REPORT.md` | `docs/IMAGE_READINESS_DETECTION_FIX_REPORT.md` | Historical report should be in docs/ |

---

## 5. Files to Consolidate

No files need to be consolidated. The existing documentation is comprehensive and each report covers a distinct topic.

---

## 6. Files to Retain in Current Location

| Path | Reason |
|------|--------|
| `src/` | Application source — well-organized |
| `tests/` | Test suites — standard location |
| `public/` | Static assets — standard location |
| `docs/` | Documentation — standard location |
| `project-data/` | User data — must stay for existing projects |
| `browser-profile/` | Chrome session — must stay for existing sessions |
| `reference/` | External CLI tool — separate concern |
| `server.ts` | Server entry point — standard location |
| `index.html` | HTML entry point — standard location |
| `vite.config.ts` | Vite config — standard location |
| `tsconfig.json` | TypeScript config — standard location |
| `package.json` | Package manifest — standard location |
| `package-lock.json` | npm lock file — standard location |
| `.env.example` | Environment template — standard location |
| `.gitignore` | Git ignore rules — standard location |

---

## 7. Candidates Recommended for Deletion

See `docs/PROJECT_CLEANUP_APPROVAL_REPORT.md` for the full list of 42 cleanup candidates.

Summary:
- 23 temporary `.cjs` debug scripts
- 10 temporary test directories
- 1 empty `server/` directory
- 1 `test-results/` directory
- 3 log/output files
- 3 build/cache artifacts
- 1 unused lockfile (`bun.lock`)
- 1 duplicate report at root

**Total:** ~70MB+ of cleanup candidates

---

## 8. Runtime Path Changes

No runtime path changes are recommended at this time. The existing paths (`project-data/`, `browser-profile/`) are used by:

- `ProjectManager` — reads/writes project data
- `ChromeSessionManager` — reads/writes browser profile
- `QueueOrchestrator` — reads project data, writes manifests and logs

Changing these paths would require updating all consumers and could break existing user projects. The paths are already well-organized within the repository.

---

## 9. Import and Dependency Changes

No import or dependency changes are needed. The existing dependency structure is clean and appropriate.

---

## 10. Configuration Changes

### Recommended `.gitignore` Updates

```
# Dependencies
node_modules/

# Build output
dist/
build/
coverage/

# Development caches
.vite/
.aistudio/

# Temporary files
tmp-*/
*.tmp
*.part
*.bak
*.jsonl

# Test artifacts
test-results/
test_output.txt

# Runtime data (user-specific, must not be committed)
browser-profile/
project-data/

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/

# Logs
*.log
server-repro*.log
```

### Recommended `package.json` Changes

1. Rename `"name"` from `"react-example"` to `"opengen-image-studio"`
2. Fix `clean` script: `rm -rf dist server.js` → `rimraf dist server.js` (cross-platform)
3. Add `typecheck` script: `tsc --noEmit`
4. Add `test:watch` script: `tsx --test --watch tests/**/*.test.ts`

---

## 11. Build-System Implications

No build-system changes are needed. The existing Vite configuration is appropriate for the application's needs.

---

## 12. Test Implications

No test structure changes are needed. The existing test organization in `tests/` is clean and appropriate.

The only test-related improvement is the `newLawPreflightFix.test.ts` guard for missing project data (already implemented).

---

## 13. Packaging Implications

No packaging changes are needed. The application is a local-first desktop application that doesn't require packaging.

---

## 14. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Deleting temp files breaks something | Low | Low | These files are not referenced by any code |
| Removing `.vite/` cache causes slow first dev start | Medium | Low | Cache regenerates automatically |
| Removing `dist/` requires rebuild | Low | Low | `npm run build` regenerates it |
| Removing `bun.lock` has no impact | None | None | Project uses npm, not bun |
| Wrong `.gitignore` excludes user data | Medium | High | `.gitignore` only affects version control, not filesystem |

---

## 15. Rollback Strategy

Since there is no Git repository, rollback is limited. Before any cleanup:

1. Create a backup copy of the entire repository
2. Document every file being deleted
3. Verify the application still works after cleanup

For approved cleanup operations, the execution report will document every change made.

---

## 16. Approval Required

This plan is for review only. No changes have been made.

The user must approve:
1. The cleanup candidates in `docs/PROJECT_CLEANUP_APPROVAL_REPORT.md`
2. The restructuring plan in this document
3. Any specific file moves or deletions

**No destructive operations will be performed without explicit approval.**