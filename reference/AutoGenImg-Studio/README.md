# AutoGenImg Studio

A modular, local-only version of the supplied Production Atelier interface. The product, content, 10 themes, original artwork, source snapshots and working viewing controls are preserved. This is **not** a connected generation service.

## Open in VS Code

1. Extract the ZIP and open the **AutoGenImg-Studio** folder itself in VS Code.
2. Install the recommended **Live Server** extension by Ritwick Dey if needed.
3. Keep the supplied workspace settings (`.vscode/settings.json`).
4. Right-click `index.html` and choose **Open with Live Server**.
5. Use the resulting HTTP address, not a `file://` double-click. Native ES modules need HTTP serving.

There is no install/build step, package.json, npm dependency, bundler, CDN, framework or backend. Node.js is not an application requirement. Any ordinary local static HTTP server also works.

### Live Server and the restrictive CSP

The project keeps `connect-src 'none'` and does not permit inline JavaScript. Live Server normally injects an inline WebSocket reload client, which conflicts with both restrictions. The supplied `liveServer.settings.useWebExt: true` setting disables that injected client. **Serving the app needs no browser extension; refresh the browser manually after edits.** Automatic reload is intentionally not enabled. Do not weaken the application CSP merely to allow development reload code. If you have another server already running, stop it and restart Live Server after opening this folder so these workspace settings apply.

Official extension settings: https://ritwickdey.github.io/vscode-live-server/docs/settings.html

## Technology

HTML5, CSS3/custom properties/gradients/glass surfaces, native JavaScript ES modules, inline SVG icons, PNG artwork and browser APIs (`hashchange`, `matchMedia`, DOM events, `inert`, focus APIs, `requestAnimationFrame`, `print`). No remote fonts or runtime network calls.

## Layout

```text
AutoGenImg-Studio/
  index.html
  css/
    base.css                Shared tokens, reset, typography, original focus foundation
    layout.css              Sidebar, shell, navigation, header and workflow layout
    components.css          Controls, panels, forms, badges and utilities
    workspaces.css          Dashboard, prompts, references, monitor, gallery, guide, settings
    overlays.css            Dialogs, viewers, screen-reader live region
    responsive.css          Collapsed navigation and original viewport breakpoints
    accessibility.css       Reduced motion and print
    states.css              CSS hash/radio fallbacks and original final refinements
    artwork.css             Relative references to the five original artworks
    no-script.css           Conditional noscript fallback
    themes/
      dark.css
      light.css
      aurora-violet.css
      arctic-blue.css
      lavender-mist.css
      midnight-orchid.css
      obsidian-amethyst.css
      carbon-graphite.css
      midnight-sapphire.css
      dark-titanium.css
      shared-glass.css      Original common dark/light glass component treatment
      shared-premium.css    Original common premium-theme component treatment
  js/
    main.js
    modules/
      context.js            Per-app helpers and transient state; no globals/storage
      navigation.js         Hash routing, title/context updates and sidebar
      modal-manager.js      Dialog visibility, inert state, opening/closing focus
      theme-manager.js      Original theme names, cycle and pressed indicators
      gallery.js            Selection, preview selection and density
      search.js             Prompt/gallery/manifest search and captured-log filtering
      accessibility.js      Skip link, guide keyboard controls, focus traps, viewer keys
      ui-interactions.js    Prompt/reference disclosure and print buttons
  assets/artwork/
    art-1.png ... art-5.png
    manifest.json           Source-decoded byte sizes and SHA-256 hashes
  .vscode/                  Live Server compatibility settings and recommendation
  tests/
    browser-check.py        Optional developer browser regression suite
    validation-report.json Complete original/modular browser regression results
    live-server-report.json Dedicated Live Server engine smoke-test results
    static-report.json     Structural, local-reference and asset validation results
  README.md
  IMPLEMENTATION-REPORT.md
```

No empty `assets/images` or `assets/icons` folders were added: all five raster resources are artwork, and all 199 SVG icons stay inline deliberately to preserve `currentColor`, accessibility semantics and exact rendering.

