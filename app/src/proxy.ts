import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Serve the component library at ui.flagon.io (and ui.localhost:3000 for local
// dev) by rewriting that host onto the /ui section. The registry under /r and
// framework/asset paths are left untouched so shadcn can fetch
// https://ui.flagon.io/r/<name>.json directly.
//
// This is Next's Proxy convention (the renamed successor to middleware).
export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const isUiHost = host === "ui.flagon.io" || host.startsWith("ui.localhost");
  if (!isUiHost) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/ui") || pathname.startsWith("/r")) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = pathname === "/" ? "/ui" : `/ui${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next internals, API routes, and any path with a file extension.
  matcher: ["/((?!_next/|api/|.*\\.).*)"],
};
