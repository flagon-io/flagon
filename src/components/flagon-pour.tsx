import { FlagonMark } from "@/brand/flagon-mark";

/**
 * The hero centerpiece: the Flagon mark, pouring. Same vessel as <Logo>, set in
 * motion, with an ambient teal glow behind it. All motion is CSS and halts under
 * prefers-reduced-motion, leaving the vessel full and still.
 */
export function FlagonPour({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 50% 55%, color-mix(in srgb, var(--brew-top) 45%, transparent), transparent 68%)",
        }}
      />
      <FlagonMark animated className="size-full" />
    </div>
  );
}
