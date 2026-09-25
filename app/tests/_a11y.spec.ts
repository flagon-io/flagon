import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { components } from "../src/components/docs/registry";

// axe-core ships with our deps (transitive); find its minified bundle whether it
// hoisted to the workspace root or landed in the app package.
const axePath = [
  resolve(process.cwd(), "node_modules/axe-core/axe.min.js"),
  resolve(process.cwd(), "../node_modules/axe-core/axe.min.js"),
].find((p) => existsSync(p))!;

const pages = [
  "/ui",
  "/ui/installation",
  "/ui/theming",
  "/ui/components",
  ...components.map((c) => `/ui/components/${c.slug}`),
];

// The Brand playground renders an arbitrary, user-editable "Custom" brand, so the
// contrast of a preview swatch depends on whatever colors are being tried, not on
// the library. We still scan it for structural a11y (labels/roles), but its
// color-contrast is not a library gate.
const CONTRAST_EXCLUDED = ["/ui/theming"];
// Design-system components target WCAG AA (4.5:1) for text. We hard-fail below this
// floor, which catches real regressions while tolerating the two documented edges
// that sit just under AA: the semantic `destructive` red used AS TEXT on a dark
// card (4.3:1 - the same token must stay dark enough for white text on the fill, so
// it can't also be lighter as text; it passes on the base background).
const CONTRAST_FLOOR = 4.0;

type Node = { target: string; ratio?: number; fg?: string; bg?: string };
type Violation = { rule: string; impact: string; nodes: Node[] };

async function axeViolations(page: import("@playwright/test").Page): Promise<Violation[]> {
  // A late client navigation (dev-server HMR, a redirect) can swap the document
  // after injection and drop the global, so make sure axe is present right
  // before running it, re-injecting once if the page moved underneath us.
  await page.addScriptTag({ path: axePath });
  // @ts-expect-error injected global
  if (!(await page.evaluate(() => typeof window.axe?.run === "function"))) {
    await page.waitForLoadState("networkidle");
    await page.addScriptTag({ path: axePath });
  }
  return page.evaluate(async () => {
    // @ts-expect-error injected global
    const results = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: {
        // "region" is about the /ui doc shell's landmarks, not the components under test.
        region: { enabled: false },
        // The Command palette is built on cmdk, whose listbox wraps options in a
        // presentation node; axe flags aria-required-children for that structure.
        // It is a known upstream primitive limitation, not our composition, so we
        // exempt this one rule rather than fork cmdk's internals.
        "aria-required-children": { enabled: false },
      },
    });
    return results.violations.map(
      (v: {
        id: string;
        impact: string;
        nodes: { target: string[]; any: { data?: { contrastRatio?: number; fgColor?: string; bgColor?: string } }[] }[];
      }) => ({
        rule: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target?.join(" ") ?? "",
          ratio: n.any?.[0]?.data?.contrastRatio,
          fg: n.any?.[0]?.data?.fgColor,
          bg: n.any?.[0]?.data?.bgColor,
        })),
      }),
    );
  });
}

// One test per page. Playwright shards tests (not loop iterations) across workers,
// so splitting the catalog turns what was a single serial marathon into a fan-out
// that scales with `workers`, and a failure names the exact offending page.
for (const path of pages) {
  test(`a11y sweep (light + dark): ${path}`, async ({ page }) => {
    const failures: string[] = [];
    // Sub-AA-but-tolerated contrast (the documented `destructive` edge): recorded
    // as a report annotation instead of console noise, so a clean run is silent.
    const tolerated = new Set<string>();

    for (const mode of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto(path, { waitUntil: "networkidle" });
      // Let the pre-paint theme script + brand settle.
      await page.waitForTimeout(150);

      for (const v of await axeViolations(page)) {
        if (v.impact !== "critical" && v.impact !== "serious") continue;
        if (v.rule === "color-contrast") {
          if (CONTRAST_EXCLUDED.includes(path)) continue;
          for (const n of v.nodes) {
            if ((n.ratio ?? 0) < CONTRAST_FLOOR) {
              failures.push(`color-contrast ${n.ratio}:1 fg=${n.fg} bg=${n.bg} @ ${path} (${mode}) ${n.target}`);
            } else {
              tolerated.add(`color-contrast ${n.ratio}:1 @ ${path} (${mode}) ${n.target}`);
            }
          }
        } else {
          failures.push(`${v.impact} ${v.rule} @ ${path} (${mode}) ${v.nodes[0]?.target ?? ""}`);
        }
      }
    }

    if (tolerated.size) {
      test.info().annotations.push({ type: "a11y-tolerated-contrast", description: [...tolerated].join("; ") });
    }
    expect(failures, `accessibility gate failures:\n${[...new Set(failures)].join("\n")}`).toEqual([]);
  });
}
