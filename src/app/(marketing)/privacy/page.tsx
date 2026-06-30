import type { Metadata } from 'next';
import { H1, H2, Lead, P } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Flagon collects, uses, and protects your information.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="eyebrow">Legal</p>
      <H1>Privacy Policy</H1>
      <Lead>Last updated June 29, 2026.</Lead>
      <P>
        This Privacy Policy explains how Flagon, LLC (&quot;Flagon&quot;) collects, uses, and shares
        information when you use our hosted service and website. If you self-host Flagon, you are the
        controller of your own data and this policy does not apply to that deployment.
      </P>

      <H2>Information we collect</H2>
      <P>
        Account information (name, username, email), organization and project data you create,
        evaluation context you send to the API, and usage and diagnostic data such as request
        metadata, IP address, and aggregate evaluation counts used for billing.
      </P>

      <H2>How we use information</H2>
      <P>
        To provide and operate the service, authenticate you, meter usage and bill accurately,
        provide support, secure the platform, and communicate important updates. We do not sell your
        personal information.
      </P>

      <H2>Sharing</H2>
      <P>
        We share data with subprocessors that help us run the service (for example, hosting,
        database, payments, and email providers), under contracts that require appropriate
        safeguards. We may disclose information to comply with law or protect rights and safety.
      </P>

      <H2>Cookies</H2>
      <P>
        We use strictly necessary cookies to keep you signed in and to remember preferences such as
        your color theme. We do not use advertising cookies.
      </P>

      <H2>Security</H2>
      <P>
        We use industry-standard measures including encryption in transit, hashed credentials and
        SDK keys, and tenant isolation. No system is perfectly secure, but we work hard to protect
        your data.
      </P>

      <H2>Data retention</H2>
      <P>
        We retain account and organization data while your account is active and for a reasonable
        period afterward as required for legal, accounting, or operational purposes. You may request
        deletion as described below.
      </P>

      <H2>Your rights</H2>
      <P>
        Depending on your location, you may have rights to access, correct, export, or delete your
        personal information. To exercise them, email privacy@flagon.io.
      </P>

      <H2>International transfers</H2>
      <P>
        We may process data in countries other than your own. Where required, we use appropriate
        transfer mechanisms to protect your information.
      </P>

      <H2>Changes</H2>
      <P>
        We may update this policy from time to time. Material changes will be communicated through
        the service or by email.
      </P>

      <H2>Contact</H2>
      <P>Questions about privacy? Email privacy@flagon.io.</P>
    </div>
  );
}
