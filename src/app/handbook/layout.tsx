import type { ReactNode } from "react";
import { DocsShell } from "@/components/docs-shell";
import { HandbookSidebar } from "@/components/handbook-sidebar";
import { getHandbookNav } from "@/lib/handbook";

export default async function HandbookLayout({ children }: { children: ReactNode }) {
  const categories = (await getHandbookNav()).map((c) => ({
    name: c.name,
    sections: c.sections.map((s) => ({
      name: s.name,
      soon: s.soon,
      pages: s.pages.map((p) => ({ slug: p.slug, title: p.title })),
    })),
  }));

  return (
    <DocsShell
      toggleLabel="Browse the handbook"
      sidebar={<HandbookSidebar categories={categories} />}
    >
      {children}
    </DocsShell>
  );
}
