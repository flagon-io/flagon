"use client";

import { useState, useTransition } from "react";
import { SegmentedControl, toast } from "@flagon/design";
import { updateProjectCreationPolicyAction } from "./actions";

type Policy = "managers" | "members";

const OPTIONS = [
  { value: "managers", label: "Owners & admins" },
  { value: "members", label: "All members" },
];

/**
 * Org base permission for who may create projects (GitHub-style). Owners/admins
 * always can; this widens it to any member. Saves on change; reverts on error.
 * Members see the current setting read-only.
 */
export function ProjectCreationForm({
  slug,
  initialPolicy,
  canManage,
}: {
  slug: string;
  initialPolicy: string;
  canManage: boolean;
}) {
  const [policy, setPolicy] = useState<Policy>(
    initialPolicy === "members" ? "members" : "managers",
  );
  const [pending, start] = useTransition();

  function change(next: string) {
    if (!canManage || next === policy) return;
    const previous = policy;
    const value = next as Policy;
    setPolicy(value);
    start(async () => {
      const res = await updateProjectCreationPolicyAction(slug, value);
      if (res.error) {
        setPolicy(previous);
        toast.error("Couldn't update project creation", res.error);
      } else {
        toast.success("Project creation updated");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        value={policy}
        onValueChange={change}
        options={OPTIONS}
        ariaLabel="Who can create projects"
        className={
          !canManage || pending ? "pointer-events-none opacity-70" : undefined
        }
      />
      <p className="text-xs text-zinc-500">
        {policy === "members"
          ? "Any member of this organization can create projects."
          : "Only owners and admins can create projects."}
      </p>
    </div>
  );
}
