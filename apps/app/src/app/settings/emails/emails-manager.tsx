"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitButtonClass } from "@/components/field";
import { FormError, FormNotice } from "@/components/form-error";
import {
  addEmailAction,
  removeEmailAction,
  resendEmailVerificationAction,
  setPrimaryEmailAction,
} from "./actions";

type EmailRow = { email: string; verified: boolean; isPrimary: boolean };
type Banner = { kind: "ok" | "error"; text: string } | null;

/**
 * The multi-email manager. Add an address (which sends a confirmation link),
 * resend that link, make a verified address primary, or remove a non-primary
 * one. Each control posts a server action and refreshes the list.
 */
export function EmailsManager({
  emails,
  banner: initialBanner,
}: {
  emails: EmailRow[];
  banner: Banner;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(initialBanner);
  const [newEmail, setNewEmail] = useState("");

  function run(action: (fd: FormData) => Promise<{ ok?: string; error?: string }>, fd: FormData) {
    startTransition(async () => {
      const result = await action(fd);
      setBanner(
        result.error
          ? { kind: "error", text: result.error }
          : result.ok
            ? { kind: "ok", text: result.ok }
            : null,
      );
      router.refresh();
    });
  }

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData();
    fd.set("email", newEmail.trim());
    run(addEmailAction, fd);
    setNewEmail("");
  }

  function act(
    action: (fd: FormData) => Promise<{ ok?: string; error?: string }>,
    email: string,
  ) {
    const fd = new FormData();
    fd.set("email", email);
    run(action, fd);
  }

  return (
    <div className="flex flex-col gap-4">
      {banner ? (
        banner.kind === "ok" ? (
          <FormNotice>{banner.text}</FormNotice>
        ) : (
          <FormError>{banner.text}</FormError>
        )
      ) : null}

      <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
        {emails.map((e) => (
          <li
            key={e.email}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-100">{e.email}</span>
              {e.isPrimary ? <Badge tone="teal">Primary</Badge> : null}
              {e.verified ? (
                !e.isPrimary ? <Badge tone="zinc">Verified</Badge> : null
              ) : (
                <Badge tone="amber">Unverified</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs">
              {!e.verified ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(resendEmailVerificationAction, e.email)}
                  className="font-medium text-teal-400 hover:text-teal-300 disabled:opacity-50"
                >
                  Resend
                </button>
              ) : null}
              {e.verified && !e.isPrimary ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(setPrimaryEmailAction, e.email)}
                  className="font-medium text-teal-400 hover:text-teal-300 disabled:opacity-50"
                >
                  Make primary
                </button>
              ) : null}
              {!e.isPrimary ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(removeEmailAction, e.email)}
                  className="font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={onAdd} className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="new-email" className="text-xs font-medium text-zinc-400">
            Add email address
          </label>
          <input
            id="new-email"
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className={`${submitButtonClass} shrink-0 px-4`}
        >
          Add
        </button>
      </form>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "teal" | "zinc" | "amber";
}) {
  const tones = {
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-300",
    zinc: "border-white/15 bg-white/5 text-zinc-400",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
