"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CopyField } from "@/components/copy-field";
import { Button, Field, Input } from "@/components/form-controls";
import { Modal, ModalActions, ModalClose } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { appPath } from "@/lib/urls";

/**
 * Client tokens: the publishable evaluation credential.
 *
 * This is the credential almost every integration needs, which is why it stays
 * on the Feature Flags page. Secret organization tokens moved to
 * Organization -> API tokens, because they are a PLATFORM credential that can
 * reach projects, members, and usage, not a flags-specific one.
 *
 * Client tokens remain readable after creation on purpose: they ship inside
 * applications, so treating them as secrets nobody may look at again would be
 * theatre. Secret tokens are shown once and never again.
 */
type Token = { id: string; name: string; created_at: string; token?: string | null };

function CreateClientTokenModal({
  create,
}: {
  create: (form: FormData) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Create client token"
      description="Publishable credential for web, mobile, and desktop applications evaluating over OFREP."
      trigger={
        <Button variant="secondary" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Create
        </Button>
      }
    >
      <form
        action={async (form) => {
          if (await create(form)) setOpen(false);
        }}
      >
        <Field label="Name" hint="Use a name that identifies where this token is deployed.">
          <Input name="name" required autoFocus placeholder="iOS production" />
        </Field>
        <ModalActions>
          <ModalClose />
          <SubmitButton pendingLabel="Creating…">Create token</SubmitButton>
        </ModalActions>
      </form>
    </Modal>
  );
}

export function CredentialsPanel({
  orgSlug,
  clientTokens: initialClient,
}: {
  orgSlug: string;
  clientTokens: Token[];
}) {
  const [clientTokens, setClientTokens] = useState(initialClient);
  // Which token was just rotated. A masked field looks identical before and
  // after rotation, so without this the most consequential action on the page
  // gives no feedback at all: the old credential is already dead and nothing
  // on screen says so.
  const [rotated, setRotated] = useState<string | null>(null);

  async function create(form: FormData) {
    const response = await fetch(`/api/v1/orgs/${orgSlug}/client-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name") }),
    });
    if (!response.ok) return false;
    const body = await response.json();
    setClientTokens((items) => [body, ...items]);
    return true;
  }

  async function revoke(id: string) {
    if (!(await fetch(`/api/v1/orgs/${orgSlug}/client-tokens/${id}`, { method: "DELETE" })).ok) return;
    setClientTokens((items) => items.filter((item) => item.id !== id));
  }

  async function rotate(id: string) {
    const response = await fetch(`/api/v1/orgs/${orgSlug}/client-tokens/${id}`, { method: "PATCH" });
    if (!response.ok) return;
    const body = await response.json();
    setClientTokens((items) => items.map((item) => (item.id === id ? { ...item, ...body } : item)));
    setRotated(id);
  }

  return (
    <section className="mt-10 border-t border-white/10 pt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Client tokens</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Publishable credentials for applications that evaluate flags. They
            return evaluated values only, never your rules or segments, so they
            are safe to ship in a browser or mobile build. For servers and CI
            that need the management API, create an{" "}
            <Link
              href={appPath(`/${orgSlug}/settings/tokens`)}
              className="text-teal-400 transition hover:text-teal-300"
            >
              organization API token
            </Link>
            .
          </p>
        </div>
        <CreateClientTokenModal create={create} />
      </div>

      <ul className="mt-4 divide-y divide-white/5 border border-white/10">
        {clientTokens.map((token) => (
          <li key={token.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm text-zinc-200">
                  {token.name}
                  {rotated === token.id ? (
                    <span className="border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-teal-300">
                      Rotated
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-zinc-600">
                  {rotated === token.id
                    ? "The previous token stopped working immediately. Update anything using it."
                    : "Publishable client evaluation"}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => rotate(token.id)}>
                Rotate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revoke(token.id)}
                className="text-red-400"
              >
                Revoke
              </Button>
            </div>
            {token.token ? (
              <div className="mt-3">
                {/* Revealed after rotation so the change is visible, and the
                    new value is right there to paste into whatever needs it. */}
                <CopyField
                  key={rotated === token.id ? `${token.id}-rotated` : token.id}
                  value={token.token}
                  label={`${token.name} client token`}
                  masked={rotated !== token.id}
                />
              </div>
            ) : (
              <p className="mt-2 text-xs text-amber-400">
                Created before retrievable client tokens. Rotate once to reveal
                its replacement.
              </p>
            )}
          </li>
        ))}
        {!clientTokens.length ? (
          <li className="px-4 py-4 text-sm text-zinc-600">None created.</li>
        ) : null}
      </ul>
    </section>
  );
}
