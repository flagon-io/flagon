import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { MDXRemote, type MDXRemoteProps } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import {
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
  Info,
  Lightbulb,
  OctagonAlert,
  Sparkles,
  StickyNote,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { TabsClient } from "@/components/mdx-tabs";
import { DeepDive } from "@/components/deep-dive";
import { Fig } from "@/components/book-art";
import { CompCalculator } from "@/components/comp-calculator";
import {
  MarkTreatments,
  MarkSizes,
  MarkMotion,
  Palette,
  TypeSpecimen,
  MarkUsage,
} from "@/components/brand-blocks";

type CalloutType = "note" | "info" | "tip" | "warn" | "danger" | "brand";

const CALLOUTS: Record<
  CalloutType,
  { icon: LucideIcon; label: string; box: string; icon_: string }
> = {
  note: {
    icon: StickyNote,
    label: "Note",
    box: "border-hairline bg-panel",
    icon_: "text-subtle",
  },
  info: {
    icon: Info,
    label: "Info",
    box: "border-sky-500/30 bg-sky-500/5",
    icon_: "text-sky-600 dark:text-sky-400",
  },
  tip: {
    icon: Lightbulb,
    label: "Tip",
    box: "border-emerald-500/30 bg-emerald-500/5",
    icon_: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    icon: TriangleAlert,
    label: "Warning",
    box: "border-amber-500/35 bg-amber-500/5",
    icon_: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    icon: OctagonAlert,
    label: "Danger",
    box: "border-destructive/40 bg-destructive/5",
    icon_: "text-destructive",
  },
  brand: {
    icon: Sparkles,
    label: "Flagon",
    box: "border-brand/40 bg-brand/5",
    icon_: "text-brand",
  },
};

/**
 * Callout box usable inside MDX: <Callout>...</Callout>, or with a type
 * (note | info | tip | warn | danger | brand) and an optional title. Each type
 * carries its own icon so the kind reads without relying on color alone.
 */
function Callout({
  children,
  type = "note",
  title,
}: {
  children: ReactNode;
  type?: CalloutType;
  title?: string;
}) {
  const c = CALLOUTS[type] ?? CALLOUTS.note;
  const Icon = c.icon;
  return (
    <div
      role="note"
      aria-label={title ?? c.label}
      className={cn(
        "my-6 flex gap-3 rounded-lg border px-4 py-3.5 text-sm leading-relaxed",
        c.box,
      )}
    >
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", c.icon_)}
        strokeWidth={2}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {title ? (
          <div className="mb-1 font-semibold text-foreground">{title}</div>
        ) : null}
        <div className="text-muted-foreground [&_p]:m-0 [&>*+*]:mt-2! [&_pre]:my-2">
          {children}
        </div>
      </div>
    </div>
  );
}

/** A grid of linked cards: <Cards><Card title href description /></Cards>. */
function Cards({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
  );
}

function Card({
  title,
  href,
  description,
  children,
}: {
  title: string;
  href: string;
  description?: string;
  children?: ReactNode;
}) {
  const external = /^https?:\/\//.test(href);
  const Arrow = external ? ArrowUpRight : ArrowRight;
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="font-medium tracking-tight text-foreground transition-colors group-hover:text-brand">
          {title}
        </span>
        <Arrow
          className="mt-0.5 h-4 w-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand"
          strokeWidth={2}
          aria-hidden
        />
      </span>
      {description || children ? (
        <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground [&_p]:m-0">
          {description ?? children}
        </span>
      ) : null}
    </>
  );
  const className =
    "group block rounded-lg border border-hairline bg-card p-4 no-underline! outline-none transition hover:border-mark hover:bg-panel focus-visible:ring-2 focus-visible:ring-brand";
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

/** Numbered vertical steps: <Steps><Step title="...">body</Step></Steps>. */
function Steps({ children }: { children: ReactNode }) {
  const steps = Children.toArray(children).filter(isValidElement);
  return (
    <ol className="my-8 ml-0! list-none! p-0">
      {steps.map((step, i) =>
        cloneElement(step as ReactElement<StepProps>, {
          n: i + 1,
          last: i === steps.length - 1,
        }),
      )}
    </ol>
  );
}

type StepProps = {
  title?: string;
  children?: ReactNode;
  n?: number;
  last?: boolean;
};

function Step({ title, children, n = 1, last = false }: StepProps) {
  return (
    <li className="relative mt-0! flex gap-4 pb-8 last:pb-0">
      {!last ? (
        <span
          aria-hidden
          className="absolute bottom-0 left-3.5 top-9 w-px -translate-x-1/2 bg-mark"
        />
      ) : null}
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-panel font-mono text-xs font-medium tabular-nums text-foreground"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {title ? (
          <div className="font-semibold tracking-tight text-foreground">
            <span className="sr-only">Step {n}: </span>
            {title}
          </div>
        ) : null}
        <div className="mt-2 [&>*+*]:mt-4 [&>*:first-child]:mt-0">
          {children}
        </div>
      </div>
    </li>
  );
}

