import type { Metadata } from 'next';
import { Code, DocNext, H1, H2, Lead, P, Pre } from '@/components/prose';

export const metadata: Metadata = {
  title: 'API authentication',
  description:
    'Authenticate the Flagon management API with personal access tokens, organization tokens, or a short-lived JWT. Scopes, rate limits, and the token exchange explained.',
};

export default function ApiAuthPage() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Reference</p>
      <H1>API authentication</H1>
      <Lead>
        The management API (<Code>api.flagon.io/v1</Code>) accepts three credentials, all sent as a
        bearer token. Pick the one that fits: a token for you, a token for a service, or a
        short-lived JWT for stateless backends.
      </Lead>

      <H2>Personal access tokens</H2>
      <P>
        Create one under <strong className="text-foreground">Settings → Personal access tokens</strong>.
        A PAT acts as <em>you</em>, carrying your live permissions in every organization you belong
        to. Revoking your access anywhere takes effect immediately. The token is shown once
        (<Code>flagon_pat_…</Code>), so store it as a secret.
      </P>
      <Pre>{`curl https://api.flagon.io/v1/me \\
  -H "Authorization: Bearer $FLAGON_PAT"`}</Pre>

      <H2>Organization tokens</H2>
      <P>
        Admins create these under <strong className="text-foreground">Organization settings →
        Organization API tokens</strong>. An org token acts as the organization with a{' '}
        <strong className="text-foreground">fixed role</strong> (capped at the creator&rsquo;s role,
        never owner), so services and CI never share a person&rsquo;s account. Format:{' '}
        <Code>flagon_oat_…</Code>.
      </P>

      <H2>Scopes</H2>
      <P>
        Both token types can be narrowed to a set of <strong className="text-foreground">scopes</strong>{' '}
        (for example <Code>projects:read</Code>, <Code>environments:write</Code>). A token with no
        scopes selected has full access for its role; a scoped token is limited to exactly the scopes
        you pick. A request that needs a scope the token lacks returns <Code>403</Code>.
      </P>

      <H2>The JWT exchange</H2>
      <P>
        Any credential can be exchanged for a short-lived (15-minute) signed JWT at{' '}
        <Code>POST /v1/token</Code>. Backends validate that JWT against the published JWKS
        (<Code>/api/auth/jwks</Code>) with no session or token lookup, which is how Flagon&rsquo;s data
        plane stays stateless as services split out.
      </P>
      <Pre>{`# exchange a PAT (or session, or org token) for a JWT
curl -X POST https://api.flagon.io/v1/token \\
  -H "Authorization: Bearer $FLAGON_PAT"
# => { "token": "eyJ…", "token_type": "Bearer", "expires_in": 900 }

# then call the API with the JWT
curl https://api.flagon.io/v1/me \\
  -H "Authorization: Bearer $JWT"`}</Pre>

      <H2>Rate limits</H2>
      <P>
        Token requests are rate limited per token. When you exceed the budget the API returns{' '}
        <Code>429</Code> with a <Code>Retry-After</Code> header and <Code>RateLimit-*</Code> headers;
        back off until the window resets. First-party session requests are not limited.
      </P>

      <H2>Not for flag evaluation</H2>
      <P>
        These credentials are for the <em>management</em> API. Flag <em>evaluation</em> uses a
        separate, environment-scoped <strong className="text-foreground">SDK key</strong> over OFREP
        and is unaffected by tokens, scopes, or rate limits here. See{' '}
        <a href="/docs/feature-flags/evaluation" className="text-brand-500 hover:text-brand-400">
          Evaluation (OFREP)
        </a>
        .
      </P>

      <DocNext href="/docs/api" label="REST API reference" />
    </div>
  );
}
