package db

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// SSO provider types.
const (
	SSOTypeOIDC = "oidc"
	SSOTypeSAML = "saml"
)

// SSO provider sentinels.
var (
	ErrSSOProviderNotFound  = errors.New("sso provider not found")
	ErrSSOProviderIDTaken   = errors.New("sso provider id already in use")
	ErrSSOProviderDomainUse = errors.New("sso provider domain already in use")
)

// SSOOIDCConfig is the non-secret OIDC configuration. ClientSecretSet reports
// whether a client secret is stored; the secret itself never leaves the API on a
// user-facing read.
type SSOOIDCConfig struct {
	ClientID          string   `json:"client_id"`
	DiscoveryEndpoint string   `json:"discovery_endpoint,omitempty"`
	Scopes            []string `json:"scopes,omitempty"`
	PKCE              bool     `json:"pkce"`
	ClientSecretSet   bool     `json:"client_secret_set"`
}

// SSOSAMLConfig is the non-secret SAML configuration (the IdP certificate is
// public). PrivateKeySet reports whether a service-provider signing key is stored.
type SSOSAMLConfig struct {
	EntryPoint           string `json:"entry_point"`
	Cert                 string `json:"cert"`
	Audience             string `json:"audience,omitempty"`
	WantAssertionsSigned bool   `json:"want_assertions_signed"`
	AuthnRequestsSigned  bool   `json:"authn_requests_signed"`
	PrivateKeySet        bool   `json:"private_key_set"`
}

// SSOSecrets are the write-only credentials of a provider. They are stored apart
// from the rest of the configuration and returned only by the app-only internal
// read (SSOProviderConfigs).
type SSOSecrets struct {
	ClientSecret string `json:"client_secret,omitempty"`
	PrivateKey   string `json:"private_key,omitempty"`
}

