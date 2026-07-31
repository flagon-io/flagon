import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import betterTailwind from "eslint-plugin-better-tailwindcss";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Tailwind class hygiene, enforced as errors + auto-fixed. entryPoint is the
  // v4 CSS config so the plugin knows this project's classes.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: { "better-tailwindcss": { entryPoint: "src/app/globals.css" } },
    // Only PROVABLY value-preserving rules (canonical form incl. shorthand,
    // class ordering, de-dup, whitespace). Deliberately NOT enabling
    // no-deprecated-classes (rewrites rounded->rounded-sm etc. — a value mapping
    // to verify by hand) or variant-order (can shift stacked-variant behavior).
    rules: {
      "better-tailwindcss/enforce-canonical-classes": "error",
      "better-tailwindcss/enforce-consistent-class-order": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
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
