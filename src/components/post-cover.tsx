import { SCENES, type SceneName } from "@/components/art/scenes";
import { SlantBox } from "@/components/slant";
import { DOTS } from "@/components/schematic";
import { runForAspect } from "@/lib/slant";
import { cn } from "@/lib/cn";

/** A blog post's cover: its line drawing on a panel leaning at the site's
 * tilt, like the art cards. */
export function PostCover({
  art,
  id,
  aspect = 16 / 9,
  className,
}: {
  art: SceneName;
  /** Unique on the page, for the drawing's patterns. */
  id: string;
  /** Width over height; the lean is worked out from it. */
  aspect?: number;
  className?: string;
}) {
  const Scene = SCENES[art];
  const run = runForAspect(aspect);
  return (
    <SlantBox
      run={run}
      className={className}
      style={{ aspectRatio: aspect }}
      frameClassName={cn("rounded-sm border border-hairline bg-(--art-card)", art === "g1t" && "art-g1t")}
    >
      <div className="h-full py-3" style={{ ...DOTS, paddingInline: run }}>
        <Scene id={id} className="h-full w-full" />
      </div>
    </SlantBox>
  );
}
