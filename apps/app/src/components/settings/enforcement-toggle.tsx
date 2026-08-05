"use client";

import { type ReactNode, useState, useTransition } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Switch,
  toast,
} from "@flagon/design";

/**
 * A consequential on/off setting: an org-wide enforcement toggle (require 2FA,
 * enforce SSO). Enabling one blocks non-compliant members, so turning it ON goes
 * through a confirm modal with the consequence spelled out; turning it OFF is
 * immediate. Optimistic with revert-on-error, matching the rest of settings.
 */
export function EnforcementToggle({
  label,
  description,
  enabled,
  disabled = false,
  confirm,
  onChange,
}: {
  label: string;
  description: ReactNode;
  enabled: boolean;
  disabled?: boolean;
  confirm: { title: string; body: ReactNode; confirmLabel: string };
  onChange: (next: boolean) => Promise<{ error?: string }>;
}) {
  const [on, setOn] = useState(enabled);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  function commit(next: boolean) {
    const previous = on;
    setOn(next);
    start(async () => {
      const res = await onChange(next);
      if (res.error) {
        setOn(previous);
        toast.error("Couldn't update setting", res.error);
      } else {
        toast.success(next ? `${label} enabled` : `${label} disabled`);
      }
    });
  }

  function requestChange(next: boolean) {
    if (disabled || next === on) return;
    if (next) setConfirming(true);
    else commit(false);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-zinc-100">{label}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
        </div>
        <Switch
          checked={on}
          onCheckedChange={requestChange}
          disabled={disabled || pending}
          ariaLabel={label}
        />
      </div>

      {confirming ? (
        <Modal onClose={() => setConfirming(false)}>
          <ModalHeader title={confirm.title} onClose={() => setConfirming(false)} />
          <ModalBody>
            <p className="text-sm text-zinc-400">{confirm.body}</p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                commit(true);
              }}
            >
              {confirm.confirmLabel}
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}
