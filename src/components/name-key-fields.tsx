"use client";
import { useState } from "react";
import { suggestFlagKey } from "@/lib/flags";
import { Field, Input } from "./form-controls";
export function NameKeyFields({
  namePlaceholder,
  keyPlaceholder,
  keyLabel = "Key",
  keyHint = "Generated from the name. Edit it to use a custom key.",
}: {
  namePlaceholder: string;
  keyPlaceholder: string;
  keyLabel?: string;
  keyHint?: string;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [customKey, setCustomKey] = useState(false);
  return (
    <>
      <Field label="Name" hint="A human-readable name for your team.">
        <Input
          name="name"
          required
          maxLength={100}
          autoFocus
          /* This names a FLAG, a project, a team - never a person. The field
             is called "name" because that is the server contract, and the
             browser reads that as a contact-card field and offers to fill in
             whoever is signed in. The data-* attributes are what 1Password and
             LastPass look for; they ignore autocomplete entirely. */
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          spellCheck={false}
          value={name}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            if (!customKey) setKey(suggestFlagKey(next));
          }}
          placeholder={namePlaceholder}
        />
      </Field>
      <Field label={keyLabel} hint={keyHint}>
        <Input
          name="key"
          required
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          spellCheck={
            false
          } /* The hyphen MUST be escaped: browsers compile the pattern attribute as a
   `v`-mode regex, where `-` is a reserved character class syntax character
   even in trailing position. Unescaped, the pattern fails to compile and the
   browser silently drops constraint validation altogether, so a malformed key
   reaches the server with no client-side complaint at all. */
          pattern="[a-z][a-z0-9._\-]{0,127}"
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            setCustomKey(true);
          }}
          placeholder={keyPlaceholder}
          className="font-mono"
        />
      </Field>
    </>
  );
}
