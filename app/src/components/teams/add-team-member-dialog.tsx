"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from "@flagon-io/ui";
import type { TeamRole } from "@/lib/api/types";
import { errorMessage } from "@/lib/client-fetch";
import { RoleSelect, TEAM_ROLE_OPTIONS } from "./team-shared";

export function AddTeamMemberDialog({
  open,
  onOpenChange,
  base,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: string;
  onAdded: () => Promise<void>;
}) {
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = login.trim();
    if (!value) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`${base}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: value, role }),
    });
    setAdding(false);
    if (!res.ok) {
      setError(await errorMessage(res, "Couldn't add that member."));
      return;
    }
    setLogin("");
    setRole("member");
    onOpenChange(false);
    await onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription className="mt-1.5">
              Add an existing organization member to this team.
            </DialogDescription>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tm-login">Email or username</Label>
            <Input
              id="tm-login"
              autoFocus
              placeholder="person@example.com"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tm-role">Role</Label>
            <RoleSelect
              id="tm-role"
              roles={TEAM_ROLE_OPTIONS}
              value={role}
              onChange={(r) => setRole(r as TeamRole)}
            />
            <p className="text-xs text-muted-foreground">
              {TEAM_ROLE_OPTIONS.find((r) => r.value === role)?.hint}
            </p>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={adding || !login.trim()}>
              {adding ? "Adding..." : "Add member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
