import Link from "next/link";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";

type FooterLink = { label: string; href?: string };
type FooterGroup = { title: string; links: FooterLink[] };

const groups: FooterGroup[] = [
  {
    title: "Product",
    links: [
      { label: "Catalog" },
      { label: "Feature Flags" },
      { label: "Experiments" },
      { label: "Config" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Enterprise", href: "/enterprise" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact sales", href: "/enterprise/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "API reference", href: "/docs/api" },
      { label: "Status" },
      { label: "Changelog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Security", href: "/security" },
      { label: "License (FSL)" },
    ],
  },
];

function FooterItem({ link }: { link: FooterLink }) {
  const className =
    "text-sm text-zinc-500 transition-colors hover:text-zinc-200";

  if (link.href) {
    return (
      <Link href={link.href} className={className}>
        {link.label}
      </Link>
    );
  }

  return (
    <span
      aria-disabled
      title="Coming soon"
      className="cursor-not-allowed text-sm text-zinc-600"
    >
      {link.label}
    </span>
  );
}

/**
 * Marketing footer columns. Rendered in the marketing layout and sits directly
 * above the shared SiteBottomBar. Not used on the app surface.
 */
export function SiteFooter() {
  return (
    <footer className="w-full border-t border-white/5">
      <div className="mx-auto w-full max-w-7xl px-6 py-14">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:grid-cols-5">
          {/* Brand cell */}
          <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <FlagonMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-tight text-zinc-200">
                {brand.name}
              </span>
            </Link>
            <p className="max-w-[16rem] text-sm leading-6 text-zinc-500">
              The self-hostable developer platform.
            </p>
          </div>

          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {group.title}
              </h3>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <FooterItem link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
