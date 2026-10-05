import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Mdx } from "@/components/mdx";
import { Toc } from "@/components/toc";
import {
  getHandbookPage,
  getHandbookOrder,
  listHandbookSlugs,
} from "@/lib/handbook";
import { site } from "@/lib/site";
import { extractToc } from "@/lib/toc";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  return (await listHandbookSlugs()).map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getHandbookPage(slug);
  if (!page) return {};
  return {
    title: `${page.title} · Handbook`,
    description: page.description,
  };
}

export default async function HandbookPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const [page, order] = await Promise.all([getHandbookPage(slug), getHandbookOrder()]);

  if (!page) notFound();

  const toc = extractToc(page.content);
  const idx = order.findIndex((p) => p.slug === slug);
  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-12">
      <main className="min-w-0">
        <article>
          <header className="border-b border-hairline pb-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
              {page.section} · {page.readingMinutes} min read
            </p>
            <h1 className="mt-4 text-balance text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
              {page.title}
            </h1>
            {page.description ? (
              <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
                {page.description}
              </p>
            ) : null}
          </header>

          <div className="prose mt-10 max-w-2xl">
            <Mdx source={page.content} />
          </div>
        </article>

        {/* edit link: pages live in content/handbook/<folder>/<page>.mdx behind a
            flat URL, so the loader records each page's source path. */}
        <div className="mt-12 max-w-2xl border-t border-hairline pt-6">
          <a
            href={`${site.links.repo}/blob/main/${page.source}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-subtle transition hover:text-foreground"
          >
            Edit this page on GitHub →
          </a>
        </div>

        {/* prev / next */}
        {(prev || next) && (
          <nav className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
            {prev ? (
              <Link
                href={`/handbook/${prev.slug}`}
                className="group rounded-lg border border-hairline p-5 transition hover:bg-panel"
              >
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-subtle">
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> Previous
                </span>
                <p className="mt-2 font-medium tracking-tight group-hover:text-brand">
                  {prev.title}
                </p>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/handbook/${next.slug}`}
                className="group rounded-lg border border-hairline p-5 text-right transition hover:bg-panel"
              >
                <span className="flex items-center justify-end gap-1.5 font-mono text-[10px] uppercase tracking-widest text-subtle">
                  Next <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
                <p className="mt-2 font-medium tracking-tight group-hover:text-brand">
                  {next.title}
                </p>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </main>

      {/* On this page: sticky within the scrolling content column, with its own
          overflow so a long TOC scrolls rather than pushing the page. */}
      <aside className="hidden xl:block xl:sticky xl:top-10 xl:max-h-[calc(100dvh-8rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain">
        <Toc items={toc} />
      </aside>
    </div>
  );
}
