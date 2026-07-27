import type { Metadata } from "next";
import { brand } from "@flagon/design";
import { LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: `Privacy Policy (Draft) — ${brand.name}`,
  description: `Draft policy for how ${brand.name} collects, uses, and protects your data.`,
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="July 27, 2026"
      draft
      intro={`This policy explains what ${brand.legalName} collects when you use ${brand.name}, why, and the choices you have.`}
    >
      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> you provide: your email
          address(es), username, and password (stored only as a hash).
        </li>
        <li>
          <strong>Organization and content data</strong> you create in the
          product, such as organizations, members, and settings.
        </li>
        <li>
          <strong>Technical data</strong> generated as you use the service, such
          as IP address, browser/user-agent, and session and access-token
          activity, used to keep the service secure and working.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>to provide, maintain, and secure the service;</li>
        <li>to authenticate you and protect against abuse;</li>
        <li>
          to send account and service messages (for example, email verification
          and password resets);
        </li>
        <li>
          to send occasional product updates only where you have opted in, and
          you can opt out at any time.
        </li>
      </ul>

      <h2>Sharing</h2>
      <p>
        We do not sell your personal data. We share it only with service
        providers who help us run {brand.name} (such as hosting and email
        delivery) under appropriate confidentiality obligations, with members of
        your organization as the product requires, or where the law requires it.
      </p>

      <h2>Retention</h2>
      <p>
        We keep your data for as long as your account is active. When you delete
        your account, we delete or de-identify your personal data within a
        reasonable period, except where we must retain it to meet legal
        obligations.
      </p>

      <h2>Security</h2>
      <p>
        We take reasonable measures to protect your data. Passwords are hashed
        and access tokens are stored only as hashes. See our{" "}
        <a href="/security">Security</a> page for more.
      </p>

      <h2>Your choices</h2>
      <p>
        You can view and update your account information, manage your email
        addresses, revoke sessions and access tokens, and delete your account
        from your settings. Depending on where you live, you may have additional
        rights over your data; contact us to exercise them.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Email{" "}
        <a href="mailto:privacy@flagon.io">privacy@flagon.io</a>.
      </p>
    </LegalShell>
  );
}
