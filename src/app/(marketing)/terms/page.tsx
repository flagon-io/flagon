import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { brand } from "@/lib/brand";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Flagon.",
};

/**
 * The billing sections describe the mechanics this repository implements:
 * monthly Pro with a usage credit, overage billed in arrears on the following
 * invoice, hard caps only on Hobby, and Enterprise priced by agreement. Prices
 * are read from PLANS so the terms and the pricing page cannot drift apart -
 * a number typed here by hand would eventually contradict the one a customer
 * is actually charged.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="July 21, 2026"
      summary={
        <>
          Plain-language terms for the hosted service. You keep ownership of
          everything you put in; we bill monthly for Pro with usage beyond your
          credit charged on the next invoice; either side can end the
          arrangement.
        </>
      }
    >
      <LegalSection n={1} title="The agreement">
        <p>
          These terms are between you and {brand.legalName}, a{" "}
          {`${brand.jurisdiction} corporation`} (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;), and they govern the hosted {brand.name} service at{" "}
          {brand.domain}. Using the service means accepting them. If you are
          agreeing on behalf of a company, you are confirming you may bind it.
        </p>
        <p>
          The {brand.name} source is published separately under the license in
          the repository. These terms cover the hosted service; that license
          covers running the software yourself.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Your account">
        <p>
          You are responsible for what happens under your account and for
          keeping credentials and API tokens safe. Tokens are shown once and
          stored only as digests, so a lost token has to be rotated rather than
          recovered. Tell us promptly if you believe an account has been
          compromised.
        </p>
        <p>
          Organizations have exactly one owner. Access inside an organization is
          yours to administer, and we act on the permissions your organization
          has configured.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Your data stays yours">
        <p>
          You own the content you put into {brand.name}: your flags, projects,
          documentation, and the evaluation traffic you send. We claim no
          ownership of it. We use it only to run the service for you, as
          described in our Privacy Policy, and we do not train models on it.
        </p>
        <p>
          You are responsible for having the right to send us any personal data
          contained in an evaluation context, and for not sending categories of
          data that need protection we have not agreed to provide.
        </p>
      </LegalSection>

      <LegalSection n={4} title="Acceptable use">
        <p>Do not use {brand.name} to:</p>
        <ul>
          <li>break the law, or infringe someone else&apos;s rights;</li>
          <li>
            attack the service, probe other tenants&apos; data, or work around
            plan limits, rate limits, or metering;
          </li>
          <li>
            resell raw access to the evaluation API as if it were your own
            equivalent service;
          </li>
          <li>
            store credentials, payment card data, or health records in flag
            values or evaluation context.
          </li>
        </ul>
        <p>
          We may suspend an organization that is actively harming the service or
          other customers. Where we reasonably can, we will tell you first.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Plans, fees, and usage">
        <ul>
          <li>
            <strong className="text-zinc-300">{PLANS.free.name}</strong> is
            free, hard-capped, and never generates a bill. When it reaches its
            ceiling, requests are refused rather than charged.
          </li>
          <li>
            <strong className="text-zinc-300">{PLANS.pro.name}</strong> is $
            {PLANS.pro.priceMonthly} per month, billed in advance, and includes
            ${(PLANS.pro.includedUsageCents / 100).toFixed(0)} of usage each
            period. Usage beyond that credit is billed{" "}
            <strong className="text-zinc-300">in arrears</strong>, appearing on
            the following period&apos;s invoice at the rates published on our
            pricing page. Pro is not hard-capped: it keeps serving and bills the
            overage.
          </li>
          <li>
            <strong className="text-zinc-300">{PLANS.enterprise.name}</strong>{" "}
            is priced by agreement. Where a signed agreement and these terms
            conflict, that agreement wins.
          </li>
        </ul>
        <p>
          Fees exclude taxes, which we add where required. Payments are handled
          by Stripe; a failed payment may lead to suspension after we have tried
          to reach you.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Changing plans and cancelling">
        <p>
          You can cancel at any time from the billing portal. Cancellation takes
          effect at the end of the period you have paid for, and usage you have
          already incurred is still billed. We do not prorate partial months,
          and fees already paid are non-refundable except where the law says
          otherwise.
        </p>
        <p>
          If we change prices, we will give notice before the change applies to
          your next renewal.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Availability and support">
        <p>
          We work to keep {brand.name} available and fast, but the hosted
          service is provided without an uptime commitment unless you have an
          Enterprise agreement that includes one. Support for {PLANS.free.name}{" "}
          is community-based; {PLANS.pro.name} includes standard support;
          Enterprise support is set by agreement.
        </p>
        <p>
          Flag evaluation is designed to fail safe on your side: SDKs cache and
          fall back to your in-code defaults, and we recommend you rely on that
          rather than on us being reachable.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Ending the arrangement">
        <p>
          You may stop using the service and delete your organization whenever
          you like. We may end or suspend an account for a material breach of
          these terms, for non-payment, or if required by law. On termination,
          your right to use the service stops and your data is deleted as
          described in the Privacy Policy. Export anything you want to keep
          first &mdash; the API can do it.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Warranties and liability">
        <p>
          The service is provided &ldquo;as is&rdquo;, without warranties of any
          kind, to the fullest extent the law allows. We do not promise it will
          be uninterrupted or error-free.
        </p>
        <p>
          Neither side is liable for indirect, incidental, or consequential
          losses, or for lost profits or data. Our total liability arising from
          the service is limited to the amount you paid us in the twelve months
          before the claim. Nothing here limits liability that cannot be limited
          by law.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Changes to these terms">
        <p>
          We may update these terms. If a change is material we will update the
          date above and notify organization owners before it takes effect.
          Continuing to use the service after that means accepting the new
          version.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Governing law">
        <p>
          These terms are governed by the laws of the State of{" "}
          {brand.jurisdiction}, without regard to its conflict-of-laws rules,
          and the state and federal courts located in {brand.jurisdiction},
          which has exclusive jurisdiction over any dispute arising from them.
          If any provision is held unenforceable, the rest stays in force.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Contact">
        <p>
          Questions about these terms go to{" "}
          <a
            href={`mailto:legal@${brand.domain}`}
            className="text-teal-400 transition hover:text-teal-300"
          >
            legal@{brand.domain}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
