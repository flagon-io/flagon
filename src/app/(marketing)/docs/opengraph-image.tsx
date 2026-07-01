import { renderOg, size, contentType } from '@/app/_og/render';

export { size, contentType };
export const alt = 'Flagon documentation: the open-source developer platform';

export default function Image() {
  return renderOg({
    eyebrow: 'DOCUMENTATION',
    title: 'Build on the',
    titleMuted: 'platform.',
    subtitle: 'Guides, the REST API reference, and self-hosting for every Flagon capability.',
  });
}
