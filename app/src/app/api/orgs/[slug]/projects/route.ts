import { NextResponse } from "next/server";
import { routeError, badRequest, listOptionsFrom } from "@/lib/route-error";
import { createProject, listProjects, type CreateProjectBody } from "@/lib/flagon-api";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const page = await listProjects(slug, listOptionsFrom(request));
    return NextResponse.json({ items: page.items, next: page.next });
  } catch (e) {
    return routeError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const raw = await request.json().catch(() => ({}));
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return badRequest("A name is required.");

  const body: CreateProjectBody = { name };
  if (typeof raw.slug === "string" && raw.slug.trim()) body.slug = raw.slug.trim();
  if (typeof raw.description === "string") body.description = raw.description;
  if (typeof raw.readme === "string") body.readme = raw.readme;
  if (typeof raw.repository_url === "string") body.repository_url = raw.repository_url.trim();

  try {
    const project = await createProject(slug, body);
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    return routeError(e, "Could not create the project.");
  }
}
