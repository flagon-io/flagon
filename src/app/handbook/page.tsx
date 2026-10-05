import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getHandbookNav } from "@/lib/handbook";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Handbook",
  description:
    "The Book of Flagon: how the company works, in the open. The way we operate, what we value, how we pay people, and how we make decisions, all readable, all here.",
};

export default async function HandbookIndex() {
  const categories = await getHandbookNav();

  return (
    <main>
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
          The Book of Flagon
        </p>
        <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          How we work, in the open.
        </h1>
        <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground">
          This is the real thing, not a polished excerpt. How {site.legalName}{" "}
          operates, what we value, how we pay people, how we decide. If
          something here reads badly, that&rsquo;s a bug; tell us and
          we&rsquo;ll fix it. It&rsquo;s all versioned in{" "}
          <a
            href={site.links.github}
            target="_blank"
            rel="noreferrer"
            className="text-link underline underline-offset-2"
          >
            git
          </a>
          , so you can watch it change.
        </p>
      </div>

      <div className="mt-14 flex flex-col gap-14">
        {categories.map((category) => {
          const sections = category.sections.filter((s) => s.pages.length > 0);
          if (sections.length === 0) return null;
          return (
          <div key={category.name ?? "_top"} className="flex flex-col gap-10">
            {category.name ? (
              <h2 className="text-2xl font-semibold tracking-tight">{category.name}</h2>
            ) : null}
            {sections.map((section) => {
              const numbered = section.name === "Chapters";
              return (
                <section key={section.name}>
                  <h3 className="font-mono text-[11px] uppercase tracking-widest text-subtle">
                    {section.name}
                  </h3>
                  <ol className="mt-4 border-t border-hairline">
                    {section.pages.map((page, i) => (
                      <li key={page.slug}>
                        <Link
                          href={`/handbook/${page.slug}`}
                          className="group block border-b border-hairline py-4"
                        >
                          <span className="flex items-baseline gap-3">
                            <span className="text-base font-semibold tracking-tight group-hover:text-brand">
                              {page.title}
                            </span>
                            <span
                              aria-hidden
                              className="min-w-8 flex-1 translate-y-[-0.28em] border-b border-dotted border-hairline transition-colors group-hover:border-mark"
                            />
                            {numbered ? (
                              <span className="shrink-0 font-mono text-xs tabular-nums text-subtle group-hover:text-brand">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                            ) : (
                              <ArrowRight
                                className="h-4 w-4 shrink-0 translate-y-[0.15em] text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                                strokeWidth={2}
                                aria-hidden
                              />
                            )}
                          </span>
                          {page.description ? (
                            <span className="mt-1.5 block max-w-2xl text-sm leading-relaxed text-muted-foreground">
                              {page.description}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
          );
        })}
      </div>
    </main>
  );
}
