# RECOVERY_FRONTEND_RECONSTRUCTION_PLAN.md

## Frontend Reconstruction Plan

### Migration Strategy
Controlled, page-by-page migration from legacy Tailwind to reference CSS:

1. Keep tailwindcss() in vite.config.ts during migration
2. Migrate each page component from Tailwind classes to reference CSS classes
3. Remove tailwindcss() from vite.config.ts once all pages migrated
4. Verify tests, build, and screenshots after each page

### Page Migration Order
1. DashboardPage.tsx - remove space-y-6 (already mostly migrated)
2. ProjectSettingsPage.tsx - full migration
3. BundleManagerPage.tsx - full migration
4. ReferenceManagerPage.tsx - full migration
5. RunMonitorPage.tsx - full migration
6. GalleryPage.tsx - full migration
7. ReviewCenterPage.tsx - full migration
8. ReportsHistoryPage.tsx - full migration
9. GuidedWorkflowPage.tsx - full migration
10. SettingsPage.tsx - full migration

### Reference CSS Classes to Use
- Layout: .app, .sidebar, .viewport, .utility-bar, .workspace, .stack, .page, .page.default
- Header: .app-header, .title-row, .provider, .workflow-rail
- Controls: .btn, .btn.primary, .btn.green, .btn.danger, .btn.quiet, .btn.tiny, .btn.icon-only
- Badges: .badge, .badge.green, .badge.amber, .badge.red, .badge.gray
- Panels: .panel, .card
- Headings: .heading, .section-title, .rule
- Layout helpers: .actions, .row, .two, .three, .wide-two
- Forms: .field, .label, .input, .textarea, .select, .search, .hint
- Notices: .notice, .notice.green, .notice.amber, .notice.red
- Provider cards: .provider-card, .provider-card.selected
- Hero: .hero, .hero-copy, .studio-eyebrow, .hero-original-title, .hero-art, .hero-frame
- Readiness: .readiness-strip
- Library: .library-grid, .project-visual, .planning-track, .mini-stats
- Stats: .stats, .stat, .statlabel, .value-block, .progress
- Overlays: .modal, .modal-box, .modal-box.wide, .modal-box.narrow, .modal-heading, .modal-footer
- Viewer: .viewer-box, .viewer-picture, .viewer-caption, .viewer-arrow
- Guide: .guide-steps, .step-tab, .guide-body, .guide-footer, .style-choice
- Settings: .theme-options, .theme-option, .swatch, .local-settings
- Inventory: .inventory-list
- States: .state-explorer, .empty
- Tables: .table-wrap
- Misc: .muted, .indigo-text, .green-text, .amber-text, .red-text, .subtle-link

### Acceptance Criteria Per Page
- No legacy Tailwind classes (space-y-6, p-6, rounded-xl, glass-panel, flex, grid, grid-cols-*, max-w-*, bg-*, text-*, focus:ring-*, outline-none)
- Uses reference CSS classes for layout, spacing, colors, typography
- Matches reference dimensions (sidebar 232px, hero 214px frames, etc.)
- All existing functionality preserved
- Tests pass, build succeeds
