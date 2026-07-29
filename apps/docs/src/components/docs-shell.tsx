"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Menu, X } from "lucide-react";
import { FlagonMark, IconGitHub, brand } from "@flagon/design";
import { nav, flatNav } from "@/lib/nav";
import { APP_URL } from "@/lib/urls";

function normalize(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = normalize(usePathname());
  return (
    <nav className="flex flex-col gap-6 text-sm">
      {nav.map((section) => (
        <div key={section.title}>
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
            {section.title}
          </div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = normalize(item.href) === pathname;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={
                      "block rounded-md px-3 py-1.5 transition " +
                      (active
                        ? "bg-teal-400/10 font-medium text-teal-300"
                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")
                    }
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Pager() {
  const pathname = normalize(usePathname());
  const idx = flatNav.findIndex((i) => normalize(i.href) === pathname);
  if (idx === -1) return null;
  const prev = idx > 0 ? flatNav[idx - 1] : null;
  const next = idx < flatNav.length - 1 ? flatNav[idx + 1] : null;

  return (
    <div className="mt-16 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col rounded-lg border border-white/10 px-4 py-3 transition hover:border-white/20 hover:bg-white/5"
        >
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <ArrowLeft className="h-3 w-3" /> Previous
          </span>
          <span className="mt-1 text-sm font-medium text-zinc-200 group-hover:text-teal-300">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col rounded-lg border border-white/10 px-4 py-3 text-right transition hover:border-white/20 hover:bg-white/5"
        >
          <span className="flex items-center justify-end gap-1 text-xs text-zinc-500">
            Next <ArrowRight className="h-3 w-3" />
          </span>
          <span className="mt-1 text-sm font-medium text-zinc-200 group-hover:text-teal-300">
            {next.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

export function DocsShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09090b]/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Toggle navigation"
              onClick={() => setOpen((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 hover:bg-white/5 lg:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link href="/" className="flex items-center gap-2">
              <FlagonMark className="h-6 w-6 text-teal-400" />
              <span className="font-semibold text-zinc-100">{brand.name}</span>
              <span className="text-sm text-zinc-500">Docs</span>
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a
              href={brand.repo}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 text-zinc-400 hover:text-zinc-200 sm:flex"
            >
              <IconGitHub className="h-4 w-4" /> GitHub
            </a>
            <Link
              href={APP_URL}
              className="rounded-md bg-teal-500 px-3 py-1.5 font-medium text-zinc-950 transition hover:bg-teal-400"
            >
              Console
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 sm:px-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 lg:block">
          <Sidebar />
        </aside>

        {/* Mobile drawer */}
        {open ? (
          <div className="fixed inset-0 top-14 z-20 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto border-r border-white/10 bg-[#0b0f10] p-6">
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 py-10">
          <article className="prose-docs mx-auto max-w-3xl">{children}</article>
          <div className="mx-auto max-w-3xl">
            <Pager />
          </div>
        </main>
      </div>
    </div>
  );
}
