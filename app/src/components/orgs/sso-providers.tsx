"use client";

import { useState } from "react";
import { KeyRound, Plus, Trash2, Copy, Check, Pencil } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@flagon-io/ui";
import { errorMessage } from "@/lib/client-fetch";
import { TableShell } from "@/components/shared/list-states";
import type { SSOProtocol, SSOProvider } from "@/lib/api/sso-types";

/**
 * Manage an org's SSO providers (OIDC + SAML). The Flagon API owns this
 * configuration (the same providers the agent and MCP can manage); secrets are
 * write-only, so a saved provider only shows whether its secret is set. For SAML,
 * the panel surfaces the ACS + SP-metadata URLs to paste into the IdP.
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
  const [dialog, setDialog] = useState<{ mode: "new" } | { mode: "edit"; provider: SSOProvider } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(providerId: string) {
    setRemoving(providerId);
    setError(null);
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(slug)}/sso?providerId=${encodeURIComponent(providerId)}`,
      { method: "DELETE" },
    );
    setRemoving(null);
    if (!res.ok) {
      setError(await errorMessage(res, `Couldn't remove ${providerId}.`));
      return;
    }
    setProviders(((await res.json()) as { providers: SSOProvider[] }).providers);
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
        <Button size="sm" onClick={() => setDialog({ mode: "new" })}>
          <Plus className="size-4" />
          New provider
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {providers.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <KeyRound className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">No SSO providers yet</p>
          <p className="text-sm text-muted-foreground">Add one to let members sign in through your IdP.</p>
        </Card>
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Provider</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead className="hidden md:table-cell">Service provider URLs</TableHead>
                <TableHead className="w-20 pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand-bright">
                        <KeyRound className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-foreground">
                          {p.provider_id}
                          <Badge variant="outline" className="uppercase">
                            {p.type}
                          </Badge>
                          {p.type === "oidc" && !p.oidc?.client_secret_set && (
                            <Badge variant="outline">No secret</Badge>
                          )}
                        </p>
                        <p className="max-w-72 truncate text-xs text-muted-foreground" title={p.issuer}>
                          {p.issuer}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.domain || "-"}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {p.type === "saml" ? (
                      <SamlUrls origin={origin} providerId={p.provider_id} />
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Edit ${p.provider_id}`}
                        disabled={removing !== null}
                        onClick={() => setDialog({ mode: "edit", provider: p })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Remove ${p.provider_id}`}
                        disabled={removing !== null}
                        onClick={() => remove(p.provider_id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}

      <ProviderDialog
        key={dialog?.mode === "edit" ? dialog.provider.id : "new"}
        slug={slug}
        editing={dialog?.mode === "edit" ? dialog.provider : null}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        onSaved={(list) => {
          setProviders(list);
          setDialog(null);
        }}
      />
    </div>
  );
}

function SamlUrls({ origin, providerId }: { origin: string; providerId: string }) {
  const acs = `${origin}/api/auth/sso/saml2/sp/acs/${providerId}`;
  const metadata = `${origin}/api/auth/sso/saml2/sp/metadata?providerId=${providerId}`;
  return (
    <div className="flex flex-col items-start gap-1">
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

/**
 * Create a provider, or edit one. On edit the provider ID and protocol are fixed
 * (the ID is in the IdP's callback URL), and a secret field left blank keeps the
 * stored secret: secrets are write-only and never sent back to the browser.
 */
function ProviderDialog({
  slug,
  editing,
  open,
  onOpenChange,
  onSaved,
}: {
  slug: string;
  editing: SSOProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (providers: SSOProvider[]) => void;
}) {
  const [protocol, setProtocol] = useState<SSOProtocol>(editing?.type ?? "oidc");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const field = (name: string) => String(f.get(name) ?? "").trim();
    const common = { domain: field("domain"), issuer: field("issuer") };
    const clientSecret = field("clientSecret");
    const oidc = { client_id: field("clientId"), ...(clientSecret ? { client_secret: clientSecret } : {}) };
    const saml = { entry_point: field("entryPoint"), cert: field("cert") };

    const base = `/api/orgs/${encodeURIComponent(slug)}/sso`;
    const res = editing
      ? await fetch(`${base}?providerId=${encodeURIComponent(editing.provider_id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(editing.type === "oidc" ? { ...common, oidc } : { ...common, saml }),
        })
      : await fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider_id: field("providerId"),
            type: protocol,
            ...common,
            ...(protocol === "oidc" ? { oidc: { ...oidc, client_secret: clientSecret } } : { saml }),
          }),
        });
    setBusy(false);
    if (!res.ok) {
      setError(await errorMessage(res, editing ? "Could not save the provider." : "Could not add the provider."));
      return;
    }
    onSaved(((await res.json()) as { providers: SSOProvider[] }).providers);
  }

  const type = editing?.type ?? protocol;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <DialogTitle>{editing ? `Edit ${editing.provider_id}` : "New SSO provider"}</DialogTitle>
        <DialogDescription className="mt-1">
          {editing
            ? "Changes apply at the next sign-in through this provider."
            : "Connect your identity provider. You’ll paste Flagon’s URLs into the IdP after."}
        </DialogDescription>
        <form onSubmit={submit} className="mt-4 space-y-3">
          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="protocol">Protocol</Label>
                <SelectField
                  value={protocol}
                  onValueChange={(v) => setProtocol(v as SSOProtocol)}
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
          )}
          <div className="space-y-1.5">
            <Label htmlFor="domain">Email domain</Label>
            <Input id="domain" name="domain" placeholder="acme.com" defaultValue={editing?.domain ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issuer">{type === "oidc" ? "Issuer URL" : "SP entity ID"}</Label>
            <Input
              id="issuer"
              name="issuer"
              placeholder={type === "oidc" ? "https://acme.okta.com" : "https://app.flagon.io/saml/acme"}
              defaultValue={editing?.issuer ?? ""}
              required
            />
          </div>

          {type === "oidc" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="clientId">Client ID</Label>
                <Input id="clientId" name="clientId" defaultValue={editing?.oidc?.client_id ?? ""} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clientSecret">Client secret</Label>
                <Input
                  id="clientSecret"
                  name="clientSecret"
                  type="password"
                  autoComplete="new-password"
                  placeholder={editing?.oidc?.client_secret_set ? "Leave blank to keep the current secret" : undefined}
                  required={!editing}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="entryPoint">IdP SSO URL (entry point)</Label>
                <Input
                  id="entryPoint"
                  name="entryPoint"
                  placeholder="https://acme.okta.com/app/.../sso/saml"
                  defaultValue={editing?.saml?.entry_point ?? ""}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cert">IdP signing certificate (PEM)</Label>
                <Textarea
                  id="cert"
                  name="cert"
                  rows={4}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  defaultValue={editing?.saml?.cert ?? ""}
                  required
                />
              </div>
            </>
          )}

          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {editing ? (busy ? "Saving…" : "Save changes") : busy ? "Registering…" : "Register provider"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
