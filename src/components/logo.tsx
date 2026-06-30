import { cn } from '@/lib/cn';

// Brand mark: a monoline flagon — lidded jug body, knob, pour spout, and handle,
// drawn in one constant-width stroke. Flat single color via `currentColor` (no
// gradient) so it reproduces in one ink/thread/etch and at favicon sizes. Defaults
// to brand vermilion; override the color by passing a text-* class (e.g. a
// monochrome `text-foreground` lockup).
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
      strokeLinejoin="round"
      aria-hidden
      className={cn('shrink-0 text-brand-500', className)}
    >
      <path d="M11 9 C9 11 7.5 14.5 7.5 19 C7.5 23.5 9 25.8 10 27 L18 27 C19 25.8 20.5 23.5 20.5 19 C20.5 14.5 19 11 17 9 Z" />
      <path d="M10.5 9 L10.5 7.2 C10.5 6 12 5.4 14 5.4 C16 5.4 17.5 6 17.5 7.2 L17.5 9" />
      <path d="M14 5.4 L14 4" />
      <path d="M11 9 C10 8.3 8.9 8 7.9 8.5" />
      <path d="M18.4 11.6 C23.6 12.2 25.8 14.9 25.8 17.6 C25.8 20.7 22.8 21.9 19.7 22.5" />
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
