import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { UiThemeProvider } from "@/components/docs/ui-theme";
import { UiDocsChrome } from "@/components/docs/ui-docs-chrome";

// Server layout: read the chosen Brand from a cookie so the server renders the
// right Brand on first paint (no flash of the default on refresh). The cookie is
// kept in sync with localStorage by the client provider.
export default async function UiDocsLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("flagon-ui-theme")?.value ?? "flagon";
  return (
    <UiThemeProvider initialTheme={theme}>
      <UiDocsChrome>{children}</UiDocsChrome>
    </UiThemeProvider>
  );
}
