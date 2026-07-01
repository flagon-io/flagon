import { renderOg, size, contentType } from './_og/render';

export { size, contentType };
export const alt = 'Flagon: the open-source developer platform';

export default function Image() {
  return renderOg({
    eyebrow: 'THE OPEN-SOURCE DEVELOPER PLATFORM',
    title: 'Stop building your platform.',
    titleMuted: 'Start shipping on it.',
    subtitle: 'One hub for everything you run, with the platform capabilities built in.',
  });
}
