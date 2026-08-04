"use server";

import { revalidatePath } from "next/cache";
import {
  acknowledgeIncident,
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
  setRunbookServices,
  setRunbookSteps,
  updateRunbook,
} from "@/lib/runbooks-api";
import {
  addOverride,
  createPolicy,
  createSchedule,
  deletePolicy,
  deleteSchedule,
  removeOverride,
  setPolicyLevels,
  setScheduleMembers,
  updatePolicy,
  updateSchedule,
} from "@/lib/oncall-api";

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
export async function acknowledgeIncidentAction(slug: string, number: number): Promise<{ error?: string }> {
  const res = await acknowledgeIncident(slug, number);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/${number}`);
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
export async function createRunbookAction(slug: string, body: { key: string; name: string; description?: string; triggerSeverity?: string }): Promise<{ key?: string; error?: string }> {
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
export async function setRunbookStepsAction(slug: string, key: string, steps: { title: string; body?: string; kind: string; url?: string }[]): Promise<{ error?: string }> {
  const res = await setRunbookSteps(slug, key, steps);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/runbooks`);
  return {};
}
export async function setRunbookServicesAction(slug: string, key: string, projectKeys: string[]): Promise<{ error?: string }> {
  const res = await setRunbookServices(slug, key, projectKeys);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/runbooks`);
  return {};
}

// --- On-call schedules ------------------------------------------------------
export async function createScheduleAction(slug: string, body: Record<string, unknown>): Promise<{ key?: string; error?: string }> {
  const res = await createSchedule(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/on-call`);
  return { key: res.data?.schedule.key };
}
export async function updateScheduleAction(slug: string, key: string, body: Record<string, unknown>): Promise<{ error?: string }> {
  const res = await updateSchedule(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/on-call`);
  return {};
}
export async function deleteScheduleAction(slug: string, key: string): Promise<{ error?: string }> {
  const res = await deleteSchedule(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/on-call`);
  return {};
}
export async function setScheduleMembersAction(slug: string, key: string, userIds: string[]): Promise<{ error?: string }> {
  const res = await setScheduleMembers(slug, key, userIds);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/on-call`);
  return {};
}
export async function addOverrideAction(slug: string, key: string, body: { userId: string; startsAt: string; endsAt: string }): Promise<{ error?: string }> {
  const res = await addOverride(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/on-call`);
  return {};
}
export async function removeOverrideAction(slug: string, key: string, id: string): Promise<{ error?: string }> {
  const res = await removeOverride(slug, key, id);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/on-call`);
  return {};
}

// --- Escalation policies ----------------------------------------------------
export async function createPolicyAction(slug: string, body: { key: string; name: string }): Promise<{ key?: string; error?: string }> {
  const res = await createPolicy(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/escalation`);
  return { key: res.data?.policy.key };
}
export async function deletePolicyAction(slug: string, key: string): Promise<{ error?: string }> {
  const res = await deletePolicy(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/escalation`);
  return {};
}
export async function updatePolicyAction(slug: string, key: string, body: { name?: string; repeatCount?: number }): Promise<{ error?: string }> {
  const res = await updatePolicy(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/escalation`);
  return {};
}
export async function setPolicyLevelsAction(slug: string, key: string, levels: { targetType: string; targetRef: string; delayMinutes: number }[]): Promise<{ error?: string }> {
  const res = await setPolicyLevels(slug, key, levels);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/escalation`);
  return {};
}
