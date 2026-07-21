import { isValidUsername } from "./username";

/**
 * Project slug rules, shared by client forms and the server. Projects are
 * the org-scoped unit of work everything else attaches to; the slug is the
 * project's stable identifier in URLs, SDK configuration, and the API. Same
 * charset rules as org slugs; unique within the organization (two orgs can
 * both have a "storefront" project).
 *
 * Data access lives in ./projects.server.ts (this module stays free of
 * database imports so client components can use the validation).
 */
export const PROJECT_SLUG_MIN_LENGTH = 2;
export const PROJECT_SLUG_MAX_LENGTH = 39;

export const PROJECT_SLUG_HINT =
  "Slug may only contain lowercase alphanumeric characters or single hyphens, and cannot begin or end with a hyphen.";

/** Segments that collide with project routes. */
const RESERVED_SLUGS = new Set(["new", "settings"]);

export const PROJECT_NAME_MAX_LENGTH = 100;

export function normalizeProjectSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export type ProjectSlugValidation = { ok: true } | { ok: false; error: string };

export function validateProjectSlug(rawSlug: string): ProjectSlugValidation {
  const slug = normalizeProjectSlug(rawSlug);
  if (
    slug.length < PROJECT_SLUG_MIN_LENGTH ||
    slug.length > PROJECT_SLUG_MAX_LENGTH
  ) {
    return {
      ok: false,
      error: `Slug must be between ${PROJECT_SLUG_MIN_LENGTH} and ${PROJECT_SLUG_MAX_LENGTH} characters.`,
    };
  }
  if (!isValidUsername(slug)) {
    return { ok: false, error: PROJECT_SLUG_HINT };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "That slug is reserved. Choose another." };
  }
  return { ok: true };
}

/**
 * Project details: the description, website, and topics on the About rail.
 *
 * These are deliberately NOT the README (overview_markdown). A description is
 * one line written for someone scanning a list; a README is a document written
 * for someone who has already arrived. Deriving one from the other, which is
 * what the rail used to do, produces a summary that is wrong exactly when the
 * README opens with a caveat instead of a sentence.
 */
export const PROJECT_DESCRIPTION_MAX_LENGTH = 350;
export const PROJECT_WEBSITE_MAX_LENGTH = 255;
export const PROJECT_TOPIC_MAX_LENGTH = 35;
export const PROJECT_TOPICS_MAX = 20;

export const PROJECT_TOPIC_HINT =
  "Topics are lowercase, start with a letter or number, and may contain hyphens.";

const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]{0,34}$/;

/**
 * Splits typed text into topics: spaces AND commas, because people type both
 * and a topic can contain neither. Lowercased, de-duplicated, order kept.
 */
export function parseTopics(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[\s,]+/);
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const part of parts) {
    const topic = String(part).trim().toLowerCase();
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    topics.push(topic);
  }
  return topics;
}

/**
 * A website as typed, made absolute.
 *
 * "flagon.io" is what people type and https:// is what they mean; storing it
 * bare would render a link that resolves against the console's own origin.
 * Anything that is not http(s) is REJECTED rather than coerced, because the
 * value ends up in an href: javascript:, data:, and friends are the reason
 * this function exists at all.
 */
export type WebsiteResult =
  { ok: true; website: string } | { ok: false; error: string };

export function normalizeWebsite(raw: string): WebsiteResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, website: "" };
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "Enter a valid URL, like https://flagon.io." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Websites must be http or https URLs." };
  }
  const website = url.toString();
  if (website.length > PROJECT_WEBSITE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Websites are limited to ${PROJECT_WEBSITE_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, website };
}

export type ProjectDetailsInput = {
  description?: string;
  website?: string;
  topics?: string | string[];
};

export type ProjectDetailsValidation =
  | {
      ok: true;
      details: { description: string; website: string; topics: string[] };
    }
  | {
      ok: false;
      code: "invalid_description" | "invalid_website" | "invalid_topics";
      error: string;
    };

/** Validates and normalizes all three at once; shared by forms, actions, API. */
export function validateProjectDetails(
  input: ProjectDetailsInput,
): ProjectDetailsValidation {
  const description = (input.description ?? "").trim();
  if (description.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      code: "invalid_description",
      error: `Descriptions are limited to ${PROJECT_DESCRIPTION_MAX_LENGTH} characters.`,
    };
  }

  const website = normalizeWebsite(input.website ?? "");
  if (!website.ok) {
    return { ok: false, code: "invalid_website", error: website.error };
  }

  const topics = parseTopics(input.topics ?? []);
  if (topics.length > PROJECT_TOPICS_MAX) {
    return {
      ok: false,
      code: "invalid_topics",
      error: `A project can have at most ${PROJECT_TOPICS_MAX} topics.`,
    };
  }
  const invalid = topics.find((topic) => !TOPIC_PATTERN.test(topic));
  if (invalid) {
    return {
      ok: false,
      code: "invalid_topics",
      error:
        invalid.length > PROJECT_TOPIC_MAX_LENGTH
          ? `Topics are limited to ${PROJECT_TOPIC_MAX_LENGTH} characters ("${invalid.slice(0, 20)}…").`
          : `"${invalid}" is not a valid topic. ${PROJECT_TOPIC_HINT}`,
    };
  }

  return {
    ok: true,
    details: { description, website: website.website, topics },
  };
}

/** Best-effort slug suggestion from a project name (client + server). */
export function suggestProjectSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, PROJECT_SLUG_MAX_LENGTH);
}
