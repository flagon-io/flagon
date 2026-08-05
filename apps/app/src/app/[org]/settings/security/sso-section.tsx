"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, SegmentedControl, Textarea, toast } from "@flagon/design";
import { KeyRound, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { FormError } from "@/components/form-error";
import { SettingsFooter } from "@/components/settings/section";
import { CopyField } from "@/components/settings/copy-field";
import { EnforcementToggle } from "@/components/settings/enforcement-toggle";
import { removeSsoProviderAction, updateSecurityAction } from "./actions";

export type SsoProviderSummary = {
  providerId: string;
  issuer: string;
  domain: string;
  protocol: "saml" | "oidc";
};

type SpUrls = { acsUrl: string; metadataUrl: string; entityId: string };

/**
 * Single sign-on, modeled on GitHub's "SAML single sign-on" block: CONFIGURE the
 * connection first (SAML or OIDC), which does not affect anyone, then ENFORCE it
 * as a separate, deliberate switch. Configuring shows the service-provider URLs
 * (ACS, Entity ID) an admin pastes into their IdP. The owner is never locked out
 * by enforcement.
 */
export function SsoSection({
  slug,
  orgId,
  orgName,
  canManage,
  isOwner,
  provider,
  ssoEnforced,
  providerId,
  callbackUrl,
  spUrls,
}: {
  slug: string;
  orgId: string;
  orgName: string;
  canManage: boolean;
  isOwner: boolean;
  provider: SsoProviderSummary | null;
  ssoEnforced: boolean;
  providerId: string;
  callbackUrl: string;
  spUrls: SpUrls;
}) {
  const router = useRouter();
  const [protocol, setProtocol] = useState<"saml" | "oidc">("saml");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // SAML fields
  const [entryPoint, setEntryPoint] = useState("");
  const [issuer, setIssuer] = useState("");
  const [cert, setCert] = useState("");
  // OIDC fields
  const [oidcIssuer, setOidcIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  // Shared
  const [domain, setDomain] = useState("");

  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const common = { providerId, organizationId: orgId, domain: domain.trim() };
      const res =
        protocol === "saml"
          ? await authClient.sso.register({
              ...common,
              issuer: issuer.trim(),
              samlConfig: {
                entryPoint: entryPoint.trim(),
                cert: cert.trim(),
                callbackUrl,
                spMetadata: { entityID: spUrls.entityId },
              },
            })
          : await authClient.sso.register({
              ...common,
              issuer: oidcIssuer.trim(),
              oidcConfig: {
                clientId: clientId.trim(),
                clientSecret: clientSecret.trim(),
                discoveryEndpoint: `${oidcIssuer.trim().replace(/\/$/, "")}/.well-known/openid-configuration`,
              },
            });
      if (res?.error) {
        setError(
          res.error.message ??
            "Could not save the identity provider. Check the values and try again.",
        );
        return;
      }
      toast.success("Single sign-on configured");
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await removeSsoProviderAction(slug);
      if (res.error) toast.error("Couldn't remove SSO", res.error);
      else {
        toast.success("Single sign-on removed");
        router.refresh();
      }
    });
  }

  // --- Configured: show the connection + the enforce switch ------------------
  if (provider) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/2 p-4">
          <div className="mt-0.5 flex size-8 items-center justify-center rounded-md border border-white/10 bg-white/5">
            <KeyRound className="size-4 text-teal-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-100">
              {provider.protocol === "saml" ? "SAML 2.0" : "OpenID Connect"} is
              connected
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {provider.issuer} · {provider.domain}
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Remove
            </button>
          ) : null}
        </div>

        {provider.protocol === "saml" ? (
          <div className="flex flex-col gap-3">
            <CopyField label="Assertion Consumer Service (ACS) URL" value={spUrls.acsUrl} />
            <CopyField label="Service Provider Entity ID" value={spUrls.entityId} />
          </div>
        ) : null}

        <div className="-mx-5 border-t border-white/8" />

        <EnforcementToggle
          label="Require single sign-on"
          description={
            isOwner
              ? `Every member of ${orgName} except the owner must authenticate through your identity provider before accessing its resources.`
              : "Only the organization owner can change SSO enforcement."
          }
          enabled={ssoEnforced}
          disabled={!isOwner}
          confirm={{
            title: "Require single sign-on?",
            body: `Members who have not authenticated with your identity provider will be blocked from ${orgName} until they do. The owner keeps a fallback and is never locked out. Test sign-in first.`,
            confirmLabel: "Require SSO",
          }}
          onChange={(next) => updateSecurityAction(slug, { ssoEnforced: next })}
        />
      </div>
    );
  }

  // --- Not configured: the connect form --------------------------------------
  if (!canManage) {
    return (
      <p className="text-sm text-zinc-500">
        Single sign-on is not configured. Ask an owner or admin to set it up.
      </p>
    );
  }

  return (
    <form onSubmit={register} className="flex flex-col gap-4">
      <SegmentedControl
        value={protocol}
        onValueChange={(v) => setProtocol(v as "saml" | "oidc")}
        options={[
          { value: "saml", label: "SAML 2.0" },
          { value: "oidc", label: "OpenID Connect" },
        ]}
        ariaLabel="SSO protocol"
      />

      {protocol === "saml" ? (
        <>
          <Field label="Sign-on URL" htmlFor="saml-entrypoint" hint="Members are forwarded here to sign in (your IdP's SSO URL).">
            <Input
              id="saml-entrypoint"
              required
              value={entryPoint}
              onChange={(e) => setEntryPoint(e.target.value)}
              placeholder="https://acme.okta.com/app/.../sso/saml"
            />
          </Field>
          <Field label="Issuer" htmlFor="saml-issuer" hint="A unique URL generated by your identity provider.">
            <Input
              id="saml-issuer"
              required
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="http://www.okta.com/exk..."
            />
          </Field>
          <Field label="Public certificate" htmlFor="saml-cert" hint="The X.509 signing certificate from your IdP (PEM).">
            <Textarea
              id="saml-cert"
              required
              rows={5}
              value={cert}
              onChange={(e) => setCert(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="font-mono text-xs"
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Issuer URL" htmlFor="oidc-issuer" hint="Your provider's issuer; discovery is read from /.well-known/openid-configuration.">
            <Input
              id="oidc-issuer"
              required
              value={oidcIssuer}
              onChange={(e) => setOidcIssuer(e.target.value)}
              placeholder="https://acme.okta.com"
            />
          </Field>
          <Field label="Client ID" htmlFor="oidc-client-id">
            <Input
              id="oidc-client-id"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </Field>
          <Field label="Client secret" htmlFor="oidc-client-secret">
            <Input
              id="oidc-client-secret"
              required
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </Field>
        </>
      )}

      <Field label="Email domain" htmlFor="sso-domain" hint="Members with this email domain are routed to this provider (e.g. acme.com).">
        <Input
          id="sso-domain"
          required
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="acme.com"
        />
      </Field>

      {protocol === "saml" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-white/8 bg-white/2 p-4">
          <p className="text-xs text-zinc-400">
            Paste these into your identity provider when creating the SAML app:
          </p>
          <CopyField label="Assertion Consumer Service (ACS) URL" value={spUrls.acsUrl} />
          <CopyField label="Service Provider Entity ID" value={spUrls.entityId} />
        </div>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <SettingsFooter>
        <span className="mr-auto text-xs text-zinc-500">
          Configuring does not require SSO yet. You can test before enforcing.
        </span>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Enable single sign-on"}
        </Button>
      </SettingsFooter>
    </form>
  );
}
