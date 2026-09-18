import {
  User,
  UserCog,
  Palette,
  Bell,
  Mail,
  ShieldCheck,
  MonitorSmartphone,
  Building2,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

export type SettingsLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Match the pathname exactly (for the index route). */
  exact?: boolean;
};

export type SettingsGroup = { label?: string; items: SettingsLink[] };

/**
 * Personal account settings, grouped to match what Flagon's personal account
 * actually has. Org-level concerns (billing, members, org tokens) live under
 * /<org>/settings, not here.
 */
export const settingsNav: SettingsGroup[] = [
  {
    items: [
      { label: "Public profile", href: "/settings", icon: User, exact: true },
      { label: "Account", href: "/settings/account", icon: UserCog },
      { label: "Appearance", href: "/settings/appearance", icon: Palette },
      { label: "Notifications", href: "/settings/notifications", icon: Bell },
    ],
  },
  {
    label: "Access",
    items: [
      { label: "Emails", href: "/settings/emails", icon: Mail },
      { label: "Password and authentication", href: "/settings/security", icon: ShieldCheck },
      { label: "Sessions", href: "/settings/sessions", icon: MonitorSmartphone },
      { label: "Organizations", href: "/settings/organizations", icon: Building2 },
    ],
  },
  {
    label: "Developer settings",
    items: [{ label: "Personal access tokens", href: "/settings/tokens", icon: KeyRound }],
  },
];

export function settingsActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
