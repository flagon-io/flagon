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
