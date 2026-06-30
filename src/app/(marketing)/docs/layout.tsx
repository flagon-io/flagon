import { DocsNav } from '@/components/docs-nav';

const GLOW = 'radial-gradient(38rem 18rem at 28% 0%, var(--glow), transparent 70%)';
const FADE = 'linear-gradient(black, transparent)';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{ maskImage: FADE, WebkitMaskImage: FADE }}
      />
      <div className="pointer-events-none absolute inset-x-0 -top-28 h-80" style={{ background: GLOW }} />
      <div className="relative mx-auto max-w-6xl px-6 py-12 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <aside className="mb-10 lg:mb-0">
          <DocsNav />
        </aside>
        <article className="min-w-0">{children}</article>
      </div>
    </div>
  );
}
