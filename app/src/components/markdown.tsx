"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// GitHub-flavored markdown rendered with theme-matched elements. Safe by default:
// react-markdown does not render raw HTML unless a rehype-raw plugin is added.
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: (p) => (
          <h1
            className="mt-6 mb-3 border-b border-hairline pb-1.5 text-2xl font-semibold text-foreground first:mt-0"
            {...p}
          />
        ),
        h2: (p) => (
          <h2
            className="mt-6 mb-3 border-b border-hairline pb-1.5 text-xl font-semibold text-foreground first:mt-0"
            {...p}
          />
        ),
        h3: (p) => <h3 className="mt-5 mb-2 text-lg font-semibold text-foreground" {...p} />,
        h4: (p) => <h4 className="mt-4 mb-2 font-semibold text-foreground" {...p} />,
        p: (p) => <p className="my-3 leading-7 text-foreground/90" {...p} />,
        a: (p) => (
          <a
            className="text-link underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
            {...p}
          />
        ),
        ul: (p) => <ul className="my-3 list-disc space-y-1 pl-6 text-foreground/90" {...p} />,
        ol: (p) => <ol className="my-3 list-decimal space-y-1 pl-6 text-foreground/90" {...p} />,
        li: (p) => <li className="leading-7" {...p} />,
        blockquote: (p) => (
          <blockquote className="my-3 border-l-2 border-hairline pl-4 text-muted-foreground" {...p} />
        ),
        hr: () => <hr className="my-6 border-hairline" />,
        pre: (p) => (
          <pre
            className="my-4 overflow-x-auto rounded-lg border border-hairline bg-panel p-4 text-sm"
            {...p}
          />
        ),
        code: ({ className, children, ...props }) => {
          const isBlock = /language-/.test(className || "");
          if (isBlock) {
            return (
              <code className={`${className} font-mono`} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code
              className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
              {...props}
            >
              {children}
            </code>
          );
        },
        table: (p) => (
          <div className="my-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm" {...p} />
          </div>
        ),
        th: (p) => (
          <th className="border border-hairline bg-panel px-3 py-1.5 text-left font-semibold" {...p} />
        ),
        td: (p) => <td className="border border-hairline px-3 py-1.5" {...p} />,
        img: (p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="my-3 max-w-full rounded-md" alt={p.alt ?? ""} {...p} />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
