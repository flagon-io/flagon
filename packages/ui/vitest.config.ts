import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests for the design system: the pure logic (money parsing, flexible date
// parsing, Brand serialize/compile) plus a few component render smoke tests.
// jsdom gives the component tests a DOM; the pure-logic tests don't need it but
// share the environment. Integration behavior is covered by Playwright in app/.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
