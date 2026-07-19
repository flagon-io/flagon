import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Flagon.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 2026">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">1. Overview</h2>
        <p>
          These Terms of Service govern your access to and use of Flagon and any
          related services. By using the platform you agree to these terms.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">2. Accounts</h2>
        <p>
          You are responsible for activity under your account and for keeping
          your credentials secure.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">
          3. Acceptable use
        </h2>
        <p>
          You agree not to misuse the platform or attempt to disrupt its
          integrity, security, or availability.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">4. Contact</h2>
        <p>Questions about these terms can be directed to the Flagon team.</p>
      </section>
    </LegalPage>
  );
}
