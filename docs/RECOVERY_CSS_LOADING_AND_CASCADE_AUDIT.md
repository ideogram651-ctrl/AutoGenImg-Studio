# RECOVERY_CSS_LOADING_AND_CASCADE_AUDIT.md

## CSS Loading and Cascade Audit

### Entry Point: src/main.tsx
Imports reference stylesheets in order: base.css, layout.css, components.css, workspaces.css, overlays.css, responsive.css, accessibility.css, states.css, artwork.css, then 10 theme files + shared themes.

### vite.config.ts
- Imports @tailwindcss/vite plugin
- Tailwind utility classes ARE still generated and available in browser
- Creates conflict: components using Tailwind classes get Tailwind styling, not reference styling

### src/index.css
- Tailwind @import "tailwindcss" REMOVED (previous mission)
- Only minimal helpers remain (scrollbars, body margin)
- No conflicting legacy variables

### Cascade Conflicts Identified
Legacy Tailwind classes in component markup override reference CSS:

| Legacy Class | Reference Equivalent | Conflict |
|---|---|---|
| space-y-6 | .stack (gap: var(--space-6)) | Spacing |
| p-6 | .panel (padding: 26px) / .card (padding: 20px) | Padding |
| rounded-xl | .panel (border-radius: var(--radius-panel)=14px) / .card (10px) | Border radius |
| glass-panel | .panel / .card (reference glass treatment) | Background/border |
| flex / grid | .actions, .row, .two, .three (reference grids) | Layout |
| grid-cols-1 / sm:grid-cols-3 | .two / .three / .library-grid | Grid columns |
| max-w-4xl / max-w-5xl | .workspace (max-width: 1640px) | Width |
| bg-white/5 / hover:bg-white/10 | var(--color-surface) / var(--color-card) | Background |
| bg-indigo-600 | .btn.primary / var(--color-primary) | Button colors |
| text-emerald-400 | .green-text / var(--color-success) | Text color |
| outline-none / focus:ring-1 | :focus-visible (outline: 2px solid var(--color-primary)) | Focus |

### Resolution Strategy
1. Keep tailwindcss() in vite.config.ts during migration (don't break build)
2. Migrate each component from Tailwind classes to reference CSS classes
3. Remove tailwindcss() from vite.config.ts once all components are migrated
4. Remove legacy inline styles that conflict with reference variables

### Design Tokens (base.css)
Key variables:
- --sidebar-width: 232px
- --color-background: #0b0d16 (dark theme)
- --color-secondary: #111421
- --color-surface: rgba(25, 27, 44, 0.78)
- --color-card: rgba(34, 35, 57, 0.76)
- --color-border: rgba(174, 160, 255, 0.19)
- --color-text: #f4f1ff
- --color-muted: #b1b0cc
- --color-primary: #a995ff
- --color-primary-soft: rgba(139, 111, 255, 0.16)
- --color-success: #83d9c2
- --color-warning: #f0c17d
- --color-error: #f39bba
- --inset: rgba(12, 15, 29, 0.78)
- --hover: rgba(112, 91, 190, 0.22)
- --space-1 through --space-16 (4px-64px)
- --text-page: 36px, --text-section: 21px, --text-body: 14px
- --radius-panel: 14px, --radius-card: 10px, --radius-hero: 18px
