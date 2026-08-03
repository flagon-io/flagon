/**
 * The default set of console routes the QA harness screenshots.
 *
 * Each entry is { name, path }. `path` may contain `:slug` (the org slug) and
 * `:exp` / `:flag` (seeded keys, overridable via env) which `capture.mjs`
 * substitutes before navigating. Add a route here and it is captured on the
 * next `npm run qa` — no other wiring.
 *
 * Override the whole list ad hoc by passing paths as CLI args:
 *   npm run qa -- /acme/experiments /acme/flags
 */
export function defaultRoutes({ slug, exp, flag }) {
  const sub = (p) => p.replace(":slug", slug).replace(":exp", exp).replace(":flag", flag);
  return [
    { name: "experiments-list", path: sub("/:slug/experiments") },
    { name: "experiment-results", path: sub("/:slug/experiments/:exp") },
    { name: "experiment-diagnostics", path: sub("/:slug/experiments/:exp?tab=diagnostics") },
    { name: "experiment-metrics", path: sub("/:slug/experiments/metrics") },
    { name: "holdouts", path: sub("/:slug/experiments/holdouts") },
    { name: "flags-list", path: sub("/:slug/flags") },
    { name: "flag-detail", path: sub("/:slug/flags/:flag") },
    { name: "usage", path: sub("/:slug/usage") },
    { name: "billing", path: sub("/:slug/settings/billing") },
  ];
}
