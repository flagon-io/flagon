"use client";

import { appPath } from "@/lib/urls";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEAM_NAME_HINT } from "@/lib/teams";
import {
  Notice,
  buttonClass,
  hintClass,
  subtleButtonClass,
} from "@/components/form-ui";
import { Input, Label } from "@/ui";
import { createTeamAction } from "./actions";

/** Team creation form; lands on the new team's page on success. */
export function NewTeamForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await createTeamAction(orgSlug, name);
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }
    router.push(appPath(`/${orgSlug}/teams/${result.teamId}`));
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 border border-white/10 bg-white/2 p-6"
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div>
        <Label htmlFor="team-name">Team name</Label>
        <Input
          id="team-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Platform"
          autoFocus
          required
        />
        <p className={hintClass}>{TEAM_NAME_HINT}</p>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-white/5 pt-5">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Creating..." : "Create team"}
        </button>
        <Link href={appPath(`/${orgSlug}/teams`)} className={subtleButtonClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
