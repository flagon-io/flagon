import { SCENES, type SceneName } from "@/components/art/scenes";
import { cn } from "@/lib/cn";

/** A blog post's cover: its line drawing, framed like the site's art cards. */
export function PostCover({
  art,
  id,
  className,
}: {
  art: SceneName;
  /** Unique on the page, for the drawing's patterns. */
  id: string;
  className?: string;
}) {
  const Scene = SCENES[art];
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-hairline bg-(--art-card) p-2",
        art === "g1t" && "art-g1t",
        className,
      )}
    >
      <Scene id={id} />
    </div>
  );
}
