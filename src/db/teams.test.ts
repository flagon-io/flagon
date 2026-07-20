import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import postgres from "postgres";

/**
 * Proves the teams + projects backbone end to end against a real database:
 * the organization plugin writes teams through the plural modelName mapping,
 * team listing and member counts work, and projects go through withTenant
 * (RLS) with the per-org key uniqueness surfacing as a typed error. Skipped
 * without a database, runs in CI.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
    process.env.DATABASE_URL_OWNER &&
    process.env.BETTER_AUTH_SECRET,
);

describe.skipIf(!canRun)("teams and projects backbone", () => {
  const stamp = Date.now();
  const email = `teams-${stamp}@example.com`;
  const memberEmail = `teams-${stamp}-member@example.com`;
  const invitedEmail = `teams-${stamp}-invited@example.com`;
  const orgSlug = `teams-org-${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;

  beforeAll(() => {
    // Silence the console email provider's output in test logs.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (owner) {
      await owner`DELETE FROM organizations WHERE slug = ${orgSlug}`;
      await owner`DELETE FROM users WHERE email IN (${email}, ${memberEmail}, ${invitedEmail})`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("creates a team via the plugin and a project under RLS", async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 1 });
    const { auth } = await import("@/lib/auth");
    ({ closePool } = await import("@/db/client"));
    const { createProject, listProjects } = await import(
      "@/lib/projects.server"
    );
    const { teamMemberCounts } = await import("@/lib/teams.server");

    // Sign up and carry the session cookie into the org-plugin calls.
    const { headers } = await auth.api.signUpEmail({
      body: {
        email,
        password: "teams-pw-1234",
        name: "Team Tester",
        username: `teams${stamp}`,
      },
      returnHeaders: true,
    });
    const token = /flagon\.session_token=([^;]+)/.exec(
      headers.get("set-cookie") ?? "",
    )?.[1];
    expect(token).toBeTruthy();
    const sessionHeaders = new Headers({
      cookie: `flagon.session_token=${token}`,
    });

    const org = await auth.api.createOrganization({
      body: { name: "Teams Org", slug: orgSlug },
      headers: sessionHeaders,
    });
    expect(org?.id).toBeTruthy();
    const orgId = org!.id;

    // Team lands in the plural teams table via the modelName mapping.
    const team = await auth.api.createTeam({
      body: { name: "Platform", organizationId: orgId },
      headers: sessionHeaders,
    });
    const [teamRow] = await owner`
      SELECT name, organization_id FROM teams WHERE id = ${team.id}::uuid
    `;
    expect(teamRow.name).toBe("Platform");
    expect(teamRow.organization_id).toBe(orgId);

    const listed = await auth.api.listOrganizationTeams({
      query: { organizationId: orgId },
      headers: sessionHeaders,
    });
    expect(listed.map((t) => t.name)).toContain("Platform");

    // The roster is readable without being ON the team (the owner isn't):
    // any org member can view any team, like repository-host team pages.
    const { listTeamRoster } = await import("@/lib/teams.server");
    expect(await listTeamRoster(team.id)).toEqual([]);

    // getFullOrganization joins teams when the feature is enabled - this is
    // the console's resolveOrg path, so it must survive the teams rollout.
    const full = await auth.api.getFullOrganization({
      query: { organizationSlug: orgSlug },
      headers: sessionHeaders,
    });
    expect(full?.id).toBe(orgId);
    expect(full?.teams?.map((t) => t.name)).toContain("Platform");
    expect((await teamMemberCounts(orgId)).get(team.id) ?? 0).toBe(0);

    // Projects go through withTenant (RLS) and enforce per-org slug
    // uniqueness as a typed result, not a thrown 500.
    const created = await createProject(orgId, {
      name: "Storefront",
      slug: "storefront",
    });
    expect(created.ok).toBe(true);
    const duplicate = await createProject(orgId, {
      name: "Copy",
      slug: "storefront",
    });
    expect(duplicate).toMatchObject({ ok: false, code: "slug_taken" });
    expect(
      await createProject(orgId, { name: "Bad", slug: "New" }),
    ).toMatchObject({ ok: false, code: "invalid_slug" });

    const projects = await listProjects(orgId);
    expect(projects.map((p) => p.slug)).toEqual(["storefront"]);

    // Rename + delete round out the project lifecycle (both under RLS).
    const { deleteProject, getProject, renameProject } = await import(
      "@/lib/projects.server"
    );
    const scratch = await createProject(orgId, {
      name: "Scratch",
      slug: "scratch",
    });
    expect(scratch.ok).toBe(true);
    const scratchProject = (scratch as { ok: true; project: { id: string } })
      .project;
    const renamed = await renameProject(orgId, scratchProject.id, "Scratch Pad");
    expect(renamed.ok && renamed.project.name).toBe("Scratch Pad");
    expect(await deleteProject(orgId, scratchProject.id)).toBe(true);
    expect(await getProject(orgId, "scratch")).toBeNull();

    // --- Repository-style access control -------------------------------
    const {
      listProjectGrants,
      removeProjectGrant,
      resolveProjectRole,
      upsertProjectGrant,
    } = await import("@/lib/project-access.server");
    const ownerId = (await auth.api.getSession({ headers: sessionHeaders }))!
      .user.id;
    const project = (created as { ok: true; project: { id: string } }).project;

    // A second user joins the org as a plain member.
    const memberRes = await auth.api.signUpEmail({
      body: {
        email: memberEmail,
        password: "teams-pw-5678",
        name: "Plain Member",
        username: `teamsm${stamp}`,
      },
    });
    await auth.api.addMember({
      body: {
        userId: memberRes.user.id,
        organizationId: orgId,
        role: "member",
      },
    });
    const fullOrg = await auth.api.getFullOrganization({
      query: { organizationSlug: orgSlug },
      headers: sessionHeaders,
    });
    const members = fullOrg!.members.map((m) => ({
      userId: m.userId,
      role: m.role,
    }));

    // Owner is implicitly admin; a plain member gets the read baseline.
    expect(
      await resolveProjectRole({ orgId, projectId: project.id, userId: ownerId, members }),
    ).toBe("admin");
    expect(
      await resolveProjectRole({ orgId, projectId: project.id, userId: memberRes.user.id, members }),
    ).toBe("read");
    // Non-members resolve to null (no access).
    expect(
      await resolveProjectRole({ orgId, projectId: project.id, userId: "nobody", members }),
    ).toBeNull();

    // A team grant elevates everyone on the team.
    await auth.api.addTeamMember({
      body: { teamId: team.id, userId: memberRes.user.id },
      headers: sessionHeaders,
    });
    const teamGrant = await upsertProjectGrant({
      orgId,
      projectId: project.id,
      subjectType: "team",
      subjectId: team.id,
      role: "write",
    });
    expect(teamGrant.ok).toBe(true);
    expect(
      await resolveProjectRole({ orgId, projectId: project.id, userId: memberRes.user.id, members }),
    ).toBe("write");

    // A direct grant wins when higher; upsert is idempotent per subject.
    await upsertProjectGrant({
      orgId,
      projectId: project.id,
      subjectType: "user",
      subjectId: memberRes.user.id,
      role: "admin",
    });
    expect(
      await resolveProjectRole({ orgId, projectId: project.id, userId: memberRes.user.id, members }),
    ).toBe("admin");

    const grants = await listProjectGrants(orgId, project.id);
    expect(grants).toHaveLength(2);
    expect(grants.map((g) => g.subject.type).sort()).toEqual(["team", "user"]);

    // Bilateral view: the team sees the projects it holds grants on.
    const { listTeamProjectGrants } = await import(
      "@/lib/project-access.server"
    );
    const teamProjects = await listTeamProjectGrants(orgId, team.id);
    expect(teamProjects).toHaveLength(1);
    expect(teamProjects[0].project.slug).toBe("storefront");
    expect(teamProjects[0].role).toBe("write");

    // Revoking the direct grant falls back to the team grant.
    const directGrant = grants.find((g) => g.subject.type === "user")!;
    expect(await removeProjectGrant(orgId, project.id, directGrant.id)).toBe(true);
    expect(
      await resolveProjectRole({ orgId, projectId: project.id, userId: memberRes.user.id, members }),
    ).toBe("write");

    // --- Invitation flow: invite -> sign up -> accept ------------------
    const invitation = await auth.api.createInvitation({
      body: {
        email: invitedEmail,
        role: "member",
        organizationId: orgId,
        resend: true,
      },
      headers: sessionHeaders,
    });
    expect(invitation.status).toBe("pending");

    const { headers: invitedSignupHeaders } = await auth.api.signUpEmail({
      body: {
        email: invitedEmail,
        password: "teams-pw-9012",
        name: "Invited Person",
        username: `teamsi${stamp}`,
      },
      returnHeaders: true,
    });
    // Verify the address so verification-gated invitation flows pass.
    await owner`UPDATE users SET email_verified = true WHERE email = ${invitedEmail}`;
    const invitedToken = /flagon\.session_token=([^;]+)/.exec(
      invitedSignupHeaders.get("set-cookie") ?? "",
    )?.[1];
    const invitedHeaders = new Headers({
      cookie: `flagon.session_token=${invitedToken}`,
    });

    const accepted = await auth.api.acceptInvitation({
      body: { invitationId: invitation.id },
      headers: invitedHeaders,
    });
    expect(accepted?.invitation.status).toBe("accepted");

    const roster = await auth.api.getFullOrganization({
      query: { organizationSlug: orgSlug },
      headers: sessionHeaders,
    });
    expect(roster!.members).toHaveLength(3);
    expect(
      roster!.members.map((m) => m.user.email).sort(),
    ).toContain(invitedEmail);
  });
});
