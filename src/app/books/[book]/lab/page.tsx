import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { Section, GUTTER } from "@/components/section";
import { Mdx } from "@/components/mdx";
import { chapterLabs, labFiles } from "@/lib/book-lab";
import { chapterHref, getBook, getBooks } from "@/lib/books";
import { site } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getBooks()
    .filter((b) => labFiles(b.slug).length > 0)
    .map((b) => ({ book: b.slug }));
}

export async function generateMetadata(props: PageProps<"/books/[book]/lab">): Promise<Metadata> {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book) return {};
  return {
    title: `The lab · ${book.title}`,
    description: `Rerun every claim in ${book.title} on your own machine with one command: the book's sample data, and a script per chapter.`,
  };
}

export default async function LabPage(props: PageProps<"/books/[book]/lab">) {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book || labFiles(slug).length === 0) notFound();

  const rows = book.chapters
    .map((c) => ({ c, labs: chapterLabs(slug, c.source.split("/").pop()!) }))
    .filter((r) => r.labs.length);
  const claims = rows.reduce((n, r) => n + r.labs.reduce((m, l) => m + l.claims, 0), 0);
  const base = `${site.url}/books/${slug}`;

  // Written as MDX so the commands get the same code styling as the chapters.
  const source = `
Every measurement in this book came from a real PostgreSQL 18 server running the book's sample data. The lab is that server, packaged: one compose file, the seed, and a script for each chapter in which every claim is a check that either holds or fails loudly. If a chapter says an index takes a query from reading the whole table to reading a couple dozen pages, its lab measures that on your machine and stops with \`NOT PROVED\` if it doesn't hold.

## Run it

You need Docker, and bash: any terminal on Linux or macOS, or Git Bash or WSL on Windows. Download the lab and run a chapter:

\`\`\`bash
curl -L ${base}/lab.tar.gz | tar xz
cd ${slug}-lab
./lab 16-btree
\`\`\`

That one command does everything: it starts the lab's server if it isn't running (the first start seeds 2 million events, about a minute), runs the chapter's checks in a fresh copy of the data, and exits non-zero if any claim fails. A chapter's number or name works too (\`./lab 16\`, \`./lab btree\`); \`./lab\` on its own lists every chapter, and \`./lab all\` runs them in reading order and lists any that failed. Labs can build indexes, update every row, or drop tables without stepping on each other. When you're done, \`docker compose down -v\` throws the whole thing away.

A few chapters need more than one server (a primary and a replica, a sharded cluster, a MySQL to compare against). \`./lab\` lists them with a \`+\`. Their labs are shell scripts that start their own containers from their own compose files and remove them when they finish, pass or fail; they take a few minutes and more memory. Set \`KEEP=1\` (\`KEEP=1 ./lab 37\`) to leave those servers running so you can look around afterwards.

To explore by hand, make yourself a copy and connect:

\`\`\`bash
docker compose exec postgres psql -c "create database scratch template book"
docker compose exec postgres psql -d scratch
\`\`\`

The server also listens on \`127.0.0.1:5418\` (user and password \`postgres\`) if you'd rather use your own client.

## What a claim looks like

\`\`\`sql
select lab.prove(
  'with an index on (project_id, created_at), the dashboard reads under 50 pages',
  lab.buffers($$ select * from events where project_id = 4242
                 order by created_at desc limit 20 $$) < 50
);
\`\`\`

\`lab.buffers\` runs the query under \`EXPLAIN (ANALYZE, BUFFERS)\` and counts the pages it touched. \`lab.prove\` prints \`PROVED\` or stops the script. The helpers are in [helpers.sql](/books/${slug}/lab/helpers.sql), and they're short enough to read in a minute. We check pages, rows, and plan shapes rather than milliseconds: timings depend on your hardware, page counts don't.

## Chapter by chapter

${claims} claims across ${rows.length} chapters.

| Chapter | Lab | Claims |
|---|---|---|
${rows
  .map(
    ({ c, labs }) =>
      `| [${c.title}](${chapterHref(book, c)}) | ${labs
        .map((l) => `[${l.file}](/books/${slug}/lab/${l.file})`)
        .join(", ")} | ${labs.reduce((n, l) => n + l.claims, 0)} |`,
  )
  .join("\n")}

## Found one that doesn't hold?

That's a bug in the book, and we want it. [Open an issue](${site.links.repo}/issues) with the lab's output and your platform, or send a fix: the lab lives next to the chapters in [the repository](${site.links.repo}/tree/main/content/books/${slug}/lab).
`;

  return (
    <Frame>
      <main>
        <Section divider={false}>
          <div className={GUTTER}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
              {book.title} · The lab
            </p>
            <h1 className="mt-4 max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              Don&rsquo;t take our word for it.
            </h1>
            <div className="prose mt-8 max-w-2xl">
              <Mdx source={source} />
            </div>
          </div>
        </Section>
      </main>
    </Frame>
  );
}
