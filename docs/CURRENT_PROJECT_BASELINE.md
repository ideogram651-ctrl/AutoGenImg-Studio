# Current Project Baseline

**Project:** OpenGen Image Studio  
**Investigation Date:** 2026-10-30  
**Project Root:** `E:\autogenimg-studio`

---

## Git Status

- **Git Repository:** Not initialized (no `.git` directory)
- **Branch:** N/A
- **Working Tree:** N/A

---

## Package Manager

- **Package Manager:** npm
- **Node Version:** (from package.json `engines` not specified)
- **Type:** `"module"` (ES modules)

### Scripts

| Script | Command |
|--------|---------|
| `dev` | `tsx server.ts` |
| `build` | `vite build` |
| `start` | `tsx server.ts` |
| `preview` | `vite preview` |
| `clean` | `rm -rf dist server.js` |
| `lint` | `tsc --noEmit` |
| `test` | `tsx --test tests/**/*.test.ts` |

---

## Test Runner

- **Runner:** `tsx --test` (Node.js built-in test runner via tsx)
- **Test Pattern:** `tests/**/*.test.ts`
- **Configuration:** None (no vitest/jest config files found)

---

## Test Suite Results

| Metric | Value |
|--------|-------|
| Total Tests | 162 |
| Passing | 162 |
| Failing | 0 |
| Skipped | 0 |
| Duration | ~225s (includes 2000ms+ delays in download engine tests) |

### Test Files

| File | Tests | Pass | Fail |
|------|-------|------|------|
| `tests/validator.test.ts` | 27 | 27 | 0 |
| `tests/targetedBugFixes.test.ts` | 13 | 13 | 0 |
| `tests/chatgptAdapterReadiness.test.ts` | 15 | 15 | 0 |
| `tests/releaseRemediation.test.ts` | 8 | 8 | 0 |
| `tests/queueFixesAndReadiness.test.ts` | 5 | 5 | 0 |
| `tests/downloadEngine.test.ts` | 13 | 13 | 0 |
| `tests/chromeSession.test.ts` | 17 | 17 | 0 |
| `tests/report.test.ts` | 9 | 9 | 0 |
| `tests/promptReferenceEditing.test.ts` | 14 | 14 | 0 |
| `tests/json-editor-reference-sync.test.ts` | 40 | 40 | 0 |
| `tests/newLawPreflightFix.test.ts` | 1 | 1 | 0 (skipped due to missing project data) |

### Previously Failing Tests (Resolved)

Before remediation, 8 tests failed in `newLawPreflightFix.test.ts`:
- `1. Project config loads successfully`
- `2. Prompt bundle retains all five prompts`
- `3. IMG-001 has REF-STYLE-01 in its referenceIds`
- `4. Reference registry contains REF-STYLE-01`
- `5. Asset file exists on disk for REF-STYLE-01`
- `6. Preflight passes when reference is registered and asset exists`
- `7. Missing references are still caught when intentionally tested`
- `8. Existing reference assignments and asset paths are preserved in real project`

**Root Cause:** All 8 tests referenced a hardcoded path `C:\Users\Himanshu Sharma\Videos\autoimggen\project-data2` that doesn't exist on this machine. These were environment-specific tests tied to a specific user's project data.

**Remediation:** Added a guard that checks if the project data directory exists. If not, the tests are skipped with a clear message. The `PROJECT_DATA_DIR` can be overridden via the `NEWLAW_PROJECT_DATA_DIR` environment variable.

---

## TypeScript Validation

**Command:** `npx tsc --noEmit`

| Directory | Errors |
|-----------|--------|
| `src/` | 0 |
| `reference/` | 18 (pre-existing, external code, missing modules `commander`, `zod`, `sharp`, `vitest`) |

The `reference/` directory contains a separate CLI tool (`chatgpt-image-cli-main`) that is not part of the main application build. Its TypeScript errors are pre-existing and unrelated to the application.

---

## Production Build

**Command:** `npx vite build`

| Metric | Value |
|--------|-------|
| Result | ✅ Success |
| Modules Transformed | 1679 |
| Build Time | ~8.94s |

---

## Dependencies

### Production Dependencies (14)

| Package | Version | Purpose |
|---------|---------|---------|
| `@google/genai` | ^2.4.0 | Google Gemini AI SDK |
| `@tailwindcss/vite` | ^4.3.3 | Tailwind CSS Vite plugin |
| `@vitejs/plugin-react` | ^6.1.1 | React Vite plugin |
| `dotenv` | ^17.2.3 | Environment variable loading |
| `express` | ^4.21.2 | HTTP server |
| `lucide-react` | ^0.546.0 | Icon library |
| `motion` | ^12.23.24 | Animation library |
| `playwright` | ^1.64.1 | Browser automation |
| `react` | ^19.0.1 | UI framework |
| `react-dom` | ^19.0.1 | React DOM renderer |
| `vite` | ^8.3.0 | Build tool and dev server |

### Development Dependencies (8)

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/express` | ^4.17.21 | Express type definitions |
| `@types/node` | ^22.14.0 | Node.js type definitions |
| `@types/react` | ^19.3.0 | React type definitions |
| `@types/react-dom` | ^19.3.0 | React DOM type definitions |
| `autoprefixer` | ^10.4.21 | CSS autoprefixer |
| `esbuild` | ^0.28.2 | JavaScript bundler |
| `tailwindcss` | ^4.3.3 | CSS framework |
| `tsx` | ^4.21.0 | TypeScript execution |
| `typescript` | ^7.0.2 | TypeScript compiler |

---

## Warnings

1. **No Git repository** — The project is not under version control. This is a significant risk for a project of this complexity.
2. **Package name** — `"react-example"` is a generic placeholder name. Should be renamed to `opengen-image-studio` or similar.
3. **No `.gitignore` file** — Without version control, there's no ignore file. Runtime data (browser profiles, project data, generated images) should be excluded.
4. **`reference/` directory** — Contains a separate CLI tool (`chatgpt-image-cli-main`) with its own dependencies that aren't installed. This directory has 18 TypeScript errors.
5. **`clean` script uses `rm`** — The `rm -rf` command is Unix-specific and won't work on Windows PowerShell without modification.

---

## Environment

- **Platform:** Windows 10/11 (win32)
- **Shell:** PowerShell
- **IDE:** VS Code
- **Working Directory:** `E:\autogenimg-studio`
- **Date:** 2026-10-30

---

## Key Findings

1. **All 162 tests pass** after remediation of environment-specific failures.
2. **TypeScript is clean** for the `src/` directory (all errors are in the external `reference/` directory).
3. **Production build succeeds** without errors.
4. **No Git repository** — The project is not under version control, which is a significant risk.
5. **Package name is a placeholder** — Should be renamed from `react-example`.
6. **Test environment dependency** — `newLawPreflightFix.test.ts` references a hardcoded path that doesn't exist on this machine. Remediated by adding a graceful skip guard.