export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <linearGradient id="flagon-grad" x1="6" y1="3" x2="26" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff9a40" />
          <stop offset="1" stopColor="#f25109" />
        </linearGradient>
      </defs>
      {/* Standalone flagon: foamy head, tankard body, and a handle. No backplate. */}
      <g fill="url(#flagon-grad)">
        <circle cx="11.4" cy="9.6" r="3" />
        <circle cx="16" cy="7.8" r="3.4" />
        <circle cx="20.4" cy="9.6" r="3" />
        <path d="M9 11h12v14.5a3.5 3.5 0 0 1-3.5 3.5h-5A3.5 3.5 0 0 1 9 25.5V11Z" />
        <path d="M21 14.2h2.4a4 4 0 0 1 0 8H21v-2.7h2a1.3 1.3 0 0 0 0-2.6h-2v-2.7Z" />
      </g>
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
