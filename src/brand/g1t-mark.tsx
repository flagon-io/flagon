/**
 * g1t's mark, "the fleet": three 1s stepping back in depth, the agents at work
 * behind the one change in front. The same shapes as g1t's own logo component
 * and brand files; the front 1 takes the current text color and the two behind
 * fade into g1t's lavender. Inline, so it's crisp at any size.
 */
export function G1tMark({ className, tight = false }: { className?: string; tight?: boolean }) {
  return (
    <svg
      viewBox={tight ? "6.9 5 18.2 22" : "0 0 32 32"}
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(0.7 0.5)">
        <rect x="6.2" y="9.5" width="4.4" height="17" rx="2.2" fill="#b6a8ff" fillOpacity="0.35" />
        <rect x="12.4" y="7" width="4.8" height="19.5" rx="2.4" fill="#b6a8ff" fillOpacity="0.65" />
        <rect x="19" y="4.5" width="5.4" height="22" rx="2.7" fill="currentColor" />
        <path
          d="M21.7 7.2 17.6 10.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
