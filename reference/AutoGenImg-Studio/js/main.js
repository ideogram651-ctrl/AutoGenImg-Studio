/** Native ES-module entry point. No framework, persistence, network or automation. */
import { createContext } from "./modules/context.js";
import { initModalManager } from "./modules/modal-manager.js";
import { initNavigation } from "./modules/navigation.js";
import { initThemeManager } from "./modules/theme-manager.js";
import { initSearch } from "./modules/search.js";
import { initGallery } from "./modules/gallery.js";
import { initUIInteractions } from "./modules/ui-interactions.js";
import { initAccessibility } from "./modules/accessibility.js";

const context = createContext();
const synchronizeOverlay = initModalManager(context);
const { route } = initNavigation(context, synchronizeOverlay);
initThemeManager(context);
initSearch(context);
initGallery(context);
initUIInteractions(context);
initAccessibility(context);
route(true);
context.navToggle.setAttribute("aria-expanded", String(!context.mobile()));
