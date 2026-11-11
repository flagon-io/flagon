import type { Metadata } from "next";
import { Frame } from "@/components/frame";
import { FlagonMark } from "@/brand/flagon-mark";
import { Section, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";

export const metadata: Metadata = {
  title: "Not found",
  description: "That page doesn't exist, or it moved.",
};

export default function NotFound() {
  return (
    <Frame>
      <main>
        <Section divider={false} className="text-center">
          <div className={`flex flex-col items-center ${GUTTER}`}>
            <FlagonMark size={72} className="text-foreground" />
            <p className="mt-8 font-mono text-[11px] uppercase tracking-widest text-subtle">
              404
            </p>
            <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Nothing on tap here.
            </h1>
            <p className="mt-5 max-w-md text-pretty text-lg/relaxed text-muted-foreground">
              The page you&rsquo;re after doesn&rsquo;t exist, or it moved. No harm
              done. Here&rsquo;s the way back to something useful.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Cta href="/">Back to home</Cta>
              <Cta href="/handbook" variant="secondary">
                Read the handbook
              </Cta>
            </div>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-subtle">
              or press{" "}
              <kbd className="rounded-sm border border-hairline bg-panel px-1.5 py-0.5 not-italic">
                ⌘K
              </kbd>{" "}
              to search
            </p>
          </div>
        </Section>
      </main>
    </Frame>
  );
}