// SSOProvider is an org's SSO provider as owners/admins (and the agent/MCP) see
// it: everything except the secrets. Exactly one of OIDC / SAML is set, per Type.
type SSOProvider struct {
	ID         string         `json:"id"`
	ProviderID string         `json:"provider_id"`
	Type       string         `json:"type"`
	Domain     string         `json:"domain"`
	Issuer     string         `json:"issuer"`
	OIDC       *SSOOIDCConfig `json:"oidc,omitempty"`
	SAML       *SSOSAMLConfig `json:"saml,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
}

// SSOProviderConfig is the full configuration, secrets included, for the app's
// auth layer to run the protocol flow. Internal only: it is never returned by a
// user-facing operation or tool.
type SSOProviderConfig struct {
	SSOProvider
	OrgID   string     `json:"org_id"`
	UserID  string     `json:"user_id"`
	Secrets SSOSecrets `json:"secrets"`
}

// SSOProviderInput creates a provider. The service validates and normalizes it.
type SSOProviderInput struct {
	ProviderID string
	Type       string
	Domain     string
	Issuer     string
	OIDC       *SSOOIDCConfig
	SAML       *SSOSAMLConfig
	Secrets    SSOSecrets
}

// SSOProviderUpdate replaces a provider's editable fields. The service merges the
// caller's partial edit onto the current provider first, so every field here is
// the full new value. A nil secret pointer keeps the stored secret; a non-nil
// one replaces it ("" clears it).
type SSOProviderUpdate struct {
	Domain       string
	Issuer       string
	OIDC         *SSOOIDCConfig
	SAML         *SSOSAMLConfig
	ClientSecret *string
	PrivateKey   *string
}

// SSOConfigFilter narrows the internal configuration read. Every set field
// narrows; with none set nothing is returned.
type SSOConfigFilter struct {
	ProviderID string
	Domain     string
	OrgID      string
}

// SSO import outcomes (flagon.import_sso_provider).
const (
	SSOImportImported = "imported"
	SSOImportExists   = "exists"
	SSOImportDeleted  = "deleted"
	SSOImportNoOrg    = "no_org"
)

// ssoConfigJSON is the non-secret configuration column for a provider.
func ssoConfigJSON(typ string, oidc *SSOOIDCConfig, saml *SSOSAMLConfig) ([]byte, error) {
	switch typ {
	case SSOTypeOIDC:
		if oidc == nil {
			oidc = &SSOOIDCConfig{}
		}
		c := *oidc
		c.ClientSecretSet = false // derived from the secrets column, never stored
		return json.Marshal(struct {
			ClientID          string   `json:"client_id"`
			DiscoveryEndpoint string   `json:"discovery_endpoint,omitempty"`
			Scopes            []string `json:"scopes,omitempty"`
			PKCE              bool     `json:"pkce"`
		}{c.ClientID, c.DiscoveryEndpoint, c.Scopes, c.PKCE})
	case SSOTypeSAML:
		if saml == nil {
			saml = &SSOSAMLConfig{}
		}
		c := *saml
		return json.Marshal(struct {
			EntryPoint           string `json:"entry_point"`
			Cert                 string `json:"cert"`
			Audience             string `json:"audience,omitempty"`
			WantAssertionsSigned bool   `json:"want_assertions_signed"`
			AuthnRequestsSigned  bool   `json:"authn_requests_signed"`
		}{c.EntryPoint, c.Cert, c.Audience, c.WantAssertionsSigned, c.AuthnRequestsSigned})
	}
	return []byte("{}"), nil
}

// hydrateSSO fills a provider's typed config from its stored JSON and the secret
// presence flags.
func hydrateSSO(p *SSOProvider, config []byte, clientSecretSet, privateKeySet bool) error {
	switch p.Type {
	case SSOTypeOIDC:
		var c SSOOIDCConfig
		if err := json.Unmarshal(config, &c); err != nil {
			return err
		}
		c.ClientSecretSet = clientSecretSet
		p.OIDC = &c
	case SSOTypeSAML:
		var c SSOSAMLConfig
		if err := json.Unmarshal(config, &c); err != nil {
			return err
		}
		c.PrivateKeySet = privateKeySet
		p.SAML = &c
	}
	return nil
}

// ssoUniqueErr maps a unique violation to the precise sentinel.
func ssoUniqueErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		if pgErr.ConstraintName == "sso_providers_domain_live_idx" {
			return ErrSSOProviderDomainUse
		}
		return ErrSSOProviderIDTaken
	}
	return err
}

// ssoProviderCols is the user-facing projection: the secrets column itself is
// never selected, only whether each secret is present.
const ssoProviderCols = `id, provider_id, type, domain, issuer, config,
	secrets ? 'client_secret', secrets ? 'private_key', created_at, updated_at`

func scanSSOProvider(row pgx.Row) (SSOProvider, error) {
	var p SSOProvider
	var config []byte
	var clientSecretSet, privateKeySet bool
	if err := row.Scan(&p.ID, &p.ProviderID, &p.Type, &p.Domain, &p.Issuer, &config,
		&clientSecretSet, &privateKeySet, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return SSOProvider{}, err
	}
	if err := hydrateSSO(&p, config, clientSecretSet, privateKeySet); err != nil {
		return SSOProvider{}, err
	}
	return p, nil
}

// ssoRequireOrgAdmin resolves an org the actor can see and requires them to be an
// owner or admin of it (SSO configuration is a security setting).
func ssoRequireOrgAdmin(ctx context.Context, tx pgx.Tx, actorID, slug string) (orgID string, err error) {
	orgID, _, err = resolveOrg(ctx, tx, slug)
	if err != nil {
		return "", err
	}
	role, err := memberRole(ctx, tx, orgID, actorID)
	if err != nil {
		return "", err
	}
	if role != RoleOwner && role != RoleAdmin {
		return "", ErrForbidden
	}
	return orgID, nil
}

// ListSSOProviders returns an org's live SSO providers, secrets masked. Org
// owners/admins only.
func (d *DB) ListSSOProviders(ctx context.Context, actorID, orgSlug string) ([]SSOProvider, error) {
	out := []SSOProvider{}
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, err := ssoRequireOrgAdmin(ctx, tx, actorID, orgSlug)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT `+ssoProviderCols+` FROM public.sso_providers
			 WHERE org_id = $1 AND deleted_at IS NULL ORDER BY provider_id`, orgID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			p, err := scanSSOProvider(rows)
			if err != nil {
				return err
			}
			out = append(out, p)
		}
		return rows.Err()
	})
	return out, err
}

