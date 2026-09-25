"use client";

// Last-resort boundary for errors in the root layout itself. It replaces the
// whole document, so it renders its own <html>/<body> and pulls in the global
// stylesheet directly (the root layout's import doesn't apply here). The theme
// class is re-applied from the stored preference so it matches the app.
import "./globals.css";
import { useEffect } from "react";
import { FlagonMark } from "@flagon-io/ui";
import { ThemeScript } from "@/components/theme/theme-script";
import { RouteError, type RouteErrorProps } from "@/components/shared/route-error";

export default function GlobalError(props: RouteErrorProps) {
  // ThemeScript covers a server-rendered 500; this covers a client-side swap,
  // where the new <html> replaces the classes the script had set.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("flagon-theme");
      const dark =
        stored === "dark" ||
        ((!stored || stored === "system") &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    } catch {
      /* storage unavailable: keep the light default */
    }
  }, []);

  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <title>Something went wrong - Flagon</title>
        <ThemeScript />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-6">
          <FlagonMark className="h-7 w-auto text-foreground" />
          <RouteError
            {...props}
            className="w-full max-w-md"
            description="Flagon hit an unexpected error loading this page. Try again in a moment."
          />
        </main>
      </body>
    </html>
  );
}