## Editing CSS

Edit the responsibility-specific stylesheet. The ordered links in `index.html` are intentional: shared foundation → layout/components/workspaces/overlays → responsive/accessibility → final states/artwork → dark/light tokens and original glass treatment → premium tokens and shared premium treatment. Do not casually reorder them; the original layered cascade is preserved. Focus rules and later breakpoint refinements sometimes remain in foundation/state/glass files to preserve source order and specificity. Intentional source overrides are not duplicated copies of whole stylesheets.

Markup formatting places some closing `>` characters on their own lines. This preserves every original text node, including preformatted read-only fields; ordinary HTML pretty-printers can silently alter those fields. Keep whitespace inside textual content unchanged when reformatting.

## Editing an existing theme

Change only its file under `css/themes/`. The theme IDs and visible names are unchanged. `dark.css` defines the inherited effective source-default palette on `:root`; `base.css` contains shared structural tokens. `light.css` overrides its palette using `:root[data-theme=light]`. Each of the eight premium files sets its existing palette plus `--theme-*` gradients and glass parameters.

All theme files are local, preloaded once and selector-scoped. Switching still sets `document.documentElement.dataset.theme` and toggles `data-premium-theme`; it does not fetch CSS or persist anything. There are exactly ten choices. The original light-theme glass treatment has not been redesigned.

## Adding a theme later

This is a maintenance recipe, not an added eleventh theme:

1. Copy one *premium token file*, rename it, and change its `data-theme` selector and token values. Do not copy the application's component styles.
2. Link that file before `shared-premium.css` in `index.html`.
3. Add the exact ID and display name to `themeNames` in `js/modules/theme-manager.js`; its key order controls cycling.
4. Add a matching `data-set-theme` button to the existing appearance segment in Settings, following its ARIA attributes and swatch markup.
5. Re-run theme and interaction checks. A premium theme reuses `shared-premium.css` via `data-premium-theme`.

## Editing JavaScript

`main.js` creates one context, wires the router/dialog dependency explicitly, initializes each responsibility once, then performs the initial route. Modules receive that context rather than publishing globals. `context.js` is only shared DOM helpers, original overlay-to-parent mapping and transient state. Use native relative imports with `.js` extensions.

Keep router state and modal focus state together through the existing context. Do not initialize modules twice or attach duplicate listeners. Theme, search and gallery state remains session-only as in the supplied application. Viewer arrows and focus trapping live with accessibility because they share the original keyboard dispatcher.

## Security and source behavior

- The CSP allows same-origin scripts, styles and images, plus original inline style attributes. It still blocks eval, inline JavaScript, remote scripts/fonts, connections, forms, objects and base changes.
- The obsolete inline-script hash was replaced with same-origin external-module permission.
- Two duplicate remote analytics tags from the supplied file were removed; they were already blocked by its CSP.
- Five embedded PNGs were decoded without recompression or resizing. `assets/artwork/manifest.json` records their original decoded-byte hashes.
- Original inline SVGs and style attributes are intentional; no embedded Base64 image payloads remain.
- Generation, uploads, file/project writes, provider access and other disabled operations remain disabled. Searches operate over captured text only. No backend, storage, automation or fake generation progress was added.

## Verification

See `IMPLEMENTATION-REPORT.md` and the JSON reports in `tests/`. Browser testing uses a real local HTTP server, not `file://`. Deterministic screenshot comparisons use reduced-motion mode; existing reduced-motion, reduced-transparency, print and no-JavaScript behaviors are also checked.

The optional regression script requires separately installed **developer-only** Python packages, not application dependencies:

```sh
python -m pip install playwright pillow
python -m playwright install chromium
python tests/browser-check.py
```

On a minimal Linux test machine, Playwright may also need its documented browser system dependencies. To compare against a source snapshot you already possess, pass `--baseline /path/to/snapshot.html`. The shipped project never needs that file to run. The suite writes its results to `tests/validation-report.json`; keep a copy before re-running if you want to retain the original comparative report.
