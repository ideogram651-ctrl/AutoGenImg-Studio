/** Per-application DOM helpers and the original transient (not persisted) state. */
export function createContext() {
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const body = document.body;
  const state = {
    currentPage: "",
    lastOverlay: null,
    opener: null,
    galleryScroll: 0,
  };
  const overlayParents = {
    "create-project": "dashboard",
    "delete-project": "dashboard",
    "paste-json": "bundle",
    "view-json": "bundle",
    "edit-json": "bundle",
    "edit-prompt": "bundle",
    "add-reference-upload": "references",
    "add-reference-text": "references",
    "edit-reference": "references",
    "regenerate-all": "monitor",
    "delete-run": "reports",
    "report-preview": "reports",
    "viewer-1": "gallery",
    "viewer-2": "gallery",
    "viewer-3": "gallery",
    "viewer-4": "gallery",
    "viewer-5": "gallery",
  };
  const pages = $$(".page");
  const announce = (text) => {
    $("#ui-announcer").textContent = text;
  };
  const navToggle = $("#navigation-toggle");
  const mobile = () => matchMedia("(max-width:700px)").matches;
  const closeMobile = () => {
    body.classList.remove("mobile-nav-open");
    navToggle.setAttribute(
      "aria-expanded",
      String(!mobile() && !body.classList.contains("nav-collapsed")),
    );
  };
  const focusables = (root) =>
    $$(
      'a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]',
      root,
    ).filter((el) => el.getClientRects().length);
  const closeOverlay = () => {
    const id = location.hash.slice(1);
    location.hash = overlayParents[id] || state.currentPage || "dashboard";
  };
  return {
    $,
    $$,
    body,
    state,
    overlayParents,
    pages,
    announce,
    navToggle,
    mobile,
    closeMobile,
    focusables,
    closeOverlay,
  };
}
