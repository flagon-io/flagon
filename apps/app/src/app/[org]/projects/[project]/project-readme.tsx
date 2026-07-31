"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookText, Pencil } from "lucide-react";
import { Button, SegmentedControl, Textarea } from "@flagon/design";
import { Markdown } from "@/components/markdown";
import { updateProjectAction } from "../actions";

/**
 * The project README, GitHub-repository style: a rendered Markdown card that is
 * the centerpiece of the project. Managers can edit it inline with Write/Preview
 * tabs. Manually managed today; it will sync from a linked repository later.
 */
export function ProjectReadme({
  slug,
  projectKey,
  projectName,
  readme,
  canManage,
}: {
  slug: string;
  projectKey: string;
  projectName: string;
  readme: string | null;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ReadmeEditor
        slug={slug}
        projectKey={projectKey}
        initial={readme ?? `# ${projectName}\n\n`}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-white/2">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <BookText className="size-4 text-zinc-500" />
          <span className="font-mono text-xs">README.md</span>
        </div>
        {canManage ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        ) : null}
      </div>
      <div className="px-5 py-4">
        {readme && readme.trim() ? (
          <Markdown>{readme}</Markdown>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="grid size-10 place-items-center rounded-lg bg-white/5 text-zinc-400">
              <BookText className="size-5" />
            </span>
            <p className="text-sm text-zinc-400">No README yet.</p>
            {canManage ? (
              <>
                <p className="max-w-sm text-sm text-zinc-500">
                  Add a README to tell people what this project is, how it works, and
                  who to talk to.
                </p>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  Add a README
                </Button>
              </>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function ReadmeEditor({
  slug,
  projectKey,
  initial,
  onDone,
}: {
  slug: string;
  projectKey: string;
  initial: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState("write");
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    start(async () => {
      const res = await updateProjectAction(slug, projectKey, {
        readme: value.trim() ? value : null,
      });
      if (res.error) return setError(res.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-white/2">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <BookText className="size-4 text-zinc-500" />
          <span className="font-mono text-xs">README.md</span>
        </div>
        <div className="w-48">
          <SegmentedControl
            size="sm"
            ariaLabel="Edit mode"
            value={tab}
            onValueChange={setTab}
            options={[
              { value: "write", label: "Write" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </div>
      </div>

      <div className="px-5 py-4">
        {tab === "write" ? (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={16}
            autoFocus
            spellCheck={false}
            placeholder="# My project&#10;&#10;What it does, how to run it, who owns it."
            className="font-mono text-sm/relaxed"
          />
        ) : value.trim() ? (
          <Markdown>{value}</Markdown>
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">Nothing to preview yet.</p>
        )}
        <p className="mt-2 text-xs text-zinc-600">
          Markdown with GitHub-flavored extensions (tables, task lists). Links open
          in a new tab.
        </p>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-white/8 px-4 py-3">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save README"}
        </Button>
      </div>
    </section>
  );
}
