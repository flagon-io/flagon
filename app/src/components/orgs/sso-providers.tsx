"use client";

import { useState } from "react";
import { KeyRound, Plus, Trash2, Copy, Check } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
  SelectField,
  Textarea,
} from "@flagon-io/ui";

export interface SSOProvider {
  id: string;
  providerId: string;
  issuer: string;
  domain: string | null;
  protocol: "oidc" | "saml";
}

/**
 * Manage an org's SSO providers (OIDC + SAML). Registering one binds the org to an
 * IdP; after that, members sign in through it and are provisioned into the org. For
 * SAML, the panel surfaces the ACS + SP-metadata URLs to paste into the IdP (Okta,
 * Azure AD, ...).
 */
export function SSOProviders({
  slug,
  origin,
  initial,
}: {
  slug: string;
  origin: string;
  initial: SSOProvider[];
}) {
  const [providers, setProviders] = useState(initial);
  const [open, setOpen] = useState(false);

  async function remove(providerId: string) {
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(slug)}/sso?providerId=${encodeURIComponent(providerId)}`,
      { method: "DELETE" },
    );
    if (res.ok) setProviders(((await res.json()) as { providers: SSOProvider[] }).providers);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">SSO providers</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Connect your identity provider so members sign in with OIDC or SAML.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          New provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <KeyRound className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">No SSO providers yet</p>
          <p className="text-sm text-muted-foreground">Add one to let members sign in through your IdP.</p>
        </Card>
      ) : (
        <div className="divide-y divide-hairline rounded-xl border border-hairline">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand-bright">
                <KeyRound className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                  {p.providerId}
                  <Badge variant="outline" className="uppercase">
                    {p.protocol}
                  </Badge>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.domain ? `${p.domain} · ` : ""}
                  {p.issuer}
                </p>
              </div>
              {p.protocol === "saml" && <SamlUrls origin={origin} providerId={p.providerId} />}
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Remove ${p.providerId}`}
                onClick={() => remove(p.providerId)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <NewProviderDialog
        slug={slug}
        open={open}
        onOpenChange={setOpen}
        onCreated={(list) => {
          setProviders(list);
          setOpen(false);
        }}
      />
    </div>
  );
}

function SamlUrls({ origin, providerId }: { origin: string; providerId: string }) {
  const acs = `${origin}/api/auth/sso/saml2/sp/acs/${providerId}`;
  const metadata = `${origin}/api/auth/sso/saml2/sp/metadata?providerId=${providerId}`;
  return (
    <div className="hidden shrink-0 flex-col items-end gap-1 md:flex">
      <CopyField label="ACS URL" value={acs} />
      <CopyField label="Metadata" value={metadata} />
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      title={value}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {label}
    </button>
  );
}

function NewProviderDialog({
  slug,
  open,
  onOpenChange,
  onCreated,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (providers: SSOProvider[]) => void;
}) {
  const [protocol, setProtocol] = useState<"oidc" | "saml">("oidc");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const common = {
      protocol,
      providerId: String(f.get("providerId") ?? "").trim(),
      issuer: String(f.get("issuer") ?? "").trim(),
      domain: String(f.get("domain") ?? "").trim(),
    };
    const body =
      protocol === "oidc"
        ? {
            ...common,
            clientId: String(f.get("clientId") ?? "").trim(),
            clientSecret: String(f.get("clientSecret") ?? "").trim(),
          }
        : {
            ...common,
            entryPoint: String(f.get("entryPoint") ?? "").trim(),
            cert: String(f.get("cert") ?? "").trim(),
          };
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/sso`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      setError(b.error ?? "Could not register the provider.");
      return;
    }
    onCreated(((await res.json()) as { providers: SSOProvider[] }).providers);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <DialogTitle>New SSO provider</DialogTitle>
        <DialogDescription className="mt-1">
          Connect your identity provider. You&rsquo;ll paste Flagon&rsquo;s URLs into the IdP after.
        </DialogDescription>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="protocol">Protocol</Label>
              <SelectField
                value={protocol}
                onValueChange={(v) => setProtocol(v as "oidc" | "saml")}
                options={[
                  { value: "oidc", label: "OIDC / OpenID Connect" },
                  { value: "saml", label: "SAML 2.0" },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="providerId">Provider ID</Label>
              <Input id="providerId" name="providerId" placeholder="acme-okta" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="domain">Email domain</Label>
            <Input id="domain" name="domain" placeholder="acme.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issuer">
              {protocol === "oidc" ? "Issuer URL" : "SP entity ID"}
            </Label>
            <Input
              id="issuer"
              name="issuer"
              placeholder={protocol === "oidc" ? "https://acme.okta.com" : "https://app.flagon.io/saml/acme"}
              required
            />
          </div>

          {protocol === "oidc" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="clientId">Client ID</Label>
                <Input id="clientId" name="clientId" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clientSecret">Client secret</Label>
                <Input id="clientSecret" name="clientSecret" type="password" required />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="entryPoint">IdP SSO URL (entry point)</Label>
                <Input id="entryPoint" name="entryPoint" placeholder="https://acme.okta.com/app/.../sso/saml" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cert">IdP signing certificate (PEM)</Label>
                <Textarea id="cert" name="cert" rows={4} placeholder="-----BEGIN CERTIFICATE-----" required />
              </div>
            </>
          )}

          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Registering…" : "Register provider"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
