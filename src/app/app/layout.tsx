import type { Metadata } from "next";
import { brand } from "@/lib/brand";

/**
 * Application shell - served at `app.flagon.io` (locally `/app`). Intentionally
 * distinct from the marketing chrome; this is the product surface. Not indexed.
 *
 * Chrome lives in the route groups: (console) renders the signed-in header and
 * requires a session; (auth) renders the centered sign-in/sign-up flow.
 */
export const metadata: Metadata = {
  title: {
    default: `${brand.name} Console`,
    template: `%s · ${brand.name}`,
  },
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-[#09090b] text-zinc-100">
      {children}
    </div>
  );
}
