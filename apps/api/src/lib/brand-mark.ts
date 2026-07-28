/**
 * The Flagon tankard mark, as a standalone SVG document.
 *
 * The API renders no HTML, but a browser opening the API in a tab still asks
 * for /favicon.ico, and the root hypermedia index is meant to be looked at. So
 * the same mark the marketing site shows (apps/web/src/app/icon.svg, drawn from
 * @flagon/design logo-geometry.json) is served here too — kept byte-identical
 * on purpose so the logo can never be subtly different depending on where you
 * look at it.
 */
export const brandMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <!-- The Flagon tankard mark. Geometry mirrors @flagon/design logo-geometry.json. -->
  <defs>
    <linearGradient id="flagon-stroke" x1="15" y1="15" x2="49" y2="50" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2dd4bf" />
      <stop offset="1" stop-color="#0d9488" />
    </linearGradient>
  </defs>
  <g fill="none" stroke="url(#flagon-stroke)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">
    <!-- body -->
    <path d="M18 22 L36 22 L39 50 L15 50 Z" />
    <!-- lid -->
    <path d="M19 22 L21 15 L33 15 L35 22 Z" />
    <!-- handle -->
    <path d="M37 28 L46 29 L49 34 L49 39 L46 44 L38 43" />
  </g>
</svg>
`;
/** A 64x64 PNG rendering of brandMarkSvg for clients that request a PNG icon. */
export const brandMarkPng = Buffer.from(
  "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",
  "base64",
);
