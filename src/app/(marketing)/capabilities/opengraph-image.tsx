import { renderOg, size, contentType } from '@/app/_og/render';

export { size, contentType };
export const alt = 'Flagon capabilities: one hub, every capability built in';

export default function Image() {
  return renderOg({
    eyebrow: 'CAPABILITIES',
    title: 'One hub.',
    titleMuted: 'Every capability, built in.',
    subtitle: 'Start with the catalog. Add feature flags, config, secrets, events, and more.',
  });
}
