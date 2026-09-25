"use client";

// Error boundary for org pages. It renders inside the org shell (the [org]
// layout is above it), so the sidebar stays usable; failures in that layout
// itself fall through to the root app/error.tsx.
import { RouteError, type RouteErrorProps } from "@/components/shared/route-error";

export default function OrgError(props: RouteErrorProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-8">
      <RouteError {...props} />
    </div>
  );
}
