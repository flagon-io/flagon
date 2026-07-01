import { cn } from '@/lib/cn';

// Brand mark: a geometric, faceted flagon — straight segments + angled shoulders
// and chamfers (miter joins) for a technical feel, with a lidded jug body and a
// clean angular handle that attaches on the body edge and bulges outward (no
// bleed). Flat single color via `currentColor` (no gradient) so it reproduces in
// one ink/thread/etch and at favicon sizes. Defaults to brand vermilion; override
// the color with a text-* class.
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.3}
      strokeLinecap="round"
      strokeLinejoin="miter"
      aria-hidden
      className={cn('shrink-0 text-brand-500', className)}
    >
      {/* body (faceted jug) */}
      <path d="M11 9 L7.5 13 L8 23 L10 27 L18 27 L20 23 L20.5 13 L17 9 Z" />
      {/* lid */}
      <path d="M9.8 9 L10.5 6.6 L17.5 6.6 L18.2 9" />
      {/* knob */}
      <path d="M13.2 6.6 L13.5 4.9 L14.5 4.9 L14.8 6.6" />
      {/* handle */}
      <path d="M20.5 13.5 L24.8 15 L25.5 18 L24.8 21 L20 24.5" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold leading-none tracking-tight">
      <LogoMark size={size} />
      <span className="text-[1.05rem] leading-none">Flagon</span>
    </span>
  );
}
