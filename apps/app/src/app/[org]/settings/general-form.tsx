"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, submitButtonClass } from "@/components/field";
import { FormError, FormNotice } from "@/components/form-error";
import { planName } from "@/lib/plans";
import { slugify } from "@/lib/slug";
import { updateOrgAction } from "./actions";

export function OrgGeneralForm({
  currentSlug,
  initialName,
  initialPlan,
  canManage,
}: {
  currentSlug: string;
  initialName: string;
  initialPlan: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(currentSlug);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("currentSlug", currentSlug);
    fd.set("name", name.trim());
    fd.set("slug", slug.trim());
    startTransition(async () => {
      const result = await updateOrgAction(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      if (result.newSlug) {
        router.push(`/${result.newSlug}/settings`);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <Field
        id="org-name"
        label="Organization name"
        name="name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!canManage}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="org-slug" className="text-xs font-medium text-zinc-400">
          Organization URL
        </label>
        <div className="flex items-stretch overflow-hidden rounded-md border border-white/10 bg-white/5 focus-within:border-teal-500/50 focus-within:ring-2 focus-within:ring-teal-500/20">
          <span className="flex items-center whitespace-nowrap border-r border-white/10 bg-white/2 px-3 text-sm text-zinc-500">
            app.flagon.io/
          </span>
          <input
            id="org-slug"
            name="slug"
            type="text"
            value={slug}
            disabled={!canManage}
            onChange={(e) => setSlug(slugify(e.target.value))}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-100 outline-none disabled:opacity-60"
          />
        </div>
      </div>

      {/* Plan is read-only here: it is a billing concern, changed only through
          Stripe on the Billing page. This block used to be a free-for-all Select
          that self-granted Pro. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-400">Plan</span>
        <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
          <span className="text-sm text-zinc-100">{planName(initialPlan)}</span>
          <Link
            href={`/${currentSlug}/settings/billing`}
            className="text-xs font-medium text-teal-400 hover:text-teal-300"
          >
            Manage billing
          </Link>
        </div>
      </div>

      {error ? <FormError>{error}</FormError> : null}
      {saved ? <FormNotice>Organization updated.</FormNotice> : null}

      {canManage ? (
        <button type="submit" className={submitButtonClass} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      ) : null}
    </form>
  );
}
