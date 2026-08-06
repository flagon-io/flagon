"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { Field } from "@/components/field";
import { FormError, FormNotice } from "@/components/form-error";
import { SettingsFooter } from "@/components/settings/section";
import { USERNAME_MIN, validateUsername } from "@/lib/username";

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
  // Stays quiet until there is enough typed to judge, then names the actual rule
  // that failed rather than reciting all of them.
  const formatHint =
    usernameChanged && uname.length >= USERNAME_MIN ? validateUsername(uname) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Your name cannot be empty.");
      return;
    }
    const usernameProblem = usernameChanged ? validateUsername(uname) : null;
    if (usernameProblem) {
      setError(usernameProblem);
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
