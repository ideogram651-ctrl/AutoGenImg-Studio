/** Original hash routing, context updates and responsive sidebar. */
export function initNavigation(context, synchronizeOverlay) {
  const {
    $,
    $$,
    body,
    state,
    overlayParents,
    pages,
    navToggle,
    mobile,
    closeMobile,
    focusables,
  } = context;
  function route(initial = false) {
    const id = decodeURIComponent(location.hash.slice(1));
    const overlay = Object.hasOwn(overlayParents, id)
      ? document.getElementById(id)
      : null;
    const pageId = overlay
      ? overlayParents[id]
      : pages.some((p) => p.id === id)
        ? id
        : "dashboard";
    const changingPage = state.currentPage !== pageId;
    pages.forEach((p) => {
      const active = p.id === pageId;
      p.classList.toggle("is-current", active);
      if (active) p.removeAttribute("inert");
      else p.setAttribute("inert", "");
    });
    $$(".nav a").forEach((a) => {
      if (a.hash === "#" + pageId) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    $$(".workflow-rail a").forEach((a) => {
      if (a.hash === "#" + pageId) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
    });
    const project = [
      "gallery",
      "review",
      "reports",
      "offline",
      "settings",
    ].includes(pageId)
      ? "Stickman"
      : "new_law";
    $("#utility-context").textContent =
      project + " / " + ($("#" + pageId + " h1")?.textContent || pageId);
    $("#utility-context").title =
      "Page-local project snapshot; no live project switching";
    $(".project-context .newlaw").style.display =
      project === "new_law" ? "block" : "none";
    $(".project-context .stickman").style.display =
      project === "Stickman" ? "block" : "none";
    synchronizeOverlay(overlay, pageId, changingPage, initial);
    document.title =
      ($("#" + pageId + " h1")?.textContent || "Studio") +
      " — AutoGenImg Studio";
  }
  window.addEventListener("hashchange", () => route());
  navToggle.addEventListener("click", () => {
    if (mobile()) {
      body.classList.toggle("mobile-nav-open");
      const open = body.classList.contains("mobile-nav-open");
      navToggle.setAttribute("aria-expanded", String(open));
      if (open) focusables($(".sidebar"))[0]?.focus();
    } else {
      body.classList.toggle("nav-collapsed");
      navToggle.setAttribute(
        "aria-expanded",
        String(!body.classList.contains("nav-collapsed")),
      );
    }
  });
  $("#mobile-backdrop").addEventListener("click", () => {
    closeMobile();
    navToggle.focus();
  });
  window.addEventListener("resize", () => {
    if (!mobile()) body.classList.remove("mobile-nav-open");
    navToggle.setAttribute(
      "aria-expanded",
      String(
        mobile()
          ? body.classList.contains("mobile-nav-open")
          : !body.classList.contains("nav-collapsed"),
      ),
    );
  });
  return { route };
}
