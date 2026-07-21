"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings, X } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/form-controls";
import { Modal } from "@/components/modal";
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_TOPICS_MAX,
  PROJECT_TOPIC_HINT,
  parseTopics,
} from "@/lib/projects";

/**
 * The About rail's edit dialog: description, website, topics.
 *
 * Modelled on the repository details dialog people already know, and opened
 * from the gear on the rail rather than living on the Settings tab, because
 * these three fields are the rail - editing them anywhere else means leaving
 * the thing you are editing to go find a form.
 */
export function ProjectDetailsDialog({
  description: initialDescription,
  website: initialWebsite,
  topics: initialTopics,
  save,
}: {
  description: string;
  website: string;
  topics: string[];
  save: (input: {
    description: string;
    website: string;
    topics: string[];
  }) => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(initialDescription);
  const [website, setWebsite] = useState(initialWebsite);
  const [topics, setTopics] = useState<string[]>(initialTopics);
  // Held separately from `topics` so a half-typed word is never a topic yet,
  // and so backspacing out of an empty box can reach the chip before it.
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const commitDraft = (value: string) => {
    const parsed = parseTopics(value).filter(
      (topic) => !topics.includes(topic),
    );
    if (parsed.length) setTopics((current) => [...current, ...parsed]);
    setDraft("");
  };

  const onTopicKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Space and comma end a topic, the way they do everywhere topics are typed.
    if (event.key === "Enter" || event.key === " " || event.key === ",") {
      event.preventDefault();
      if (draft.trim()) commitDraft(draft);
      return;
    }
    if (event.key === "Backspace" && !draft && topics.length) {
      setTopics((current) => current.slice(0, -1));
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // A topic typed but never separated is still a topic the person meant.
    const pendingTopics = draft.trim()
      ? [...topics, ...parseTopics(draft).filter((t) => !topics.includes(t))]
      : topics;
    start(async () => {
      const result = await save({
        description,
        website,
        topics: pendingTopics,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      setTopics(pendingTopics);
      setDraft("");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Edit project details"
      description="How this project introduces itself in lists and on its overview."
      trigger={
        <button
          type="button"
          aria-label="Edit project details"
          className="cursor-pointer text-zinc-600 transition hover:text-zinc-300"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      }
    >
      <form onSubmit={submit} className="grid gap-5">
        <Field
          label="Description"
          hint={`One line, for someone scanning a list. ${PROJECT_DESCRIPTION_MAX_LENGTH - description.length} characters left.`}
        >
          <Textarea
            value={description}
            maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this project is for."
            className="min-h-20"
          />
        </Field>

        <Field label="Website" hint="Docs, a dashboard, wherever this lives.">
          <Input
            value={website}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="https://flagon.io"
          />
        </Field>

        <Field
          label="Topics"
          hint={`${PROJECT_TOPIC_HINT} Up to ${PROJECT_TOPICS_MAX}; space or comma to add.`}
        >
          <div className="flex flex-wrap items-center gap-1.5 border border-white/10 bg-black/20 p-2">
            {topics.map((topic) => (
              <span
                key={topic}
                className="inline-flex items-center gap-1 rounded-full border border-teal-400/20 bg-teal-400/10 py-0.5 pl-2.5 pr-1 text-xs text-teal-300"
              >
                {topic}
                <button
                  type="button"
                  aria-label={`Remove topic ${topic}`}
                  onClick={() =>
                    setTopics((current) =>
                      current.filter((item) => item !== topic),
                    )
                  }
                  className="cursor-pointer rounded-full p-0.5 text-teal-300/70 transition hover:bg-teal-400/20 hover:text-teal-200"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onTopicKeyDown}
              onBlur={() => draft.trim() && commitDraft(draft)}
              aria-label="Add a topic"
              autoComplete="off"
              spellCheck={false}
              placeholder={topics.length ? "" : "platform  flags"}
              className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </div>
        </Field>

        {error ? (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
