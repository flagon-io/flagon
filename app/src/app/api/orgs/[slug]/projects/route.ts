import { NextResponse } from "next/server";
import { createProject, listProjects, type CreateProjectBody } from "@/lib/flagon-api";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  try {
    const page = await listProjects(slug, {
      q: url.searchParams.get("q") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: limitParam ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ items: page.items, next: page.next });
  } catch {
    return NextResponse.json({ items: [], next: null });
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
