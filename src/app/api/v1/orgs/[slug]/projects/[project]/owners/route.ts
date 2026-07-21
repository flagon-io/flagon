import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import { roleAtLeast } from "@/lib/project-access";
import {
  listProjectOwners,
  replaceProjectOwners,
  serializeProjectOwner,
} from "@/lib/project-ownership.server";
import { resolveProjectContext } from "../context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; project: string }> },
) {
  const { slug, project } = await params;
  const result = await resolveProjectContext(
    request,
    slug,
    project,
    "projects:read",
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiJson(
    (await listProjectOwners(result.ctx.org.id, result.ctx.project.id)).map(
      serializeProjectOwner,
    ),
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string; project: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, project } = await params;
  const result = await resolveProjectContext(
    request,
    slug,
    project,
    "projects:write",
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);
  if (!roleAtLeast(result.ctx.role, "admin"))
    return apiError(
      403,
      "forbidden",
      "Project admin access required to assign ownership.",
    );
  const body = await request.json().catch(() => null);
  // An owner is a team or a person (drizzle/0026). team_ids keeps its original
  // meaning so existing callers are unaffected; user_ids is additive. Omitting
  // a list clears that kind of owner, which is what "replace" has always meant.
  const strings = (value: unknown) =>
    Array.isArray(value) && value.every((id) => typeof id === "string");
  if (body?.team_ids !== undefined && !strings(body.team_ids))
    return apiError(
      400,
      "invalid_owners",
      "team_ids must be an array of team IDs.",
    );
  if (body?.user_ids !== undefined && !strings(body.user_ids))
    return apiError(
      400,
      "invalid_owners",
      "user_ids must be an array of user IDs.",
    );
  if (body?.team_ids === undefined && body?.user_ids === undefined)
    return apiError(
      400,
      "invalid_owners",
      "Provide team_ids, user_ids, or both.",
    );
  const replaced = await replaceProjectOwners(
    result.ctx.org.id,
    result.ctx.project.id,
    { teamIds: body.team_ids ?? [], userIds: body.user_ids ?? [] },
  );
  return replaced.ok
    ? apiJson(replaced.owners.map(serializeProjectOwner))
    : apiError(400, replaced.code, replaced.error);
}
