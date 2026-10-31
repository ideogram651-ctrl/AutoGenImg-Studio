/** Original local-only behavior, separated by responsibility. */
export function initGallery(context) {
  const { $, $$, announce } = context;
  // Selection affects presentation only; it never changes any source asset or file.
  const assetChecks = $$("input[data-asset-select]");
  function selected() {
    return assetChecks.filter((c) => c.checked);
  }
  function selectionChanged() {
    const count = selected().length;
    $("#selection-tray").hidden = !count;
    $("#selection-count").textContent =
      count + " asset" + (count === 1 ? "" : "s") + " selected";
    assetChecks.forEach((c) =>
      c.closest(".gallery-card").classList.toggle("is-selected", c.checked),
    );
    $("#select-all-assets").textContent =
      count === assetChecks.length ? "Deselect all" : "Select all";
    announce(count + " of " + assetChecks.length + " assets selected");
  }
  assetChecks.forEach((c) => c.addEventListener("change", selectionChanged));
  $("#select-all-assets").addEventListener("click", () => {
    const select = selected().length !== assetChecks.length;
    assetChecks.forEach((c) => (c.checked = select));
    selectionChanged();
  });
  $("#clear-selection").addEventListener("click", () => {
    assetChecks.forEach((c) => (c.checked = false));
    selectionChanged();
    $("#select-all-assets").focus();
  });
  $("#preview-selected").addEventListener("click", () => {
    const first = selected()[0];
    if (first) location.hash = "viewer-" + first.dataset.assetSelect;
  });
  $$("button[data-density]").forEach((b) =>
    b.addEventListener("click", () => {
      $("#asset-grid").dataset.density = b.dataset.density;
      $$("button[data-density]").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b)),
      );
      announce(b.dataset.density + " gallery density");
    }),
  );
}
