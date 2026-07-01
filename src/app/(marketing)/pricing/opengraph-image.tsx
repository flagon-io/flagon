import { renderOg, size, contentType } from '@/app/_og/render';

export { size, contentType };
export const alt = 'Flagon pricing: usage-based, not seat-based';

export default function Image() {
  return renderOg({
    eyebrow: 'PRICING',
    title: 'Usage-based,',
    titleMuted: 'not seat-based.',
    subtitle: 'Pay for what you use, never per seat. Projects, environments, and teams are free.',
  });
}
