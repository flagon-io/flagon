#!/usr/bin/env node
/**
 * Build the upload-ready Flagon icons in .github/brand: the mark baked for a
 * light and a dark ground, as SVG and PNG, for places that want a logo file
 * (GitHub org and app avatars, Google OAuth consent and Workspace, and so on).
 *
 *   npm run brand:icons
 *
 * Two families, each in a light and a dark edition:
 *
 *   avatar-*   the mark centred on a solid square, padded so a circular crop
 *              keeps the whole glass. For profile pictures and app logos.
 *   mark-*     the bare mark on a transparent ground, trimmed to its own box.
 *              For placing on a background you control.
 *
 * "light" means for a light ground (dark glass); "dark" means for a dark
 * ground (light glass). The brew is the same teal in both. The geometry is
 * public/brand/flagon-mark.svg; change it there and here together.
 *
 * Browser: CHROME_PATH, else a locally installed Chrome or Edge (see
 * scripts/lib/book-browser.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/book-browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".github", "brand");

const THEMES = {
  light: { ink: "#0b0b0d", ground: "#ffffff" },
  dark: { ink: "#ededed", ground: "#000000" },
};
const AVATAR_SIZES = [120, 256, 512, 1024];
const MARK_SIZES = [256, 512, 1024];

/** The mark's drawing, in its native 11.3 12.3 41 41 coordinate space. */
function markBody(ink) {
  return `<defs>
    <clipPath id="flagon-body">
      <path d="M19.5 23 L34.5 23 L36.5 46 Q36.7 48 34.3 48 L19.7 48 Q17.3 48 17.5 46 Z" />
    </clipPath>
    <linearGradient id="flagon-brew" x1="0" y1="0.3" x2="0" y2="1">
      <stop offset="0" stop-color="#14b8a6" />
      <stop offset="1" stop-color="#0f766e" />
    </linearGradient>
  </defs>
  <g clip-path="url(#flagon-body)">
    <path d="M13 27 q3.75 -0.7 7.5 0 t7.5 0 t7.5 0 t7.5 0 t7.5 0 L51 52 L13 52 Z" fill="url(#flagon-brew)" />
    <path d="M19.7 30 q-1.1 6 -0.4 12" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" fill="none" />
  </g>
  <path d="M37 27 L45.5 27 L48.5 30 L48.5 36.5 L45.5 39.5 L38 39.5" fill="none" stroke="${ink}" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M17.5 21 L36.5 21 L38.6 47 Q39 50 36 50 L18 50 Q15 50 15.4 47 Z" fill="none" stroke="${ink}" stroke-width="3.1" stroke-linejoin="round" />
  <path d="M17 21 Q16.3 16.3 20 15.6 L33 15.6 Q37.2 16.2 37 21 Z" fill="none" stroke="${ink}" stroke-width="3" stroke-linejoin="round" />
  <path d="M36.7 17.1 L39.4 16.1" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round" />
  <circle cx="40.3" cy="15.8" r="1.4" fill="${ink}" />`;
}

// The mark's inked extent (strokes included) is about x 13.4..50.1, y 14.1..51.6,
// so its own box is a square around that centre with a hair of margin.
const MARK_BOX = "11.95 13.05 39.5 39.5";
// For avatars that box is drawn 46 wide on a 75 square, so a circular crop
// clears it: the farthest inked corner lands ~32 from centre, inside 37.5.
const AVATAR_INSET = 14.5;

function markSvg({ ink }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_BOX}" fill="none" role="img" aria-label="Flagon">
  ${markBody(ink)}
</svg>
`;
}

function avatarSvg({ ink, ground }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 75 75" fill="none" role="img" aria-label="Flagon">
  <rect width="75" height="75" fill="${ground}" />
  <svg x="${AVATAR_INSET}" y="${AVATAR_INSET}" width="46" height="46" viewBox="${MARK_BOX}" overflow="visible">
  ${markBody(ink)}
  </svg>
</svg>
`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const render = async (svg, size, file) => {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">` +
          svg.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `) +
          `</body></html>`,
      );
      await page.screenshot({ path: path.join(outDir, file), omitBackground: true, type: "png" });
    };

    for (const [name, theme] of Object.entries(THEMES)) {
      const avatar = avatarSvg(theme);
      const mark = markSvg(theme);
      fs.writeFileSync(path.join(outDir, `avatar-${name}.svg`), avatar);
      fs.writeFileSync(path.join(outDir, `mark-${name}.svg`), mark);
      for (const size of AVATAR_SIZES) await render(avatar, size, `avatar-${name}-${size}.png`);
      for (const size of MARK_SIZES) await render(mark, size, `mark-${name}-${size}.png`);
    }
  } finally {
    await browser.close();
  }
  const files = fs.readdirSync(outDir).filter((f) => /\.(svg|png)$/.test(f));
  console.log(`wrote ${files.length} files to ${path.relative(root, outDir)}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
