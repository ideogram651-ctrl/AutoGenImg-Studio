# Developer Experience Report

**Project:** OpenGen Image Studio  
**Date:** 2026-10-30  
**Status:** COMPLETE

---

## Developer Onboarding

### Prerequisites

- Node.js 18+ (LTS recommended)
- Google Chrome (standard installation)
- npm (included with Node.js)

### Setup Steps

1. Clone: `git clone https://github.com/ideogram651-ctrl/AutoGenImg-Studio.git`
2. Install: `npm install`
3. Start: `npm run dev`
4. Open: `http://localhost:3000`

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Vite + Express) on port 3000 |
| `npm run build` | Production build (Vite) |
| `npm run preview` | Preview production build |
| `npm run clean` | Clean build artifacts |
| `npm run lint` | TypeScript type check |
| `npm test` | Run all tests |
| `npm run start` | Start production server |

### Configuration

- **Environment:** `.env.example` template (no secrets required)
- **TypeScript:** `tsconfig.json` with strict mode
- **Vite:** `vite.config.ts` with Tailwind + React plugins
- **Settings:** Managed via `SettingsManager` (settings.json)

### Logging

- Console: `console.log/warn/error` with `[adapter/detect]` prefixes
- Structured: JSONL format in `events.jsonl`
- SSE: Live state/log/item_update broadcasts
- Vite: Dev server logs (excluded from git)

### Error Handling

- Preflight errors block run start with descriptive messages
- Submission failures pause queue, mark item FAILED
- Generation timeouts distinguish "still generating" from "failed"
- Download failures mark NEEDS_REVIEW, allow retry
- Auth challenges pause with BLOCKED_AUTH status

### Scripts

All scripts are cross-platform (using `npm` and `tsx`). The `clean` script uses `rimraf` for cross-platform compatibility.

### Known Issues

1. No `.env` file required — all config via Settings page or environment variables
2. Chrome path auto-detected from standard Windows paths
3. No hot reload for server-side changes (requires restart)