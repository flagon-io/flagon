/**
 * Normalize list responses across API versions. The canonical response is an
 * array; accepting a named envelope keeps rolling deploys compatible without
 * allowing arbitrary JSON objects to reach array-only UI code.
 */
export function listFromResponse<T>(body: unknown, envelopeKey: string): T[] {
  if (Array.isArray(body)) return body as T[];
  if (!body || typeof body !== "object") return [];

  const enveloped = (body as Record<string, unknown>)[envelopeKey];
  return Array.isArray(enveloped) ? (enveloped as T[]) : [];
}
