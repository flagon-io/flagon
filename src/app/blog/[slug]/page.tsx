import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Frame } from "@/components/frame";
import { Mdx } from "@/components/mdx";
import { PostCover } from "@/components/post-cover";
import { getPost, getAllPosts, formatDate } from "@/lib/blog";
import { site } from "@/lib/site";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <Frame>
      <main className="mx-auto w-full max-w-2xl px-6 py-12 sm:px-8">
        <Link
          href="/blog"
          className="group inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-subtle transition hover:text-foreground"
        >
          <ArrowLeft
            className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
            strokeWidth={2}
          />
          All posts
        </Link>

        <article className="mt-8">
          <PostCover art={post.art} id={`cover-${post.slug}`} className="mb-10" />
          <header className="border-b border-hairline pb-8">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-subtle">
              <span>{formatDate(post.date)}</span>
              <span>·</span>
              <span>{post.readingMinutes} min read</span>
              {post.tags.map((t) => (
                <span key={t} className="text-brand">
                  {t}
                </span>
              ))}
            </div>
            <h1 className="mt-4 text-balance text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              {post.description}
            </p>
            <p className="mt-5 text-sm text-subtle">
              by {post.author}
              {post.role ? `, ${post.role}` : ""}
            </p>
          </header>

          <div className="prose mt-10">
            <Mdx source={post.content} />
          </div>
        </article>

        <div className="mt-12 border-t border-hairline pt-6">
          <a
            href={`${site.links.repo}/blob/main/content/blog/${slug}.mdx`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-subtle transition hover:text-foreground"
          >
            Edit this post on GitHub →
          </a>
        </div>
      </main>
    </Frame>
  );
}
