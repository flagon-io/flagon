import type { Metadata } from "next";
import { getProposalByToken, type ProposalView } from "@/lib/proposals.server";
import { formatCents, formatQuantity, getMeter } from "@/lib/meters";
import { ProposalActions } from "./proposal-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Proposal",
  robots: { index: false, follow: false },
};

const RANGE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function fmtDay(iso: string): string {
  return RANGE.format(new Date(`${iso}T00:00:00Z`));
}

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const proposal = await getProposalByToken(token);

  return (
    <main className="min-h-svh bg-[#09090b] px-4 py-16 text-zinc-100">
      <div className="mx-auto w-full max-w-2xl">
        {!proposal ? (
          <Card>
            <h1 className="text-xl font-semibold">Proposal not found</h1>
            <p className="mt-2 text-sm text-zinc-400">
              This link isn&apos;t valid. It may have been mistyped or
              withdrawn. Check with your Flagon contact for an up-to-date link.
            </p>
          </Card>
        ) : (
          <ProposalBody proposal={proposal} token={token} />
        )}
      </div>
    </main>
  );
}

function ProposalBody({
  proposal,
  token,
}: {
  proposal: ProposalView;
  token: string;
}) {
  const covered = Object.entries(proposal.meterAllowances);
  const meteredIncluded = Object.entries(proposal.meteredAllowances);
  const answered = proposal.status !== "sent";

  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-widest text-teal-400/80">
        Flagon proposal
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        A plan for {proposal.orgName}
      </h1>
      <p className="mt-2 text-sm text-zinc-400">
        {fmtDay(proposal.termStart)} to {fmtDay(proposal.termEnd)}
      </p>

      {proposal.message ? (
        <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {proposal.message}
        </p>
      ) : null}

      <dl className="mt-8 space-y-4">
        <Line
          label="Base price"
          value={`${formatCents(proposal.baseFeeCents)} / ${proposal.interval}`}
        />
        {covered.length > 0 ? (
          <div>
            <dt className="text-xs uppercase tracking-wider text-zinc-500">
              Included in your term
            </dt>
            <dd className="mt-1 space-y-1">
              {covered.map(([meter, qty]) => (
                <div key={meter} className="flex justify-between text-sm">
                  <span className="text-zinc-300">
                    {getMeter(meter)?.label ?? meter}
                  </span>
                  <span className="tabular-nums text-zinc-200">
                    {formatQuantity(qty)} {getMeter(meter)?.unit ?? ""}
                  </span>
                </div>
              ))}
            </dd>
          </div>
        ) : null}
        {meteredIncluded.length > 0 ? (
          <div>
            <dt className="text-xs uppercase tracking-wider text-zinc-500">
              Metered, with monthly included
            </dt>
            <dd className="mt-1 space-y-1">
              {meteredIncluded.map(([meter, qty]) => {
                const rate = proposal.meteredRates[meter];
                const rateText = rate
                  ? `then ${formatCents(rate.unit_amount_cents)}/${formatQuantity(rate.per)}`
                  : "then at list rate";
                return (
                  <div key={meter} className="flex justify-between text-sm">
                    <span className="text-zinc-300">
                      {getMeter(meter)?.label ?? meter}
                    </span>
                    <span className="tabular-nums text-zinc-400">
                      {formatQuantity(qty)} included, {rateText}
                    </span>
                  </div>
                );
              })}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-8 border-t border-white/10 pt-6">
        {answered ? (
          <StatusBanner status={proposal.status} />
        ) : (
          <ProposalActions token={token} />
        )}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-zinc-500">
        Anything not included above is billed as usage at the rates shown, the
        same way it works today. Approving sets these terms in motion; your
        Flagon contact will confirm and activate your account.
      </p>
    </Card>
  );
}

function StatusBanner({ status }: { status: string }) {
  const map: Record<string, { text: string; tone: string }> = {
    accepted: {
      text: "You approved this proposal. Your Flagon contact will be in touch to activate it.",
      tone: "text-emerald-300",
    },
    provisioned: {
      text: "This proposal is approved and active.",
      tone: "text-emerald-300",
    },
    declined: {
      text: "You declined this proposal. If that wasn't intended, reach out to your Flagon contact.",
      tone: "text-zinc-400",
    },
    withdrawn: {
      text: "This proposal has been withdrawn. Check with your Flagon contact.",
      tone: "text-zinc-400",
    },
    expired: {
      text: "This proposal has expired. Ask your Flagon contact for a fresh one.",
      tone: "text-amber-300",
    },
    draft: {
      text: "This proposal isn't ready yet.",
      tone: "text-zinc-400",
    },
  };
  const entry = map[status] ?? { text: `Status: ${status}`, tone: "text-zinc-400" };
  return <p className={`text-sm ${entry.tone}`}>{entry.text}</p>;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums text-zinc-100">
        {value}
      </dd>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 shadow-xl">
      {children}
    </div>
  );
}
