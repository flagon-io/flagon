"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button } from "@flagon/design";
import { archiveFlagAction } from "../actions";

/**
 * The banner shown atop an archived flag. Archived flags keep evaluating but are
 * locked for editing, so the whole detail page reads as archived and points the
 * one available action (Restore) here.
 */
export function ArchivedNotice({ slug, flagKey }: { slug: string; flagKey: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function restore() {
    start(async () => {
      const res = await archiveFlagAction(slug, flagKey, "restore");
      if (!res.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <Archive className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/90" />
        <div>
          <p className="text-sm font-medium text-amber-200/90">This flag is archived</p>
          <p className="text-sm text-amber-200/60">
            It still evaluates for code that references it, but its configuration is
            locked. Restore it to make changes.
          </p>
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={restore}
        disabled={pending}
        className="shrink-0"
      >
        {pending ? "Restoring…" : "Restore flag"}
      </Button>
    </div>
  );
}
