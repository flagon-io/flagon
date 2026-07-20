"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  KeyRound,
  Mail,
  Bell,
  Building2,
  Paintbrush,
  Radio,
  Settings2,
  User,
} from "lucide-react";

const sections = [
  { href: "/app/settings", label: "Public profile", icon: User, exact: true },
  { href: "/app/settings/account", label: "Account", icon: Settings2 },
  { href: "/app/settings/emails", label: "Emails", icon: Mail },
  { href: "/app/settings/sessions", label: "Sessions", icon: Radio },
  {
    href: "/app/settings/organizations",
    label: "Organizations",
    icon: Building2,
  },
];

/** Flagon-shaped sections that land later; visible so the map is clear. */
const upcoming = [
  { label: "Appearance", icon: Paintbrush },
  { label: "Notifications", icon: Bell },
  { label: "Access tokens", icon: KeyRound },
  { label: "Billing", icon: CreditCard },
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

      <div className="mt-4 border-t border-white/5 pt-4">
        {upcoming.map(({ label, icon: Icon }) => (
          <span
            key={label}
            aria-disabled
            title="Coming soon"
            className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-1.5 text-zinc-600"
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
            <span className="ml-auto rounded-full border border-white/10 px-1.5 text-[10px] uppercase tracking-wide text-zinc-600">
              Soon
            </span>
          </span>
        ))}
      </div>
    </nav>
  );
}
