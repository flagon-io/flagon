import {
  SiDiscord,
  SiGithub,
  SiGitlab,
  SiBitbucket,
} from "@icons-pack/react-simple-icons";

/**
 * The icon set.
 *
 * We use lucide (`lucide-react`) as the icon library: consistent register,
 * broad coverage, tree-shaken to just what we import. The semantic aliases below
 * keep call sites meaning-first (IconUsage, IconSelfHost) and let us swap the
 * underlying glyph in one place. Pass `className` for size/color as usual, e.g.
 * `<IconUsage className="h-5 w-5 text-teal-400" />`.
 *
 * Brand marks come from simple-icons (`@icons-pack/react-simple-icons`) — lucide
 * dropped brand icons and points here. Add more brand icons the same way.
 */
export {
  // Standards / interoperability: composable pieces, not lock-in.
  Blocks as IconStandards,
  // Usage, not seats: a usage meter.
  Gauge as IconUsage,
  // Self-hostable: your own box.
  Server as IconSelfHost,
  // Trailing arrow for links and CTAs.
  ArrowRight as IconArrowRight,
} from "lucide-react";

/**
 * The GitHub mark (simple-icons). Defaults `color` to `currentColor` so it
 * inherits our theme instead of rendering in GitHub's near-black brand color,
 * which would vanish on the dark UI. Size/position via `className` as usual.
 */
export function IconGitHub({ className }: { className?: string }) {
  return <SiGithub color="currentColor" className={className} />;
}

/** The GitLab mark (simple-icons). Inherits theme color, like {@link IconGitHub}. */
export function IconGitLab({ className }: { className?: string }) {
  return <SiGitlab color="currentColor" className={className} />;
}

/** The Bitbucket mark (simple-icons). Inherits theme color, like {@link IconGitHub}. */
export function IconBitbucket({ className }: { className?: string }) {
  return <SiBitbucket color="currentColor" className={className} />;
}

/** The Discord mark (simple-icons). Inherits the surrounding text color. */
export function IconDiscord({ className }: { className?: string }) {
  return <SiDiscord color="currentColor" className={className} />;
}

/**
 * The Slack mark. Hand-authored inline SVG (currentColor) because simple-icons
 * dropped Slack's brand icon, so there's nothing to import — the canonical
 * monochrome path, rendered like the other brand marks.
 */
export function IconSlack({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-hidden="true"
      className={className}
    >
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}
