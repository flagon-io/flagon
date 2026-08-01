"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { Field } from "@/components/field";
import { FormError, FormNotice } from "@/components/form-error";
import { SettingsFooter } from "@/components/settings/section";

export function ChangePasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("current") ?? "");
    const newPassword = String(data.get("new") ?? "");
    const confirm = String(data.get("confirm") ?? "");

    if (newPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Those passwords do not match.");
      return;
    }

    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);

    if (error) {
      setError(error.message ?? "Could not change your password.");
      return;
    }
    setSaved(true);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex max-w-md flex-col gap-4">
        <Field
          id="current"
          label="Current password"
          name="current"
          type="password"
          required
          autoComplete="current-password"
        />
        <Field
          id="new"
          label="New password"
          name="new"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Field
          id="confirm"
          label="Confirm new password"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />

        {error ? <FormError>{error}</FormError> : null}
        {saved ? (
          <FormNotice>Password changed. Other sessions were signed out.</FormNotice>
        ) : null}
      </div>

      <SettingsFooter>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </SettingsFooter>
    </form>
  );
}