// GetSSOProvider returns one of an org's live SSO providers, secrets masked.
func (d *DB) GetSSOProvider(ctx context.Context, actorID, orgSlug, providerID string) (SSOProvider, error) {
	var p SSOProvider
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, err := ssoRequireOrgAdmin(ctx, tx, actorID, orgSlug)
		if err != nil {
			return err
		}
		p, err = scanSSOProvider(tx.QueryRow(ctx,
			`SELECT `+ssoProviderCols+` FROM public.sso_providers
			 WHERE org_id = $1 AND provider_id = $2 AND deleted_at IS NULL`, orgID, providerID))
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrSSOProviderNotFound
		}
		return err
	})
	return p, err
}

// CreateSSOProvider registers a provider for an org and audits it. Org
// owners/admins only; the input is already validated by the service.
func (d *DB) CreateSSOProvider(ctx context.Context, actorID, orgSlug string, in SSOProviderInput) (SSOProvider, error) {
	var p SSOProvider
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, err := ssoRequireOrgAdmin(ctx, tx, actorID, orgSlug)
		if err != nil {
			return err
		}
		config, err := ssoConfigJSON(in.Type, in.OIDC, in.SAML)
		if err != nil {
			return err
		}
		secrets, err := ssoSecretsJSON(d.keyring(), in.Secrets)
		if err != nil {
			return err
		}
		p, err = scanSSOProvider(tx.QueryRow(ctx,
			`INSERT INTO public.sso_providers (org_id, provider_id, type, domain, issuer, config, secrets, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING `+ssoProviderCols,
			orgID, in.ProviderID, in.Type, in.Domain, in.Issuer, config, secrets, actorID))
		if err != nil {
			return ssoUniqueErr(err)
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionSSOProviderCreated, "sso_provider", p.ProviderID,
			"added "+ssoLabel(p.Type)+" single sign-on provider "+p.ProviderID)
	})
	return p, err
}

// UpdateSSOProvider replaces a provider's editable fields and audits it. The
// provider id and type are immutable (the id is in the IdP's callback URL).
func (d *DB) UpdateSSOProvider(ctx context.Context, actorID, orgSlug, providerID string, in SSOProviderUpdate) (SSOProvider, error) {
	var p SSOProvider
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, err := ssoRequireOrgAdmin(ctx, tx, actorID, orgSlug)
		if err != nil {
			return err
		}
		var typ string
		var secretsRaw []byte
		err = tx.QueryRow(ctx,
			`SELECT type, secrets FROM public.sso_providers
			 WHERE org_id = $1 AND provider_id = $2 AND deleted_at IS NULL FOR UPDATE`, orgID, providerID).
			Scan(&typ, &secretsRaw)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrSSOProviderNotFound
		}
		if err != nil {
			return err
		}
		secrets, err := openSSOSecrets(d.keyring(), secretsRaw)
		if err != nil {
			return err
		}
		secretChanged := false
		if in.ClientSecret != nil {
			secrets.ClientSecret = *in.ClientSecret
			secretChanged = true
		}
		if in.PrivateKey != nil {
			secrets.PrivateKey = *in.PrivateKey
			secretChanged = true
		}
		config, err := ssoConfigJSON(typ, in.OIDC, in.SAML)
		if err != nil {
			return err
		}
		secretsJSON, err := ssoSecretsJSON(d.keyring(), secrets)
		if err != nil {
			return err
		}
		p, err = scanSSOProvider(tx.QueryRow(ctx,
			`UPDATE public.sso_providers
			 SET domain = $1, issuer = $2, config = $3, secrets = $4, updated_at = now()
			 WHERE org_id = $5 AND provider_id = $6 AND deleted_at IS NULL
			 RETURNING `+ssoProviderCols,
			in.Domain, in.Issuer, config, secretsJSON, orgID, providerID))
		if err != nil {
			return ssoUniqueErr(err)
		}
		summary := "updated single sign-on provider " + p.ProviderID
		if secretChanged {
			summary += " (credentials changed)"
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionSSOProviderUpdated, "sso_provider", p.ProviderID, summary)
	})
	return p, err
}

