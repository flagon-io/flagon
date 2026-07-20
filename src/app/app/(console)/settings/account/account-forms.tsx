"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { brand } from "@/lib/brand";
import { marketingHref } from "@/lib/urls";
import { USERNAME_HINT, isValidUsername } from "@/lib/username";
import {
  Notice,
  buttonClass,
  dangerButtonClass,
  hintClass,
  inputClass,
  labelClass,
} from "@/components/form-ui";

type Status = { tone: "success" | "error"; message: string } | null;

export function UsernameForm({ current }: { current: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const username = String(
      new FormData(event.currentTarget).get("username") ?? "",
    ).trim();

    if (!isValidUsername(username)) {
      setStatus({ tone: "error", message: USERNAME_HINT });
      return;
    }
    if (username.toLowerCase() === current.toLowerCase()) {
      setStatus({ tone: "error", message: "That is already your username." });
      return;
    }

    setPending(true);
    const { error } = await authClient.updateUser({ username });
    setPending(false);

    if (error) {
      setStatus({
        tone: "error",
        message: error.message ?? "Something went wrong. Please try again.",
      });
      return;
    }
    setStatus({ tone: "success", message: `You are now ${username}.` });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-4">
      {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}
      <div>
        <label htmlFor="username" className={labelClass}>
          Username
        </label>
        <input
          id="username"
          name="username"
          defaultValue={current}
          required
          className={inputClass}
        />
        <p className={hintClass}>{USERNAME_HINT}</p>
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Updating..." : "Change username"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("current") ?? "");
    const newPassword = String(data.get("new") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    const revokeOtherSessions = data.get("revoke") === "on";

    if (newPassword.length < 8) {
      setStatus({
        tone: "error",
        message: "Password should be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirm) {
      setStatus({ tone: "error", message: "Passwords don't match." });
      return;
    }

    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions,
    });
    setPending(false);

    if (error) {
      setStatus({
        tone: "error",
        message: error.message ?? "Something went wrong. Please try again.",
      });
      return;
    }
    form.reset();
    setStatus({ tone: "success", message: "Password updated." });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-4">
      {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}
      <div>
        <label htmlFor="current" className={labelClass}>
          Old password
        </label>
        <input
          id="current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="new" className={labelClass}>
          New password
        </label>
        <input
          id="new"
          name="new"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="confirm" className={labelClass}>
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-400">
        <input
          type="checkbox"
          name="revoke"
          defaultChecked
          className="h-4 w-4 rounded border-white/20 bg-white/4 accent-teal-500"
        />
        Sign out of all other sessions
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}

export function DangerZone({ username }: { username: string }) {
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const data = new FormData(event.currentTarget);
    const confirmation = String(data.get("confirmation") ?? "").trim();
    const password = String(data.get("password") ?? "");

    if (confirmation !== username) {
      setStatus({
        tone: "error",
        message: `Type your username (${username}) exactly to confirm.`,
      });
      return;
    }

    setPending(true);
    const { error } = await authClient.deleteUser({ password });

    if (error) {
      setPending(false);
      setStatus({
        tone: "error",
        message: error.message ?? "Something went wrong. Please try again.",
      });
      return;
    }
    // Account is gone; leave the app surface entirely.
    window.location.href = marketingHref("/");
  }

  return (
    <div className="mt-6 max-w-md">
      <p className="text-sm leading-6 text-zinc-400">
        Once you delete your account, there is no going back. All of your data
        will be permanently removed from {brand.name}. Please be certain.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}
        <div>
          <label htmlFor="confirmation" className={labelClass}>
            To confirm, type your username: <b>{username}</b>
          </label>
          <input
            id="confirmation"
            name="confirmation"
            autoComplete="off"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="delete-password" className={labelClass}>
            Confirm your password
          </label>
          <input
            id="delete-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Deleting account..." : "Delete this account"}
        </button>
      </form>
    </div>
  );
}
