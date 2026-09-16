/**
 * Sets the theme class on <html> before first paint, so there is no flash of
 * the wrong theme. Reads the stored preference ("light" | "dark" | "system");
 * "system" (the default) resolves via prefers-color-scheme. Runs inline in
 * <head>; the matching runtime toggle lives in ThemeToggle.
 */
const script = `
(function () {
  try {
    var stored = localStorage.getItem("flagon-theme");
    var mql = window.matchMedia("(prefers-color-scheme: dark)");
    var dark = stored === "dark" || ((!stored || stored === "system") && mql.matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
