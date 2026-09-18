package db

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrInvalidToken is returned by ResolveToken for an unknown/revoked/expired token.
var ErrInvalidToken = errors.New("invalid or expired token")

const (
	patPrefix = "flagon_pat"
	oatPrefix = "flagon_oat"
)

// AccessToken is a stored token (never includes the secret). Scopes nil = full
// access; a (possibly empty) slice = restricted to those scopes.
type AccessToken struct {
	ID         string     `json:"id"`
	Kind       string     `json:"kind"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	Role       *string    `json:"role"`   // OAT: the service principal's role; PAT: null
	Scopes     []string   `json:"scopes"` // null = full access
	ExpiresAt  *time.Time `json:"expires_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

// TokenPrincipal is who a resolved bearer token acts as.
type TokenPrincipal struct {
	UserID string   // the acting principal (real user for PAT, service principal for OAT)
	Email  string   // the principal's email (for identity-forwarding parity)
	Kind   string   // "pat" | "oat"
	OrgID  *string  // OAT: the org it is scoped to
	Scopes []string // nil = full access; non-nil = restricted to these scopes
}

// scopesParam encodes a scope list for a jsonb column: nil -> SQL NULL (full).
func scopesParam(scopes []string) *string {
	if scopes == nil {
		return nil
	}
	b, _ := json.Marshal(scopes)
	s := string(b)
	return &s
}

// scanScopes turns a jsonb value into a scope slice (nil = full access).
func scanScopes(raw []byte) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

// generateToken mints a secret, its sha256 hash, and a short display prefix.
func generateToken(prefix string) (secret, hash, display string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", "", err
	}
	raw := base64.RawURLEncoding.EncodeToString(b)
	secret = prefix + "_" + raw
	hash = hashToken(secret)
	display = prefix + "_" + raw[:6] // e.g. flagon_pat_ab12cd
	return secret, hash, display, nil
}

func hashToken(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// CreatePAT mints a personal access token for a user. Returns the plaintext
// secret (show-once) and the stored record.
func (d *DB) CreatePAT(ctx context.Context, userID, name string, scopes []string, expiresAt *time.Time) (secret string, tok AccessToken, err error) {
	secret, hash, prefix, err := generateToken(patPrefix)
	if err != nil {
		return "", AccessToken{}, err
	}
	err = d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO public.access_tokens
				(kind, name, token_hash, token_prefix, principal_user_id, org_id, created_by, scopes, expires_at)
			VALUES ('pat', $1, $2, $3, $4, NULL, $4, $5::jsonb, $6)
			RETURNING id, created_at`,
			name, hash, prefix, userID, scopesParam(scopes), expiresAt).Scan(&tok.ID, &tok.CreatedAt)
	})
	if err != nil {
		return "", AccessToken{}, err
	}
	tok.Kind = "pat"
	tok.Name = name
	tok.Prefix = prefix
	tok.Scopes = scopes
	tok.ExpiresAt = expiresAt
	return secret, tok, nil
}

// CreateOAT mints an organization access token backed by a service principal.
// Returns the plaintext secret (show-once) and the token id.
func (d *DB) CreateOAT(ctx context.Context, actorID, slug, name, role string, scopes []string, expiresAt *time.Time) (secret, tokenID string, err error) {
	secret, hash, prefix, err := generateToken(oatPrefix)
	if err != nil {
		return "", "", err
	}
	err = d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT flagon.create_oat($1, $2, $3, $4, $5, $6)`,
			actorID, slug, name, role, hash, prefix).Scan(&tokenID); err != nil {
			return mapDefinerErr(err)
		}
		// Apply scopes + expiry (RLS access_tokens_manage lets owner/admin update).
		_, err := tx.Exec(ctx,
			`UPDATE public.access_tokens SET scopes = $2::jsonb, expires_at = $3 WHERE id = $1`,
			tokenID, scopesParam(scopes), expiresAt)
		return err
	})
	if err != nil {
		return "", "", err
	}
	return secret, tokenID, nil
}

