import { ImageResponse } from 'next/og';
import { geist400, geist700, geist800 } from './fonts';

// Shared renderer for all OpenGraph / Twitter card images. Branded dark canvas:
// blueprint grid + vermilion glow + flagon watermark (baked into one backdrop
// SVG image), with per-page text composed on top in Geist. 1200x630.

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Monoline flagon paths (same as the brand mark, 0 0 32 32 space).
const FLAGON =
  '<path d="M11 9 C9 11 7.5 14.5 7.5 19 C7.5 23.5 9 25.8 10 27 L18 27 C19 25.8 20.5 23.5 20.5 19 C20.5 14.5 19 11 17 9 Z"/>' +
  '<path d="M10.5 9 L10.5 7.2 C10.5 6 12 5.4 14 5.4 C16 5.4 17.5 6 17.5 7.2 L17.5 9"/>' +
  '<path d="M14 5.4 L14 4"/>' +
  '<path d="M11 9 C10 8.3 8.9 8 7.9 8.5"/>' +
  '<path d="M18.4 11.6 C23.6 12.2 25.8 14.9 25.8 17.6 C25.8 20.7 22.8 21.9 19.7 22.5"/>';

const toDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const logoUri = toDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#ff6a14" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${FLAGON}</svg>`,
);

const wmScale = 470 / 32;
const backdropUri = toDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
        <path d="M56 0H0V56" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      </pattern>
      <radialGradient id="glow" cx="22%" cy="8%" r="60%">
        <stop offset="0%" stop-color="rgba(255,106,20,0.28)"/>
        <stop offset="100%" stop-color="rgba(255,106,20,0)"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="#08080a"/>
    <rect width="1200" height="630" fill="url(#grid)"/>
    <rect width="1200" height="630" fill="url(#glow)"/>
    <g transform="translate(770 120) scale(${wmScale})" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="${3 / wmScale}" stroke-linecap="round" stroke-linejoin="round">${FLAGON}</g>
  </svg>`,
);

type OgContent = {
  eyebrow: string;
  title: string;
  titleMuted: string;
  subtitle: string;
};

export function renderOg({ eyebrow, title, titleMuted, subtitle }: OgContent) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '1200px',
          height: '630px',
          position: 'relative',
          backgroundColor: '#08080a',
          fontFamily: 'Geist',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={backdropUri} width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0 }} alt="" />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            top: '70px',
            left: '80px',
            right: '80px',
            bottom: '56px',
          }}
        >
          {/* brand lockup */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUri} width={46} height={46} alt="" />
            <div style={{ marginLeft: '14px', fontSize: '34px', fontWeight: 700, color: '#fafafa' }}>Flagon</div>
          </div>

          <div style={{ marginTop: '92px', fontSize: '20px', fontWeight: 700, letterSpacing: '4px', color: '#9b9ba4' }}>
            {eyebrow}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '18px', fontSize: '76px', fontWeight: 800, lineHeight: 1.05 }}>
            <div style={{ color: '#fafafa' }}>{title}</div>
            <div style={{ color: '#6b6b75' }}>{titleMuted}</div>
          </div>

          <div style={{ marginTop: '26px', fontSize: '27px', color: '#b6b6bf', maxWidth: '780px' }}>{subtitle}</div>

          {/* footer */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
            <div style={{ width: '34px', height: '4px', borderRadius: '2px', backgroundColor: '#f25109' }} />
            <div style={{ marginTop: '12px', fontSize: '22px', fontWeight: 700, color: '#fafafa' }}>flagon.io</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist', data: geist400, weight: 400, style: 'normal' },
        { name: 'Geist', data: geist700, weight: 700, style: 'normal' },
        { name: 'Geist', data: geist800, weight: 800, style: 'normal' },
      ],
    },
  );
}
