// Package secrets seals credentials the API must store and later use in the
// clear (today: SSO client secrets and SAML signing keys) with AES-256-GCM, so a
// database dump, backup or replica alone never yields them.
//
// A sealed value is a self-describing string:
//
//	enc:v1:<key id>:<base64url(nonce || ciphertext || tag)>
//
// "v1" is the scheme (AES-256-GCM, 12-byte random nonce) and the key id names the
// key that sealed it (the first 8 hex characters of the key's SHA-256), so keys
// can be rotated later: a Keyring holds one primary key that seals and any number
// of retired keys that still open older values. Each value is sealed with
// associated data naming what it is (e.g. "sso.client_secret"), so a ciphertext
// copied into another field fails to open.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

// KeySize is the required key length: 32 bytes (AES-256).
const KeySize = 32

const (
	prefix = "enc:"
	scheme = "v1"
)

// ErrUnknownKey means a value was sealed with a key this keyring does not hold.
var ErrUnknownKey = errors.New("secrets: value was sealed with an unknown key")

// ErrCorrupt means a sealed value could not be decoded or authenticated.
var ErrCorrupt = errors.New("secrets: sealed value is corrupt or was tampered with")

// Keyring seals with its primary key and opens with any key it holds.
type Keyring struct {
	primary string
	aeads   map[string]cipher.AEAD
}

// NewKeyring builds a keyring whose first key is the primary (sealing) key; any
// further keys are retired keys kept only to open older values.
func NewKeyring(primary []byte, retired ...[]byte) (*Keyring, error) {
	k := &Keyring{aeads: map[string]cipher.AEAD{}}
	for i, key := range append([][]byte{primary}, retired...) {
		if len(key) != KeySize {
			return nil, fmt.Errorf("secrets: key %d is %d bytes; want %d (AES-256)", i, len(key), KeySize)
		}
		block, err := aes.NewCipher(key)
		if err != nil {
			return nil, err
		}
		aead, err := cipher.NewGCM(block)
		if err != nil {
			return nil, err
		}
		id := KeyID(key)
		if i == 0 {
			k.primary = id
		}
		k.aeads[id] = aead
	}
	return k, nil
}

// ParseKey decodes a base64 (standard or URL alphabet, padded or not) 32-byte
// key, as supplied in configuration.
func ParseKey(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		if b, err := enc.DecodeString(s); err == nil {
			if len(b) != KeySize {
				return nil, fmt.Errorf("secrets: key decodes to %d bytes; want %d", len(b), KeySize)
			}
			return b, nil
		}
	}
	return nil, errors.New("secrets: key is not valid base64")
}

// ParseKeyList parses a comma-separated list of base64 keys (see ParseKey), as
// used for retired keys during rotation. Blank entries are skipped, so an empty
// string is an empty list; any malformed entry is an error naming its position,
// never the key itself.
func ParseKeyList(s string) ([][]byte, error) {
	var keys [][]byte
	for i, part := range strings.Split(s, ",") {
		if strings.TrimSpace(part) == "" {
			continue
		}
		k, err := ParseKey(part)
		if err != nil {
			return nil, fmt.Errorf("key %d: %w", i+1, err)
		}
		keys = append(keys, k)
	}
	return keys, nil
}

// KeyID is the short, non-secret identifier of a key embedded in sealed values.
func KeyID(key []byte) string {
	sum := sha256.Sum256(key)
	return hex.EncodeToString(sum[:4])
}

// PrimaryID is the id of the key new values are sealed with.
func (k *Keyring) PrimaryID() string { return k.primary }

// IsSealed reports whether v is in the sealed format (as opposed to a legacy
// plaintext value).
func IsSealed(v string) bool { return strings.HasPrefix(v, prefix) }

// Seal encrypts plaintext under the primary key, bound to aad. Empty stays empty
// (absence is meaningful to callers and needs no protection).
func (k *Keyring) Seal(aad, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	aead := k.aeads[k.primary]
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	out := aead.Seal(nonce, nonce, []byte(plaintext), []byte(aad))
	return prefix + scheme + ":" + k.primary + ":" + base64.RawURLEncoding.EncodeToString(out), nil
}

// Open decrypts a sealed value bound to aad. A value that is not sealed is a
// legacy plaintext value (written before encryption at rest) and is returned
// unchanged, so reads keep working while existing rows are migrated.
func (k *Keyring) Open(aad, v string) (string, error) {
	if !IsSealed(v) {
		return v, nil
	}
	parts := strings.SplitN(strings.TrimPrefix(v, prefix), ":", 3)
	if len(parts) != 3 || parts[0] != scheme {
		return "", ErrCorrupt
	}
	aead, ok := k.aeads[parts[1]]
	if !ok {
		return "", fmt.Errorf("%w (key id %s)", ErrUnknownKey, parts[1])
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || len(raw) < aead.NonceSize() {
		return "", ErrCorrupt
	}
	nonce, ct := raw[:aead.NonceSize()], raw[aead.NonceSize():]
	pt, err := aead.Open(nil, nonce, ct, []byte(aad))
	if err != nil {
		return "", ErrCorrupt
	}
	return string(pt), nil
}

// NeedsReseal reports whether a stored value should be rewritten: it is legacy
// plaintext, or was sealed with a key other than the primary.
func (k *Keyring) NeedsReseal(v string) bool {
	if v == "" {
		return false
	}
	if !IsSealed(v) {
		return true
	}
	parts := strings.SplitN(strings.TrimPrefix(v, prefix), ":", 3)
	return len(parts) != 3 || parts[1] != k.primary
}

// DevKey is the fixed, PUBLICLY KNOWN key local development falls back to when
// no key is configured. It exists only so a fresh checkout runs with zero setup;
// anything it seals is effectively plaintext. Never use it outside local dev.
var DevKey = func() []byte {
	sum := sha256.Sum256([]byte("flagon local development secrets key - not secret"))
	return sum[:]
}()
