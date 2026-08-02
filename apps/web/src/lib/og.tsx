import { ImageResponse } from "next/og";
import { brand } from "@flagon/design/brand";

/**
 * Shared Open Graph image renderer — one branded 1200x630 card the whole marketing
 * site draws from, so every share (root default + per-page) looks like one system.
 * Dark brand background with a teal glow, the tankard mark + wordmark, an eyebrow, a
 * big title, and a subtitle. Each `opengraph-image.tsx` route calls this with its own
 * copy. Twitter's `summary_large_image` card falls back to og:image, so this covers
 * both without a separate twitter-image.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const c = brand.colors;

/**
 * Load an Inter weight from Google Fonts for Satori (ImageResponse needs real font
 * data). Best-effort: on any failure we render with Satori's built-in fallback font
 * rather than failing the image.
 */
async function loadInter(weight: 400 | 700): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\((https:[^)]+)\)\s*format/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function renderOgImage(opts: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}): Promise<ImageResponse> {
  const eyebrow = opts.eyebrow ?? brand.eyebrow;
  const [regular, bold] = await Promise.all([loadInter(400), loadInter(700)]);
  const fonts = [
    regular && { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    bold && { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ].filter(Boolean) as {
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: "normal";
  }[];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: c.bg,
          backgroundImage: `radial-gradient(1100px 520px at 82% -8%, ${c.accentDeep}40, transparent 62%)`,
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="52" height="52" viewBox="0 0 64 64" fill="none">
            <g
              fill="none"
              stroke={c.accentBright}
              strokeWidth={3.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <path d="M18 22 L36 22 L39 50 L15 50 Z" />
              <path d="M19 22 L21 15 L33 15 L35 22 Z" />
              <path d="M37 28 L46 29 L49 34 L49 39 L46 44 L38 43" />
            </g>
          </svg>
          <span style={{ fontSize: 38, fontWeight: 700, color: c.text }}>Flagon</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: c.accentBright,
            }}
          >
            {eyebrow}
          </span>
          <span
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: c.text,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            {opts.title}
          </span>
          {opts.subtitle ? (
            <span
              style={{ fontSize: 30, color: c.muted, lineHeight: 1.35, maxWidth: 920 }}
            >
              {opts.subtitle}
            </span>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 180,
              height: 6,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${c.accentBright}, ${c.accentDeep})`,
            }}
          />
          <span style={{ fontSize: 24, color: c.muted }}>flagon.io</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, ...(fonts.length ? { fonts } : {}) },
  );
}
