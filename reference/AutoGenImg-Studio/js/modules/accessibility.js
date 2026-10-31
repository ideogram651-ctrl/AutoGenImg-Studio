/** Original local-only behavior, separated by responsibility. */
export function initAccessibility(context) {
  const {
    $,
    $$,
    body,
    state,
    overlayParents,
    navToggle,
    mobile,
    closeMobile,
    focusables,
    closeOverlay,
  } = context;
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (
        link &&
        Object.hasOwn(overlayParents, link.hash.slice(1)) &&
        !state.lastOverlay
      ) {
        state.opener = link;
        state.galleryScroll = window.scrollY;
      }
      if (link?.classList.contains("skip-link")) {
        event.preventDefault();
        document.querySelector(".page.is-current h1")?.focus();
      }
    },
    true,
  );
  // Existing CSS-radio guide remains usable without JavaScript.
  $$(".guide-steps label").forEach((label) => {
    label.tabIndex = 0;
    label.setAttribute("role", "button");
    label.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        label.click();
      }
    });
    label.addEventListener("click", () => {
      const radio = document.getElementById(label.htmlFor);
      radio.checked = true;
      updateGuide();
    });
  });
  function updateGuide() {
    $$(".guide-steps label").forEach((label) =>
      label.setAttribute(
        "aria-pressed",
        String(document.getElementById(label.htmlFor).checked),
      ),
    );
  }
  $$(".guide-radio").forEach((input) =>
    input.addEventListener("change", updateGuide),
  );
  $$(".guide-footer label").forEach((label) => {
    label.tabIndex = 0;
    label.setAttribute("role", "button");
    label.addEventListener("keydown", (e) => {
      if (["Enter", " "].includes(e.key)) {
        e.preventDefault();
        label.click();
      }
    });
    label.addEventListener("click", () => setTimeout(updateGuide, 0));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.lastOverlay) {
        event.preventDefault();
        closeOverlay();
      } else if (body.classList.contains("mobile-nav-open")) {
        closeMobile();
        navToggle.focus();
      }
      return;
    }
    if (state.lastOverlay) {
      if (event.key === "Tab") {
        const list = focusables(state.lastOverlay);
        const first = list[0],
          last = list.at(-1);
        if (!list.length) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !state.lastOverlay.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !state.lastOverlay.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
      if (
        state.lastOverlay.classList.contains("viewer") &&
        ["ArrowLeft", "ArrowRight"].includes(event.key) &&
        !["INPUT", "TEXTAREA"].includes(event.target.tagName)
      ) {
        event.preventDefault();
        const current = Number(state.lastOverlay.id.split("-")[1]);
        location.hash =
          "viewer-" +
          (((current - 1 + (event.key === "ArrowRight" ? 1 : 4)) % 5) + 1);
      }
    } else if (
      mobile() &&
      body.classList.contains("mobile-nav-open") &&
      event.key === "Tab"
    ) {
      const list = focusables($(".sidebar"));
      if (event.shiftKey && document.activeElement === list[0]) {
        event.preventDefault();
        list.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === list.at(-1)) {
        event.preventDefault();
        list[0].focus();
      }
    }
  });
  updateGuide();
}
