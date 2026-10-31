/** Original local-only behavior, separated by responsibility. */
export function initSearch(context) {
  const { $, $$, announce } = context;
  function wireSearch(input, items, empty, status, label) {
    if (!input) return;
    const indexed = items.map((el) => ({
      el,
      text: el.textContent.toLowerCase(),
    }));
    input.addEventListener("input", () => {
      const value = input.value.trim().toLowerCase();
      let count = 0;
      indexed.forEach(({ el, text }) => {
        const visible = text.includes(value);
        el.hidden = !visible;
        if (visible) count++;
      });
      empty.hidden = count !== 0;
      status.textContent = count + " of " + items.length + " " + label;
      announce(status.textContent);
    });
  }
  wireSearch(
    $("#prompt-search"),
    $$("#bundle .prompt"),
    $("#prompt-no-results"),
    $("#prompt-search-status"),
    "prompts",
  );
  wireSearch(
    $("#gallery-search"),
    $$("#gallery .gallery-group>.gallery-grid>.gallery-card"),
    $("#gallery-no-results"),
    $("#gallery-search-status"),
    "assets",
  );
  wireSearch(
    $("#manifest-search"),
    $$("#reports table tbody tr"),
    $("#manifest-no-results"),
    $("#manifest-search-status"),
    "rows",
  );
  // Filtering is only over the captured log; no new events or progress are synthesized.
  const logs = $$("#monitor .logs .logline");
  logs.forEach(
    (el) =>
      (el.dataset.level = /ERROR|FAILED|NEEDS_REVIEW/.test(el.textContent)
        ? "error"
        : "event"),
  );
  let logMode = "all";
  function filterLogs() {
    let count = 0;
    const query = $("#log-search").value.trim().toLowerCase();
    logs.forEach((el) => {
      const show =
        (logMode === "all" || el.dataset.level === "error") &&
        el.textContent.toLowerCase().includes(query);
      el.hidden = !show;
      if (show) count++;
    });
    $("#log-status").textContent =
      count + " / " + logs.length + " captured events";
    $("#log-no-results").hidden = count !== 0;
    announce($("#log-status").textContent);
  }
  $$("[data-log-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      logMode = b.dataset.logFilter;
      $$("[data-log-filter]").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b)),
      );
      filterLogs();
    }),
  );
  $("#log-search").addEventListener("input", filterLogs);
  $("#log-status").textContent =
    logs.length + " / " + logs.length + " captured events";
}
