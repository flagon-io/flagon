"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { Field } from "@/components/field";
import { FormError, FormNotice } from "@/components/form-error";
import { SettingsFooter } from "@/components/settings/section";
import { isReserved } from "@/lib/reserved";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,37}[a-z0-9])?$/i;

/**
 * Edit name and username. Username shape is validated locally; whether a new
 * username is taken is decided on save from the server's response (no live
 * availability probe, so usernames can't be enumerated here either).
 */
export function ProfileForm({
  initialName,
  initialUsername,
}: {
  initialName: string;
  initialUsername: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const uname = username.trim();
  const usernameChanged =
    uname.toLowerCase() !== initialUsername.trim().toLowerCase();
  const formatHint =
    usernameChanged && uname.length >= 3 && (!USERNAME_RE.test(uname) || isReserved(uname))
      ? "Letters, numbers, and single hyphens, and not reserved."
      : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Your name cannot be empty.");
      return;
    }
    if (usernameChanged && (!USERNAME_RE.test(uname) || isReserved(uname))) {
      setError("That username is not allowed.");
      return;
    }

    setPending(true);
    const body: { name: string; username?: string; displayUsername?: string } =
      { name: trimmedName };
    if (usernameChanged) {
      body.username = uname.toLowerCase();
      body.displayUsername = uname;
    }
    const { error } = await authClient.updateUser(body);
    setPending(false);

    if (error) {
      setError(error.message ?? "Could not save your profile.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex max-w-md flex-col gap-4">
        <Field
          id="name"
          label="Name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        <Field
          id="username"
          label="Username"
          name="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          aria-invalid={formatHint !== null}
          aside={
            formatHint ? (
              <span className="text-xs font-medium text-amber-400">
                {formatHint}
              </span>
            ) : null
          }
        />

        {error ? <FormError>{error}</FormError> : null}
        {saved ? <FormNotice>Profile saved.</FormNotice> : null}
      </div>

      <SettingsFooter>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </SettingsFooter>
    </form>
  );
}
