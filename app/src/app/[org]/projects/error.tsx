"use client";

// Covers the projects list and, since a segment's error.tsx never wraps its own
// layout, a failure loading a project in projects/[project]/layout.tsx.
import { RouteError, type RouteErrorProps } from "@/components/shared/route-error";

export default function ProjectsError(props: RouteErrorProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-8">
      <RouteError
        {...props}
        title="Couldn't load projects"
        description="We couldn't load this project data. This is usually temporary, so try again in a moment."
      />
    </div>
  );
}
