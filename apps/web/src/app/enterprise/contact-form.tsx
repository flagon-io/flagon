"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@flagon/design";
import { CheckCircle2 } from "lucide-react";
import { submitContact } from "@/lib/api";

const TEAM_SIZES = [
  { value: "1-9", label: "1 to 9" },
  { value: "10-49", label: "10 to 49" },
  { value: "50-199", label: "50 to 199" },
  { value: "200-999", label: "200 to 999" },
  { value: "1000+", label: "1000+" },
];

/**
 * The enterprise contact form. Posts to the API's /v1/contact endpoint, which
 * records the inquiry in the leads table for follow-up (a future admin panel
 * reads it). No inbox to babysit; team size is folded into the message so it is
 * captured without a dedicated column.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("sending");
    try {
      const composed = teamSize ? `Team size: ${teamSize}\n\n${message}`.trim() : message.trim();
      const ok = await submitContact({
        email: email.trim(),
        name: name.trim() || undefined,
        company: company.trim() || undefined,
        message: composed || undefined,
      });
      if (!ok) throw new Error("Something went wrong on our end. Please try again.");
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-teal-400/20 bg-teal-400/3 p-8 text-center">
        <CheckCircle2 className="mx-auto size-8 text-teal-400" />
        <h3 className="mt-4 text-lg font-semibold text-zinc-100">Thanks, we have it.</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm/6 text-zinc-400">
          Someone from the team will get back to you soon. In the meantime, you can start
          building on the free plan any time.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-white/10 bg-white/2 p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Robin Vale"
            autoComplete="name"
          />
        </Field>
        <Field label="Company">
          <Input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Your company"
            autoComplete="organization"
          />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Work email">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Team size">
          <Select
            value={teamSize}
            onValueChange={setTeamSize}
            options={TEAM_SIZES}
            placeholder="Select a range"
            ariaLabel="Team size"
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="What are you looking to do?">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Tell us about your team and what you're building."
          />
        </Field>
      </div>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Contact us"}
        </Button>
        <p className="text-xs text-zinc-500">
          We&apos;ll only use this to get back to you about Flagon.
        </p>
      </div>
    </form>
  );
}
