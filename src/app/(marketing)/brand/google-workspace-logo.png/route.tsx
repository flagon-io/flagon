import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";
import { tankardPaths } from "@/lib/logo";

/**
 * Horizontal Flagon lockup at Google Workspace's custom-logo size (320x132,
 * PNG), served at www.flagon.io/brand/google-workspace-logo.png. Transparent
 * background with near-black text: Workspace renders logos on light chrome.
 * Rendered from the same brand constants as everything else, so it stays
 * current with no committed binary.
 */
export const dynamic = "force-static";

const WIDTH = 320;
const HEIGHT = 132;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <svg width="92" height="92" viewBox="0 0 64 64" fill="none">
          <defs>
            <linearGradient
              id="stroke"
              x1="16"
              y1="12"
              x2="52"
              y2="54"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor={brand.colors.accentBright} />
              <stop offset="1" stopColor={brand.colors.accentDeep} />
            </linearGradient>
          </defs>
          <g
            fill="none"
            stroke="url(#stroke)"
            strokeWidth="3.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            {tankardPaths.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </svg>
        <div
          style={{
            fontSize: 54,
            fontWeight: 700,
            letterSpacing: -2,
            color: "#18181b",
            fontFamily: "sans-serif",
          }}
        >
          {brand.name}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
