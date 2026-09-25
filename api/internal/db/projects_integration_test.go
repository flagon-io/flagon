package db

import (
	"context"
	"testing"

	"github.com/flagon-io/flagon/api/internal/paginate"
)

// TestProjectListingQueries exercises the real ListProjects / ListDeletedProjects
// SQL against Postgres. It guards the keyset sort key: `id` is a uuid, so the
// sort_key array must cast it to text (`ARRAY[lower(name), id::text]`) - without
// the cast Postgres rejects the query ("ARRAY types text and uuid cannot be
// matched") and both endpoints 500. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestProjectListingQueries(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	owner := "user-proj-owner-" + unique(t)
	slug := "proj-co-" + unique(t)
	if _, err := d.CreateOrg(ctx, owner, "owner@example.com", "Proj Co", slug); err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}

	// Two live projects.
	for _, p := range []ProjectInput{
		{Name: "Beta", Slug: "beta"},
		{Name: "alpha", Slug: "alpha"},
	} {
		if _, err := d.CreateProject(ctx, owner, slug, p); err != nil {
			t.Fatalf("CreateProject %s: %v", p.Slug, err)
		}
	}

	// ListProjects must run (the sort_key cast) and return both, name-ordered.
	live, _, err := d.ListProjects(ctx, owner, slug, paginate.Query{})
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(live) != 2 {
		t.Fatalf("ListProjects returned %d projects, want 2", len(live))
	}
	if live[0].Slug != "alpha" || live[1].Slug != "beta" {
		t.Errorf("ListProjects order = [%s %s], want [alpha beta]", live[0].Slug, live[1].Slug)
	}

	// Soft-delete one; it leaves the live list and enters the archive.
	if _, err := d.SetProjectDeleted(ctx, owner, slug, "beta", true); err != nil {
		t.Fatalf("SetProjectDeleted: %v", err)
	}

	live, _, err = d.ListProjects(ctx, owner, slug, paginate.Query{})
	if err != nil {
		t.Fatalf("ListProjects after delete: %v", err)
	}
	if len(live) != 1 || live[0].Slug != "alpha" {
		t.Fatalf("ListProjects after delete = %+v, want just alpha", slugs(live))
	}

	// ListDeletedProjects is the endpoint that was 500ing in production.
	deleted, _, err := d.ListDeletedProjects(ctx, owner, slug, paginate.Query{})
	if err != nil {
		t.Fatalf("ListDeletedProjects: %v", err)
	}
	if len(deleted) != 1 || deleted[0].Slug != "beta" {
		t.Fatalf("ListDeletedProjects = %+v, want just beta", slugs(deleted))
	}
	if deleted[0].DeletedAt == nil {
		t.Error("deleted project has nil DeletedAt; the archive row should carry its deletion time")
	}
}

func slugs(ps []Project) []string {
	out := make([]string, len(ps))
	for i, p := range ps {
		out[i] = p.Slug
	}
	return out
}
