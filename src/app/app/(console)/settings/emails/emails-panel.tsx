"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { brand } from "@/lib/brand";
import {
  Notice,
  buttonClass,
  dangerButtonClass,
  hintClass,
  inputClass,
  labelClass,
  subtleButtonClass,
} from "@/components/form-ui";
import {
  addEmailAction,
  removeEmailAction,
  resendVerificationAction,
  setPrimaryEmailAction,
  type EmailActionResult,
} from "./actions";

type EmailRow = {
  id: string;
  email: string;
  verified: boolean;
  primary: boolean;
};

function Badge({
  tone,
  children,
}: {
  tone: "primary" | "verified" | "unverified";
  children: React.ReactNode;
}) {
  const tones = {
    primary: "border-teal-500/40 text-teal-300",
    verified: "border-emerald-500/40 text-emerald-300",
    unverified: "border-amber-500/40 text-amber-300",
  } as const;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmailsPanel({
  emails,
  primaryVerified,
  justVerified,
  verifyError,
}: {
  emails: EmailRow[];
  primaryVerified: boolean;
  justVerified: boolean;
  verifyError: "expired" | "invalid" | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);
  const [pending, setPending] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");

  async function run(
    key: string,
    action: () => Promise<EmailActionResult>,
    onOk: string,
  ) {
    setStatus(null);
    setPending(key);
    const result = await action();
    setPending(null);
    if (!result.ok) {
      setStatus({ tone: "error", message: result.message });
      return;
    }
    setStatus({ tone: "success", message: onOk });
    router.refresh();
  }

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = newEmail.trim();
    if (!email) return;

    setStatus(null);
    setPending("add");
    const result = await addEmailAction(email);
    setPending(null);
    if (!result.ok) {
      setStatus({ tone: "error", message: result.message });
      return;
    }
    setStatus(
      result.sent === false
        ? {
            tone: "error",
            message: `${email} was added, but sending the verification email failed. Use Resend to try again.`,
          }
        : {
            tone: "success",
            message: `Verification email sent to ${email}. It expires in 1 hour.`,
          },
    );
    setNewEmail("");
    router.refresh();
  }

  return (
    <div className="mt-6 max-w-2xl space-y-6">
      <p className="text-sm leading-6 text-zinc-400">
        Emails you can use to sign in to your account and where {brand.name}
        {" sends"} notifications. Any verified address works at sign-in.
      </p>

      {justVerified ? (
        <Notice tone="success">Email address verified.</Notice>
      ) : null}
      {verifyError ? (
        <Notice tone="error">
          {verifyError === "expired"
            ? "That verification link has expired. Resend it and try again."
            : "That verification link is invalid."}
        </Notice>
      ) : null}
      {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}

      <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
        {emails.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 p-4">
            <span className="text-sm font-medium text-zinc-100">{e.email}</span>
            {e.primary ? <Badge tone="primary">Primary</Badge> : null}
            {e.verified ? (
              <Badge tone="verified">Verified</Badge>
            ) : (
              <Badge tone="unverified">Unverified</Badge>
            )}

            <span className="ml-auto flex items-center gap-2">
              {!e.verified ? (
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() =>
                    run(
                      `resend-${e.id}`,
                      () => resendVerificationAction(e.id),
                      `Verification email sent to ${e.email}.`,
                    )
                  }
                  className={subtleButtonClass}
                >
                  {pending === `resend-${e.id}` ? "Sending..." : "Resend"}
                </button>
              ) : null}
              {e.verified && !e.primary ? (
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() =>
                    run(
                      `primary-${e.id}`,
                      () => setPrimaryEmailAction(e.id),
                      `${e.email} is now your primary email.`,
                    )
                  }
                  className={subtleButtonClass}
                >
                  {pending === `primary-${e.id}` ? "Saving..." : "Make primary"}
                </button>
              ) : null}
              {!e.primary ? (
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() =>
                    run(
                      `delete-${e.id}`,
                      () => removeEmailAction(e.id),
                      `${e.email} removed.`,
                    )
                  }
                  className={dangerButtonClass}
                >
                  {pending === `delete-${e.id}` ? "Removing..." : "Remove"}
                </button>
              ) : null}
            </span>

            {e.primary ? (
              <p className="w-full text-xs leading-5 text-zinc-500">
                This email is the default for account notifications, such as
                password resets.
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd}>
        <label htmlFor="add-email" className={labelClass}>
          Add email address
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="add-email"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="Email address"
            required
            disabled={!primaryVerified}
            className={`${inputClass} mt-0 flex-1`}
          />
          <button
            type="submit"
            disabled={!primaryVerified || pending !== null}
            className={buttonClass}
          >
            {pending === "add" ? "Adding..." : "Add"}
          </button>
        </div>
        <p className={hintClass}>
          {primaryVerified
            ? "We'll send a verification link. Once verified, the address can be used to sign in or made your primary email."
            : "Verify your primary email address before adding another email."}
        </p>
      </form>
    </div>
  );
}
