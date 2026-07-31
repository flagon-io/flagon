import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/**
 * Render user-authored Markdown (GitHub-flavored) in the console's voice.
 *
 * Safe by construction: react-markdown does not render raw HTML (no rehype-raw),
 * so a project README can't inject markup or scripts. remark-gfm adds tables,
 * task lists, strikethrough, and autolinks. All links open in a new tab with
 * `rel="noreferrer nofollow"` since the content is user-supplied. Styling mirrors
 * the docs (apps/web mdx-components) so a README reads the same everywhere.
 */
const components: Components = {
  h1: (props) => (
    <h1 className="mt-8 mb-4 text-2xl font-bold tracking-tight text-zinc-50 first:mt-0" {...props} />
  ),
  h2: (props) => (
    <h2 className="mt-8 mb-3 border-b border-white/10 pb-2 text-xl font-semibold tracking-tight text-zinc-100 first:mt-0" {...props} />
  ),
  h3: (props) => (
    <h3 className="mt-6 mb-2 text-lg font-semibold text-zinc-100 first:mt-0" {...props} />
  ),
  h4: (props) => (
    <h4 className="mt-5 mb-2 text-base font-semibold text-zinc-200 first:mt-0" {...props} />
  ),
  p: (props) => <p className="my-3 leading-7 text-zinc-300" {...props} />,
  a: ({ href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer nofollow"
      className="font-medium text-teal-400 underline-offset-2 hover:underline"
      {...props}
    />
  ),
  ul: (props) => (
    <ul className="my-3 ml-5 list-disc space-y-1.5 text-zinc-300 marker:text-zinc-600" {...props} />
  ),
  ol: (props) => (
    <ol className="my-3 ml-5 list-decimal space-y-1.5 text-zinc-300 marker:text-zinc-600" {...props} />
  ),
  li: (props) => <li className="leading-7" {...props} />,
  strong: (props) => <strong className="font-semibold text-zinc-100" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  hr: (props) => <hr className="my-6 border-white/10" {...props} />,
  blockquote: (props) => (
    <blockquote className="my-4 border-l-2 border-teal-400/50 pl-4 text-zinc-400 italic" {...props} />
  ),
  img: ({ alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} className="my-4 max-w-full rounded-lg border border-white/10" {...props} />
  ),
  pre: (props) => (
    <pre
      className="my-4 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-zinc-200 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-zinc-200"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-200"
      {...props}
    />
  ),
  table: (props) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-white/4" {...props} />,
  tr: (props) => <tr className="border-b border-white/8 last:border-0" {...props} />,
  th: (props) => (
    <th className="px-3.5 py-2.5 text-left text-xs font-semibold tracking-wide text-zinc-300 uppercase" {...props} />
  ),
  td: (props) => <td className="px-3.5 py-2.5 align-top text-zinc-300" {...props} />,
  input: (props) => (
    // GFM task-list checkboxes: rendered, non-interactive.
    <input className="mr-1.5 translate-y-0.5 accent-teal-500" disabled {...props} />
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
