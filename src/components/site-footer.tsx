import Link from "next/link";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";

type FooterLink = { label: string; href?: string };
type FooterGroup = { title: string; links: FooterLink[] };

const groups: FooterGroup[] = [
  {
    title: "Product",
    // Catalog leads: it is the substrate the other products attach to, and the
    // one expected to grow the most, so the order here should read the way the
    // lineup is meant to be understood rather than the order things shipped.
    // Matches brand.products, which was already in this order.
    links: [
      { label: "Overview", href: "/products" },
      { label: "Catalog", href: "/products/catalog" },
      { label: "Feature Flags", href: "/products/feature-flags" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "Enterprise", href: "/enterprise" }],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Getting started", href: "/docs/getting-started" },
      { label: "API reference", href: "/docs/api" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Security", href: "/security" },
      { label: "License (FSL)", href: `${brand.repo}/blob/main/LICENSE.md` },
    ],
  },
];

function FooterItem({ link }: { link: FooterLink }) {
  const className =
    "text-sm text-zinc-500 transition-colors hover:text-zinc-200";

  // An off-site link is an <a>, not a <Link>: next/link prefetches and
  // client-navigates, neither of which means anything for another origin.
  if (link.href?.startsWith("http")) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className={className}
      >
        {link.label}
      </a>
    );
  }

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
