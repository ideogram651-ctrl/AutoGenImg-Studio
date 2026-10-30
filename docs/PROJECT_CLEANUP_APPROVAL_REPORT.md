# Project Cleanup Approval Report

**Project:** OpenGen Image Studio  
**Date:** 2026-10-30  
**Status:** AWAITING USER APPROVAL — No destructive operations performed

---

## Summary

| Metric | Value |
|--------|-------|
| Total files/directories inspected | 50+ |
| Definitely obsolete candidates | 20 |
| Potentially obsolete candidates | 5 |
| User data (preserve) | 2 (project-data, browser-profile) |
| Build/cache artifacts | 3 |
| Total disk usage of cleanup candidates | ~150MB+ (mostly node_modules and temp dirs) |

---

## Cleanup Candidates

### Category: DEFINITELY OBSOLETE — Temporary Development Scripts

These `.cjs` files were used during development for debugging and patching. They are not referenced by any source code, test, or configuration.

| ID | Path | Type | Size | Purpose | Usage | Classification | Risk | Recommendation |
|----|------|------|------|---------|-------|----------------|------|----------------|
| C-001 | `check-lines.cjs` | File | 328 bytes | Debug script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-002 | `clean-dead-code.cjs` | File | 2,605 bytes | Dead code cleanup script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-003 | `find-pattern.cjs` | File | 920 bytes | Pattern search script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-004 | `find-return.cjs` | File | 393 bytes | Return statement search script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-005 | `fix-baseline.cjs` | File | 1,665 bytes | Baseline fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-006 | `fix-baseline2.cjs` | File | 946 bytes | Baseline fix script v2 | None | DEFINITELY OBSOLETE | Low | Remove |
| C-007 | `fix-baseline3.cjs` | File | 924 bytes | Baseline fix script v3 | None | DEFINITELY OBSOLETE | Low | Remove |
| C-008 | `fix-close-dialog.cjs` | File | 1,030 bytes | Dialog cleanup script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-009 | `fix-close-selector.cjs` | File | 779 bytes | Selector fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-010 | `fix-close-selector2.cjs` | File | 632 bytes | Selector fix script v2 | None | DEFINITELY OBSOLETE | Low | Remove |
| C-011 | `fix-dialog-cleanup.cjs` | File | 1,030 bytes | Dialog cleanup script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-012 | `fix-dialog-cleanup2.cjs` | File | 1,812 bytes | Dialog cleanup script v2 | None | DEFINITELY OBSOLETE | Low | Remove |
| C-013 | `fix-dialog-cleanup3.cjs` | File | 1,455 bytes | Dialog cleanup script v3 | None | DEFINITELY OBSOLETE | Low | Remove |
| C-014 | `fix-download-check.cjs` | File | 1,687 bytes | Download check fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-015 | `fix-download-click.cjs` | File | 3,729 bytes | Download click fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-016 | `fix-downloadresult.cjs` | File | 6,659 bytes | Download result fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-017 | `fix-ensurepage.cjs` | File | 2,323 bytes | Ensure page fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-018 | `fix-saveas-timing.cjs` | File | 1,723 bytes | Save-as timing fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-019 | `fix-scroll.cjs` | File | 3,383 bytes | Scroll fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-020 | `fix-selectors.cjs` | File | 695 bytes | Selector fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-021 | `fix-waitgen.cjs` | File | 2,148 bytes | Wait generation fix script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-022 | `read-downloadresult.cjs` | File | 215 bytes | Read download result script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-023 | `read-waitgen.cjs` | File | 218 bytes | Read wait generation script | None | DEFINITELY OBSOLETE | Low | Remove |

**Total `.cjs` files:** 23 files, ~35KB

### Category: DEFINITELY OBSOLETE — Temporary Test Directories

These directories were created during development testing and are not part of the application.

