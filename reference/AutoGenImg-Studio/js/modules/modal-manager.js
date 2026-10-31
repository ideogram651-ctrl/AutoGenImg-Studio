/** Original local-only behavior, separated by responsibility. */
export function initModalManager(context) {
  const { $, $$, body, state, focusables, closeOverlay, closeMobile } = context;
  $$(".modal").forEach((m) =>
    m.addEventListener("click", (event) => {
      if (event.target === m) closeOverlay();
    }),
  );
  return function synchronizeOverlay(overlay, pageId, changingPage, initial) {
    body.classList.toggle("has-overlay", Boolean(overlay));
    $(".app").inert = Boolean(overlay);
    $$(".modal").forEach((m) => {
      if (m === overlay) {
        m.removeAttribute("inert");
        m.setAttribute("aria-hidden", "false");
      } else {
        m.setAttribute("inert", "");
        m.setAttribute("aria-hidden", "true");
      }
    });
    closeMobile();
    if (overlay) {
      if (
        !state.lastOverlay &&
        (!state.opener || !state.opener.getClientRects().length)
      ) {
        state.opener = $("#" + pageId + " h1");
        state.galleryScroll = window.scrollY;
      }
      if (overlay !== state.lastOverlay)
        requestAnimationFrame(() => {
          const target = focusables(overlay)[0] || overlay;
          target.focus({ preventScroll: true });
        });
    } else if (state.lastOverlay) {
      const previous = state.opener;
      requestAnimationFrame(() => {
        window.scrollTo({ top: state.galleryScroll, behavior: "instant" });
        if (
          previous &&
          previous.isConnected &&
          previous.getClientRects().length
        )
          previous.focus({ preventScroll: true });
        else $("#" + pageId + " h1").focus({ preventScroll: true });
      });
    } else if (changingPage && !initial) {
      window.scrollTo({ top: 0, behavior: "instant" });
      $("#" + pageId + " h1").focus({ preventScroll: true });
    }
    state.currentPage = pageId;
    state.lastOverlay = overlay;
  };
}
