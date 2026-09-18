import { FlagonMark } from "@flagon-io/ui";
import { cn } from "@/lib/cn";

/**
 * Flagon's mark, from @flagon-io/ui. The outline is `currentColor`, so
 * `text-foreground` makes it follow the app theme (dark/light class) instead of
 * the OS color scheme; the teal brew is baked in.
 */
export function Logo({
  className,
  title = "Flagon",
}: {
  className?: string;
  title?: string;
}) {
  return <FlagonMark title={title} className={cn("text-foreground", className)} />;
}
