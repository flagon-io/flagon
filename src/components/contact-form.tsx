"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { cn } from "@/lib/cn";
import { TOPICS, type TopicId } from "@/lib/contact";
import { BUDGETS, OFFERS, TIMELINES } from "@/lib/work";

/**
 * The contact form. There's no inbox behind it yet, so submitting composes an
 * email to us with everything filled in and hands it to the visitor's mail
 * app. The fields, labels, and validation are the real thing; when the backend
 * lands, only `send` changes.
 *
 * The topic picker swaps in the fields that topic needs (a project gets
 * budget and timeline) and keeps ?topic= in the URL so the page can be linked
 * to with a topic already chosen.
 */
export function ContactForm({ email, initialTopic }: { email: string; initialTopic: TopicId }) {
  const id = useId();
  const [topicId, setTopicId] = useState<TopicId>(initialTopic);
  const [sent, setSent] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];
  const isProject = topic.id === "project";

  // Move focus to the confirmation so keyboard and screen reader users land
  // on it, not on <body>, once the submit button is hidden.
  useEffect(() => {
    if (sent) sentHeading.current?.focus();
  }, [sent]);

  function pick(next: TopicId) {
    setTopicId(next);
    try {
      const url = new URL(window.location.href);
      if (next === "general") url.searchParams.delete("topic");
      else url.searchParams.set("topic", next);
      window.history.replaceState(null, "", url);
    } catch {
      /* the picker still works without the URL in sync */
    }
  }

  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();

    const name = get("name");
    const company = get("company");
    const subject = `${topic.subject}: ${company || name}`;
    const body = [
      `Name: ${name}`,
      `Email: ${get("email")}`,
      company ? `Company: ${company}` : null,
      isProject ? `Looking for: ${get("offer")}` : null,
      isProject ? `Budget: ${get("budget")}` : null,
      isProject ? `Timeline: ${get("timeline")}` : null,
      "",
      get("message"),
    ]
      .filter((l) => l !== null)
      // mailto bodies use CRLF line breaks (RFC 6068).
      .join("\r\n");

    setSent({ subject, body });
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function copy() {
    if (!sent) return;
    try {
      await navigator.clipboard.writeText(`To: ${email}\nSubject: ${sent.subject}\n\n${sent.body.replace(/\r\n/g, "\n")}`);
      setCopied(true);
    } catch {
      /* clipboard can be blocked; the address is on screen either way */
    }
  }

  return (
    <>
      {sent && (
        <div className="rounded-xl border border-hairline bg-panel p-6 sm:p-8" role="status">
          <Mail className="h-6 w-6 text-brand" strokeWidth={1.75} />
          <h2
            ref={sentHeading}
            tabIndex={-1}
            className="mt-4 text-lg font-semibold tracking-tight outline-none"
          >
            Your email is ready to send
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We opened your mail app with everything filled in; just hit send. If
            nothing opened, copy it and send it to{" "}
            <a href={`mailto:${email}`} className="text-link underline underline-offset-2">
              {email}
            </a>
            .
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy message"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSent(null);
                setCopied(false);
              }}
            >
              Edit details
            </Button>
          </div>
        </div>
      )}

      {/* Kept mounted (just hidden) while the confirmation shows, so "Edit
          details" brings back everything that was typed. */}
      <form onSubmit={send} hidden={!!sent} className="grid gap-8">
        <fieldset>
          <legend className="text-sm font-medium">What&rsquo;s this about?</legend>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TOPICS.map((t) => (
              <label
                key={t.id}
                className={cn(
                  "relative flex cursor-pointer flex-col rounded-lg border p-4 transition",
                  "has-focus-visible:ring-2 has-focus-visible:ring-brand has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background",
                  t.id === topic.id
                    ? "border-brand bg-brand/[0.06]"
                    : "border-hairline hover:border-input hover:bg-panel",
                )}
              >
                <input
                  type="radio"
                  name="topic"
                  value={t.id}
                  checked={t.id === topic.id}
                  onChange={() => pick(t.id)}
                  className="sr-only"
                />
                <span className="pr-5 text-sm font-semibold tracking-tight">{t.label}</span>
                <span className="mt-1 text-xs leading-snug text-muted-foreground">{t.hint}</span>
                {t.id === topic.id && (
                  <Check className="absolute right-3 top-3 h-4 w-4 text-brand" strokeWidth={2.25} />
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name" htmlFor={`${id}-name`}>
            <input id={`${id}-name`} name="name" required autoComplete="name" className={control} />
          </Field>
          <Field label="Email" htmlFor={`${id}-email`}>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              required
              autoComplete="email"
              className={control}
            />
          </Field>
          <Field
            label={topic.id === "press" ? "Publication" : "Company"}
            htmlFor={`${id}-company`}
            optional={topic.id !== "press"}
            className={isProject ? undefined : "sm:col-span-2"}
          >
            <input
              id={`${id}-company`}
              name="company"
              required={topic.id === "press"}
              autoComplete="organization"
              className={control}
            />
          </Field>

          {isProject && (
            <>
              <Field label="What you're looking for" htmlFor={`${id}-offer`}>
                <Select
                  id={`${id}-offer`}
                  name="offer"
                  options={[...OFFERS.map((o) => o.title), "Something else"]}
                />
              </Field>
              <Field label="Total budget" htmlFor={`${id}-budget`}>
                <Select id={`${id}-budget`} name="budget" options={BUDGETS} defaultValue="Not sure yet" />
              </Field>
              <Field label="Timeline" htmlFor={`${id}-timeline`}>
                <Select id={`${id}-timeline`} name="timeline" options={TIMELINES} />
              </Field>
            </>
          )}

          <Field
            label={isProject ? "What are you building?" : "Message"}
            htmlFor={`${id}-message`}
            className="sm:col-span-2"
          >
            <textarea
              id={`${id}-message`}
              name="message"
              required
              maxLength={1500}
              rows={6}
              placeholder={topic.placeholder}
              className={cn(control, "h-auto resize-y py-2.5")}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-subtle">
            Opens your email app with this filled in. Prefer plain email?{" "}
            <a href={`mailto:${email}`} className="text-link underline underline-offset-2">
              {email}
            </a>
          </p>
          <Button type="submit" className="shrink-0">
            {isProject ? "Send project details" : "Send message"}
          </Button>
        </div>
      </form>
    </>
  );
}

const control =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-subtle focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30";

function Field({
  label,
  htmlFor,
  optional,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {optional && <span className="ml-1.5 font-normal text-subtle">optional</span>}
      </label>
      {children}
    </div>
  );
}