// ListPATs returns the caller's personal access tokens.
func (d *DB) ListPATs(ctx context.Context, userID string) ([]AccessToken, error) {
	var out []AccessToken
	err := d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT id, name, token_prefix, scopes, expires_at, last_used_at, created_at
			FROM public.access_tokens WHERE kind = 'pat'
			ORDER BY created_at DESC`)
		if err != nil {
			return err
		}
		defer rows.Close()
		out = []AccessToken{}
		for rows.Next() {
			t := AccessToken{Kind: "pat"}
			var scopesRaw []byte
			if err := rows.Scan(&t.ID, &t.Name, &t.Prefix, &scopesRaw, &t.ExpiresAt, &t.LastUsedAt, &t.CreatedAt); err != nil {
				return err
			}
			t.Scopes = scanScopes(scopesRaw)
			out = append(out, t)
		}
		return rows.Err()
	})
	return out, err
}

// ListOATs returns an org's access tokens (owner/admin only, via RLS).
func (d *DB) ListOATs(ctx context.Context, actorID, slug string) ([]AccessToken, error) {
	var out []AccessToken
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			SELECT t.id, t.name, t.token_prefix, m.role, t.scopes, t.expires_at, t.last_used_at, t.created_at
			FROM public.access_tokens t
			LEFT JOIN public.memberships m
			  ON m.user_id = t.principal_user_id AND m.org_id = t.org_id
			WHERE t.kind = 'oat' AND t.org_id = $1
			ORDER BY t.created_at DESC`, orgID)
		if err != nil {
			return err
		}
		defer rows.Close()
		out = []AccessToken{}
		for rows.Next() {
			t := AccessToken{Kind: "oat"}
			var scopesRaw []byte
			if err := rows.Scan(&t.ID, &t.Name, &t.Prefix, &t.Role, &scopesRaw, &t.ExpiresAt, &t.LastUsedAt, &t.CreatedAt); err != nil {
				return err
			}
			t.Scopes = scanScopes(scopesRaw)
			out = append(out, t)
		}
		return rows.Err()
	})
	return out, err
}

// RevokePAT deletes one of the caller's personal access tokens.
func (d *DB) RevokePAT(ctx context.Context, userID, id string) error {
	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`DELETE FROM public.access_tokens WHERE id = $1 AND kind = 'pat'`, id)
		return err
	})
}

// RevokeOAT deletes an org access token (and its service principal).
func (d *DB) RevokeOAT(ctx context.Context, actorID, id string) error {
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `SELECT flagon.delete_oat($1, $2)`, actorID, id)
		return mapDefinerErr(err)
	})
}

// ResolveToken authenticates a presented bearer secret, returning the principal
// it acts as. Stamps last_used_at. Errors ErrInvalidToken when not live.
func (d *DB) ResolveToken(ctx context.Context, secret string) (TokenPrincipal, error) {
	if d == nil || d.pool == nil {
		return TokenPrincipal{}, ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var p TokenPrincipal
	var scopesRaw []byte
	err := d.pool.QueryRow(ctx,
		`SELECT principal_user_id, email, kind, org_id, scopes FROM flagon.resolve_access_token($1)`,
		hashToken(secret)).Scan(&p.UserID, &p.Email, &p.Kind, &p.OrgID, &scopesRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return TokenPrincipal{}, ErrInvalidToken
	}
	if err != nil {
		return TokenPrincipal{}, err
	}
	p.Scopes = scanScopes(scopesRaw)
	return p, nil
}

// mapDefinerErr maps the RAISE codes from the token/member SQL helpers.
func mapDefinerErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "P0001":
			return ErrForbidden
		case "P0002":
			return ErrNotMember
		case "P0003":
			return ErrInvalidRole
		}
	}
	return err
}
