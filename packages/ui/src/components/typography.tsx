import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/**
 * Prose styles for long-form content (headings, paragraphs, lists, code,
 * blockquotes, links). Wrap rendered markdown or rich text in it - the nested
 * elements pick up consistent, token-driven typography.
 */
export function Prose({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="prose"
      className={cn(
        "max-w-none text-foreground",
        "[&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-foreground",
        "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_p]:my-3 [&_p]:leading-7 [&_p]:text-muted-foreground",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_li]:text-muted-foreground",
        "[&_a]:font-medium [&_a]:text-link [&_a]:underline [&_a]:underline-offset-4",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:text-foreground",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-hairline [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
        "[&_hr]:my-6 [&_hr]:border-hairline",
        className,
      )}
      {...props}
    />
  );
}
