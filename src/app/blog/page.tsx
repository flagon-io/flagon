import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/frame";
import { Section, SectionHeader } from "@/components/section";
import { Schematic } from "@/components/schematic";
import { Cta } from "@/components/cta";
import { PostCover } from "@/components/post-cover";
import { getAllPosts, formatDate } from "@/lib/blog";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes from building a software company in public: decisions, mistakes, and the occasional strong opinion.",
};

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <Frame>
      <main>
        <Section divider={false}>
          <SectionHeader
            title="We write things down"
            lead="Notes from building a company in the open: how we decide, what we get wrong, and the occasional strong opinion we're willing to defend."
          />
        </Section>

        <Section divider>
          {posts.length > 0 ? (
            <ul className="grid gap-4 px-6 sm:px-8 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-hairline bg-(--art-card) outline-none transition hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <PostCover art={p.art} id={`post-${p.slug}`} className="rounded-none border-0 border-b" />
                    <div className="flex flex-1 flex-col p-6">
                      <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-subtle">
                        <span>{formatDate(p.date)}</span>
                        <span aria-hidden>·</span>
                        <span>{p.readingMinutes} min</span>
                      </div>
                      <h2 className="mt-3 text-balance text-lg font-semibold tracking-tight group-hover:text-brand">
                        {p.title}
                      </h2>
                      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                        {p.description}
                      </p>
                      <p className="mt-auto pt-5 text-sm text-subtle">
                        by {p.author}
                        {p.role ? `, ${p.role}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Schematic bleed>
              <div className="mx-auto max-w-md px-6 py-20 text-center sm:py-24">
                <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
                  Nothing here yet
                </p>
                <h2 className="mt-4 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                  We&rsquo;d rather write nothing than write filler.
                </h2>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                  There&rsquo;s no blog here yet, and we&rsquo;re not going to pad it
                  out to look busy. When we&rsquo;ve got something worth your time, a
                  real decision, a mistake we made, an opinion we&rsquo;ll defend,
                  it&rsquo;ll show up here. Until then, the thinking lives in the
                  handbook.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Cta href="/handbook">Read the handbook</Cta>
                  <Cta href={site.links.discord} external variant="secondary">
                    Follow along in Discord
                  </Cta>
                </div>
              </div>
            </Schematic>
          )}
        </Section>
      </main>
    </Frame>
  );
}
