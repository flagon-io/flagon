/**
 * Catalog vocabulary — the fixed option sets the console renders for a project's
 * metadata and access. Mirrors the enums the API validates (projects.route.ts).
 * Kept in one place so the pickers and the read-only display stay in lockstep.
 */
export type Option = { value: string; label: string };
export type RoleOption = { value: string; label: string; description: string };

export const LIFECYCLES: Option[] = [
  { value: "planning", label: "Planning" },
  { value: "in_development", label: "In development" },
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
  { value: "ga", label: "GA" },
  { value: "deprecated", label: "Deprecated" },
];

export const TIERS: Option[] = [
  { value: "1", label: "Tier 1 · Critical" },
  { value: "2", label: "Tier 2 · Important" },
  { value: "3", label: "Tier 3 · Standard" },
  { value: "4", label: "Tier 4 · Low" },
];

/**
 * The project's primary stack/framework (Vercel-style preset). The `value` slugs
 * MUST stay in lockstep with the FRAMEWORKS enum the API validates
 * (apps/api/src/routes/v1/projects.route.ts). `mono` + `color` drive the leading
 * icon chip the console renders (a placeholder until favicon-powered icons land);
 * `category` groups the picker; `language` is a catalog hint. Ordered by category
 * so the flat picker reads top-down: Web, Backend, Mobile, Other.
 */
export type FrameworkCategory = "Web" | "Backend" | "Mobile" | "Other";
export type FrameworkOption = Option & {
  category: FrameworkCategory;
  language: string | null;
  color: string;
  mono: string;
};

export const FRAMEWORKS: FrameworkOption[] = [
  // Web / frontend
  { value: "nextjs", label: "Next.js", category: "Web", language: "TypeScript", color: "#e5e7eb", mono: "N" },
  { value: "react", label: "React", category: "Web", language: "TypeScript", color: "#61dafb", mono: "R" },
  { value: "vue", label: "Vue", category: "Web", language: "TypeScript", color: "#42b883", mono: "V" },
  { value: "nuxt", label: "Nuxt", category: "Web", language: "TypeScript", color: "#00dc82", mono: "N" },
  { value: "svelte", label: "SvelteKit", category: "Web", language: "TypeScript", color: "#ff3e00", mono: "S" },
  { value: "remix", label: "Remix", category: "Web", language: "TypeScript", color: "#e5e7eb", mono: "Rx" },
  { value: "astro", label: "Astro", category: "Web", language: "TypeScript", color: "#ff5d01", mono: "A" },
  { value: "angular", label: "Angular", category: "Web", language: "TypeScript", color: "#dd0031", mono: "A" },
  { value: "solid", label: "SolidStart", category: "Web", language: "TypeScript", color: "#4f88c6", mono: "S" },
  { value: "gatsby", label: "Gatsby", category: "Web", language: "TypeScript", color: "#b17acc", mono: "G" },
  // Backend / API
  { value: "node", label: "Node.js", category: "Backend", language: "JavaScript", color: "#5fa04e", mono: "N" },
  { value: "express", label: "Express", category: "Backend", language: "JavaScript", color: "#e5e7eb", mono: "E" },
  { value: "nestjs", label: "NestJS", category: "Backend", language: "TypeScript", color: "#e0234e", mono: "N" },
  { value: "go", label: "Go", category: "Backend", language: "Go", color: "#00add8", mono: "Go" },
  { value: "rails", label: "Rails", category: "Backend", language: "Ruby", color: "#cc0000", mono: "R" },
  { value: "django", label: "Django", category: "Backend", language: "Python", color: "#20aa76", mono: "D" },
  { value: "flask", label: "Flask", category: "Backend", language: "Python", color: "#e5e7eb", mono: "F" },
  { value: "fastapi", label: "FastAPI", category: "Backend", language: "Python", color: "#009688", mono: "F" },
  { value: "laravel", label: "Laravel", category: "Backend", language: "PHP", color: "#ff2d20", mono: "L" },
  { value: "spring", label: "Spring", category: "Backend", language: "Java", color: "#6db33f", mono: "S" },
  { value: "dotnet", label: ".NET", category: "Backend", language: "C#", color: "#a17ff0", mono: ".N" },
  { value: "phoenix", label: "Phoenix", category: "Backend", language: "Elixir", color: "#fd4f00", mono: "P" },
  { value: "rust", label: "Rust", category: "Backend", language: "Rust", color: "#f74c00", mono: "R" },
  // Mobile
  { value: "reactnative", label: "React Native", category: "Mobile", language: "TypeScript", color: "#61dafb", mono: "RN" },
  { value: "flutter", label: "Flutter", category: "Mobile", language: "Dart", color: "#027dfd", mono: "F" },
  { value: "expo", label: "Expo", category: "Mobile", language: "TypeScript", color: "#e5e7eb", mono: "E" },
  // Other
  { value: "static", label: "Static site", category: "Other", language: "HTML", color: "#a1a1aa", mono: "S" },
  { value: "other", label: "Other", category: "Other", language: null, color: "#a1a1aa", mono: "•" },
];

/** The full framework option for a stored slug, or null. */
export function frameworkFor(value: string | null): FrameworkOption | null {
  if (!value) return null;
  return FRAMEWORKS.find((f) => f.value === value) ?? null;
}

/**
 * Project access levels, GitHub-repository style. A team granted access to a
 * project holds one of these. The project's owning team is always an implicit
 * admin and isn't listed as a grant.
 */
export const PROJECT_ACCESS_ROLES: RoleOption[] = [
  { value: "read", label: "Read", description: "View the project and its catalog entry." },
  { value: "triage", label: "Triage", description: "Read, plus manage its status and metadata." },
  { value: "write", label: "Write", description: "Contribute to and configure the project." },
  { value: "maintain", label: "Maintain", description: "Manage the project, short of destructive actions." },
  { value: "admin", label: "Admin", description: "Full access, including access and deletion." },
];

/** Human label for a stored value, falling back to the raw value. */
export function labelFor(options: Option[], value: string | null): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Human label for an access role. */
export function accessRoleLabel(value: string): string {
  return PROJECT_ACCESS_ROLES.find((r) => r.value === value)?.label ?? value;
}
