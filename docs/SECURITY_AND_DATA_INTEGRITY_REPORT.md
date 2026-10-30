# Security and Data Integrity Report

**Project:** OpenGen Image Studio  
**Date:** 2026-10-30  
**Status:** COMPLETE

---

## Security Audit

### Credentials and Environment Files

- `.env.example` is a template only — no secrets
- No `.env` file with actual secrets found
- No hardcoded API keys or tokens in source code
- GitHub credentials not stored in repository

### Browser Profile Protection

- `browser-profile/` is gitignored
- Contains Chrome session data (cookies, login state)
- Not committed to Git
- Preserved on local filesystem

### Filesystem Path Validation

- `validateImageFile()` — format-aware validation (magic bytes, MIME types)
- `validateReferenceFile()` — dispatches to format-specific validators
- Path traversal prevention in `/api/images/:projectId/:filename` endpoint
- `..`, `/`, `\` rejected in filename parameter

### Git Tracking of Sensitive Files

| File/Directory | Gitignored | Status |
|----------------|------------|--------|
| `browser-profile/` | ✅ Yes | Protected |
| `project-data/` | ✅ Yes | Protected |
| `.env*` | ✅ Yes (except `.env.example`) | Protected |
| `*.log` | ✅ Yes | Protected |
| `*.jsonl` | ✅ Yes | Protected |
| `*.bak` | ✅ Yes | Protected |

### Logging of Sensitive Content

- No passwords, tokens, or session secrets logged
- Console logs include prompt IDs, reference IDs, file paths (non-sensitive)
- SSE broadcasts include queue state and log events (no credentials)
- HTML reports contain prompt text and file paths (no secrets)

### Dependency Vulnerabilities

- No `npm audit` run (npm not available in current environment)
- Dependencies are from trusted sources (npm registry)
- No known vulnerable packages identified manually

### Runtime Permissions

- Server binds to `0.0.0.0` (all interfaces) — accessible from local network
- Console message says "localhost" which is misleading
- Recommendation: Change to `127.0.0.1` for strict local-only access

### Project Data Preservation

- All user data stored in `project-data/` (gitignored)
- Browser sessions stored in `browser-profile/` (gitignored)
- No destructive operations performed during cleanup
- `.bak` files created before overwriting canonical bundle

## Data Integrity

### File Integrity Checks

- SHA-256 checksums on all reference files (computed on upload)
- SHA-256 checksums on all downloaded images
- File signature validation (magic bytes) on download
- Non-empty file size verification
- Atomic file moves (temp → final)

### Persistence Integrity

- `saveProjectConfig()` writes project.json, prompt-bundle.json, references.json
- `.bak` backup created before overwriting bundle
- Manifest persisted after every item state change
- Run state saved separately from manifest

### Known Limitations

1. **No encryption** — Project data stored in plain JSON
2. **No access control** — Server accessible from local network (binds to 0.0.0.0)
3. **No backup strategy** — Only `.bak` for bundle, no full project backup
4. **No audit log** — No tracking of who modified what and when