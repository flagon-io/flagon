import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Security",
  description: "How to report a vulnerability in Flagon.",
};

export default function SecurityPage() {
  return (
    <LegalPage title="Security" updated="July 2026">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">
          Reporting a vulnerability
        </h2>
        <p>
          If you believe you have found a security vulnerability in Flagon,
          please email{" "}
          <a
            href="mailto:security@flagon.io"
            className="text-teal-400 hover:text-teal-300"
          >
            security@flagon.io
          </a>
          . Include enough detail to reproduce the issue. We aim to acknowledge
          reports promptly and will keep you updated as we investigate.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">
          Coordinated disclosure
        </h2>
        <p>
          Please give us a reasonable opportunity to address an issue before any
          public disclosure. We will not pursue legal action against researchers
          who act in good faith and avoid privacy violations, data destruction,
          and service disruption.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">security.txt</h2>
        <p>
          Machine-readable contact details are published at{" "}
          <a
            href="/.well-known/security.txt"
            className="text-teal-400 hover:text-teal-300"
          >
            /.well-known/security.txt
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
