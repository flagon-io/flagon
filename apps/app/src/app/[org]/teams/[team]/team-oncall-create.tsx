"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Field, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "@flagon/design";
import { createScheduleAction } from "../../incidents/actions";

const NO_MANAGE = "Only organization owners and admins and this team's maintainers can create schedules.";

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

/**
 * Creates an on-call schedule already bound to this team, then routes to its
 * editor. Binding at creation is what surfaces the schedule back on the team
 * page (no separate data migration). Disabled (never hidden) for non-managers.
 */
export function TeamOncallCreate({
  slug,
  teamKey,
  canManage,
}: {
  slug: string;
  teamKey: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [interval, setIntervalH] = useState("168");
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    const finalName = name.trim();
    if (!finalName) return setError("Name the schedule.");
    const key = slugify(finalName);
    if (!key) return setError("Give the schedule a name with letters or numbers.");
    start(async () => {
      const res = await createScheduleAction(slug, {
        name: finalName,
        key,
        teamKey,
        rotationIntervalHours: Number(interval) || 168,
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/incidents/on-call/${res.key ?? key}`);
    });
  }

  return (
    <>
      <Button
        variant="primary"
        onClick={() => setOpen(true)}
        disabled={!canManage}
        title={canManage ? undefined : NO_MANAGE}
      >
        <Plus className="size-4" /> Create on-call schedule
      </Button>

      {open ? (
        <Modal onClose={() => setOpen(false)} size="md">
          <ModalHeader
            title="Create on-call schedule"
            description="It binds to this team. You will add people on the next screen."
            onClose={() => setOpen(false)}
          />
          <ModalBody>
            <div className="flex flex-col gap-4">
              <Field label="Name">
                <Input
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Primary"
                />
              </Field>
              <Field label="Rotation interval (hours)" hint="How long each person holds the pager. 168 = one week.">
                <Input
                  value={interval}
                  onChange={(e) => setIntervalH(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                />
              </Field>
              {error ? <p className="text-sm text-red-400">{error}</p> : null}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create schedule"}
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}
