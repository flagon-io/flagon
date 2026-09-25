"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Alert, Button, Input, InputGroup, cn } from "@flagon-io/ui";
import { errorMessage } from "@/lib/client-fetch";
import { SettingsCard } from "@/components/settings/settings-card";

export function OrgGeneralForm({
  slug,
  orgId,
  initialName,
  canManage,
}: {
  slug: string;
  orgId: string;
  initialName: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed !== initialName && trimmed !== "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(await errorMessage(res, "Couldn't save your changes."));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(orgId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* selectable fallback */
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save}>
        <SettingsCard
          title="Organization name"
          description="The display name for your organization, shown across Flagon."
          footerHint={saved ? "Saved." : "Use 48 characters or fewer."}
          footer={
            canManage && (
              <Button type="submit" size="sm" disabled={!dirty || saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )
          }
        >
          <Input
            aria-label="Organization name"
            value={name}
            disabled={!canManage}
            maxLength={48}
            className="max-w-md"
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
          {error && <Alert variant="destructive">{error}</Alert>}
        </SettingsCard>
      </form>

      <SettingsCard
        title="URL slug"
        description="Your organization's namespace in URLs. It can't be changed yet, since it would break existing links and API references."
      >
        <InputGroup
          className="max-w-md"
          prefix="app.flagon.io/"
          value={slug}
          readOnly
          disabled
          aria-label="URL slug"
        />
      </SettingsCard>

      <SettingsCard
        title="Organization ID"
        description="Use this when referencing your organization in the API or support requests."
        footerHint="This identifier is stable and safe to share."
      >
        <div className="flex max-w-md items-center gap-2">
          <code className="flex h-10 min-w-0 flex-1 items-center overflow-x-auto rounded-md border border-input bg-muted/40 px-3 font-mono text-sm text-foreground select-all">
            {orgId}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copyId} className={cn("shrink-0")}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
