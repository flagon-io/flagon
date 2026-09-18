"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert, Button, Input, Label } from "@flagon-io/ui";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { error: err } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setSubmitting(false);

    if (err) {
      setError(err.message ?? "Couldn't change your password.");
      return;
    }

    setDone(true);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}
      {done && <Alert variant="success">Password updated. Other sessions were signed out.</Alert>}

      <div>
        <Button type="submit" disabled={submitting || !current || !next || !confirm}>
          {submitting ? "Updating..." : "Update password"}
        </Button>
      </div>
    </form>
  );
}
