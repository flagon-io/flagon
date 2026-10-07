import { BookOpen } from "lucide-react";
import { buttonClasses } from "@/components/button";
import { cn } from "@/lib/cn";

/**
 * Where to buy the printed book. With a listing URL (`amazon:` in the book's
 * frontmatter) it's a link out; without one it's the same bordered button,
 * disabled and marked "Soon", so readers know a paperback is coming and the
 * layout doesn't change on launch day.
 */
export function PaperbackLink({ href, className }: { href: string; className?: string }) {
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title="Buy the paperback on Amazon"
        className={buttonClasses({ variant: "outline", className })}
      >
        <BookOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
        Paperback
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled
      title="The paperback is coming soon to Amazon"
      className={cn(buttonClasses({ variant: "outline" }), "disabled:opacity-60", className)}
    >
      <BookOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
      Paperback
      <span className="rounded-sm border border-hairline px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-subtle">
        Soon
      </span>
    </button>
  );
}
