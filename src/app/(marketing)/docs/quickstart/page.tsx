import type { Metadata } from 'next';
import { Code, DocNext, H1, H2, Lead, P, Pre } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Quickstart',
  description: 'Create a flag and evaluate it from any OpenFeature SDK in a few minutes.',
};

export default function QuickstartPage() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Get started</p>
      <H1>Quickstart</H1>
      <Lead>
        Create your first flag and evaluate it over the standard OpenFeature protocol in a few
        minutes.
      </Lead>

      <H2>1. Create an organization and project</H2>
      <P>
        Sign in and create an organization (or run in single-org mode, see{' '}
        <a href="/docs/self-hosting" className="text-brand-500 hover:text-brand-400">
          self-hosting
        </a>
        ). Inside Feature Flags, create a project and an environment such as{' '}
        <Code>production</Code>.
      </P>

      <H2>2. Add a flag</H2>
      <P>
        Create a flag with one or more variants (boolean, string, number, or object) and optional
        targeting rules, then hit <Code>Publish</Code> to make it live. Publishing compiles the
        environment into an immutable bundle the data plane serves.
      </P>

      <H2>3. Create an SDK key</H2>
      <P>
        Generate an <strong className="text-foreground">SDK key</strong> for the environment. That is
        what your apps authenticate with. It is shown once, so store it as a secret.
      </P>

      <H2>4. Evaluate it</H2>
      <P>Evaluate a flag with a single HTTP call (OFREP):</P>
      <Pre>{`curl -X POST \\
  https://api.flagon.io/ofrep/v1/evaluate/flags/new-dashboard \\
  -H "Authorization: Bearer $FLAGON_SDK_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"context":{"targetingKey":"user-123","plan":"enterprise"}}'

# => { "key": "new-dashboard", "value": true,
#      "variant": "on", "reason": "TARGETING_MATCH" }`}</Pre>
      <P>
        Any OpenFeature SDK configured with the OFREP provider works the same way, with no
        Flagon-specific client.
      </P>

      <DocNext href="/docs/self-hosting" label="Self-hosting" />
    </div>
  );
}
