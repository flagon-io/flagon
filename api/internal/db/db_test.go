package db

import (
	"context"
	"errors"
	"testing"
)

func TestPingUnconfiguredReportsUnavailable(t *testing.T) {
	d := Open(context.Background(), Config{})
	defer d.Close()

	if err := d.Ping(context.Background()); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("Ping() = %v, want ErrUnavailable", err)
	}
}

func TestAppRoleCredentials(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		wantRole string
		wantErr  bool
	}{
		{
			name:     "valid",
			url:      "postgres://flagon_app:s3cret@db:5432/flagon_api",
			wantRole: "flagon_app",
		},
		{
			name:    "empty",
			url:     "",
			wantErr: true,
		},
		{
			name:    "no password",
			url:     "postgres://flagon_app@db:5432/flagon_api",
			wantErr: true,
		},
		{
			name:    "role not an identifier",
			url:     "postgres://a-b;drop:pw@db:5432/flagon_api",
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			role, pass, err := appRoleCredentials(tt.url)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got role=%q", role)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if role != tt.wantRole {
				t.Errorf("role = %q, want %q", role, tt.wantRole)
			}
			if pass == "" {
				t.Errorf("password unexpectedly empty")
			}
		})
	}
}

func TestQuoting(t *testing.T) {
	if got, want := quoteIdent(`weird"name`), `"weird""name"`; got != want {
		t.Errorf("quoteIdent = %q, want %q", got, want)
	}
	if got, want := quoteLiteral(`pa'ss`), `'pa''ss'`; got != want {
		t.Errorf("quoteLiteral = %q, want %q", got, want)
	}
}
