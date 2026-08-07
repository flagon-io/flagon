"use server";

import { revalidatePath } from "next/cache";
import {
  addActionItem,
  addIncidentService,
  attachRunbookToIncident,
  declareIncident,
  deleteActionItem,
  postIncidentUpdate,
  putRcca,
  removeIncidentService,
  resolveIncident,
  toggleChecklistItem,
  updateActionItem,
  updateIncident,
  type DeclareBody,
} from "@/lib/incidents-api";
import {
  createRunbook,
  deleteRunbook,
  setRunbookSteps,
  updateRunbook,
  type RunbookStepInput,
} from "@/lib/runbooks-api";

/**
 * Server actions for the Reliability product. Thin wrappers over the API clients
 * (which forward the session cookie, so the API authorizes org + role), then
 * revalidate. Authorization lives in the API.
 */

// --- Incidents --------------------------------------------------------------
export async function declareIncidentAction(slug: string, body: DeclareBody): Promise<{ number?: number; error?: string }> {
  const res = await declareIncident(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents`);
  return { number: res.data?.incident.number };
}
export async function updateIncidentAction(slug: string, number: number, body: Record<string, unknown>): Promise<{ error?: string }> {
  const res = await updateIncident(slug, number, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  revalidatePath(`/${slug}/incidents`);
  return {};
}
export async function postUpdateAction(slug: string, number: number, body: { body: string; status?: string }): Promise<{ error?: string }> {
  const res = await postIncidentUpdate(slug, number, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  revalidatePath(`/${slug}/incidents`);
  return {};
}
export async function resolveIncidentAction(slug: string, number: number): Promise<{ error?: string }> {
  const res = await resolveIncident(slug, number);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  revalidatePath(`/${slug}/incidents`);
  return {};
}
export async function addServiceAction(slug: string, number: number, projectKey: string): Promise<{ error?: string }> {
  const res = await addIncidentService(slug, number, projectKey);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  return {};
}
export async function removeServiceAction(slug: string, number: number, projectKey: string): Promise<{ error?: string }> {
  const res = await removeIncidentService(slug, number, projectKey);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  return {};
}
export async function attachRunbookAction(slug: string, number: number, runbookKey: string): Promise<{ error?: string }> {
  const res = await attachRunbookToIncident(slug, number, runbookKey);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  return {};
}
export async function toggleChecklistAction(slug: string, number: number, itemId: string): Promise<{ error?: string }> {
  const res = await toggleChecklistItem(slug, number, itemId);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  return {};
}

// --- RCCA -------------------------------------------------------------------
export async function putRccaAction(slug: string, number: number, values: Record<string, string>): Promise<{ error?: string }> {
  const res = await putRcca(slug, number, values);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  return {};
}
export async function addActionItemAction(slug: string, number: number, body: { title: string; description?: string; assigneeUserId?: string }): Promise<{ error?: string }> {
  const res = await addActionItem(slug, number, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  return {};
}
export async function updateActionItemAction(slug: string, number: number, itemId: string, body: Record<string, unknown>): Promise<{ error?: string }> {
  const res = await updateActionItem(slug, number, itemId, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  return {};
}
export async function deleteActionItemAction(slug: string, number: number, itemId: string): Promise<{ error?: string }> {
  const res = await deleteActionItem(slug, number, itemId);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
  return {};
}

// --- Runbooks ---------------------------------------------------------------
export async function createRunbookAction(slug: string, body: { key: string; name: string; description?: string }): Promise<{ key?: string; error?: string }> {
  const res = await createRunbook(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/runbooks`);
  return { key: res.data?.runbook.key };
}
export async function updateRunbookAction(slug: string, key: string, body: Record<string, unknown>): Promise<{ error?: string }> {
  const res = await updateRunbook(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/runbooks`);
  return {};
}
export async function deleteRunbookAction(slug: string, key: string): Promise<{ error?: string }> {
  const res = await deleteRunbook(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/runbooks`);
  return {};
}
export async function setRunbookStepsAction(slug: string, key: string, steps: RunbookStepInput[]): Promise<{ error?: string }> {
  const res = await setRunbookSteps(slug, key, steps);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/runbooks`);
  return {};
}
