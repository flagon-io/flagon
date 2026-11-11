import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import betterTailwind from "eslint-plugin-better-tailwindcss";
import { getDefaultSelectors } from "eslint-plugin-better-tailwindcss/defaults";
import { MatcherType, SelectorKind } from "eslint-plugin-better-tailwindcss/types";

/**
 * Class strings that live outside className/cn(): shared constants, and the
 * lookup objects buttons and grids pick their classes from. Listed here so the
 * Tailwind rules check them too. Add a name when you add one of these.
 */
const classConstants = "^(control|tileBase|GUTTER|slantSurface|base)$";
const classLookups = "^(variants|sizes|COLS|STRAIGHT)$";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: {
      "better-tailwindcss": {
        // Tailwind v4: the CSS entry point defines the theme (brand colors,
        // tokens), so classes are checked against the site's real config.
        entryPoint: "src/app/globals.css",
        selectors: [
          ...getDefaultSelectors(),
          {
            kind: SelectorKind.Variable,
            name: classConstants,
            match: [{ type: MatcherType.String }],
          },
          {
            kind: SelectorKind.Variable,
            name: classLookups,
            match: [{ type: MatcherType.ObjectValue }],
          },
        ],
      },
    },
    rules: {
      // Write classes the way Tailwind would: leading-tight, not leading-[1.25];
      // bg-brand/6, not bg-brand/[0.06]. Errors (and autofixable), so CI fails
      // on them instead of leaving editor warnings around.
      "better-tailwindcss/enforce-canonical-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-deprecated-classes": "error",
      // Single spaces between classes (also tidies up after the fixes above).
      "better-tailwindcss/no-unnecessary-whitespace": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
