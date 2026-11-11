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
  /** The price as people should read it ("$15,000 / month"). */
  price: string;
  /** The terms that go with the price ("Month to month"). */
  terms: string;
  body: string;
  /** What's included, short and concrete. */
  includes: string[];
};

export const OFFERS: Offer[] = [
  {
    id: "studio",
    title: "Product studio",
    price: "$15,000 / month",
    terms: "One workstream, pause any time",
    body: "Software people sign in to and use: new products, apps, platforms, and the hard migrations nobody else wants to own. You pay for progress, not hours or headcount. A workstream is one priority list; add another for $12,000 a month to move two things at once.",
    includes: [
      "Strategy, design, engineering, and project management",
      "As many initiatives as you like, worked in your order",
      "Working software every week, code you own outright",
    ],
  },
  {
    id: "websites",
    title: "Business websites",
    price: "From $6,000",
    terms: "Fixed price, quoted up front",
    body: "Your public face: the pages that tell people who you are and get them to call, book, or buy. Designed, built, and launched for a price you know before we start. If people sign in and use it, it's a product, and Product studio is the better fit.",
    includes: [
      "Design, build, and launch on modern hosting",
      "Content you can update yourself",
      "Fast, accessible, and found in search and AI answers",
    ],
  },
  {
    id: "fractional",
    title: "Fractional CTO",
    price: "$10,000 / month",
    terms: "About a day a week, month to month",
    body: "Engineering leadership without the full-time hire: architecture, platform and migration planning, hiring help, and an honest read on the team and the codebase.",
    includes: [
      "Architecture and roadmap you can actually execute",
      "Hands-on reviews of code, infra, and incidents",
      "A standing weekly session plus async access",
    ],
  },
  {
    id: "care",
    title: "Care plan",
    price: "From $500 / month",
    terms: "Sized to fit, no contract",
    body: "Keep what we built healthy after launch: hosting, updates, monitoring, and the small changes that pile up. One flat monthly price, set by the size of what we're looking after, instead of a meter running.",
    includes: [
      "Hosting, updates, and uptime monitoring",
      "Small changes and fixes, handled quickly",
      "A direct line to the person who built it",
    ],
  },
];

/**
 * Everything we take on, grouped by where it sits in a project's life, so the
 * list reads as one path from idea to running product rather than a pile of
 * keywords. Any offer below can draw on all of it.
 */
export const CAPABILITIES: { stage: string; summary: string; items: string[] }[] = [
  {
    stage: "Strategy",
    summary: "What to build, for whom, and in what order.",
    items: [
      "Product strategy",
      "Discovery and research",
      "Roadmaps",
      "Technical due diligence",
      "Fractional leadership",
    ],
  },
  {
    stage: "Design",
    summary: "UX and interfaces people understand on sight.",
    items: ["UX", "UI and visual design", "Design systems", "Prototyping", "Brand and identity"],
  },
  {
    stage: "Build",
    summary: "Apps, sites, platforms, and AI, built to last.",
    items: [
      "Web apps",
      "Mobile apps",
      "Websites",
      "APIs and platforms",
      "AI and agents",
      "E-commerce",
      "Migrations",
    ],
  },
  {
    stage: "Run",
    summary: "Fast, secure, found in search, and looked after.",
    items: [
      "Cloud and DevOps",
      "Performance and reliability",
      "Security reviews",
      "Analytics",
      "SEO",
      "Care and support",
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