/**
 * Tabs: <Tabs><Tab title="Dashboard">...</Tab><Tab title="API">...</Tab></Tabs>.
 * Every panel is rendered here on the server; the small client component only
 * switches which one shows.
 */
function Tabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children).filter(
    (c): c is ReactElement<{ title?: string; children?: ReactNode }> =>
      isValidElement(c) &&
      typeof (c.props as { title?: unknown }).title === "string",
  );
  if (tabs.length === 0) return null;
  return (
    <TabsClient
      titles={tabs.map((t) => t.props.title as string)}
      panels={tabs.map((t) => t.props.children)}
    />
  );
}

/** One tab of a <Tabs> group; its title labels the tab. */
function Tab({ children }: { title: string; children?: ReactNode }) {
  return <>{children}</>;
}

/**
 * "Prove it": a claim's receipts, folded away until a reader wants them.
 * <ProveIt lab="16-btree">the exact SQL, usually with lab.prove(...)</ProveIt>.
 * The `book` prop is filled in by the page that renders the chapter, so the
 * footer can link the chapter's whole lab script; without it the box still
 * works, just without the link.
 */
export function ProveIt({
  children,
  lab,
  book,
  title = "Prove it",
}: {
  children?: ReactNode;
  /** The chapter's lab script: "16-btree" (a .sql lab) or "37-replication.sh". */
  lab?: string;
  book?: string;
  title?: string;
}) {
  return (
    <details className="prove-it group my-6 rounded-lg border border-hairline bg-panel text-sm [&[open]]:bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-4 py-2.5 outline-none select-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
        <FlaskConical className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} aria-hidden />
        <span className="font-medium text-foreground">{title}</span>
        <span className="hidden text-muted-foreground sm:inline">Run it yourself and check our numbers</span>
        <ArrowRight
          className="ml-auto h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-open:rotate-90"
          strokeWidth={2}
          aria-hidden
        />
      </summary>
      <div className="border-t border-hairline px-4 pb-4 pt-1 [&>*+*]:mt-3 [&_pre]:my-3">
        {children}
        {lab ? <LabFooter lab={lab} book={book} /> : null}
      </div>
    </details>
  );
}

/** Where the claim's full check lives, and the one command that runs it. */
function LabFooter({ lab, book }: { lab: string; book?: string }) {
  const shell = lab.endsWith(".sh");
  const file = shell ? lab : `${lab}.sql`;
  const command = `./lab ${lab}`;
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Every claim in this chapter is checked by{" "}
      {book ? <a href={`/books/${book}/lab/${file}`}>{file}</a> : <code>{file}</code>}. From the{" "}
      {book ? <a href={`/books/${book}/lab`}>lab</a> : "lab"} folder: <code>{command}</code>
    </p>
  );
}

/** Internal links go through next/link; external links open in a new tab. */
function Anchor({ href = "", children, ...props }: React.ComponentProps<"a">) {
  const external = /^https?:\/\//.test(href);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

const components = {
  a: Anchor,
  Callout,
  Cards,
  Card,
  Steps,
  Step,
  Tabs,
  Tab,
  ProveIt,
  DeepDive,
  Fig,
  CompCalculator,
  MarkTreatments,
  MarkSizes,
  MarkMotion,
  Palette,
  TypeSpecimen,
  MarkUsage,
};

const prettyCodeOptions = {
  theme: { light: "github-light", dark: "github-dark" },
  keepBackground: false,
};

/**
 * Renders an MDX string as a server component, with GitHub-flavoured markdown,
 * slugged + linkable headings, and dual-theme code highlighting. Wrap the output
 * in a `.prose` container for typographic styling.
 */
export function Mdx({
  source,
  overrides,
}: {
  source: string;
  /** Replace or add components for one surface, e.g. the print edition's links. */
  overrides?: MDXRemoteProps["components"];
}) {
  return (
    <MDXRemote
      source={source}
      components={{ ...components, ...overrides }}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [
            rehypeSlug,
            [rehypePrettyCode, prettyCodeOptions],
            [
              rehypeAutolinkHeadings,
              {
                behavior: "wrap",
                properties: { className: ["heading-anchor"] },
              },
            ],
          ],
        },
      }}
    />
  );
}
