import type { Metadata } from 'next';
import { H1, H2, Lead, P } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms governing your use of Flagon’s hosted service.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="eyebrow">Legal</p>
      <H1>Terms of Service</H1>
      <Lead>Last updated June 29, 2026.</Lead>
      <P>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Flagon hosted
        service operated by Flagon, LLC (&quot;Flagon&quot;, &quot;we&quot;, &quot;us&quot;). By
        creating an account or using the service, you agree to these Terms.
      </P>

      <H2>1. The service</H2>
      <P>
        Flagon provides a feature-management and developer platform offered as a hosted service and
        as source-available software. We may add, change, or remove features over time. We strive
        for high availability but the service is provided on an &quot;as available&quot; basis.
      </P>

      <H2>2. Accounts</H2>
      <P>
        You are responsible for safeguarding your account credentials and API keys, and for all
        activity under your account. You must provide accurate information and promptly update it.
        Access during early access is granted at our discretion.
      </P>

      <H2>3. Acceptable use</H2>
      <P>
        You agree not to misuse the service: no unlawful activity, no attempts to disrupt or
        circumvent our systems, no infringement of others&apos; rights, and no reselling of the
        service except as expressly permitted. You retain ownership of the data you submit.
      </P>

      <H2>4. Open source &amp; license</H2>
      <P>
        The Flagon source is made available under the Functional Source License (FSL-1.1-Apache-2.0).
        You may self-host and modify it for any permitted purpose; you may not use it to offer a
        competing commercial product. Each release converts to Apache 2.0 two years after its
        publication. Your use of the source is governed by that license, not these Terms.
      </P>

      <H2>5. Fees</H2>
      <P>
        Paid plans are billed based on usage and any applicable subscription fees. Fees are
        non-refundable except where required by law. We will give reasonable notice of pricing
        changes.
      </P>

      <H2>6. Termination</H2>
      <P>
        You may stop using the service at any time. We may suspend or terminate access for breach of
        these Terms or to comply with law. Upon termination, your right to use the hosted service
        ends; you may continue to self-host under the applicable open-source license.
      </P>

      <H2>7. Disclaimers</H2>
      <P>
        The service is provided &quot;as is&quot; without warranties of any kind, whether express or
        implied, including merchantability, fitness for a particular purpose, and non-infringement.
      </P>

      <H2>8. Limitation of liability</H2>
      <P>
        To the maximum extent permitted by law, Flagon will not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or for any loss of profits or data,
        arising from your use of the service.
      </P>

      <H2>9. Changes</H2>
      <P>
        We may update these Terms from time to time. Material changes will be communicated through
        the service or by email. Continued use after changes take effect constitutes acceptance.
      </P>

      <H2>10. Contact</H2>
      <P>Questions about these Terms? Email legal@flagon.io.</P>
    </div>
  );
}
