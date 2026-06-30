import type { Metadata } from 'next';
import { Code, H1, Lead, P } from '@/components/prose';
import { OpenApiViewer } from '@/components/openapi-viewer';

export const metadata: Metadata = {
  title: 'API reference',
  description:
    'The Flagon REST API: JSON only, self-documenting, and described by a generated OpenAPI document you can render or generate clients from.',
};

export default function ApiReferencePage() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Reference</p>
      <H1>REST API</H1>
      <Lead>
        The Flagon API is JSON only and self-documenting. Responses return the resource directly;
        there&apos;s no <Code>data</Code> envelope. Errors are a consistent shape: a human{' '}
        <Code>message</Code>, plus a per-field <Code>errors</Code> object on validation failures.
      </Lead>
      <P>
        Everything below is generated from a single OpenAPI 3.1 document served at{' '}
        <Code>/api/openapi.json</Code>. Point your own tooling at it, or browse it here. As the
        platform grows, this reference grows with it automatically.
      </P>

      <div className="mt-12">
        <OpenApiViewer />
      </div>
    </div>
  );
}
