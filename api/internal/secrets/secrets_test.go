package secrets

import (
	"encoding/base64"
	"errors"
	"strings"
	"testing"
)

func key(b byte) []byte {
	k := make([]byte, KeySize)
	for i := range k {
		k[i] = b + byte(i)
	}
	return k
}

func TestSealOpenRoundTrip(t *testing.T) {
	k, err := NewKeyring(key(1))
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := k.Seal("sso.client_secret", "hunter2")
	if err != nil {
		t.Fatal(err)
	}
	if !IsSealed(sealed) || strings.Contains(sealed, "hunter2") || !strings.HasPrefix(sealed, "enc:v1:"+k.PrimaryID()+":") {
		t.Fatalf("sealed = %q", sealed)
	}
	again, _ := k.Seal("sso.client_secret", "hunter2")
	if again == sealed {
		t.Fatal("sealing must use a fresh nonce each time")
	}
	got, err := k.Open("sso.client_secret", sealed)
	if err != nil || got != "hunter2" {
		t.Fatalf("Open = %q, %v", got, err)
	}
	if k.NeedsReseal(sealed) {
		t.Fatal("a value under the primary key needs no reseal")
	}
}

func TestOpenRejectsWrongFieldTamperingAndUnknownKeys(t *testing.T) {
	k, _ := NewKeyring(key(1))
	sealed, _ := k.Seal("sso.client_secret", "hunter2")

	if _, err := k.Open("sso.private_key", sealed); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("open under other associated data = %v, want ErrCorrupt", err)
	}
	// Change one character well inside the payload (the last character can
	// carry only padding bits).
	i := len(sealed) - 10
	flip := byte('A')
	if sealed[i] == 'A' {
		flip = 'B'
	}
	tampered := sealed[:i] + string(flip) + sealed[i+1:]
	if _, err := k.Open("sso.client_secret", tampered); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("tampered open = %v, want ErrCorrupt", err)
	}
	other, _ := NewKeyring(key(9))
	if _, err := other.Open("sso.client_secret", sealed); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("unknown key open = %v, want ErrUnknownKey", err)
	}
}

func TestRotationAndLegacyPlaintext(t *testing.T) {
	old, _ := NewKeyring(key(1))
	sealedOld, _ := old.Seal("f", "v")

	rotated, err := NewKeyring(key(2), key(1))
	if err != nil {
		t.Fatal(err)
	}
	if got, err := rotated.Open("f", sealedOld); err != nil || got != "v" {
		t.Fatalf("retired key open = %q, %v", got, err)
	}
	if !rotated.NeedsReseal(sealedOld) {
		t.Fatal("a value under a retired key needs a reseal")
	}

	// Legacy plaintext passes through Open and is flagged for sealing.
	if got, err := rotated.Open("f", "plain"); err != nil || got != "plain" {
		t.Fatalf("plaintext open = %q, %v", got, err)
	}
	if !rotated.NeedsReseal("plain") || rotated.NeedsReseal("") {
		t.Fatal("NeedsReseal: plaintext needs it, empty does not")
	}
	if s, _ := rotated.Seal("f", ""); s != "" {
		t.Fatalf("empty seals to %q, want empty", s)
	}
}

func TestParseKey(t *testing.T) {
	raw := key(3)
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		got, err := ParseKey(" " + enc.EncodeToString(raw) + "\n")
		if err != nil || string(got) != string(raw) {
			t.Fatalf("ParseKey(%v) = %v", enc, err)
		}
	}
	if _, err := ParseKey(base64.StdEncoding.EncodeToString(raw[:16])); err == nil {
		t.Fatal("a 16-byte key must be rejected")
	}
	if _, err := ParseKey("not base64 !!"); err == nil {
		t.Fatal("garbage must be rejected")
	}
	if _, err := NewKeyring(raw[:31]); err == nil {
		t.Fatal("NewKeyring must reject a short key")
	}
}

func TestParseKeyList(t *testing.T) {
	a := base64.StdEncoding.EncodeToString(key(1))
	b := base64.RawURLEncoding.EncodeToString(key(2))
	if keys, err := ParseKeyList(""); err != nil || len(keys) != 0 {
		t.Fatalf("empty list = %d keys, %v; want none", len(keys), err)
	}
	keys, err := ParseKeyList(" " + a + " , ," + b + ",")
	if err != nil || len(keys) != 2 || KeyID(keys[0]) != KeyID(key(1)) || KeyID(keys[1]) != KeyID(key(2)) {
		t.Fatalf("ParseKeyList = %d keys, %v; want key(1), key(2)", len(keys), err)
	}
	if _, err := ParseKeyList(a + ",not-a-key"); err == nil || !strings.Contains(err.Error(), "key 2") {
		t.Fatalf("a malformed entry must fail naming its position, got %v", err)
	}
}
