"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Notice, buttonClass, hintClass } from "@/components/form-ui";
import { Input, Label, Select } from "@/ui";
import { submitLead } from "./actions";

const COMPANY_SIZES = ["1-9", "10-49", "50-199", "200-999", "1000+"].map(
  (size) => ({ value: size, label: `${size} people` }),
);

export function ContactSalesForm() {
  const pathname = usePathname();
  const [companySize, setCompanySize] = useState("");
  const [status, setStatus] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const data = new FormData(event.currentTarget);
    setPending(true);
    const result = await submitLead({
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      company: String(data.get("company") ?? ""),
      companySize,
      message: String(data.get("message") ?? ""),
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
      <div className="py-10 text-center">
        <h2 className="text-xl font-semibold text-zinc-100">
          Thanks, we&apos;ll be in touch
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-400">
          Your message is with our team. Expect a reply at the work email you
          provided.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="lead-name">Name *</Label>
          <Input id="lead-name" name="name" autoComplete="name" required />
        </div>
        <div>
          <Label htmlFor="lead-company">Company *</Label>
          <Input
            id="lead-company"
            name="company"
            autoComplete="organization"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="lead-email">Work email *</Label>
          <Input
            id="lead-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </div>
        <div>
          <Label htmlFor="lead-size">Company size</Label>
          <Select
            id="lead-size"
            value={companySize || undefined}
            onValueChange={setCompanySize}
            options={COMPANY_SIZES}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="lead-message">Message</Label>
        <textarea
          id="lead-message"
          name="message"
          rows={5}
          placeholder="Describe your project, needs, and timeline."
          className="mt-1 block w-full rounded-md border border-white/10 bg-white/4 px-3 py-1.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20"
        />
      </div>

      <button type="submit" disabled={pending} className={`w-full ${buttonClass} py-2.5`}>
        {pending ? "Sending..." : "Contact sales"}
      </button>
      <p className={hintClass}>
        We&apos;ll only use this to respond to your inquiry.
      </p>
    </form>
  );
}
