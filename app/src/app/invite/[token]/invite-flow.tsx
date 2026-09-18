"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Badge, Button, Input, Label } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";
import { AuthCard } from "@/components/auth/auth-card";
import type { InviteLookup } from "@/lib/flagon-api";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;

export function InviteFlow({
  token,
  invite,
  signedIn,
  sessionEmail,
}: {
  token: string;
  invite: InviteLookup;
  signedIn: boolean;
  sessionEmail: string | null;
}) {
  const emailMatches =
    signedIn && sessionEmail?.toLowerCase() === invite.email.toLowerCase();
  const who = invite.inviter ? `${invite.inviter} invited you` : "You've been invited";

  const subtitle = (
    <>
      {who} to join <span className="font-medium text-foreground">{invite.org_name}</span> as{" "}
      <Badge variant="outline" className="capitalize">
        {invite.role}
      </Badge>
    </>
  );

  return (
    <AuthCard title={`Join ${invite.org_name}`} subtitle={subtitle}>
      {signedIn && emailMatches ? (
        <AcceptPanel token={token} orgName={invite.org_name} />
      ) : signedIn ? (
        <MismatchPanel invite={invite} sessionEmail={sessionEmail} />
      ) : (
        <RegisterPanel token={token} invite={invite} />
      )}
    </AuthCard>
  );
}

function AcceptPanel({ token, orgName }: { token: string; orgName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invites/${encodeURIComponent(token)}/accept`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "Could not accept the invitation.");
      return;
    }
    router.push(`/${data.org_slug}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button onClick={accept} disabled={busy} className="w-full">
        {busy ? "Joining..." : `Join ${orgName}`}
      </Button>
    </div>
  );
}

function MismatchPanel({
  invite,
  sessionEmail,
}: {
  invite: InviteLookup;
  sessionEmail: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        This invitation was sent to <span className="font-medium">{invite.email}</span>, but
        you&rsquo;re signed in as <span className="font-medium">{sessionEmail}</span>. Sign out and
        continue with the invited email to accept it.
      </Alert>
      <Button onClick={signOut} disabled={busy} variant="outline" className="w-full">
        {busy ? "Signing out..." : "Sign out"}
      </Button>
    </div>
  );
}

function RegisterPanel({ token, invite }: { token: string; invite: InviteLookup }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usernameValid = username === "" || USERNAME_RE.test(username);
  const passwordsMatch = confirm === "" || password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!USERNAME_RE.test(username)) {
      setError("Username must be 3-30 characters: letters, numbers, hyphens, or underscores.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const res = await fetch(`/api/invites/${encodeURIComponent(token)}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), username: username.trim(), password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitting(false);
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    // Registered, verified, and joined. If sign-in somehow didn't take, send
    // them to log in; otherwise straight into the org.
    if (data.signedIn === false) {
      router.push("/login");
      return;
    }
    router.push(`/${data.org_slug}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" value={invite.email} readOnly disabled />
        <p className="text-xs text-muted-foreground">
          Your invitation verifies this address, so there&rsquo;s no code to enter.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-name">Name</Label>
        <Input
          id="invite-name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-username">Username</Label>
        <Input
          id="invite-username"
          autoComplete="username"
          required
          aria-invalid={!usernameValid || undefined}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <p className={`text-xs ${usernameValid ? "text-muted-foreground" : "text-destructive"}`}>
          Letters, numbers, hyphens, or underscores. 3-30 characters.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-password">Password</Label>
        <Input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-confirm">Confirm password</Label>
        <Input
          id="invite-confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={!passwordsMatch || undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {!passwordsMatch && <p className="text-xs text-destructive">Passwords don&rsquo;t match.</p>}
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Button type="submit" disabled={submitting} className="mt-1 w-full">
        {submitting ? "Creating account..." : `Join ${invite.org_name}`}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-link underline">
          Log in
        </Link>{" "}
        with {invite.email}, then reopen this link.
      </p>
    </form>
  );
}
