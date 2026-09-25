"use client";

// Errors inside a project's pages. The project header (layout) stays visible
// above this, so the message stays scoped to the section that failed.
import { RouteError, type RouteErrorProps } from "@/components/shared/route-error";

export default function ProjectError(props: RouteErrorProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-8">
      <RouteError {...props} />
    </div>
  );
}