// DeleteSSOProvider removes a provider (soft delete: the row stays as a tombstone
// so the import path can never resurrect it) and audits it. SSO sign-in through it
// stops at the next attempt, when the app's auth layer re-syncs its cache.
func (d *DB) DeleteSSOProvider(ctx context.Context, actorID, orgSlug, providerID string) error {
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, err := ssoRequireOrgAdmin(ctx, tx, actorID, orgSlug)
		if err != nil {
			return err
		}
		// Clear the secrets too: a tombstone has no reason to keep credentials.
		ct, err := tx.Exec(ctx,
			`UPDATE public.sso_providers SET deleted_at = now(), updated_at = now(), secrets = '{}'::jsonb
			 WHERE org_id = $1 AND provider_id = $2 AND deleted_at IS NULL`, orgID, providerID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrSSOProviderNotFound
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionSSOProviderDeleted, "sso_provider", providerID,
			"removed single sign-on provider "+providerID)
	})
}

// SSOProviderConfigs is the app-only read of full provider configuration,
// secrets included, for the auth layer's cache. It runs with no user bound,
// through the SECURITY DEFINER window, and returns only live providers of live
// orgs. Reachable solely from the internal-token API operation.
func (d *DB) SSOProviderConfigs(ctx context.Context, f SSOConfigFilter) ([]SSOProviderConfig, error) {
	if d == nil || d.pool == nil {
		return nil, ErrUnavailable
	}
	ctx, cancel := withQueryTimeout(ctx)
	defer cancel()
	rows, err := d.pool.Query(ctx,
		`SELECT id, org_id, provider_id, type, domain, issuer, config, secrets, COALESCE(user_id, ''), created_at, updated_at
		 FROM flagon.sso_provider_configs($1, $2, $3)`,
		ssoNullable(f.ProviderID), ssoNullable(f.Domain), ssoNullable(f.OrgID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SSOProviderConfig{}
	for rows.Next() {
		var c SSOProviderConfig
		var config, secrets []byte
		if err := rows.Scan(&c.ID, &c.OrgID, &c.ProviderID, &c.Type, &c.Domain, &c.Issuer, &config, &secrets,
			&c.UserID, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		if c.Secrets, err = openSSOSecrets(d.keyring(), secrets); err != nil {
			return nil, err
		}
		if err := hydrateSSO(&c.SSOProvider, config, c.Secrets.ClientSecret != "", c.Secrets.PrivateKey != ""); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ImportSSOProvider adopts a provider that predates API ownership (it exists only
// in the app's auth DB). Idempotent and never destructive; see
// flagon.import_sso_provider for the outcomes. An 'imported' result is audited in
// the same transaction (as a system action: there is no acting user).
func (d *DB) ImportSSOProvider(ctx context.Context, orgID, createdBy string, in SSOProviderInput) (string, error) {
	if d == nil || d.pool == nil {
		return "", ErrUnavailable
	}
	ctx, cancel := withQueryTimeout(ctx)
	defer cancel()
	config, err := ssoConfigJSON(in.Type, in.OIDC, in.SAML)
	if err != nil {
		return "", err
	}
	secrets, err := ssoSecretsJSON(d.keyring(), in.Secrets)
	if err != nil {
		return "", err
	}
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op (ErrTxClosed) after Commit
	var outcome string
	if err := tx.QueryRow(ctx,
		`SELECT flagon.import_sso_provider($1, $2, $3, $4, $5, $6, $7, $8)`,
		orgID, in.ProviderID, in.Type, in.Domain, in.Issuer, config, secrets, createdBy).Scan(&outcome); err != nil {
		return "", ssoUniqueErr(err)
	}
	if outcome == SSOImportImported {
		if err := recordAudit(ctx, tx, orgID, "", audit.ActionSSOProviderCreated, "sso_provider", in.ProviderID,
			"imported "+ssoLabel(in.Type)+" single sign-on provider "+in.ProviderID+" from the sign-in service"); err != nil {
			return "", err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return outcome, nil
}

func ssoLabel(typ string) string {
	if typ == SSOTypeSAML {
		return "SAML"
	}
	return "OIDC"
}

func ssoNullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
