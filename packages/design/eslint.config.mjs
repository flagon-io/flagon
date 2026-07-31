import tseslint from "typescript-eslint";
import betterTailwind from "eslint-plugin-better-tailwindcss";

/**
 * The design system is plain TS/TSX (not a Next app), so it parses with
 * typescript-eslint rather than eslint-config-next. Its only linting job today is
 * Tailwind class hygiene — the same value-preserving rules the apps enforce
 * (canonical form incl. shorthand, class ordering, de-dup, whitespace), as
 * errors + auto-fixed. entryPoint is the package's own v4 CSS.
 */
export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "better-tailwindcss": betterTailwind },
    settings: { "better-tailwindcss": { entryPoint: "src/styles.css" } },
    rules: {
      "better-tailwindcss/enforce-canonical-classes": "error",
      "better-tailwindcss/enforce-consistent-class-order": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-unnecessary-whitespace": "error",
    },
  },
];
