"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSegment, deleteSegment, updateSegment } from "@/lib/segments.server";
import type { CriteriaGroup } from "@/lib/flags";
import { resolveOrg } from "../resolve-org";
import { appPath } from "@/lib/urls";
const refresh = (slug: string) => revalidatePath("/app/" + slug + "/segments");
export async function createSegmentAction(slug: string, form: FormData) { const org = await resolveOrg(slug); if (!org) return; const result = await createSegment(org.id, { name: String(form.get("name") ?? ""), key: String(form.get("key") ?? "") }); if (!result.ok) return; refresh(slug); redirect(appPath(`/${slug}/segments/${result.segment.key}`)); }
export async function saveSegmentAction(slug: string, key: string, form: FormData) { const org = await resolveOrg(slug); if (!org) return; try { await updateSegment(org.id, key, { name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), criteria: JSON.parse(String(form.get("criteria") ?? "{}")) as CriteriaGroup }); } catch { return; } refresh(slug); revalidatePath(`/app/${slug}/segments/${key}`); }
export async function deleteSegmentAction(slug: string, key: string) { const org = await resolveOrg(slug); if (!org) return; await deleteSegment(org.id, key); refresh(slug); }