| ID | Path | Type | Size | Purpose | Usage | Classification | Risk | Recommendation |
|----|------|------|------|---------|-------|----------------|------|----------------|
| C-024 | `tmp-remediation-test-1793254483552/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |
| C-025 | `tmp-remediation-test-1793285678724/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |
| C-026 | `tmp-targeted-bugfix-1793387178969/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |
| C-027 | `tmp-targeted-bugfix-1793390316706/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |
| C-028 | `tmp-targeted-bugfix-1793393150511/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |
| C-029 | `tmp-targeted-bugfix-1793394943572/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |
| C-030 | `tmp-targeted-bugfix-1793395047510/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |
| C-031 | `tmp-targeted-bugfix-1793398152110/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |
| C-032 | `tmp-targeted-bugfix-1793398205808/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |
| C-033 | `tmp-targeted-bugfix-1793398338538/` | Directory | ~5MB | Temporary test | None | DEFINITELY OBSOLETE | Low | Remove |

**Total temp directories:** 10, ~50MB

### Category: DEFINITELY OBSOLETE — Empty/Unused Directories

| ID | Path | Type | Size | Purpose | Usage | Classification | Risk | Recommendation |
|----|------|------|------|---------|-------|----------------|------|----------------|
| C-034 | `server/` | Directory | Empty | Leftover from `clean` script | None | DEFINITELY OBSOLETE | Low | Remove |
| C-035 | `test-results/` | Directory | ~1MB | Test output artifacts | None (regenerable) | BUILD/CACHE ARTIFACT | Low | Remove |

### Category: DEFINITELY OBSOLETE — Log and Output Files

| ID | Path | Type | Size | Purpose | Usage | Classification | Risk | Recommendation |
|----|------|------|------|---------|-------|----------------|------|----------------|
| C-036 | `server-repro2.log` | File | 10,684 bytes | Dev server log | None | DEFINITELY OBSOLETE | Low | Remove |
| C-037 | `test_output.txt` | File | 342 bytes | Test output | None | DEFINITELY OBSOLETE | Low | Remove |
| C-038 | `IMAGE_READINESS_DETECTION_FIX_REPORT.md` | File | 17,272 bytes | Historical report at root | None (duplicate of docs/) | DEFINITELY OBSOLETE | Low | Remove (duplicate) |

### Category: BUILD/CACHE ARTIFACT — Regenerable

| ID | Path | Type | Size | Purpose | Usage | Classification | Risk | Recommendation |
|----|------|------|------|---------|-------|----------------|------|----------------|
| C-039 | `.vite/` | Directory | ~5MB | Vite dev cache | Regenerable | BUILD/CACHE ARTIFACT | Low | Remove |
| C-040 | `dist/` | Directory | ~10MB | Production build output | Regenerable | BUILD/CACHE ARTIFACT | Low | Remove |
| C-041 | `bun.lock` | File | 71,772 bytes | Bun package lock | None (project uses npm) | DEFINITELY OBSOLETE | Low | Remove |

### Category: PRESERVE — User Data

| ID | Path | Type | Size | Purpose | Usage | Classification | Risk | Recommendation |
|----|------|------|------|---------|-------|----------------|------|----------------|
| P-001 | `project-data/` | Directory | ~50MB+ | User projects, images, refs | Critical | USER DATA | Critical | **PRESERVE** |
| P-002 | `browser-profile/` | Directory | ~20MB+ | Chrome session data | Critical | RUNTIME STATE | Critical | **PRESERVE** |
| P-003 | `.env.example` | File | 445 bytes | Environment template | Referenced | ACTIVELY USED | Low | **PRESERVE** |

### Category: PRESERVE — Source Code

| ID | Path | Type | Size | Purpose | Usage | Classification | Risk | Recommendation |
|----|------|------|------|---------|-------|----------------|------|----------------|
| P-004 | `src/` | Directory | ~500KB | Application source | Critical | ACTIVELY USED | Critical | **PRESERVE** |
| P-005 | `server.ts` | File | 2,369 bytes | Express server entry | Critical | ACTIVELY USED | High | **PRESERVE** |
| P-006 | `index.html` | File | 920 bytes | HTML entry point | Critical | ACTIVELY USED | High | **PRESERVE** |
| P-007 | `vite.config.ts` | File | 1,342 bytes | Vite configuration | Critical | ACTIVELY USED | High | **PRESERVE** |
| P-008 | `tsconfig.json` | File | 580 bytes | TypeScript config | Critical | ACTIVELY USED | High | **PRESERVE** |
| P-009 | `package.json` | File | 973 bytes | Package manifest | Critical | ACTIVELY USED | High | **PRESERVE** |
| P-010 | `package-lock.json` | File | 136,932 bytes | npm lock file | Critical | ACTIVELY USED | High | **PRESERVE** |
| P-011 | `public/` | Directory | ~50KB | Static assets | Active | ACTIVELY USED | Medium | **PRESERVE** |
| P-012 | `tests/` | Directory | ~150KB | Test suites | Active | ACTIVELY USED | Medium | **PRESERVE** |
| P-013 | `docs/` | Directory | ~200KB | Documentation | Active | ACTIVELY USED | Medium | **PRESERVE** |

### Category: REVIEW — Potentially Obsolete

| ID | Path | Type | Size | Purpose | Usage | Classification | Risk | Recommendation |
|----|------|------|------|---------|-------|----------------|------|----------------|
| R-001 | `reference/` | Directory | ~500KB | External CLI tool | Not imported by app | UNUSED BUT POTENTIALLY USEFUL | Medium | Review (keep for reference) |
| R-002 | `metadata.json` | File | 330 bytes | Unknown metadata | Not referenced | UNKNOWN | Low | Review |
| R-003 | `check-lines.cjs` | File | 328 bytes | Already in C-001 | None | DEFINITELY OBSOLETE | Low | Remove |
| R-004 | `.aistudio/` | Directory | ~10KB | AI Studio config | Unknown | UNKNOWN | Low | Review |
| R-005 | `metadata.json` | File | 330 bytes | Unknown | Not referenced | UNKNOWN | Low | Review |

---

## .gitignore Improvements Recommended

Current `.gitignore`:
```
node_modules/
build/
dist/
coverage/
.DS_Store
*.log
.env*
!.env.example
```

Recommended additions:
```
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

