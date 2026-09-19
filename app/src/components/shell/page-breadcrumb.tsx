"use client";

import { createContext, useContext, useEffect } from "react";

/**
 * Lets a detail page contribute a trailing breadcrumb crumb with a human label
 * the path alone can't provide (a team's name, a project's name, ...). The app
 * shell holds the state and appends the crumb after the nav-derived trail; a page
 * renders `<PageBreadcrumb label={entity.name} />` to register it, and it clears
 * automatically on navigation.
 */
export type DynamicCrumb = { label: string } | null;

const BreadcrumbContext = createContext<(crumb: DynamicCrumb) => void>(() => {});

export const BreadcrumbProvider = BreadcrumbContext.Provider;

/** Registers a trailing breadcrumb crumb for the current page. Renders nothing. */
export function PageBreadcrumb({ label }: { label: string }) {
  const setCrumb = useContext(BreadcrumbContext);
  useEffect(() => {
    setCrumb({ label });
    return () => setCrumb(null);
  }, [setCrumb, label]);
  return null;
}
