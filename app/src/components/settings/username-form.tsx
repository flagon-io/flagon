"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";

export function UsernameForm({ current }: { current: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const changed = username.trim() !== current && username.trim().length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setSaving(true);

    const { error: err } = await authClient.updateUser({ username: username.trim() });

    setSaving(false);
    if (err) {
      setError(err.message ?? "That username isn't available.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}
      {done && <Alert variant="success">Username updated.</Alert>}

      <Button type="submit" disabled={!changed || saving}>
        {saving ? "Saving..." : "Change username"}
      </Button>
    </form>
  );
}
