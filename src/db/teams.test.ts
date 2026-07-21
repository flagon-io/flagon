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
    const { createProject, listProjects } =
      await import("@/lib/projects.server");
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
    const { deleteProject, getProject, renameProject } =
      await import("@/lib/projects.server");
    const scratch = await createProject(orgId, {
      name: "Scratch",
      slug: "scratch",
    });
    expect(scratch.ok).toBe(true);
    const scratchProject = (scratch as { ok: true; project: { id: string } })
      .project;
    const renamed = await renameProject(
      orgId,
      scratchProject.id,
      "Scratch Pad",
    );
    expect(renamed.ok && renamed.project.name).toBe("Scratch Pad");

    // Details (drizzle/0029) are stored normalized, and the slug can move.
    const { changeProjectSlug, updateProjectDetails } =
      await import("@/lib/projects.server");
    const detailed = await updateProjectDetails(orgId, scratchProject.id, {
      description: "  A scratch project.  ",
      website: "flagon.io/docs",
      topics: "Scratch, notes scratch",
    });
    expect(detailed).toMatchObject({
      ok: true,
      project: {
        description: "A scratch project.",
        website: "https://flagon.io/docs",
        topics: ["scratch", "notes"],
      },
    });
    // The app rejects what the column's CHECK would also reject, with a
    // message instead of a constraint violation.
    expect(
      await updateProjectDetails(orgId, scratchProject.id, {
        topics: ["Not A Topic"],
      }),
    ).toMatchObject({ ok: false, code: "invalid_topics" });

    // Moving the slug leaves NOTHING at the old path, and cannot collide.
    expect(
      await changeProjectSlug(orgId, scratchProject.id, "storefront"),
    ).toMatchObject({ ok: false, code: "slug_taken" });
    expect(
      await changeProjectSlug(orgId, scratchProject.id, "New"),
    ).toMatchObject({ ok: false, code: "invalid_slug" });
    const moved = await changeProjectSlug(
      orgId,
      scratchProject.id,
      "scratch-pad",
    );
    expect(moved.ok && moved.project.slug).toBe("scratch-pad");
    expect(await getProject(orgId, "scratch")).toBeNull();
    expect((await getProject(orgId, "scratch-pad"))?.id).toBe(
      scratchProject.id,
    );

    expect(await deleteProject(orgId, scratchProject.id)).toBe(true);
    expect(await getProject(orgId, "scratch-pad")).toBeNull();

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

    const { listProjectOwners, replaceProjectOwners } =
      await import("@/lib/project-ownership.server");
    const { updateProjectOverview } = await import("@/lib/projects.server");
    expect(
      (
        await updateProjectOverview(
          orgId,
          project.id,
          "# Storefront\n\nOwned and documented.",
        )
      ).ok,
    ).toBe(true);
    expect(
      (await replaceProjectOwners(orgId, project.id, { teamIds: [team.id] }))
        .ok,
    ).toBe(true);
    expect(await listProjectOwners(orgId, project.id)).toMatchObject([
      { kind: "team", subjectId: team.id, name: "Platform" },
    ]);

    // An owner can also be a PERSON (drizzle/0026), so responsibility does not
    // have to be laundered through a single-member team.
    expect(
      (
        await replaceProjectOwners(orgId, project.id, {
          teamIds: [team.id],
          userIds: [ownerId],
        })
      ).ok,
    ).toBe(true);
    expect(await listProjectOwners(orgId, project.id)).toHaveLength(2);

    // ...but only people who are actually members of this organization.
    const stranger = await replaceProjectOwners(orgId, project.id, {
      userIds: ["nobody"],
    });
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) expect(stranger.code).toBe("invalid_user");
    // A rejected replace leaves the previous owners untouched.
    expect(await listProjectOwners(orgId, project.id)).toHaveLength(2);

    // Owner is implicitly admin; a plain member gets the read baseline.
    expect(
      await resolveProjectRole({
        orgId,
        projectId: project.id,
        userId: ownerId,
        members,
      }),
    ).toBe("admin");
    expect(
      await resolveProjectRole({
        orgId,
        projectId: project.id,
        userId: memberRes.user.id,
        members,
      }),
    ).toBe("read");
    // Non-members resolve to null (no access).
    expect(
      await resolveProjectRole({
        orgId,
        projectId: project.id,
        userId: "nobody",
        members,
      }),
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
      await resolveProjectRole({
        orgId,
        projectId: project.id,
        userId: memberRes.user.id,
        members,
      }),
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
      await resolveProjectRole({
        orgId,
        projectId: project.id,
        userId: memberRes.user.id,
        members,
      }),
    ).toBe("admin");

    const grants = await listProjectGrants(orgId, project.id);
    expect(grants).toHaveLength(2);
    expect(grants.map((g) => g.subject.type).sort()).toEqual(["team", "user"]);

    // Bilateral view: the team sees the projects it is attached to, and by
    // which of the two independent mechanisms.
    const { listTeamProjects } = await import("@/lib/project-access.server");
    const teamProjects = await listTeamProjects(orgId, team.id);
    expect(teamProjects).toHaveLength(1);
    expect(teamProjects[0].project.slug).toBe("storefront");
    expect(teamProjects[0].role).toBe("write");
    expect(teamProjects[0].owner).toBe(true);

    // Revoking the direct grant falls back to the team grant.
    const directGrant = grants.find((g) => g.subject.type === "user")!;
    expect(await removeProjectGrant(orgId, project.id, directGrant.id)).toBe(
      true,
    );
    expect(
      await resolveProjectRole({
        orgId,
        projectId: project.id,
        userId: memberRes.user.id,
        members,
      }),
    ).toBe("write");

    // Ownership survives the loss of access, and is still reported: a team
    // that is responsible for a project it can no longer open is the row the
    // team page exists to surface, so it must not fall out of the list.
    const teamGrantRow = grants.find((g) => g.subject.type === "team")!;
    expect(await removeProjectGrant(orgId, project.id, teamGrantRow.id)).toBe(
      true,
    );
    expect(await listTeamProjects(orgId, team.id)).toMatchObject([
      { project: { slug: "storefront" }, role: null, owner: true },
    ]);
    // Put it back so the rest of the flow reads against the granted state.
    expect(
      (
        await upsertProjectGrant({
          orgId,
          projectId: project.id,
          subjectType: "team",
          subjectId: team.id,
          role: "write",
        })
      ).ok,
    ).toBe(true);

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
    expect(roster!.members.map((m) => m.user.email).sort()).toContain(
      invitedEmail,
    );

    // --- Exactly one owner, moved by transfer -------------------------
    const { transferOwnership } = await import("@/lib/org-owner.server");
    const owners = <T extends { role: string }>(m: T[]) =>
      m.filter((row) => row.role === "owner");
    expect(owners(roster!.members)).toHaveLength(1);

    // A non-owner cannot hand the organization to anyone.
    expect(
      await transferOwnership({
        orgId,
        fromUserId: memberRes.user.id,
        toUserId: ownerId,
      }),
    ).toMatchObject({ ok: false, code: "not_owner" });

    // Someone outside the organization cannot receive it.
    expect(
      await transferOwnership({
        orgId,
        fromUserId: ownerId,
        toUserId: "nobody",
      }),
    ).toMatchObject({ ok: false, code: "not_a_member" });

    // The owner hands it over: the seat moves and they step down to admin.
    expect(
      await transferOwnership({
        orgId,
        fromUserId: ownerId,
        toUserId: memberRes.user.id,
      }),
    ).toEqual({ ok: true });

    const afterTransfer = await auth.api.getFullOrganization({
      query: { organizationSlug: orgSlug },
      headers: sessionHeaders,
    });
    const ownersNow = owners(afterTransfer!.members);
    expect(ownersNow).toHaveLength(1);
    expect(ownersNow[0].userId).toBe(memberRes.user.id);
    expect(afterTransfer!.members.find((m) => m.userId === ownerId)!.role).toBe(
      "admin",
    );
  });
});
