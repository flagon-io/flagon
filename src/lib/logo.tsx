import type { SVGProps } from "react";

/**
 * Canonical Flagon tankard mark - a clean, faceted line-art stein.
 * Single source of truth for the favicon, header, social images, and avatars.
 * viewBox is 0 0 64 64.
 */
export const tankardPaths = [
  "M19 27 L37 27 L40 30 L40 48 L37 51 L19 51 L16 48 L16 30 Z", // body
  "M18 24 L21 18 L35 18 L38 24 Z", // lid
  "M26 18 L26 13.5 L30 13.5 L30 18", // thumb lever
  "M40 32 L47 33 L50 37 L50 41 L47 45 L40 46", // handle
] as const;

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
            x1="16"
            y1="12"
            x2="52"
            y2="54"
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
        strokeWidth={3.4}
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

/**
 * Raw SVG markup for the tankard, for contexts that can't render a React
 * component (e.g. embedding as an `<img>` inside `next/og` ImageResponse).
 */
export function tankardSvgMarkup(stroke = "#ffffff", size = 128): string {
  const paths = tankardPaths.map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" fill="none"><g fill="none" stroke="${stroke}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round">${paths}</g></svg>`;
}

/** Data URI form of {@link tankardSvgMarkup}. */
export function tankardDataUri(stroke = "#ffffff", size = 128): string {
  const base64 = Buffer.from(tankardSvgMarkup(stroke, size)).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}
