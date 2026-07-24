"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Notice, buttonClass, hintClass } from "@/components/form-ui";
import { Input, Label } from "@/ui";
import { joinWaitlist } from "./actions";

export function WaitlistForm() {
  const pathname = usePathname();
  const [status, setStatus] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const data = new FormData(event.currentTarget);
    setPending(true);
    const result = await joinWaitlist({
      email: String(data.get("email") ?? ""),
      company: String(data.get("company") ?? ""),
      source: pathname,
    });
    setPending(false);

    if (!result.ok) {
      setStatus({ tone: "error", message: result.message });
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="py-8 text-center">
        <h2 className="text-lg font-semibold text-zinc-100">
          You&apos;re on the list
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-400">
          We&apos;ll email you when Enterprise is ready.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="waitlist-email">Work email *</Label>
          <Input
            id="waitlist-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </div>
        <div>
          <Label htmlFor="waitlist-company">Company</Label>
          <Input
            id="waitlist-company"
            name="company"
            autoComplete="organization"
            placeholder="Optional"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className={`w-full ${buttonClass} py-2.5`}
      >
        {pending ? "Adding you..." : "Get notified"}
      </button>
      <p className={hintClass}>
        We&apos;ll only use this to tell you when Enterprise launches.
      </p>
    </form>
  );
}
