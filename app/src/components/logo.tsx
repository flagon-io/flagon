import { FLAGON_MARK_URL } from "@/lib/brand";

/**
 * Flagon's full mark (teal brew baked in), hosted on flagon.io - not
 * duplicated here. Plain <img> is intentional: the file self-adapts its
 * outline color via an embedded prefers-color-scheme media query, which is
 * exactly what it's built for (see the asset's own doc comment).
 */
export function Logo({
  className,
  title = "Flagon",
}: {
  className?: string;
  title?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element -- external SVG, no next/image optimization to gain
  return <img src={FLAGON_MARK_URL} alt={title} className={className} />;
}
