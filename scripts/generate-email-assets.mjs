// Rasterizes the tankard mark to public/email/flagon-mark.png for use in HTML
// emails (clients don't render SVG). Run once and commit the output:
//   node scripts/generate-email-assets.mjs
//
// Path data mirrors src/lib/logo.tsx (tankardPaths) - keep them in sync if the
// mark ever changes.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const tankardPaths = [
  "M19 27 L37 27 L40 30 L40 48 L37 51 L19 51 L16 48 L16 30 Z", // body
  "M18 24 L21 18 L35 18 L38 24 Z", // lid
  "M26 18 L26 13.5 L30 13.5 L30 18", // thumb lever
  "M40 32 L47 33 L50 37 L50 41 L47 45 L40 46", // handle
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128" fill="none">
  <defs>
    <linearGradient id="stroke" x1="16" y1="12" x2="52" y2="54" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2dd4bf"/>
      <stop offset="1" stop-color="#0d9488"/>
    </linearGradient>
  </defs>
  <g fill="none" stroke="url(#stroke)" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round">
    ${tankardPaths.map((d) => `<path d="${d}"/>`).join("\n    ")}
  </g>
</svg>`;

await mkdir("public/email", { recursive: true });
await sharp(Buffer.from(svg)).png().toFile("public/email/flagon-mark.png");
console.log("Wrote public/email/flagon-mark.png");
