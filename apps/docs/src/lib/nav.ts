/**
 * The docs sidebar, in order. One flat list of sections, each with its pages.
 * Adding a page is: create `src/app/<href>/page.mdx`, then add an entry here.
 */
export type NavItem = { title: string; href: string };
export type NavSection = { title: string; items: NavItem[] };

export const nav: NavSection[] = [
  {
    title: "Getting started",
    items: [
      { title: "Introduction", href: "/" },
      { title: "Quickstart", href: "/quickstart" },
    ],
  },
  {
    title: "Concepts",
    items: [
      { title: "Flags and variants", href: "/concepts/flags" },
      { title: "Environments", href: "/concepts/environments" },
      { title: "Targeting and segments", href: "/concepts/targeting" },
      { title: "SDK keys", href: "/concepts/sdk-keys" },
    ],
  },
  {
    title: "Evaluate flags",
    items: [
      { title: "OpenFeature SDK", href: "/evaluate/openfeature" },
      { title: "REST (OFREP)", href: "/evaluate/rest" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Management API", href: "/reference/management-api" },
    ],
  },
];

/** Flattened, in sidebar order — for prev/next paging. */
export const flatNav: NavItem[] = nav.flatMap((s) => s.items);
