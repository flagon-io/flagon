"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, History, MoreHorizontal, Trash2 } from "lucide-react";
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@flagon/design";
import { archiveFlagAction, deleteFlagAction } from "../actions";
import type { FlagRevision } from "@/lib/flags-api";

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

const REVISION_LABEL: Record<string, string> = {
  created: "Created flag",
  updated: "Updated flag",
  archived: "Archived flag",
  restore: "Restored flag",
  environment_updated: "Updated environment",
  rule_created: "Added a rule",
  rule_updated: "Updated a rule",
  rule_deleted: "Removed a rule",
  rules_reordered: "Reordered rules",
  rules_updated: "Updated targeting rules",
  variant_added: "Added a variant",
  variant_removed: "Removed a variant",
};

export function FlagActions({
  slug,
  flagKey,
  archived,
  revisions = [],
  afterDeleteHref,
  canManage = true,
}: {
  slug: string;
  flagKey: string;
  archived: boolean;
  revisions?: FlagRevision[];
  /** Where to go after a permanent delete. Defaults to the active flags list. */
  afterDeleteHref?: string;
  /** Only owners/admins may permanently delete a flag (matches the API gate). */
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  function archive(action: "archive" | "restore") {
    start(async () => {
      const res = await archiveFlagAction(slug, flagKey, action);
      if (!res.error) router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await deleteFlagAction(slug, flagKey);
      if (!res.error) router.push(afterDeleteHref ?? `/${slug}/flags`);
    });
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label="Flag actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={() => setShowHistory(true)}>
            <History className="h-4 w-4" /> Version history
          </MenuItem>
          <MenuItem onSelect={() => archive(archived ? "restore" : "archive")}>
            {archived ? (
              <>
                <ArchiveRestore className="h-4 w-4" /> Restore flag
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" /> Archive flag
              </>
            )}
          </MenuItem>
          {canManage ? (
            <>
              <MenuSeparator />
              <MenuItem
                onSelect={() => setConfirmDelete(true)}
                className="text-red-400 data-[highlighted]:text-red-300"
              >
                <Trash2 className="h-4 w-4" /> Delete flag
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>

      {showHistory ? (
        <Modal onClose={() => setShowHistory(false)} size="md">
          <ModalHeader title="Version history" onClose={() => setShowHistory(false)} />
          <ModalBody>
            {revisions.length === 0 ? (
              <p className="text-sm text-zinc-500">No history yet.</p>
            ) : (
              <ol className="flex flex-col">
                {revisions.map((r, i) => (
                  <li
                    key={r.id}
                    className={`flex flex-col gap-1 py-3 ${
                      i > 0 ? "border-t border-white/8" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-zinc-200">
                        {r.summary || REVISION_LABEL[r.action] || r.action}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-600">
                        {relativeTime(r.createdAt)}
                      </span>
                    </div>
                    {r.changes.length > 0 ? (
                      <ul className="flex flex-col gap-0.5 border-l border-white/10 pl-2.5">
                        {r.changes.map((change, j) => (
                          <li key={j} className="text-xs text-zinc-500">
                            {change}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <span className="text-xs text-zinc-600">{r.userName || "System"}</span>
                  </li>
                ))}
              </ol>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setShowHistory(false)}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <Modal onClose={() => setConfirmDelete(false)} size="sm">
          <ModalHeader title="Delete flag" onClose={() => setConfirmDelete(false)} />
          <ModalBody>
            <p className="text-sm text-zinc-400">
              This permanently deletes{" "}
              <code className="font-mono text-zinc-200">{flagKey}</code> and all of its
              variants, environment config, and targeting rules. This cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={pending}>
              {pending ? "Deleting…" : "Delete flag"}
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}
