import { renderOg, size, contentType } from '@/app/_og/render';

export { size, contentType };
export const alt = 'Flagon pricing — usage-based, not seat-based';

export default function Image() {
  return renderOg({
    eyebrow: 'PRICING',
    title: 'Usage-based,',
    titleMuted: 'not seat-based.',
    subtitle: 'Billed on the evaluations you serve, never per seat. Self-host free, forever.',
  });
}
