# RECOVERY_BROWSER_DIAGNOSTICS.md

## Browser Diagnostics Summary

### Method
- Started dev server at http://localhost:3000
- Captured Playwright screenshots of all 10 workspaces at 1440x900
- Inspected console errors, network failures, stylesheet loading
- Compared rendered DOM against reference

### Console Errors
- Zero console errors across all pages
- Zero network failures
- All 22 reference stylesheets load successfully

### Stylesheet Loading Matrix
All stylesheets verified loading in browser (via document.styleSheets):

| Stylesheet | Exists | Imported | Browser loaded | Selectors applied | Status |
|---|---|---|---|---|---|
| base.css | Yes | Yes | Yes | Yes | OK |
| layout.css | Yes | Yes | Yes | Yes | OK |
| components.css | Yes | Yes | Yes | Yes | OK |
| workspaces.css | Yes | Yes | Yes | Yes | OK |
| overlays.css | Yes | Yes | Yes | Yes | OK |
| responsive.css | Yes | Yes | Yes | Yes | OK |
| accessibility.css | Yes | Yes | Yes | Yes | OK |
| states.css | Yes | Yes | Yes | Yes | OK |
| artwork.css | Yes | Yes | Yes | Yes | OK |
| themes/dark.css | Yes | Yes | Yes | Yes | OK |
| themes/light.css | Yes | Yes | Yes | Yes | OK |
| themes/shared-glass.css | Yes | Yes | Yes | Yes | OK |
| themes/aurora-violet.css | Yes | Yes | Yes | Yes | OK |
| themes/arctic-blue.css | Yes | Yes | Yes | Yes | OK |
| themes/lavender-mist.css | Yes | Yes | Yes | Yes | OK |
| themes/midnight-orchid.css | Yes | Yes | Yes | Yes | OK |
| themes/obsidian-amethyst.css | Yes | Yes | Yes | Yes | OK |
| themes/carbon-graphite.css | Yes | Yes | Yes | Yes | OK |
| themes/midnight-sapphire.css | Yes | Yes | Yes | Yes | OK |
| themes/dark-titanium.css | Yes | Yes | Yes | Yes | OK |
| themes/shared-premium.css | Yes | Yes | Yes | Yes | OK |

### Root Cause of Visual Regression
CSS loads correctly. The problem is component markup, not CSS loading:

Every page mixes legacy Tailwind utility classes with reference CSS classes:
- space-y-6, p-6, rounded-xl, glass-panel (spacing/borders/radius)
- flex, grid, grid-cols-1, sm:grid-cols-3 (layout)
- bg-white/5, hover:bg-white/10, bg-indigo-600, text-emerald-400 (colors)
- max-w-4xl, max-w-5xl, max-w-md (width constraints)
- outline-none, focus:ring-1, focus:ring-indigo-500 (focus styles)

These Tailwind classes override reference dimensions, spacing, colors, and typography because @tailwindcss/vite plugin in vite.config.ts still generates all Tailwind utilities.

### Affected Pages
1. DashboardPage.tsx - mostly migrated, has space-y-6 (line 84)
2. ProjectSettingsPage.tsx - HEAVILY Tailwind throughout
3. BundleManagerPage.tsx - HEAVILY Tailwind (modals + layout)
4. ReferenceManagerPage.tsx - HEAVILY Tailwind throughout
5. RunMonitorPage.tsx - HEAVILY Tailwind throughout
6. GalleryPage.tsx - HEAVILY Tailwind (grid + viewer)
7. ReviewCenterPage.tsx - HEAVILY Tailwind throughout
8. ReportsHistoryPage.tsx - HEAVILY Tailwind throughout
9. GuidedWorkflowPage.tsx - HEAVILY Tailwind throughout
10. SettingsPage.tsx - HEAVILY Tailwind throughout

### vite.config.ts
Still imports tailwindcss() plugin, which generates all Tailwind utility classes. This must remain until all components are migrated off Tailwind, then removed.