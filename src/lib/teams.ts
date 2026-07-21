/**
 * Team name rules, shared by client forms and the server. Teams are named
 * groups of org members; resources (projects, feature flags) become
 * shareable with teams so access is granted to groups instead of one member
 * at a time.
 *
 * Data access lives in ./teams.server.ts (this module stays free of database
 * imports so client components can use the validation).
 */
export const TEAM_NAME_MIN_LENGTH = 2;
export const TEAM_NAME_MAX_LENGTH = 50;

export const TEAM_NAME_HINT = `Team names are ${TEAM_NAME_MIN_LENGTH}-${TEAM_NAME_MAX_LENGTH} characters and unique within the organization.`;

export type TeamNameValidation =
  { ok: true; name: string } | { ok: false; error: string };

export function validateTeamName(rawName: string): TeamNameValidation {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (
    name.length < TEAM_NAME_MIN_LENGTH ||
    name.length > TEAM_NAME_MAX_LENGTH
  ) {
    return {
      ok: false,
      error: `Team name must be between ${TEAM_NAME_MIN_LENGTH} and ${TEAM_NAME_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, name };
}
