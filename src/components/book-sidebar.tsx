import { SidebarNav, type SidebarGroup } from "@/components/sidebar";

type BookNav = {
  slug: string;
  title: string;
  parts: { name: string; chapters: { slug: string; title: string; number: number | null }[] }[];
};

/**
 * A book's sidebar: each part is a collapsible section of its chapters, numbered
 * the same way as the contents page and the PDF. Front and back matter carry no
 * number.
 */
export function BookSidebar({ book }: { book: BookNav }) {
  const groups: SidebarGroup[] = [
    {
      name: null,
      sections: book.parts.map((part) => ({
        name: part.name,
        items: part.chapters.map((c) => ({
          href: `/books/${book.slug}/${c.slug}`,
          title: c.title,
          number: c.number ?? undefined,
        })),
      })),
    },
  ];

  return (
    <SidebarNav
      title={book.title}
      homeHref={`/books/${book.slug}`}
      homeLabel="Contents"
      groups={groups}
    />
  );
}
