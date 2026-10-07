import type { ComponentType } from "react";
import {
  Boxes,
  FlaskConical,
  GitBranch,
  Handshake,
  Info,
  LayoutGrid,
  Megaphone,
  Users,
} from "lucide-react";
import { SiDiscord, SiGithub } from "@icons-pack/react-simple-icons";
import { PRODUCTS, productHref } from "@/lib/products";

/**
 * Single source of truth for the company's identity and top-level navigation.
 * Everything that renders the name, the legal entity, links, or the nav reads
 * from here so there is exactly one place to change them.
 */

const links = {
  github: "https://github.com/flagon-io",
  /** The company's organization on g1t, our own forge. */
  g1t: "https://g1t.sh/flagon-io",
  /** The repo backing this site (used for "edit on GitHub" links). */
  repo: "https://github.com/flagon-io/flagon",
  discord: "https://discord.gg/dtYQs6rPXN",
  email: "hey@flagon.io",
} as const;

type IconType = ComponentType<{ className?: string }>;

export type NavLink = {
  label: string;
  href: string;
  external?: boolean;
  icon?: IconType;
};
/** A dropdown: sections of links, rendered with a divider between sections. */
export type NavGroup = {
  label: string;
  sections: readonly (readonly NavLink[])[];
};
export type NavItem = NavLink | NavGroup;

/**
 * Top nav is company-shaped: Flagon is the studio, and each product has its own
 * site. Products sit up front as a dropdown into each one's page here, which
 * then links out; the handbook, blog, and company pages follow.
 */
const nav: readonly NavItem[] = [
  {
    label: "Products",
    sections: [
      PRODUCTS.map((p) => ({
        label: p.name,
        href: productHref(p),
        icon: GitBranch,
      })),
      [{ label: "All products", href: "/products", icon: LayoutGrid }],
    ],
  },
  { label: "Handbook", href: "/handbook" },
  { label: "Books", href: "/books" },
  { label: "Blog", href: "/blog" },
  {
    label: "Company",
    sections: [
      [
        { label: "About", href: "/about", icon: Info },
        { label: "People", href: "/people", icon: Users },
        { label: "Small teams", href: "/teams", icon: Boxes },
        { label: "Media", href: "/media", icon: Megaphone },
      ],
      [
        { label: "Side projects", href: "/side-projects", icon: FlaskConical },
        { label: "Partnerships", href: "/partnerships", icon: Handshake },
        {
          label: "Discord",
          href: links.discord,
          external: true,
          icon: SiDiscord,
        },
        { label: "GitHub", href: links.github, external: true, icon: SiGithub },
        { label: "Flagon on g1t", href: links.g1t, external: true, icon: GitBranch },
      ],
    ],
  },
];

export const site = {
  name: "Flagon",
  legalName: "Flagon, Inc.",
  domain: "flagon.io",
  url: "https://www.flagon.io",
  tagline: "We build software in the open.",
  description:
    "Flagon, Inc. is a small, independent software company. We build products for developers, starting with g1t, and we run the company in the open: the handbook, the pay, and the way we decide are all public.",
  links,
  nav,
} as const;

export function isNavGroup(item: NavItem): item is NavGroup {
  return "sections" in item;
}
