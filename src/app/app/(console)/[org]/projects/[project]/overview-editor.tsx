"use client";
import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Pencil } from "lucide-react";
import { Button, Textarea } from "@/components/form-controls";

export function OverviewEditor({
  initial,
  canEdit,
  save,
}: {
  initial: string;
  canEdit: boolean;
  save: (markdown: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [markdown, setMarkdown] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (!editing)
    return (
      <section className="border border-white/10 bg-white/[0.02]">
        <div className="flex items-center border-b border-white/10 px-5 py-3">
          <BookOpen className="mr-2 h-4 w-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-200">Overview</h2>
          {canEdit ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
              className="ml-auto gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          ) : null}
        </div>
        <div className="p-5">
          {markdown ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdown}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-zinc-400">
                Tell people what this project does.
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Document purpose, architecture, runbooks, and useful links with
                Markdown.
              </p>
              {canEdit ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="mt-4"
                >
                  Write overview
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </section>
    );
  return (
    <section className="border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-1 border-b border-white/10 px-4 py-2">
        <button
          type="button"
          onClick={() => setPreview(false)}
          className={`cursor-pointer rounded px-3 py-1.5 text-xs ${!preview ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className={`cursor-pointer rounded px-3 py-1.5 text-xs ${preview ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          Preview
        </button>
        <span className="ml-auto text-xs text-zinc-600">
          Markdown · {markdown.length.toLocaleString()} / 100,000
        </span>
      </div>
      <div className="min-h-72 p-4">
        {preview ? (
          markdown ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdown}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-zinc-600">
              Nothing to preview.
            </p>
          )
        ) : (
          <Textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            maxLength={100000}
            autoFocus
            className="min-h-64 resize-y border-0 bg-transparent font-mono text-sm leading-6 focus:ring-0"
            placeholder={
              "# Project name\n\nWhat this project does, who it serves, and where to learn more…"
            }
          />
        )}
      </div>
      {error ? <p className="px-4 pb-2 text-xs text-red-400">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-white/10 bg-black/15 px-4 py-3">
        <Button
          variant="secondary"
          onClick={() => {
            setMarkdown(initial);
            setEditing(false);
            setError("");
          }}
        >
          Cancel
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await save(markdown);
              if (result.ok) {
                setEditing(false);
                setError("");
              } else setError(result.message);
            })
          }
        >
          {pending ? "Saving…" : "Save overview"}
        </Button>
      </div>
    </section>
  );
}
