"use client";

// Error boundary for personal settings pages. It renders inside the settings
// chrome (the nav stays usable); failures in settings/layout.tsx itself fall
// through to the root app/error.tsx.
import { RouteError, type RouteErrorProps } from "@/components/shared/route-error";

export default function SettingsError(props: RouteErrorProps) {
  return <RouteError {...props} />;
}
