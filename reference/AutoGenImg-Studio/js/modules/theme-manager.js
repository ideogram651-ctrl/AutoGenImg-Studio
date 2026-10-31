/** Original local-only behavior, separated by responsibility. */
export function initThemeManager(context) {
  const { $, $$, announce } = context;
  // Extend the existing session-only theme mechanism; no storage is introduced.
  const themeNames = {
    dark: "Dark",
    light: "Light",
    "aurora-violet": "Aurora Violet",
    "arctic-blue": "Arctic Blue",
    "lavender-mist": "Lavender Mist",
    "midnight-orchid": "Midnight Orchid",
    "obsidian-amethyst": "Obsidian Amethyst",
    "carbon-graphite": "Carbon Graphite",
    "midnight-sapphire": "Midnight Sapphire",
    "dark-titanium": "Dark Titanium",
  };
  const themeOrder = Object.keys(themeNames);
  $$("[data-theme-toggle]").forEach((b) =>
    b.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme || "dark";
      setTheme(
        themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length],
      );
    }),
  );
  $$("[data-set-theme]").forEach((b) =>
    b.addEventListener("click", () => setTheme(b.dataset.setTheme)),
  );
  function setTheme(theme) {
    if (!Object.hasOwn(themeNames, theme)) return;
    document.documentElement.dataset.theme = theme;
    if (theme !== "dark" && theme !== "light")
      document.documentElement.setAttribute("data-premium-theme", "");
    else document.documentElement.removeAttribute("data-premium-theme");
    const next =
      themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length];
    $$("[data-theme-toggle]").forEach((b) => {
      b.textContent = theme === "dark" ? "◑ Light" : "◑ Theme";
      b.setAttribute(
        "aria-label",
        "Current theme: " +
          themeNames[theme] +
          ". Switch to " +
          themeNames[next] +
          " theme",
      );
      b.title =
        "Current: " +
        themeNames[theme] +
        " · Next: " +
        themeNames[next] +
        ". All themes are available in Settings.";
    });
    $$("[data-set-theme]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.setTheme === theme)),
    );
    announce(themeNames[theme] + " appearance applied locally.");
  }
}
