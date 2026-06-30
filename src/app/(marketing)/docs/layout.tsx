import { DocsNav } from '@/components/docs-nav';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
      <aside className="mb-10 lg:mb-0">
        <DocsNav />
      </aside>
      <article className="min-w-0">{children}</article>
    </div>
  );
}
