import type { Metadata } from 'next';
import { Code, DocNext, H1, H2, Lead, P, Ul } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description:
    'The Flagon feature flags product: typed flags, variants, environments, and segments, evaluated over OpenFeature.',
};

export default function FeatureFlagsPage() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Feature Flags</p>
      <H1>Overview</H1>
      <Lead>
        The flagship product. Define typed flags, target by context, roll out gradually, and evaluate
        from anywhere over an open standard.
      </Lead>

      <H2>Concepts</H2>
      <Ul>
        <li>
          <strong className="text-foreground">Project</strong>: a unit of work that holds flags and
          environments.
        </li>
        <li>
          <strong className="text-foreground">Environment</strong>: an independent context such as{' '}
          <Code>production</Code> or <Code>staging</Code>. Each has its own SDK keys and published
          bundle.
        </li>
        <li>
          <strong className="text-foreground">Flag</strong>: a typed switch (boolean, string, number,
          or object) with named variants and a default.
        </li>
        <li>
          <strong className="text-foreground">Variant</strong>: one possible value of a flag, for
          example <Code>on</Code> / <Code>off</Code> or <Code>blue</Code> / <Code>green</Code>.
        </li>
        <li>
          <strong className="text-foreground">Segment</strong>: a named, reusable targeting condition
          you can reference from many flags.
        </li>
      </Ul>

      <H2>How delivery works</H2>
      <P>
        Editing a flag updates the control plane. Hitting <Code>Publish</Code> compiles the
        environment&apos;s flags into an immutable, versioned <strong className="text-foreground">bundle</strong>{' '}
        and writes it to the bundle store. The data plane reads that bundle and answers evaluation
        requests, so evaluation stays fast and never depends on your primary database being up.
      </P>

      <H2>Flag types</H2>
      <P>
        Flags can be boolean, string, number, or object. The variant&apos;s value is returned as-is,
        so an object flag can ship structured configuration, not just an on/off switch.
      </P>

      <DocNext href="/docs/feature-flags/evaluation" label="Evaluation (OFREP)" />
    </div>
  );
}