# Runtime data (user-specific)
browser-profile/
project-data/

# OS files
Thumbs.db
.DS_Store

# IDE files
.vscode/
.idea/

# Logs
*.log
server-repro*.log
```

**WARNING:** `browser-profile/` and `project-data/` contain user data and browser sessions. They should be ignored from version control but must NOT be deleted from the filesystem.

---

## Package.json Improvements Recommended

1. **Rename package:** `"react-example"` → `"opengen-image-studio"`
2. **Fix `clean` script:** Uses `rm -rf` (Unix-specific). Change to cross-platform: `rimraf dist server.js`
3. **Add `test:watch` script:** `tsx --test --watch tests/**/*.test.ts`
4. **Add `typecheck` script:** `tsc --noEmit`

---

## Total Cleanup Impact

| Category | Files/Directories | Estimated Size |
|----------|-------------------|----------------|
| Definitely obsolete (.cjs scripts) | 23 files | ~35KB |
| Temporary test directories | 10 dirs | ~50MB |
| Empty/unused directories | 2 dirs | ~1MB |
| Log/output files | 3 files | ~28KB |
| Build/cache artifacts | 3 items | ~20MB |
| Unused lockfile | 1 file | ~72KB |
| **Total cleanup** | **42 items** | **~70MB+** |

---

## Important Notes

1. **No destructive operations have been performed.** This report is for approval only.
2. **User data is preserved** — `project-data/` and `browser-profile/` are explicitly marked as PRESERVE.
3. **Build artifacts are regenerable** — `dist/` and `.vite/` can be safely removed and regenerated.
4. **Temporary test directories** contain copies of project data and can be safely removed.
5. **The `reference/` directory** contains an external CLI tool that is not part of the main application. It should be reviewed separately.

---

## Approval Required

Please review the above candidates and provide explicit approval for:

1. **Remove** — Delete the listed obsolete files and directories
2. **Relocate** — Move runtime data outside the source tree (if desired)
3. **Preserve** — Confirm which files must be kept

A general approval to "clean the project" does NOT authorize deletion of all candidates. Please approve specific candidate IDs (e.g., C-001 through C-038) or categories.

**No destructive operations will be performed without explicit approval.**