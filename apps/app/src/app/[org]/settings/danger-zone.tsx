"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  toast,
  useConfirm,
} from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { WEB_URL } from "@/lib/urls";
import { ORG_RETENTION_DAYS, type Settlement } from "@/lib/org-lifecycle-shared";
import { transferOwnershipAction } from "./members/actions";
import { deleteOrgAction } from "./lifecycle-actions";

/** Format cents as a dollar amount. */
function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type DangerMember = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
};

/**
 * The org Danger Zone: ownership transfer and org deletion for the owner, and
 * leaving the org for everyone else. Deletion goes through BetterAuth's
 * organization delete; ownership transfer goes through the app-owned members
 * table (transferOwnershipAction), which keeps the single-owner invariant.
 */
export function DangerZone({
  slug,
  orgId,
  orgName,
  isOwner,
  currentUserId,
  members,
  settlement,
}: {
  slug: string;
  orgId: string;
  orgName: string;
  isOwner: boolean;
  currentUserId: string;
  members: DangerMember[];
  /** Deletion settlement preview (owner only); null when unavailable/not loaded. */
  settlement: Settlement | null;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [transferring, setTransferring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const transferable = members.filter(
    (m) => m.role !== "owner" && m.userId !== currentUserId,
  );

  async function leave() {
    if (
      !(await confirm({
        title: "Leave organization?",
        message: (
          <>
            You will lose access to{" "}
            <strong className="text-zinc-200">{orgName}</strong> and all of its
            projects. An owner or admin would need to invite you back.
          </>
        ),
        confirmLabel: "Leave organization",
        tone: "danger",
      }))
    )
      return;
    start(async () => {
      const { error } = await authClient.organization.leave({ organizationId: orgId });
      if (error) {
        toast.error("Couldn't leave organization", error.message);
        return;
      }
      toast.success(`You left ${orgName}`);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-red-500/25 bg-red-500/3">
      <div className="border-b border-red-500/15 px-5 py-4">
        <h2 className="text-sm font-semibold text-red-300">Danger zone</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Irreversible and destructive actions for this organization.
        </p>
      </div>
      <div className="flex flex-col divide-y divide-white/8">
        {isOwner ? (
          <>
            <DangerRow
              title="Transfer ownership"
              description="Hand this organization to another member. You will become an admin."
              action={
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setTransferring(true)}
                >
                  Transfer ownership
                </Button>
              }
            />
            <DangerRow
              title="Delete this organization"
              description={`Settles any balance (cancels the subscription and bills final usage), then deletes. Retained for ${ORG_RETENTION_DAYS} days, then permanently removed.`}
              action={
                <Button variant="danger" disabled={pending} onClick={() => setDeleting(true)}>
                  Delete organization
                </Button>
              }
            />
          </>
        ) : (
          <DangerRow
            title="Leave this organization"
            description="Give up your own access to this organization."
            action={
              <Button variant="danger" disabled={pending} onClick={leave}>
                Leave organization
              </Button>
            }
          />
        )}
      </div>

      {transferring ? (
        <TransferModal
          slug={slug}
          orgName={orgName}
          members={transferable}
          onClose={() => setTransferring(false)}
        />
      ) : null}
      {deleting ? (
        <DeleteModal
          slug={slug}
          orgName={orgName}
          settlement={settlement}
          onClose={() => setDeleting(false)}
        />
      ) : null}
      {confirmDialog}
    </section>
  );
}

function DangerRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm text-zinc-100">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

function TransferModal({
  slug,
  orgName,
  members,
  onClose,
}: {
  slug: string;
  orgName: string;
  members: DangerMember[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [memberId, setMemberId] = useState(members[0]?.memberId ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!memberId) return setError("Choose a member to transfer ownership to.");
    start(async () => {
      const res = await transferOwnershipAction(slug, memberId);
      if (res.error) return setError(res.error);
      toast.success(`Ownership of ${orgName} transferred`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="sm">
      <ModalHeader title="Transfer ownership" onClose={onClose} />
      <ModalBody>
        {members.length === 0 ? (
          <p className="text-sm text-zinc-400">
            There is no other member to transfer ownership to. Invite someone
            first.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-zinc-400">
              The new owner takes full control of {orgName}. You will keep access
              as an admin.
            </p>
            <Field label="New owner">
              <Select
                ariaLabel="New owner"
                value={memberId}
                onValueChange={setMemberId}
                options={members.map((m) => ({
                  value: m.memberId,
                  label: `${m.name} (${m.email})`,
                }))}
              />
            </Field>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={submit}
          disabled={pending || members.length === 0 || !memberId}
        >
          {pending ? "Transferring…" : "Transfer ownership"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function DeleteModal({
  slug,
  orgName,
  settlement,
  onClose,
}: {
  slug: string;
  orgName: string;
  settlement: Settlement | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  // If the first attempt is blocked by a payment problem, offer the billing portal.
  const [needsBilling, setNeedsBilling] = useState(false);
  const confirmed = typed.trim() === slug;

  function submit() {
    if (!confirmed) return;
    setError(null);
    setNeedsBilling(false);
    start(async () => {
      const res = await deleteOrgAction(slug);
      if (!res.deleted) {
        setError(res.error ?? "Could not delete the organization.");
        // A 402 means the balance couldn't be collected — point them at billing.
        if (res.settlement && !res.settlement.clear) setNeedsBilling(true);
        return;
      }
      toast.success(`${orgName} deleted`);
      router.push("/");
      router.refresh();
    });
  }

  const owes = settlement && (settlement.owedCents > 0 || settlement.hasActiveSubscription);
  // GitHub-style: when a subscription is live, deletion cancels the plan too.
  const confirmLabel = settlement?.hasActiveSubscription
    ? "Cancel subscription and delete the organization"
    : "Delete this organization";

  return (
    <Modal onClose={onClose} size="sm">
      <ModalHeader title="Are you sure you want to delete this?" onClose={onClose} />
      <ModalBody>
        <div className="flex flex-col gap-4">
          {/* The GitHub-shaped consequences warning: what's removed + retention. */}
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-sm text-amber-200/90">
            Deleting the <strong className="text-amber-100">{orgName}</strong> organization will
            delete all of its flags, experiments, and projects. The{" "}
            <strong className="text-amber-100">{slug}</strong> URL will be unavailable for{" "}
            {ORG_RETENTION_DAYS} days.
          </div>

          <p className="text-xs text-zinc-500">
            Before proceeding, please review the{" "}
            <a
              href={`${WEB_URL}/terms`}
              target="_blank"
              rel="noreferrer"
              className="text-teal-300 hover:text-teal-200"
            >
              Terms of Service
            </a>{" "}
            regarding organization deletion.
          </p>

          {/* What we settle on the way out (arrears usage / open invoices). */}
          {owes ? (
            <div className="rounded-lg border border-white/10 bg-white/3 px-3 py-2.5 text-xs text-zinc-400">
              {settlement!.hasActiveSubscription ? (
                <p>This cancels your subscription and bills the final usage to your card on file.</p>
              ) : null}
              {settlement!.owedCents > 0 ? (
                <p className={settlement!.hasActiveSubscription ? "mt-1" : ""}>
                  <strong className="text-zinc-200">{usd(settlement!.owedCents)}</strong> owed on{" "}
                  {settlement!.openInvoiceCount} open invoice
                  {settlement!.openInvoiceCount === 1 ? "" : "s"} is collected now.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">No outstanding balance.</p>
          )}

          <div>
            <label htmlFor="delete-org-confirm" className="block text-xs font-medium text-zinc-400">
              Enter this organization&apos;s name to confirm
            </label>
            <div className="mt-1.5">
              <Input
                id="delete-org-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={slug}
                autoFocus
                autoComplete="off"
              />
            </div>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {needsBilling ? (
            <Link
              href={`/${slug}/settings/billing`}
              className="text-xs font-medium text-teal-300 hover:text-teal-200"
            >
              Open billing to update your card and pay the balance
            </Link>
          ) : null}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="danger" onClick={submit} disabled={pending || !confirmed}>
          {pending ? "Deleting…" : confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
