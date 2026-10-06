import { Frame } from "@/components/frame";
import { Cta } from "@/components/cta";
import { HexField } from "@/components/hex-field";
import { SlantSplit } from "@/components/slant";
import type { SceneName } from "@/components/art/scenes";

type Action = {
  label: string;
  href: string;
  external?: boolean;
  variant?: "primary" | "secondary";
};

/**
 * A reserved-route page. Not a "coming soon" dead end: it states honestly what
 * will live here and points to the real content that exists today. Used for the
 * smaller company pages (Media, Side projects, Partnerships) until they're
 * fleshed out. Laid out as a slanted split, so it reads like the rest of the
 * site rather than a placeholder.
 */
export function StubPage({
  title,
  lead,
  art,
  actions = [],
}: {
  title: string;
  lead: string;
  art: SceneName;
  actions?: Action[];
}) {
  return (
    <Frame>
      <main className="flex flex-1 flex-col">
        <SlantSplit
          art={art}
          artId={`stub-${art}`}
          backdrop={<HexField />}
          divider={false}
          className="flex-1"
        >
          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">
            {lead}
          </p>
          {actions.length > 0 && (
            <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row">
              {actions.map((a) => (
                <Cta
                  key={a.href}
                  href={a.href}
                  external={a.external}
                  variant={a.variant ?? "secondary"}
                >
                  {a.label}
                </Cta>
              ))}
            </div>
          )}
        </SlantSplit>
      </main>
    </Frame>
  );
}
