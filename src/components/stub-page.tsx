import { Frame } from "@/components/frame";
import { Cta } from "@/components/cta";

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
 * fleshed out.
 */
export function StubPage({
  title,
  lead,
  actions = [],
}: {
  title: string;
  lead: string;
  actions?: Action[];
}) {
  return (
    <Frame>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center sm:py-32">
        <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          {lead}
        </p>
        {actions.length > 0 && (
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
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
      </main>
    </Frame>
  );
}
