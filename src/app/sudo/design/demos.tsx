'use client';

import { useState } from 'react';
import { Field } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { SecretReveal } from '@/components/ui/secret-reveal';

/** Live, stateful Select for the design reference. */
export function SelectDemo() {
  const [value, setValue] = useState('member');
  return (
    <div className="w-44">
      <Select
        value={value}
        onValueChange={setValue}
        ariaLabel="Role"
        options={[
          { value: 'viewer', label: 'Viewer' },
          { value: 'member', label: 'Member' },
          { value: 'admin', label: 'Admin' },
          { value: 'owner', label: 'Owner' },
        ]}
      />
    </div>
  );
}

/** Live Modal for the design reference. */
export function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create something"
        description="ESC or click the backdrop to dismiss."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="demo-modal-form" onClick={() => setOpen(false)}>
              Save
            </Button>
          </>
        }
      >
        <form id="demo-modal-form" onSubmit={(e) => e.preventDefault()}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Name</span>
            <Input autoFocus placeholder="Type something…" />
          </label>
        </form>
      </Modal>
    </>
  );
}

/** Reveal-on-demand secret (SDK keys). Shows the success + failure paths. */
export function SecretRevealDemo() {
  return (
    <div className="flex flex-col gap-3">
      <SecretReveal
        masked="flagon_srv_AFjg8…"
        onReveal={async () => {
          await new Promise((r) => setTimeout(r, 300));
          return { ok: true, value: 'flagon_srv_AFjg8sK2p9QxR4tLmN0vB7wZ' };
        }}
      />
      <SecretReveal
        masked="flagon_srv_old12…"
        onReveal={async () => ({ ok: false, error: 'Predates reveal — rotate it.' })}
      />
    </div>
  );
}

/** Live, stateful labeled Field for the design reference. */
export function FieldDemo() {
  const [value, setValue] = useState('');
  return (
    <div className="w-full max-w-xs">
      <Field
        label="Work email"
        type="email"
        value={value}
        onChange={setValue}
        placeholder="you@company.com"
        hint="We only use this for account notifications."
      />
    </div>
  );
}
