"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Field, Input } from "@/components/form-controls";
import { Modal, ModalActions, ModalClose } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
export function DeleteFlagModal({
  flagKey,
  action,
}: {
  flagKey: string;
  action: (form: FormData) => void | Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const matches = confirmation === flagKey;
  return (
    <Modal
      size="sm"
      title="Delete feature flag?"
      description="This permanently removes the flag and its targeting configuration. Applications evaluating it will receive their code-defined default value."
      trigger={
        <Button variant="danger" className="gap-2">
          <Trash2 className="h-4 w-4" /> Delete flag
        </Button>
      }
    >
      <form action={action}>
        <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-200">
          This action cannot be undone.
        </div>
        <Field
          label={
            <>
              Type <code className="text-zinc-200">{flagKey}</code> to confirm
            </>
          }
          className="mt-4"
        >
          <Input
            name="confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            className="font-mono"
          />
        </Field>
        <ModalActions>
          <ModalClose />
          <SubmitButton
            variant="danger"
            pendingLabel="Deleting…"
            disabled={!matches}
          >
            Delete permanently
          </SubmitButton>
        </ModalActions>
      </form>
    </Modal>
  );
}
