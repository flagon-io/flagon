import type { Metadata } from "next";
import { brand } from "@flagon/design";
import { LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: `Terms of Service · ${brand.name}`,
  description: `Draft terms that will govern your use of ${brand.name}.`,
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="July 30, 2026"
      draft
      intro={`These terms govern your use of ${brand.name}, operated by ${brand.legalName} ("we", "us"). By creating an account or using the service, you agree to them.`}
    >
      <h2>1. The service</h2>
      <p>
        {brand.name} is a developer platform that hosts a growing set of products
        on shared foundations. During the current alpha it is offered as-is while
        we build it in the open. Features may change, break, or be removed, and
        availability is not guaranteed.
      </p>
      <p>
        These terms govern the <strong>managed service</strong> we operate at
        flagon.io. {brand.name} is also source-available: if you run it on your
        own infrastructure, your use of the source is governed by the license in
        our source repository, not by these terms.
      </p>

      <h2>2. Your account</h2>
      <p>
        You are responsible for your account, for keeping your credentials and
        access tokens secure, and for all activity that happens under it. You
        must be able to form a binding contract to use the service, and you must
        provide accurate account information.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>break the law or infringe anyone&apos;s rights;</li>
        <li>
          disrupt the service, probe or bypass its security, or access it other
          than through the interfaces we provide;
        </li>
        <li>
          resell or abuse the service, or use it to store or transmit malware or
          unlawful content.
        </li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You keep ownership of the content and data you put into {brand.name}. You
        grant us the limited rights needed to operate the service for you, such
        as storing, processing, and displaying that data back to you and your
        organization. You are responsible for having the rights to the data you
        upload.
      </p>

      <h2>5. Organizations</h2>
      <p>
        Content and settings inside an organization are controlled by that
        organization&apos;s owners and admins, who may manage members, roles, and
        access. If you join an organization, its administrators may see and manage
        your activity within it.
      </p>

      <h2>6. Plans and fees</h2>
      <p>
        {brand.name} offers a free tier and paid plans. Paid plans are billed on
        a recurring basis through our payment processor, Stripe, at the prices
        shown when you subscribe. Some plans include usage-based charges for
        evaluations beyond an included allowance. Fees are non-refundable except
        where required by law, and if a payment fails or a subscription lapses we
        may restrict access to paid features until it is resolved.
      </p>
      <p>
        Because we are in alpha, plans, prices, and limits may change. We will
        present any change before it applies to you; continuing to use a paid
        plan after a change takes effect means you accept it.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may stop using the service and delete your account at any time. We
        may suspend or terminate access if these terms are breached or to protect
        the service or its users.
      </p>

      <h2>8. Disclaimers and liability</h2>
      <p>
        The service is provided <strong>&ldquo;as is&rdquo;</strong> without
        warranties of any kind. To the fullest extent permitted by law, we are
        not liable for indirect or consequential damages, and our total liability
        is limited to the amount you paid us (if any) in the twelve months before
        the claim.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms. If we make material changes we will take
        reasonable steps to let you know. Continuing to use the service after a
        change means you accept the updated terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms? Email{" "}
        <a href="mailto:legal@flagon.io">legal@flagon.io</a>.
      </p>
    </LegalShell>
  );
}
