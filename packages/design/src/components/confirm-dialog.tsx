"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./modal";
import { Button } from "./button";

/**
 * The house confirmation dialog — the replacement for window.confirm(), so a
 * destructive or important action gets a real, on-brand modal instead of a raw
 * browser prompt. Use the `useConfirm` hook for the ergonomic promise-based flow:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   // ...
 *   onClick={async () => {
 *     if (await confirm({ title: "Delete metric?", message: "…", tone: "danger",
 *                         confirmLabel: "Delete" })) {
 *       await reallyDelete();
 *     }
 *   }}
 *   // render {confirmDialog} once in the component tree.
 *
 * The promise resolves true on confirm, false on cancel/escape/overlay-click.
 */
export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' (default) styles the confirm button as destructive; 'primary' is neutral. */
  tone?: "danger" | "primary";
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
  pending = false,
}: ConfirmOptions & {
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  return (
    <Modal onClose={onCancel} size="sm">
      <ModalHeader title={title} onClose={onCancel} />
      {message ? (
        <ModalBody>
          <div className="text-sm text-zinc-400">{message}</div>
        </ModalBody>
      ) : null}
      <ModalFooter>
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={pending}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

type PendingConfirm = ConfirmOptions & { resolve: (ok: boolean) => void };

/**
 * Imperative confirm(): returns a function that opens the dialog and resolves to
 * the user's choice, plus the dialog node to render. One hook instance drives one
 * dialog at a time (a second call replaces the first, resolving it false).
 */
export function useConfirm() {
  const [state, setState] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState((prev) => {
        prev?.resolve(false); // a superseded prompt resolves as cancelled
        return { ...options, resolve };
      });
    });
  }, []);

  const settle = useCallback(
    (ok: boolean) =>
      setState((prev) => {
        prev?.resolve(ok);
        return null;
      }),
    [],
  );

  const confirmDialog = state ? (
    <ConfirmDialog
      {...state}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
