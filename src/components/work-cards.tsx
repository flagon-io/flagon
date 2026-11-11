import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { slantForAspect } from "@/lib/slant";
import { DOTS } from "@/components/schematic";
import { Tag } from "@/components/slant";
import type { CaseStudy } from "@/lib/work";

/**
 * Case studies, plus an open slot inviting the next one, as slanted frames
 * at the site's one lean. The frame is a clip (so the screenshot inside stays
 * upright) with an SVG outline that follows the same shape, the way the
 * product rail's cards are drawn.
 */
const ASPECT = 16 / 10;
const S = slantForAspect(ASPECT) * 100;
const CLIP = `polygon(${S}% 0, 100% 0, ${100 - S}% 100%, 0 100%)`;

function SlantFrame({
  children,
  dashed = false,
  className,
}: {
  children: ReactNode;
  dashed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-[16/10] w-full", className)}>
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: CLIP }}>
        {children}
      </div>
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-hairline transition-colors group-hover:text-brand/60"
      >
        <polygon
          points={`${S},0 100,0 ${100 - S},100 0,100`}
          fill="none"
          stroke="currentColor"
          strokeWidth={dashed ? 1.5 : 1}
          strokeDasharray={dashed ? "6 5" : undefined}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

export function CaseStudyCard({ study }: { study: CaseStudy }) {
  return (
    <article className="group flex flex-col">
      <a href={study.url} target="_blank" rel="noreferrer" aria-label={`Visit ${study.domain}`}>
        <SlantFrame>
          {study.image ? (
            <Image
              src={study.image}
              alt={`The ${study.name} home page`}
              width={1288}
              height={932}
              sizes="(min-width: 1024px) 600px, 100vw"
              className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.02]"
            />
          ) : null}
        </SlantFrame>
      </a>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{study.name}</h3>
        <Tag className="text-brand before:border before:border-brand/30 before:bg-brand/10">
          {study.client ? "Client" : "Our own"}
        </Tag>
      </div>
      <p className="mt-1 text-sm text-subtle">{study.kind}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{study.summary}</p>
      <a
        href={study.url}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand"
      >
        Visit {study.domain}
        <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
      </a>
    </article>
  );
}

/** The open slot: where the next project goes, linking to the project form. */
export function NextProjectCard({ href }: { href: string }) {
  return (
    <article className="group flex flex-col">
      <Link href={href} className="outline-none focus-visible:[&_svg]:text-brand">
        <SlantFrame dashed>
          <div
            className="flex h-full flex-col items-center justify-center bg-panel text-center transition-colors group-hover:bg-brand/[0.05]"
            style={DOTS}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground transition group-hover:border-brand group-hover:text-brand">
              <Plus className="h-5 w-5" strokeWidth={2} />
            </span>
            <p className="mt-4 text-xl font-semibold tracking-tight">Your project here</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-subtle">
              Now booking
            </p>
          </div>
        </SlantFrame>
      </Link>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold tracking-tight">What are you building?</h3>
        <Tag className="text-muted-foreground before:border before:border-dashed before:border-input">
          Next
        </Tag>
      </div>
      <p className="mt-1 text-sm text-subtle">A product, a platform, a site, or a rescue</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        We take a few projects at a time, so the slot next to Tavernacle is open.
        Tell us what you have in mind and you&rsquo;ll hear back from the person
        who&rsquo;d build it.
      </p>
      <Link href={href} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
        Start a project
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
      </Link>
    </article>
  );
}
