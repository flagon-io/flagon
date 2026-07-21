import { describe, it, expect } from "vitest";
import { sessionCookieDomain } from "./cookie-domain";

describe("session cookie domain", () => {
  it("scopes to the apex so every subdomain shares the session", () => {
    // The production shape: signing in on app.flagon.io must leave
    // www.flagon.io (marketing header) and api.flagon.io signed in too.
    expect(sessionCookieDomain("https://app.flagon.io", "flagon.io")).toBe(
      ".flagon.io",
    );
    expect(sessionCookieDomain("https://www.flagon.io", "flagon.io")).toBe(
      ".flagon.io",
    );
    expect(sessionCookieDomain("https://flagon.io", "flagon.io")).toBe(
      ".flagon.io",
    );
  });

  it("stays single-origin off the apex (localhost, previews)", () => {
    // A cookie scoped to a domain you don't serve from is dropped, so
    // cross-subdomain cookies must stay off for these.
    expect(
      sessionCookieDomain("http://localhost:3000", "flagon.io"),
    ).toBeNull();
    expect(
      sessionCookieDomain("https://flagon-git-main.vercel.app", "flagon.io"),
    ).toBeNull();
    // Lookalike domains must not match the apex check.
    expect(sessionCookieDomain("https://notflagon.io", "flagon.io")).toBeNull();
  });

  it("handles self-hosting on another apex", () => {
    expect(sessionCookieDomain("https://app.example.dev", "example.dev")).toBe(
      ".example.dev",
    );
  });

  it("returns null for unusable input", () => {
    expect(sessionCookieDomain("not-a-url", "flagon.io")).toBeNull();
    expect(sessionCookieDomain("https://app.flagon.io", "")).toBeNull();
    expect(
      sessionCookieDomain("https://app.flagon.io", "localhost"),
    ).toBeNull();
  });
});
