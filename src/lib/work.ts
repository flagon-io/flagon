/**
 * Client work: what Flagon takes on, what it costs, and what we've built. The
 * /work page, the home page's work section, and the project form all read from
 * here, so a rate change or a new case study is one edit in this file.
 *
 * Rates are public and the same for everyone. That's how custom work stays
 * consistent with the rest of the company's pricing: no quote that depends on
 * how much we think you can afford.
 */

export type Offer = {
  id: string;
  title: string;
  /** The price as people should read it ("$7,500 / week"). */
  price: string;
  /** The terms that go with the price ("Two-week minimum"). */
  terms: string;
  body: string;
  /** What's included, short and concrete. */
  includes: string[];
};

export const OFFERS: Offer[] = [
  {
    id: "build",
    title: "Build weeks",
    price: "$7,500 / week",
    terms: "Two-week minimum",
    body: "Product work, start to finish: new apps, APIs, platforms, and the hard migrations nobody else wants to own. You buy focused weeks, not hours, so the incentive is to ship.",
    includes: [
      "A senior engineer on your project, full time",
      "Working software every week, not status decks",
      "Code, docs, and infrastructure you own outright",
    ],
  },
  {
    id: "fractional",
    title: "Fractional CTO",
    price: "$10,000 / month",
    terms: "Month to month",
    body: "Engineering leadership without the full-time hire: architecture, platform and migration planning, hiring help, and an honest read on the team and the codebase.",
    includes: [
      "Architecture and roadmap you can actually execute",
      "Hands-on reviews of code, infra, and incidents",
      "A standing weekly session plus async access",
    ],
  },
  {
    id: "websites",
    title: "Websites",
    price: "From $6,000",
    terms: "Fixed price, quoted up front",
    body: "Fast, well-made sites for businesses that need to look as good online as they are in person. Designed, built, and launched, with a price you know before we start.",
    includes: [
      "Design, build, and launch on modern hosting",
      "Mobile-first, accessible, and quick to load",
      "Found by search engines and AI assistants alike",
    ],
  },
  {
    id: "care",
    title: "Care plan",
    price: "$1,500 / month",
    terms: "Cancel any time",
    body: "Keep what we built healthy after launch: hosting, updates, monitoring, and the small changes that pile up. One flat price instead of a meter running.",
    includes: [
      "Hosting, updates, and uptime monitoring",
      "Small changes and fixes, handled quickly",
      "A direct line to the person who built it",
    ],
  },
];

/** How an engagement goes, in order. */
export const PROCESS: { title: string; body: string }[] = [
  {
    title: "Tell us what you're building",
    body: "Send a note with what you need, roughly when, and roughly what you can spend. We reply within two business days, even if the answer is no.",
  },
  {
    title: "A short call, then a written plan",
    body: "We talk it through, then send a plan in plain language: scope, timeline, price, and what we'd cut first if things get tight.",
  },
  {
    title: "Build in the open",
    body: "Weekly working software you can click through, a shared channel, and no surprises. If something changes, you hear it from us first.",
  },
  {
    title: "Hand off, or keep going",
    body: "You get the code, the docs, and the keys. Keep us on a care plan or take it from there; either way it's yours.",
  },
];

/**
 * The scale of what the founder built for before Flagon: each company's own
 * public figure from the years he was there (League of Legends 103M monthly
 * players, Sept 2016; Imgur ~150M monthly users, Nov 2017; Entrata 2.6M units,
 * Oct 2022), plus the Aptive migration he led.
 */
export const TRACK_RECORD: {
  value: string;
  label: string;
  employer: EmployerId;
  year: string;
}[] = [
  { value: "100M+", label: "Players every month", employer: "riot", year: "2016" },
  { value: "150M", label: "Monthly users", employer: "imgur", year: "2017" },
  { value: "2.6M", label: "Apartment homes", employer: "entrata", year: "2022" },
  { value: "1M", label: "Accounts migrated, zero rollbacks", employer: "aptive", year: "2025" },
];

/** Companies the founder built software at before Flagon. Logos in components/employer-logos.tsx. */
export type Employer = { id: EmployerId; name: string; role: string };

export type EmployerId =
  | "riot"
  | "imgur"
  | "bluehost"
  | "outdoorsy"
  | "entrata"
  | "aptive"
  | "trugolf";

export const EMPLOYERS: Employer[] = [
  { id: "riot", name: "Riot Games", role: "Software Engineer" },
  { id: "imgur", name: "Imgur", role: "Senior Software Engineer" },
  { id: "entrata", name: "Entrata", role: "Software Architect" },
  { id: "outdoorsy", name: "Outdoorsy", role: "Senior Backend Engineer" },
  { id: "trugolf", name: "TruGolf", role: "Principal Software Engineer" },
  { id: "bluehost", name: "Bluehost", role: "Developer" },
  { id: "aptive", name: "Aptive Environmental", role: "VP, Software Engineering" },
];

export type CaseStudy = {
  id: string;
  name: string;
  url: string;
  domain: string;
  /** Who it's for, in a few words ("Dueling piano bar, Salt Lake City"). */
  kind: string;
  summary: string;
  /** A screenshot in /public (1288x932). */
  image?: string;
  /** Client work vs. our own sites and projects. */
  client: boolean;
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: "tavernacle",
    name: "The Tavernacle",
    url: "https://tavernacle.com",
    domain: "tavernacle.com",
    kind: "Dueling piano bar, Salt Lake City",
    summary:
      "A new site for a downtown dueling piano bar with three spaces under one roof. Built so the thing people come to do, book a night out, is never more than a tap away.",
    image: "/work/tavernacle-home.jpg",
    client: true,
  },
];

/** Budget ranges offered on the project form. */
export const BUDGETS = [
  "Under $10k",
  "$10k to $25k",
  "$25k to $50k",
  "$50k to $100k",
  "$100k+",
  "Not sure yet",
] as const;

/** Timelines offered on the project form. */
export const TIMELINES = [
  "As soon as possible",
  "In the next month",
  "In the next quarter",
  "Just exploring",
] as const;
