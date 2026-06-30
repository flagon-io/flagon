import { renderOg, size, contentType } from './_og/render';

export { size, contentType };
export const alt = 'Flagon — the open-source developer platform';

export default function Image() {
  return renderOg({
    eyebrow: 'THE OPEN-SOURCE DEVELOPER PLATFORM',
    title: 'Build products,',
    titleMuted: 'not platforms.',
    subtitle: 'Every primitive your product needs, on one open-source foundation.',
  });
}
