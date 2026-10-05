import type { Team } from "@/lib/teams";

/**
 * The crew. Adding a teammate is one object in the PEOPLE array below: name,
 * role, where they are, and the team they're on. That's the whole workflow, and
 * the People page groups, counts, and filters itself from it.
 */
export type Person = {
  name: string;
  role: string;
  /**
   * "State, Country" (e.g. "Utah, USA"), optional. Everyone is remote (there
   * are no offices), so this says where someone is, never "Remote".
   */
  location?: string;
  team: Team;
  /** Path to a square photo in /public; falls back to initials. */
  photo?: string;
  /** Marks the founder(s), sorted to the front and badged. */
  founder?: boolean;
  bio?: string;
  links?: { label: string; href: string }[];
};

export const PEOPLE: Person[] = [
  {
    name: "Chase Pierce",
    role: "Founder & everything else, for now",
    location: "Utah, USA",
    team: "Leadership",
    photo: "/people/chase-pierce.jpg",
    founder: true,
    bio: "Started Flagon to build the company he always wanted to work for: open by default, honest about how it works, and here for the long game.",
    links: [{ label: "GitHub", href: "https://github.com/syntaqx" }],
  },
];

/** People, founders first, then alphabetical. */
export function getPeople(): Person[] {
  return [...PEOPLE].sort((a, b) => {
    if (!!a.founder !== !!b.founder) return a.founder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Distinct teams that actually have people on them, for the filter. */
export function peopleTeams(): string[] {
  return [...new Set(PEOPLE.map((p) => p.team))].sort();
}

/** The founder, for author cards on founder notes. */
export function getFounder(): Person | undefined {
  return PEOPLE.find((p) => p.founder);
}
