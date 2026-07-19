import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Flagon collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 2026">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">1. Overview</h2>
        <p>
          This Privacy Policy explains how Flagon collects, uses, and protects
          information when you use the platform.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">
          2. Data we collect
        </h2>
        <p>
          We collect the information you provide to create and operate your
          account, along with usage data needed to run the service.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">
          3. How we use data
        </h2>
        <p>
          Data is used to provide, secure, and improve the platform. We do not
          sell your personal information.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-200">4. Contact</h2>
        <p>
          Questions about this policy can be directed to the Flagon team.
        </p>
      </section>
    </LegalPage>
  );
}
