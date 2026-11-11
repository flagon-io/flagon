"use client";

/**
 * An inline script that runs while the browser parses the server HTML, before
 * first paint, and stays inert afterwards.
 *
 * It has to be a Client Component: the type is chosen per environment, as
 * executable JS when rendered on the server and inert text/plain when React
 * renders it in the browser (a client render never executes a <script>, and
 * React warns when it meets one). In a Server Component `typeof window` is
 * always "undefined", so the client would receive a live <script> and warn.
 * suppressHydrationWarning covers the type differing between the two.
 * See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      dangerouslySetInnerHTML={{ __html: html }}
      suppressHydrationWarning
    />
  );
}
