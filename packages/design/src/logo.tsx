import type { SVGProps } from "react";
import geometry from "./logo-geometry.json";

/**
 * Canonical Flagon tankard mark: a faceted line-art stein.
 *
 * The geometry lives in logo-geometry.json, which the favicon is also drawn
 * from, so the shape is defined exactly once.
 *
 * Shape notes, so the next revision does not undo them. The body is TAPERED
 * and taller than it is wide, the lid sits inset on the rim, and there is no
 * centred spout. An earlier version was a squat rounded box with a small
 * centred nub on top, which people read as a sippy cup: the nub scanned as a
 * spout and the proportions as a toddler's beaker. A diagonal thumb lever was
 * tried instead and read as a drinking straw, which is worse.
 */
export const tankardPaths = geometry.paths;
export const tankardStrokeWidth = geometry.strokeWidth;

type FlagonMarkProps = SVGProps<SVGSVGElement> & {
  /** Stroke color; defaults to the brand teal gradient. */
  stroke?: string;
};

export function FlagonMark({
  stroke = "url(#flagon-stroke)",
  ...props
}: FlagonMarkProps) {
  const useGradient = stroke.startsWith("url(");

  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden {...props}>
      {useGradient && (
        <defs>
          <linearGradient
            id="flagon-stroke"
            x1="15"
            y1="15"
            x2="49"
            y2="50"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#2dd4bf" />
            <stop offset="1" stopColor="#0d9488" />
          </linearGradient>
        </defs>
      )}
      <g
        fill="none"
        stroke={stroke}
        strokeWidth={tankardStrokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {tankardPaths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
