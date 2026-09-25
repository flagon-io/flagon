"use client";

// Root error boundary. Catches failures in the entry resolver and in the [org]
// and /settings layouts themselves (a segment's error.tsx never wraps its own
// layout), e.g. the API being unreachable while resolving the signed-in user.
// Renders full-page, like the root 404, since no shell is available here.
import { FlagonMark } from "@flagon-io/ui";
import { RouteError, type RouteErrorProps } from "@/components/shared/route-error";

export default function RootError(props: RouteErrorProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-6">
      <FlagonMark className="h-7 w-auto text-foreground" />
      <RouteError
        {...props}
        className="w-full max-w-md"
        description="We couldn't reach Flagon to load this page. This is usually temporary, so try again in a moment."
      />
    </main>
  );
}
