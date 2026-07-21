import { describe, it, expect } from "vitest";
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_TOPICS_MAX,
  normalizeWebsite,
  parseTopics,
  validateProjectDetails,
} from "./projects";

describe("project website", () => {
  it("upgrades a bare host to https, because that is what people mean", () => {
    expect(normalizeWebsite("flagon.io")).toEqual({
      ok: true,
      website: "https://flagon.io/",
    });
    expect(normalizeWebsite("  www.flagon.io/docs  ")).toEqual({
      ok: true,
      website: "https://www.flagon.io/docs",
    });
  });

  it("keeps an explicit scheme", () => {
    expect(normalizeWebsite("http://internal.example")).toEqual({
      ok: true,
      website: "http://internal.example/",
    });
  });

  it("treats empty as unset rather than invalid", () => {
    expect(normalizeWebsite("   ")).toEqual({ ok: true, website: "" });
  });

  it("REJECTS non-http schemes: the value is rendered as an href", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "file:///etc/passwd",
    ]) {
      expect(normalizeWebsite(hostile).ok).toBe(false);
    }
  });

  it("rejects text that is not a URL at all", () => {
    expect(normalizeWebsite("not a url").ok).toBe(false);
  });
});

describe("project topics", () => {
  it("splits on spaces and commas, lowercases, and de-duplicates in order", () => {
    expect(parseTopics("Platform, checkout  platform flags")).toEqual([
      "platform",
      "checkout",
      "flags",
    ]);
  });

  it("accepts an array as typed by the API", () => {
    expect(parseTopics(["Edge", "edge", " sdk "])).toEqual(["edge", "sdk"]);
  });

  it("rejects topics the storage constraint would also reject", () => {
    expect(validateProjectDetails({ topics: ["-leading-hyphen"] }).ok).toBe(
      false,
    );
    expect(validateProjectDetails({ topics: ["under_score"] }).ok).toBe(false);
    expect(validateProjectDetails({ topics: ["a".repeat(36)] }).ok).toBe(false);
    expect(
      validateProjectDetails({
        topics: Array.from(
          { length: PROJECT_TOPICS_MAX + 1 },
          (_, i) => `t${i}`,
        ),
      }).ok,
    ).toBe(false);
  });
});

describe("project details", () => {
  it("normalizes all three together", () => {
    const result = validateProjectDetails({
      description: "  Checkout and cart.  ",
      website: "flagon.io",
      topics: "Checkout,platform",
    });
    expect(result).toEqual({
      ok: true,
      details: {
        description: "Checkout and cart.",
        website: "https://flagon.io/",
        topics: ["checkout", "platform"],
      },
    });
  });

  it("bounds the description at the same length the column checks", () => {
    expect(
      validateProjectDetails({
        description: "x".repeat(PROJECT_DESCRIPTION_MAX_LENGTH),
      }).ok,
    ).toBe(true);
    expect(
      validateProjectDetails({
        description: "x".repeat(PROJECT_DESCRIPTION_MAX_LENGTH + 1),
      }).ok,
    ).toBe(false);
  });

  it("treats everything as optional: an empty patch is valid and empties nothing it was not given", () => {
    expect(validateProjectDetails({})).toEqual({
      ok: true,
      details: { description: "", website: "", topics: [] },
    });
  });
});
