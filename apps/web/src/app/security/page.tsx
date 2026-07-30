import type { Metadata } from "next";
import { brand } from "@flagon/design";
import { LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: `Security (Draft) · ${brand.name}`,
  description: `Draft overview of how ${brand.name} protects your account and data, and how to report a vulnerability.`,
};

export default function SecurityPage() {
  return (
    <LegalShell
      title="Security"
      updated="July 27, 2026"
      draft
      intro={`Security is foundational to a developer platform. Here is how ${brand.name} protects accounts and data, and how to reach us with a concern.`}
    >
      <h2>Accounts and credentials</h2>
      <ul>
        <li>Passwords are stored only as salted hashes, never in plain text.</li>
        <li>
          Access tokens (personal and organization) are shown once and stored
          only as hashes; you can revoke any token at any time.
        </li>
        <li>
          You can review your active sessions and sign out of other devices from
          your security settings.
        </li>
      </ul>

      <h2>Data and tenancy</h2>
      <ul>
        <li>
          Data is scoped to your organization, and access is governed by member
          roles.
        </li>
        <li>Data is encrypted in transit (TLS).</li>
        <li>
          {brand.name} is source-available and self-hostable: you can run it on
          your own infrastructure and keep data entirely under your control.
        </li>
      </ul>

      <h2>Reporting a vulnerability</h2>
      <p>
        If you believe you have found a security vulnerability, please report it
        privately to{" "}
        <a href="mailto:security@flagon.io">security@flagon.io</a> rather than
        opening a public issue. Include enough detail to reproduce it. We will
        acknowledge your report, investigate, and keep you updated. We appreciate
        responsible disclosure and will not pursue action against good-faith
        research that respects our users&apos; privacy and data.
      </p>

      <h2>Scope</h2>
      <p>
        {brand.name} is under active development during its alpha. Practices on
        this page describe the hosted service and will evolve; material changes
        will be reflected here.
      </p>
    </LegalShell>
  );
}
