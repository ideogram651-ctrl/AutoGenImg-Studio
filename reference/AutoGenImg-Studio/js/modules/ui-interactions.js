/** Original local-only behavior, separated by responsibility. */
export function initUIInteractions(context) {
  const { $, $$ } = context;
  // Prompt disclosure and mapping inspection preserve original complete text nodes.
  $$("[data-expand]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = document.getElementById(b.getAttribute("aria-controls"));
      const expanded = b.getAttribute("aria-expanded") !== "true";
      p.classList.toggle("expanded", expanded);
      b.setAttribute("aria-expanded", String(expanded));
      b.textContent = expanded ? "Collapse prompt ↑" : "Read full prompt ↓";
    }),
  );
  $$("[data-print]").forEach((b) =>
    b.addEventListener("click", () => window.print()),
  );
}
