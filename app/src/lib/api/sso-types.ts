// SSO provider shapes returned by the Go API (GET/POST/PATCH
// /orgs/{slug}/sso/providers). Client-safe: no server imports, so the settings UI
// imports these directly. Secrets never appear in responses: the API reports only
// whether each one is set (client_secret_set / private_key_set).
//
// Aliases of the schema generated from the OpenAPI spec (see types.ts), narrowed
// where the spec types the protocol as a plain string.
import type { components } from "./schema.gen";

type S = components["schemas"];

export type SSOProtocol = "oidc" | "saml";

export type SSOOIDCSettings = S["SSOOIDCConfig"];
export type SSOSAMLSettings = S["SSOSAMLConfig"];

export type SSOProvider = Omit<S["SSOProvider"], "$schema" | "type"> & { type: SSOProtocol };

/** POST body. Secrets are write-only. */
export type CreateSSOProviderBody = Omit<S["CreateSSOProviderInputBody"], "$schema">;

/** PATCH body: omitted fields (and secrets) are left unchanged. */
export type UpdateSSOProviderBody = Omit<S["UpdateSSOProviderInputBody"], "$schema">;
