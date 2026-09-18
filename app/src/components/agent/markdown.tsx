"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@flagon-io/ui";

/** Renders assistant markdown, styled to Flagon's tokens. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed text-foreground",
        "[&>*+*]:mt-2",
        "[&_a]:text-link [&_a]:underline [&_a]:underline-offset-2",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_li]:marker:text-muted-foreground",
        "[&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_code]:rounded [&_code]:bg-panel [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-hairline [&_pre]:bg-card [&_pre]:p-3",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-hairline [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a target="_blank" rel="noreferrer" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
