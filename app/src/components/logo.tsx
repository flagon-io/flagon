import { FlagonMark } from "@/brand/flagon-mark";

/**
 * The Flagon mark, monochrome (currentColor) - fine for small/inline use
 * like an auth-page header. For the full teal-brew lockup, use FlagonMark
 * with variant="full" or "flat" directly (requires the brew/sheen CSS
 * tokens app/ doesn't define).
 */
export function Logo({
  className,
  title = "Flagon",
}: {
  className?: string;
  title?: string;
}) {
  return <FlagonMark className={className} title={title} variant="mono" />;
}
