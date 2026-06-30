import type { Metadata } from 'next';
import { Code, DocNext, H1, H2, Lead, P, Pre, Ul } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Evaluation (OFREP)',
  description:
    'Evaluate Flagon flags from any OpenFeature SDK over OFREP, the OpenFeature Remote Evaluation Protocol.',
};

export default function EvaluationPage() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Feature Flags</p>
      <H1>Evaluation (OFREP)</H1>
      <Lead>
        Flagon implements OFREP, the OpenFeature Remote Evaluation Protocol, so any OpenFeature SDK
        with the OFREP provider evaluates against Flagon with no custom code.
      </Lead>

      <H2>Endpoints</H2>
      <P>Flagon implements the full OFREP surface, so the standard provider works unmodified:</P>
      <Ul>
        <li>
          <Code>POST /ofrep/v1/evaluate/flags/{'{key}'}</Code> evaluates a single flag.
        </li>
        <li>
          <Code>POST /ofrep/v1/evaluate/flags</Code> bulk-evaluates every flag in the environment.
        </li>
        <li>
          <Code>GET /ofrep/v1/configuration</Code> returns provider capabilities (caching and the
          supported value types), which the SDK uses to configure polling.
        </li>
      </Ul>

      <H2>Authentication</H2>
      <P>
        Authenticate with an environment <strong className="text-foreground">SDK key</strong> as a
        bearer token. The key selects the organization and environment, so a request never carries a
        user session.
      </P>

      <H2>Evaluation context</H2>
      <P>
        The request body holds an OpenFeature context: a <Code>targetingKey</Code> (the subject id,
        used for sticky rollouts) plus any attributes you target on.
      </P>
      <Pre>{`curl -X POST \\
  https://api.flagon.io/ofrep/v1/evaluate/flags/checkout-color \\
  -H "Authorization: Bearer $FLAGON_SDK_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"context":{"targetingKey":"user-123","plan":"pro","country":"US"}}'

# => { "key": "checkout-color", "value": "green",
#      "variant": "green", "reason": "SPLIT" }`}</Pre>

      <H2>Caching</H2>
      <P>
        Bulk evaluation responses carry an <Code>ETag</Code> for the published bundle. Send it back as{' '}
        <Code>If-None-Match</Code> and Flagon returns <Code>304 Not Modified</Code> when nothing has
        changed, so SDKs can poll cheaply. The OFREP provider discovers this (and the minimum poll
        interval) from <Code>GET /ofrep/v1/configuration</Code>, so caching is automatic.
      </P>

      <DocNext href="/docs/feature-flags/targeting" label="Targeting & rollouts" />
    </div>
  );
}
