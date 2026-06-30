import { renderOg, size, contentType } from '@/app/_og/render';

export { size, contentType };
export const alt = 'Flagon products — every primitive your product needs';

export default function Image() {
  return renderOg({
    eyebrow: 'PRODUCTS',
    title: 'Every primitive',
    titleMuted: 'your product needs.',
    subtitle: 'Feature flags, experiments, configuration, eventing, audit, and more.',
  });
}
