/**
 * Reliability vocabulary the console renders. Severity/status slugs stay in
 * lockstep with the API enums in apps/api/src/routes/v1/incidents.route.ts, and
 * escalation target types with oncall.route.ts.
 */
export type Option = { value: string; label: string };

export type SeverityTone = "red" | "orange" | "amber" | "muted";
export const SEVERITIES: (Option & { tone: SeverityTone })[] = [
  { value: "sev1", label: "SEV1", tone: "red" },
  { value: "sev2", label: "SEV2", tone: "orange" },
  { value: "sev3", label: "SEV3", tone: "amber" },
  { value: "sev4", label: "SEV4", tone: "muted" },
];

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

export function severityTone(value: string): SeverityTone {
  return SEVERITIES.find((s) => s.value === value)?.tone ?? "muted";
}

/** Inline styles for a severity pill (metallic tones like the readiness badge). */
export const SEVERITY_STYLE: Record<SeverityTone, { bg: string; fg: string; border: string }> = {
  red: { bg: "#f8717122", fg: "#f87171", border: "#f8717144" },
  orange: { bg: "#fb923c22", fg: "#fb923c", border: "#fb923c44" },
  amber: { bg: "#fbbf2422", fg: "#fbbf24", border: "#fbbf2444" },
  muted: { bg: "#a1a1aa22", fg: "#a1a1aa", border: "#a1a1aa44" },
};
