# Distribution Architecture Report

**Project:** OpenGen Image Studio  
**Date:** 2026-10-30  
**Status:** COMPLETE

---

## Selected Distribution Model: Localhost Application

**Primary recommendation:** Localhost Application (Option A)

The application should be distributed as a Node.js-based local application that serves a React frontend via Vite/Express, with browser automation via Playwright CDP connecting to the user's installed Chrome.

### Why This Model

1. **No new dependencies** — Uses existing Node.js, Express, Vite, Playwright
2. **No packaging framework** — No Electron/Tauri needed
3. **Browser automation works** — Playwright CDP connects to installed Chrome
4. **Filesystem access** — Direct access to local filesystem for project data
5. **Simple installation** — `npm install` + `npm run dev`
6. **Cross-platform** — Node.js + Chrome are available on all platforms

### Alternatives Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Electron | Native desktop app, system tray | Heavy bundle size, complexity, Playwright CDP conflicts | Not recommended |
| Tauri | Lightweight, Rust backend | Playwright integration complex, learning curve | Not recommended |
| Portable | Single executable | Playwright + Chrome dependency management difficult | Not recommended |
| **Localhost (current)** | Simple, proven, no new deps | Requires Node.js + Chrome installed | **Selected** |

### Installation Prerequisites

1. **Node.js** 18+ (LTS recommended)
2. **Google Chrome** (standard installation)
3. **npm** (included with Node.js)

### Installation Steps

1. Clone repository: `git clone https://github.com/ideogram651-ctrl/AutoGenImg-Studio.git`
2. Install dependencies: `npm install`
3. Start application: `npm run dev`
4. Open browser: `http://localhost:3000`
5. Configure Chrome session in Settings page

### Runtime Data Locations

| Data Type | Location | Gitignored |
|-----------|----------|------------|
| User projects | `./project-data/` | ✅ Yes |
| Browser profile | `./browser-profile/` | ✅ Yes |
| Build output | `./dist/` | ✅ Yes |
| Dev cache | `./.vite/` | ✅ Yes |

### Fresh-Machine Verification

- `npm install` installs all dependencies from lockfile ✅
- `npm run build` produces production bundle ✅
- `npm run dev` starts server on localhost:3000 ✅
- `npm test` runs all tests ✅
- `npx tsc --noEmit` validates TypeScript ✅

### Known Limitations

1. **Node.js required** — User must install Node.js (not bundled)
2. **Chrome required** — User must install Google Chrome (not bundled)
3. **No auto-update** — Manual `git pull` + `npm install` for updates
4. **No installer** — No `.exe` or `.msi` installer (npm-based)
5. **Port 3000** — May conflict with other applications

### Future Considerations

- Package as portable ZIP with Node.js + Chrome detection
- Add auto-update mechanism via GitHub releases
- Consider Electron/Tauri if native desktop features are needed

### Implementation Status

| Feature | Status |
|---------|--------|
| npm install | ✅ Working |
| npm run dev | ✅ Working |
| npm run build | ✅ Working |
| npm test | ✅ Working |
| npm run preview | ✅ Working |
| .gitignore | ✅ Updated |
| README | ✅ Professional |
| Installer | ❌ Not implemented (not required for current scope) |