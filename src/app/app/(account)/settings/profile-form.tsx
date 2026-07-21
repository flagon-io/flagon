"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { brand } from "@/lib/brand";
import {
  Notice,
  buttonClass,
  hintClass,
  inputClass,
  labelClass,
} from "@/components/form-ui";

/** Profile fields that exist today (name) plus disabled placeholders for the
 * fields that make sense for Flagon later (bio, URL, company, location). */
export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const name = String(
      new FormData(event.currentTarget).get("name") ?? "",
    ).trim();
    if (!name) {
      setStatus({ tone: "error", message: "Name can't be empty." });
      return;
    }

    setPending(true);
    const { error } = await authClient.updateUser({ name });
    setPending(false);

    if (error) {
      setStatus({
        tone: "error",
        message: error.message ?? "Something went wrong. Please try again.",
      });
      return;
    }
    setStatus({ tone: "success", message: "Profile updated." });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-5">
      {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}

      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={initialName}
          required
          className={inputClass}
        />
        <p className={hintClass}>
          Your name may appear around {brand.name} where you contribute or are
          mentioned.
        </p>
      </div>

      <div>
        <label htmlFor="bio" className={labelClass}>
          Bio
        </label>
        <textarea
          id="bio"
          disabled
          rows={3}
          placeholder="Coming soon"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="url" className={labelClass}>
          URL
        </label>
        <input
          id="url"
          disabled
          placeholder="Coming soon"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="company" className={labelClass}>
            Company
          </label>
          <input
            id="company"
            disabled
            placeholder="Coming soon"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="location" className={labelClass}>
            Location
          </label>
          <input
            id="location"
            disabled
            placeholder="Coming soon"
            className={inputClass}
          />
        </div>
      </div>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving..." : "Update profile"}
      </button>
    </form>
  );
}
