package db

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/paginate"
)

// TestProjectRestoreWindowAndNewSlug proves project restore matches org restore:
// the archive lists only projects deleted within DeletedRetention (each with
// purge_at), restoring outside the window is ErrProjectNotFound, a slug taken by
// a live project is ErrProjectSlugTaken, and restore can take a new slug instead
// of forcing the live project to be renamed. Skips unless
// FLAGON_TEST_DATABASE_URL is set.
func TestProjectRestoreWindowAndNewSlug(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	owner := "user-restore-owner-" + unique(t)
	slug := "restore-co-" + unique(t)
	if _, err := d.CreateOrg(ctx, owner, "restore-owner@example.com", "Restore Co", slug); err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}
	for _, p := range []ProjectInput{{Name: "Web", Slug: "web"}, {Name: "Old", Slug: "old"}} {
		if _, err := d.CreateProject(ctx, owner, slug, p); err != nil {
			t.Fatalf("CreateProject %s: %v", p.Slug, err)
		}
		if _, err := d.SetProjectDeleted(ctx, owner, slug, p.Slug, true); err != nil {
			t.Fatalf("delete %s: %v", p.Slug, err)
		}
	}

	// Age "old" past the retention window (as the migrator: the app role cannot
	// rewrite deleted_at).
	migrator, err := pgx.Connect(ctx, cfg.MigratorURL)
	if err != nil {
		t.Fatalf("connect migrator: %v", err)
	}
	defer func() { _ = migrator.Close(ctx) }()
	if _, err := migrator.Exec(ctx, `
		UPDATE public.projects p SET deleted_at = now() - interval '31 days'
		FROM public.orgs o WHERE o.id = p.org_id AND o.slug = $1 AND p.slug = 'old'`, slug); err != nil {
		t.Fatalf("age project: %v", err)
	}

	// The archive lists only the restorable one, with purge_at.
	deleted, _, err := d.ListDeletedProjects(ctx, owner, slug, paginate.Query{})
	if err != nil {
		t.Fatalf("ListDeletedProjects: %v", err)
	}
	if len(deleted) != 1 || deleted[0].Slug != "web" {
		t.Fatalf("archive = %v, want just web", slugs(deleted))
	}
	if deleted[0].PurgeAt == nil || deleted[0].DeletedAt == nil ||
		!deleted[0].PurgeAt.Equal(deleted[0].DeletedAt.Add(DeletedRetention)) {
		t.Fatalf("purge_at = %v, want deleted_at + %v", deleted[0].PurgeAt, DeletedRetention)
	}
	if left := time.Until(*deleted[0].PurgeAt); left < 29*24*time.Hour {
		t.Fatalf("purge_at only %v away, want ~30 days", left)
	}

	// Outside the window: gone.
	if _, err := d.RestoreProject(ctx, owner, slug, "old", ""); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("restore past the window = %v, want ErrProjectNotFound", err)
	}

	// A live project takes "web": restoring under the old slug conflicts...
	if _, err := d.CreateProject(ctx, owner, slug, ProjectInput{Name: "Web 2", Slug: "web"}); err != nil {
		t.Fatalf("reuse slug: %v", err)
	}
	if _, err := d.RestoreProject(ctx, owner, slug, "web", ""); !errors.Is(err, ErrProjectSlugTaken) {
		t.Fatalf("restore onto a taken slug = %v, want ErrProjectSlugTaken", err)
	}
	// ...and a new taken slug conflicts too...
	if _, err := d.RestoreProject(ctx, owner, slug, "web", "web"); !errors.Is(err, ErrProjectSlugTaken) {
		t.Fatalf("restore under a taken new slug = %v, want ErrProjectSlugTaken", err)
	}
	// ...but a free new slug restores it without touching the live project.
	p, err := d.RestoreProject(ctx, owner, slug, "web", "web-classic")
	if err != nil {
		t.Fatalf("restore under a new slug: %v", err)
	}
	if p.Slug != "web-classic" || p.Name != "Web" {
		t.Fatalf("restored = %s/%s, want Web at web-classic", p.Name, p.Slug)
	}
	live, _, err := d.ListProjects(ctx, owner, slug, paginate.Query{})
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if got := slugs(live); len(got) != 2 {
		t.Fatalf("live projects = %v, want web and web-classic", got)
	}
}
