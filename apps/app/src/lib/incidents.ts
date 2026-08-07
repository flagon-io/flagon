/**
 * Reliability vocabulary the console renders. Status slugs stay in lockstep with the
 * API enums in apps/api/src/routes/v1/incidents.route.ts, and escalation target types
 * with oncall.route.ts. Severity is NOT hardcoded here: it is org-configurable (see
 * the incident_severity_levels table + severity-levels-api.ts) and threaded in as data.
 */
export type Option = { value: string; label: string };

/** How a severity rolls into the global/platform uptime total. */
export type PlatformMode = "full" | "proportional" | "none";

/** An org's configured severity level (mirrors the API's /severity-levels shape). */
export type SeverityLevel = {
  key: string;
  name: string;
  description: string | null;
  rank: number;
  color: string;
  /** Service impact: how much this severity counts against the affected project's uptime (0..1). */
  downtimeWeight: number;
  /** Platform impact: how it rolls into the global total (decoupled from per-service). */
  platformMode: PlatformMode;
  isDefault: boolean;
};

export const STATUSES: Option[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
];

export const TARGET_TYPES: Option[] = [
  { value: "schedule", label: "Schedule" },
  { value: "team", label: "Team" },
  { value: "user", label: "User" },
];

export function labelFor(options: Option[], value: string | null): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Find a severity level by key (for a badge's label + color). */
export function findLevel(levels: SeverityLevel[], key: string): SeverityLevel | undefined {
  return levels.find((l) => l.key === key);
}

/**
 * Inline pill styles derived from a severity level's hex color (metallic tone like the
 * readiness badge): a translucent fill + border off the same hue. Falls back to zinc.
 */
export function severityStyle(color: string): { bg: string; fg: string; border: string } {
  const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#a1a1aa";
  return { bg: `${hex}22`, fg: hex, border: `${hex}44` };
}
