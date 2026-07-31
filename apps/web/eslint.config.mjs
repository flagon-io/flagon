import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import betterTailwind from "eslint-plugin-better-tailwindcss";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Tailwind class hygiene, enforced as errors + auto-fixed (value-preserving
  // rules only). entryPoint is the v4 CSS config.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: { "better-tailwindcss": { entryPoint: "src/app/globals.css" } },
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
