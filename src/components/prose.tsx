/** Minimal prose primitives for docs/legal pages (no typography plugin needed). */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{children}</h1>;
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-lg leading-relaxed text-muted">{children}</p>;
}

export function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-14 scroll-mt-24 border-b border-border pb-2 text-xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mt-8 scroll-mt-24 text-base font-semibold">
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 leading-relaxed text-muted">{children}</p>;
}

export function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-[13px] leading-relaxed text-muted">
      {children}
    </pre>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-card-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

export function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="mt-4 list-disc space-y-2 pl-5 text-muted marker:text-border">{children}</ul>;
}

/** "Next page" link at the bottom of a doc page. */
export function DocNext({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-16 border-t border-border pt-6">
      <Link
        href={href}
        className="group flex items-center justify-between rounded-xl border border-border p-4 transition-colors hover:border-brand-500/40"
      >
        <span>
          <span className="block text-xs text-muted">Next</span>
          <span className="font-medium">{label}</span>
        </span>
        <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
