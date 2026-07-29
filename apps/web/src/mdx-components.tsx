import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/code-tabs";
import { Callout } from "@/components/docs/callout";
import { Card, CardGrid, Badge } from "@/components/docs/cards";
import { CodeGroup } from "@/components/docs/code-group";

/** Turn a heading's text into a stable id for deep links. */
function slugify(children: ReactNode): string | undefined {
  const text = extractText(children);
  if (!text) return undefined;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractText(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

/**
 * The MDX element mapping — the docs' typography. @next/mdx calls this for every
 * MDX file, so `.md`/`.mdx` prose renders in the design system's voice and the
 * custom components (Callout, CodeTabs, CodeBlock) are usable without importing.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    Callout,
    CodeTabs,
    CodeBlock,
    Card,
    CardGrid,
    Badge,
    CodeGroup,

    h1: (props) => (
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-zinc-50" {...props} />
    ),
    h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => (
      <h2
        id={slugify(children)}
        className="mt-12 mb-4 border-b border-white/10 pb-2 text-xl font-semibold tracking-tight text-zinc-100"
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
      <h3
        id={slugify(children)}
        className="mt-8 mb-3 text-lg font-semibold text-zinc-100"
        {...props}
      >
        {children}
      </h3>
    ),
    h4: ({ children, ...props }: ComponentPropsWithoutRef<"h4">) => (
      <h4
        id={slugify(children)}
        className="mt-6 mb-2 text-base font-semibold text-zinc-200"
        {...props}
      >
        {children}
      </h4>
    ),
    p: (props) => (
      <p className="my-4 leading-7 text-zinc-400" {...props} />
    ),
    a: ({ href = "#", ...props }: ComponentPropsWithoutRef<"a">) => {
      const external = /^https?:\/\//.test(href);
      if (external) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-teal-400 underline-offset-2 hover:underline"
            {...props}
          />
        );
      }
      return (
        <Link
          href={href}
          className="font-medium text-teal-400 underline-offset-2 hover:underline"
          {...props}
        />
      );
    },
    ul: (props) => (
      <ul className="my-4 ml-5 list-disc space-y-2 text-zinc-400 marker:text-zinc-600" {...props} />
    ),
    ol: (props) => (
      <ol className="my-4 ml-5 list-decimal space-y-2 text-zinc-400 marker:text-zinc-600" {...props} />
    ),
    li: (props) => <li className="leading-7" {...props} />,
    strong: (props) => <strong className="font-semibold text-zinc-200" {...props} />,
    em: (props) => <em className="italic" {...props} />,
    hr: (props) => <hr className="my-10 border-white/10" {...props} />,
    blockquote: (props) => (
      <blockquote
        className="my-5 border-l-2 border-teal-400/50 pl-4 text-zinc-400 italic"
        {...props}
      />
    ),
    // Inline code. Fenced blocks come through `pre` and skip this via the guard.
    code: (props: ComponentPropsWithoutRef<"code">) => (
      <code
        className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-200"
        {...props}
      />
    ),
    // Fenced code block: pull the raw text out of the inner <code> and render it
    // through CodeBlock (copy button + monochrome styling).
    pre: ({ children }: ComponentPropsWithoutRef<"pre">) => {
      const codeEl = children as
        | { props?: { children?: ReactNode; className?: string } }
        | undefined;
      const raw = extractText(codeEl?.props?.children).replace(/\n$/, "");
      const lang = codeEl?.props?.className?.replace("language-", "");
      const label = lang ? prettyLang(lang) : undefined;
      return <CodeBlock raw={raw} label={label} />;
    },
    table: (props) => (
      <div className="my-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm" {...props} />
      </div>
    ),
    thead: (props) => <thead {...props} />,
    th: (props) => (
      <th
        className="border-b border-white/15 px-3 py-2 text-left font-semibold text-zinc-300"
        {...props}
      />
    ),
    td: (props) => (
      <td className="border-b border-white/5 px-3 py-2 align-top text-zinc-400" {...props} />
    ),
  };
}

function prettyLang(lang: string): string {
  const map: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    json: "JSON",
    bash: "Shell",
    sh: "Shell",
    py: "Python",
    go: "Go",
    http: "HTTP",
    env: ".env",
  };
  return map[lang] ?? lang;
}
