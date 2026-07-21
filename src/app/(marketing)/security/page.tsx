import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How to report a vulnerability in Flagon, and what we promise in return.",
};

/**
 * A disclosure policy is only useful if it answers the researcher's real
 * questions: am I allowed to test this, what happens if I see something I
 * should not have, and will you sue me. Vague goodwill ("we take security
 * seriously") answers none of them, so this page commits to specifics -
 * response times, an explicit safe harbour, what is out of scope - and is
 * straight about the size of the reward rather than implying a programme we
 * cannot fund. A researcher who learns the real number only after doing the
 * work is a researcher who does not come back.
 */
export default function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      updated="July 21, 2026"
      summary={
        <>
          Report anything you find to{" "}
          <a
            href={`mailto:security@${brand.domain}`}
            className="text-teal-400 transition hover:text-teal-300"
          >
            security@{brand.domain}
          </a>
          . Test only against your own organization, we will not pursue you for
          good-faith research, and we pay for findings that matter.
        </>
      }
    >
      <LegalSection n={1} title="Reporting a vulnerability">
        <p>
          Email{" "}
          <a
            href={`mailto:security@${brand.domain}`}
            className="text-teal-400 transition hover:text-teal-300"
          >
            security@{brand.domain}
          </a>{" "}
          with enough detail to reproduce: the endpoint or page, the steps, and
          what you were able to do that you should not have been. A short proof
          of concept beats a scanner report.
        </p>
        <p>What you can expect from us:</p>
        <ul>
          <li>an acknowledgement within two business days;</li>
          <li>
            an assessment, with our intended fix or our reasoning, within ten
            business days;
          </li>
          <li>
            an update when it ships, and public credit on request once it is
            fixed.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={2} title="Safe harbour">
        <p>
          If you make a good-faith effort to follow this policy, we will not
          pursue legal action against you, and we will say so if someone else
          tries to. Good faith means you stayed in the scope below, you did not
          access, change, or destroy another customer&apos;s data, you did not
          degrade the service for anyone else, and you gave us a reasonable
          chance to fix the issue before publishing.
        </p>
        <p>
          If you reach another tenant&apos;s data by accident &mdash; exactly
          the class of bug we most want to hear about &mdash; stop, tell us what
          you saw, and delete it. Reporting that honestly will never be held
          against you.
        </p>
      </LegalSection>

      <LegalSection n={3} title="Scope">
        <p>In scope:</p>
        <ul>
          <li>
            the hosted service at {brand.domain}, including the console and the
            public API;
          </li>
          <li>the {brand.name} source in our public repository.</li>
        </ul>
        <p>Out of scope, so you do not waste your time:</p>
        <ul>
          <li>
            denial of service, traffic floods, and anything whose impact is
            volume;
          </li>
          <li>
            social engineering of our team or our customers, and physical
            attacks;
          </li>
          <li>
            missing hardening headers, cookie flags, or TLS settings with no
            demonstrated impact;
          </li>
          <li>
            bugs in our providers &mdash; Stripe, Vercel, Neon, Resend, Sentry
            &mdash; which belong in their own programmes. We do want to hear if
            our USE of one of them is wrong.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={4} title="Testing responsibly">
        <p>
          Create your own organization and test against that. Never use another
          customer&apos;s account, and never use production data that is not
          yours. Automated scanning at volume is indistinguishable from an
          attack and will trip rate limits and metering, so keep it light or
          tell us first.
        </p>
      </LegalSection>

      <LegalSection n={5} title="How tenants are kept apart">
        <p>
          Isolation between organizations is enforced by the database, not only
          by application code: every tenant table carries row-level security
          keyed on the organization, and the application connects with a role
          that cannot bypass it. A table nobody classified is unreachable rather
          than quietly readable &mdash; it fails closed. Passwords and API
          tokens are stored only as digests, and traffic is encrypted in
          transit.
        </p>
        <p>
          The source is public, so you can check that rather than take our word
          for it.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Bounty">
        <p>
          {/* The value and the word after it live in ONE expression. An
              interpolation followed by prose loses its space when compiled,
              and writing {" "} there does not survive either: Prettier folds
              the line back together the moment it fits, which is how this
              exact sentence broke twice. */}
          If you find something real, we pay for it. Here is the honest shape of
          that: {`${brand.legalName} is a very small company`}, so there is no
          published payout table and we will not compete with a large
          vendor&apos;s programme. What we will do is pay a genuine amount,
          scaled to the severity of what you found, and pay it quickly rather
          than after a quarter of internal review.
        </p>
        <p>
          A report that protects our customers is worth money to us and we will
          treat it that way. If a finding lands outside what we can afford to
          reward properly, we will tell you what we can do up front instead of
          negotiating you down afterwards.
        </p>
        <p>
          The usual conditions apply: the first clear report of an issue is the
          one that counts, duplicates and out-of-scope items are not rewarded,
          and raw scanner output is not a finding. Public credit is yours on
          request either way, and every report is answered by a person.
        </p>
      </LegalSection>

      <LegalSection n={7} title="security.txt">
        <p>
          Machine-readable contact details are published at{" "}
          <a
            href="/.well-known/security.txt"
            className="text-teal-400 transition hover:text-teal-300"
          >
            /.well-known/security.txt
          </a>
          , per RFC 9116.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
