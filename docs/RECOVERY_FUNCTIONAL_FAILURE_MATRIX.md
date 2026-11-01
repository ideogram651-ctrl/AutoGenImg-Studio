# RECOVERY_FUNCTIONAL_FAILURE_MATRIX.md

## Functional Failure Matrix

| Area | Existing Functionality | Current Observed State | Root Cause | Required Fix |
|---|---|---|---|---|
| Sidebar | Navigation, theme switch | Renders but uses legacy spacing/colors | Legacy markup | Migrate to reference CSS |
| Sidebar toggle | Collapse/expand | Works (body.nav-collapsed class) | None | Verify visual |
| Overview | Project summary, Hero, Project Library | Renders but wrong spacing/dimensions | space-y-6 legacy class + Tailwind overrides | Remove legacy, use reference classes |
| Project Setup | Project configuration, save | Migrated to reference CSS | Was HEAVILY Tailwind | **MIGRATED** - uses reference classes |
| Prompt Sequence | Import, edit, validate, save | Migrated to reference CSS | Was HEAVILY Tailwind | **MIGRATED** - uses reference classes |
| Reference Library | Upload, add, remove references | Migrated to reference CSS | Was HEAVILY Tailwind | **MIGRATED** - uses reference classes |
| Generation Monitor | Start, pause, resume, stop queue | Migrated to reference CSS | Was HEAVILY Tailwind | **MIGRATED** - uses reference classes |
| Gallery | Load images, filter, search, viewer | Migrated to reference CSS | Was HEAVILY Tailwind | **MIGRATED** - uses reference classes |
| Review Center | Review, accept/reject, recovery | Migrated to reference CSS | Was HEAVILY Tailwind | **MIGRATED** - uses reference classes |
| Reports & History | Load runs, open report | Migrated to reference CSS | Was HEAVILY Tailwind | **MIGRATED** - uses reference classes |
| Preferences | Change theme, settings | Migrated to reference CSS | Was HEAVILY Tailwind | **MIGRATED** - uses reference classes |

### Status
- All backend functionality verified working (162/162 tests pass, production build succeeds)
- No functional regressions in backend services
- All failures are visual/CSS-related only
