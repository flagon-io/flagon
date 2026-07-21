import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Flagon collects, uses, and protects your data.",
};

/**
 * Written against what the code does, not against a template.
 *
 * Every specific claim here is checkable in this repository: the subprocessor
 * list is the set of services the app really talks to, the cookie name is the
 * one auth.ts sets, and the section on evaluation context says what the OFREP
 * endpoints actually do with it (they do not persist it) rather than the
 * reassuring thing a generic policy would say. A privacy policy describing a
 * different system than the one running is worse than none: it is a promise
 * nobody checked.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="July 21, 2026"
      summary={
        <>
          The short version: we collect what running the service requires, we do
          not sell it, and the evaluation context your application sends &mdash;
          the part that can describe your end users &mdash; is used to answer
          the request and is never written to our database.
        </>
      }
    >
      <LegalSection n={1} title="Who this covers">
        <p>
          This policy describes how {brand.legalName}, a {brand.jurisdiction}{" "}
          corporation, handles information in the hosted {brand.name} service at{" "}
          {brand.domain}. It covers two different kinds of data, and the
          distinction runs through everything below:
        </p>
        <ul>
          <li>
            <strong className="text-zinc-300">Account data</strong> about you,
            our customer: your identity, your organization, your billing. We
            decide how this is handled, so we are its controller.
          </li>
          <li>
            <strong className="text-zinc-300">Customer data</strong> you send us
            while using the service, including any evaluation context describing
            your own end users. You decide what that contains; we process it on
            your instructions.
          </li>
        </ul>
        <p>
          If you self-host {brand.name}, your data never reaches us and this
          policy does not apply to that deployment.
        </p>
      </LegalSection>

      <LegalSection n={2} title="What we collect">
        <ul>
          <li>
            <strong className="text-zinc-300">Identity.</strong> Your name,
            username, and email addresses. Signing in with a social provider
            gives us the profile and email that provider releases.
          </li>
          <li>
            <strong className="text-zinc-300">Credentials.</strong> Passwords
            are stored only as a hash. API and client tokens are stored only as
            a SHA-256 digest, which is why we cannot show you a token again
            after it is issued.
          </li>
          <li>
            <strong className="text-zinc-300">Workspace content.</strong> The
            organizations, projects, teams, flags, segments, and documentation
            you create.
          </li>
          <li>
            <strong className="text-zinc-300">Operational records.</strong>{" "}
            Sessions, rate-limit counters, and metered usage. A usage record is
            a meter name, a quantity, a project, and a timestamp.
          </li>
          <li>
            <strong className="text-zinc-300">Billing.</strong> Your plan and
            your Stripe customer and subscription identifiers. Card details go
            directly to Stripe and never reach our servers or our database.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={3} title="Evaluation context is not stored">
        <p>
          When your application evaluates a flag it sends an evaluation context:
          a targeting key, plus whatever attributes your rules need. That is the
          data most likely to describe an identifiable person, and it is used to
          compute the response and then discarded. It is{" "}
          <strong className="text-zinc-300">not written to our database</strong>
          . What persists from an evaluation is the count, for metering, not who
          it was for.
        </p>
        <p>
          You control what goes in. Targeting works on any stable identifier, so
          it never has to be a real name or email address.
        </p>
      </LegalSection>

      <LegalSection n={4} title="How we use it">
        <p>
          To operate the service, bill for it, keep it secure and available, and
          answer you when you get in touch. We do not sell personal information,
          and we do not use your workspace content or your evaluation traffic to
          train models.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Who else processes it">
        <p>
          These are the third parties that handle data on our behalf. It is the
          real list, not a generic one:
        </p>
        <ul>
          <li>
            <strong className="text-zinc-300">Vercel</strong> &mdash; hosting,
            delivery, and product analytics. Our analytics are cookieless and
            aggregate; they do not follow you across other sites.
          </li>
          <li>
            <strong className="text-zinc-300">Neon</strong> &mdash; the managed
            Postgres database, currently in the United States.
          </li>
          <li>
            <strong className="text-zinc-300">Stripe</strong> &mdash; payments,
            invoices, and the billing portal.
          </li>
          <li>
            <strong className="text-zinc-300">Resend</strong> &mdash;
            transactional email: verification, password resets, invitations.
          </li>
          <li>
            <strong className="text-zinc-300">Sentry</strong> &mdash; error
            monitoring. A stack trace can incidentally carry request details, so
            we treat it as processing personal data rather than pretending it
            cannot.
          </li>
        </ul>
        <p>
          We update this list before adding a subprocessor that handles customer
          data.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Cookies">
        <p>
          One cookie matters: a session cookie named{" "}
          <code className="font-mono text-zinc-300">flagon.session_token</code>,
          scoped to {brand.domain} so one sign-in works across the site and the
          console. It is required to stay signed in. We run no advertising or
          cross-site tracking cookies.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Retention and deletion">
        <p>
          Account and workspace data is kept while your account or organization
          exists. Deleting an organization removes it along with its projects,
          flags, access grants, and tokens. Usage that has already been invoiced
          is retained as part of our financial records, and invoices live in
          Stripe under Stripe&apos;s retention.
        </p>
        <p>
          Deleted data can survive briefly in database backups until those
          backups age out on our provider&apos;s schedule.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Security">
        <p>
          Traffic is encrypted in transit. Every tenant table is protected by
          row-level security in the database, keyed on the organization, and the
          application connects with a role that cannot bypass it &mdash; so
          isolation between customers is enforced by the database itself, not
          only by application code. Passwords and tokens are stored as digests.
        </p>
        <p>
          No system is perfect. If you find a vulnerability, report it to{" "}
          <a
            href={`mailto:security@${brand.domain}`}
            className="text-teal-400 transition hover:text-teal-300"
          >
            security@{brand.domain}
          </a>{" "}
          rather than testing it against another customer&apos;s data.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Your rights">
        <p>
          You can read and correct most of your data directly in the console,
          and export your workspace through the API. Depending on where you
          live, you may also have the right to a copy of your data, to have it
          deleted, or to object to how it is processed. Write to us and we will
          action it; no particular form of words is required.
        </p>
        <p>
          If you process personal data of people in the EEA or UK through{" "}
          {brand.name}, a data processing agreement is available on request.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Changes and contact">
        <p>
          If this policy changes materially we will update the date above and
          tell organization owners. Questions, requests, and complaints go to{" "}
          <a
            href={`mailto:privacy@${brand.domain}`}
            className="text-teal-400 transition hover:text-teal-300"
          >
            privacy@{brand.domain}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
