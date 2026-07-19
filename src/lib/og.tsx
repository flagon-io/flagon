import { brand } from "@/lib/brand";
import { tankardPaths } from "@/lib/logo";

/**
 * Shared render tree for generated social images (OpenGraph + Twitter).
 * Consumed by `next/og`'s `ImageResponse` in the metadata file conventions.
 */
export const ogSize = { width: 1200, height: 630 } as const;

export function OgImage() {
  const { colors } = brand;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: colors.bg,
        color: colors.text,
        padding: "72px 80px",
        fontFamily: "sans-serif",
      }}
    >
      {/* Wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            display: "flex",
            width: 64,
            height: 64,
            borderRadius: 16,
            backgroundColor: colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
            <g
              fill="none"
              stroke={colors.accentBright}
              strokeWidth="3.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              {tankardPaths.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
          </svg>
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
          {brand.name}
        </div>
      </div>

      {/* Headline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: colors.accentBright,
            marginBottom: 16,
          }}
        >
          {brand.eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          {brand.taglineLead}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: -2,
            color: colors.muted,
          }}
        >
          {brand.taglineFollow}
        </div>
      </div>

      {/* Footer row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 22px",
            borderRadius: 999,
            border: `1px solid ${colors.accentDeep}`,
            color: colors.accentBright,
            fontSize: 24,
          }}
        >
          Coming soon
        </div>
        <div style={{ display: "flex", color: colors.muted }}>
          {brand.domain}
        </div>
      </div>
    </div>
  );
}
