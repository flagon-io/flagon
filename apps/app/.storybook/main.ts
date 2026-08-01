import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook runs on the Vite builder (NOT @storybook/nextjs) because this app is on
 * a modified Next 16 the Next framework preset doesn't support. Instead we render
 * the client components in isolation and mock the two Next-only seams they touch:
 *
 *  - `next/navigation` (useRouter/useSearchParams/…) -> a no-op mock, so components
 *    that call the router render without a Next runtime.
 *  - the flag server actions (`../actions`) -> async no-ops, so an editor's Save path
 *    resolves cleanly in a story without a server or DB.
 *
 * Tailwind v4 comes for free: Vite auto-loads the app's postcss.config.mjs
 * (@tailwindcss/postcss), so importing globals.css in preview.ts gives real styles.
 */
const mock = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  viteFinal: async (cfg) => {
    cfg.resolve ??= {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias as Record<string, string> | undefined),
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      "next/navigation": mock("./mocks/next-navigation.ts"),
    };
    // Replace the flag server actions with no-ops wherever a component under
    // src/app/**/flags/** imports them via the relative "../actions" specifier.
    cfg.plugins ??= [];
    cfg.plugins.push({
      name: "flagon-mock-flag-actions",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "../actions" && importer && importer.replace(/\\/g, "/").includes("/flags/")) {
          return mock("./mocks/flag-actions.ts");
        }
        return null;
      },
    });
    return cfg;
  },
};

export default config;
