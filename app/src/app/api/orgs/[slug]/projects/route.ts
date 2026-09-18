import { NextResponse } from "next/server";
import { createProject, listProjects, type CreateProjectBody } from "@/lib/flagon-api";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const projects = await listProjects(slug);
    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json({ projects: [] });
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const raw = await request.json().catch(() => ({}));
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

  const body: CreateProjectBody = { name };
  if (typeof raw.slug === "string" && raw.slug.trim()) body.slug = raw.slug.trim();
  if (typeof raw.description === "string") body.description = raw.description;
  if (typeof raw.readme === "string") body.readme = raw.readme;
  if (typeof raw.repository_url === "string") body.repository_url = raw.repository_url.trim();

  try {
    const project = await createProject(slug, body);
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create the project.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
