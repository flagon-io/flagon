/**
 * Management-API scopes (fine-grained tokens). A token whose `scopes` is a
 * non-empty set is restricted to exactly those; a null/empty set means the token
 * inherits its full role permissions (classic, unrestricted). Sessions are never
 * scoped. These scopes apply ONLY to /api/v1. Capability scopes (flags, …) are
 * added here as those capabilities land.
 */

export const API_SCOPES = [
  { value: 'projects:read', label: 'Projects: read' },
  { value: 'projects:write', label: 'Projects: write' },
  { value: 'environments:read', label: 'Environments: read' },
  { value: 'environments:write', label: 'Environments: write' },
  { value: 'members:read', label: 'Members: read' },
  { value: 'members:write', label: 'Members: write' },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]['value'];

export const API_SCOPE_VALUES: readonly string[] = API_SCOPES.map((s) => s.value);

/**
 * Keep only valid, de-duplicated scopes. Returns null when the result is empty,
 * so "no scopes" consistently means "unrestricted / inherit the role".
 */
export function normalizeScopes(input: string[] | null | undefined): string[] | null {
  if (!input) return null;
  const valid = [...new Set(input.filter((s) => API_SCOPE_VALUES.includes(s)))];
  return valid.length ? valid : null;
}

/** Does a principal's scope set permit `required`? Unrestricted (null/empty) → yes. */
export function scopeAllows(scopes: string[] | null | undefined, required: ApiScope): boolean {
  if (!scopes || scopes.length === 0) return true;
  return scopes.includes(required);
}
