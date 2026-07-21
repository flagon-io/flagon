"use client";

import { appPath } from "@/lib/urls";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  KeyRound,
  Mail,
  Building2,
  Radio,
  Settings2,
  User,
} from "lucide-react";

const sections = [
  {
    href: appPath("/settings"),
    label: "Public profile",
    icon: User,
    exact: true,
  },
  { href: appPath("/settings/account"), label: "Account", icon: Settings2 },
  { href: appPath("/settings/emails"), label: "Emails", icon: Mail },
  { href: appPath("/settings/sessions"), label: "Sessions", icon: Radio },
  { href: appPath("/settings/tokens"), label: "Access tokens", icon: KeyRound },
  {
    href: appPath("/settings/organizations"),
    label: "Organizations",
    icon: Building2,
  },
];

/** The app lives at /app/... locally but at the subdomain root in production;
 * normalize both sides so active states match either way. */
function normalize(path: string): string {
  return path.replace(/^\/app(?=\/|$)/, "") || "/";
}

export function SettingsNav() {
  const pathname = normalize(usePathname());

  return (
    <nav className="flex flex-col gap-0.5 text-sm" aria-label="Settings">
      {sections.map(({ href, label, icon: Icon, exact }) => {
        const target = normalize(href);
        const active = exact
          ? pathname === target
          : pathname.startsWith(target);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 transition ${
              active
                ? "bg-white/5 font-medium text-zinc-100"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
