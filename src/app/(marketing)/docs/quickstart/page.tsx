import type { Metadata } from 'next';
import { Code, DocNext, H1, H2, Lead, P } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Quickstart',
  description: 'Set up your catalog: an organization, environments, and your first project.',
};

export default function QuickstartPage() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Get started</p>
      <H1>Quickstart</H1>
      <Lead>
        Set up your catalog in a couple of minutes: an organization, its environments, and your
        first project. Capabilities like Feature Flags attach to this once they land.
      </Lead>

      <H2>1. Create an organization</H2>
      <P>
        Sign in and create an organization (or run in single-org mode, see{' '}
        <a href="/docs/self-hosting" className="text-brand-500 hover:text-brand-400">
          self-hosting
        </a>
        ). Your organization is the tenant boundary and the billing entity: it holds your teams,
        projects, and environments.
      </P>

      <H2>2. Review your environments</H2>
      <P>
        New organizations start with <Code>production</Code> and <Code>staging</Code> environments.
        Environments are an org-level primitive shared across every project, so{' '}
        <Code>production</Code> means the same thing everywhere. Add, rename, or reorder them under
        Environments.
      </P>

      <H2>3. Create a project</H2>
      <P>
        A project is one application or service you run. It inherits your whole environment set, and
        capabilities attach to it per environment. Create one from Projects to start your catalog.
      </P>

      <DocNext href="/docs/self-hosting" label="Self-hosting" />
    </div>
  );
}
