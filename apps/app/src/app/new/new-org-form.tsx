"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PlanCard } from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { Field, submitButtonClass } from "@/components/field";
import { FormError } from "@/components/form-error";
import { PLANS, DEFAULT_PLAN, SELF_HOST_NOTE, type PlanId } from "@/lib/plans";
import { isValidSlug, slugify } from "@/lib/slug";
import { isReserved } from "@/lib/reserved";

/**
 * Create-organization form: name, URL slug, and plan. The plan picker uses the
 * shared GitHub-style PlanCard (same component as the marketing pricing page);
 * only selectable plans can be picked, and slug uniqueness is decided on submit.
 *
 * `hasHobby` is true when the account already owns its one Hobby organization;
 * Hobby is then disabled (an account may own only one) rather than the whole
 * page being walled off.
 */
export function NewOrgForm({ hasHobby }: { hasHobby: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [plan, setPlan] = useState<PlanId | null>(hasHobby ? null : DEFAULT_PLAN);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A plan can be chosen when it is available for the alpha and not the Hobby
  // plan the account has already used up.
  const isSelectable = (p: (typeof PLANS)[number]) =>
    p.available && !(p.id === "hobby" && hasHobby);

  const effectiveSlug = slugEdited ? slug : slugify(name);
  const slugHint = !effectiveSlug
    ? null
    : !isValidSlug(effectiveSlug)
      ? "Lowercase letters, numbers, and single hyphens."
      : isReserved(effectiveSlug)
        ? "That name is reserved."
        : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const orgName = name.trim();
    const orgSlug = effectiveSlug;
    if (!orgName) {
      setError("Give your organization a name.");
      return;
    }
    if (!isValidSlug(orgSlug) || isReserved(orgSlug)) {
      setError("Choose a valid, unreserved URL for your organization.");
      return;
    }
    if (!plan) {
      setError("Choose a plan for your organization.");
      return;
    }

    setPending(true);
    // `plan` is a server-side additional field (input: true). BetterAuth's
    // generated client type does not surface additional org fields, so pass the
    // payload as a variable (excess-property checks only fire on literals); the
    // server validates and persists it.
    const payload = { name: orgName, slug: orgSlug, plan };
    const created = await authClient.organization.create(payload);
    if (created.error) {
      setError(
        created.error.message ??
          "We could not create your organization. The URL may be taken.",
      );
      setPending(false);
      return;
    }

    await authClient.organization.setActive({
      organizationId: created.data.id,
    });
    router.push(`/${orgSlug}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <Field
          id="org-name"
          label="Organization name"
          type="text"
          name="name"
          required
          placeholder="Acme Rockets"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="org-slug"
              className="text-xs font-medium text-zinc-400"
            >
              Organization URL
            </label>
            {slugHint ? (
              <span className="text-xs font-medium text-amber-400">
                {slugHint}
              </span>
            ) : null}
          </div>
          <div className="flex items-stretch overflow-hidden rounded-md border border-white/10 bg-white/5 focus-within:border-teal-500/50 focus-within:ring-2 focus-within:ring-teal-500/20">
            <span className="flex items-center border-r border-white/10 bg-white/2 px-3 text-sm whitespace-nowrap text-zinc-500">
              app.flagon.io/
            </span>
            <input
              id="org-slug"
              name="slug"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
              placeholder="acme-rockets"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(slugify(e.target.value));
              }}
            />
          </div>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium text-zinc-400">Plan</legend>
        <div role="radiogroup" aria-label="Plan" className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => {
            const hobbyBlocked = p.id === "hobby" && hasHobby;
            return (
              <PlanCard
                key={p.id}
                plan={p}
                bordered
                selected={plan === p.id}
                onSelect={isSelectable(p) ? () => setPlan(p.id) : undefined}
                disabled={hobbyBlocked}
                disabledLabel={hobbyBlocked ? "One per account" : undefined}
                disabledNote={
                  hobbyBlocked
                    ? "You already have a Hobby organization. Choose Pro to create more, or self-host with no limit."
                    : undefined
                }
              />
            );
          })}
        </div>
        <p className="text-xs text-zinc-500">
          {hasHobby
            ? "You already have a Hobby organization (limited to one). Pro is $20/mo and lifts that limit; you'll set up billing right after creating."
            : "Hobby is free and limited to one user. Pro is $20/mo, with team members and no org limit; you'll set up billing right after creating."}{" "}
          {SELF_HOST_NOTE}
        </p>
      </fieldset>

      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        {error ? <FormError>{error}</FormError> : null}
        <button
          type="submit"
          className={submitButtonClass}
          disabled={pending || !plan}
        >
          {pending ? "Creating…" : "Create organization"}
        </button>
      </div>
    </form>
  );
}
