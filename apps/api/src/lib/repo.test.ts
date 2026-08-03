import { describe, expect, it } from "vitest";
import { parseRepo } from "./repo.js";

describe("parseRepo", () => {
  it("parses a github https URL", () => {
    expect(parseRepo("https://github.com/flagon-io/flagon")).toEqual({
      provider: "github",
      name: "flagon-io/flagon",
    });
  });

  it("strips a trailing .git and extra path", () => {
    expect(parseRepo("https://github.com/acme/widgets.git/tree/main")).toEqual({
      provider: "github",
      name: "acme/widgets",
    });
  });

  it("detects gitlab and bitbucket", () => {
    expect(parseRepo("https://gitlab.com/group/app").provider).toBe("gitlab");
    expect(parseRepo("https://bitbucket.org/team/repo").provider).toBe("bitbucket");
  });

  it("parses a scp-like ssh remote", () => {
    expect(parseRepo("git@github.com:acme/widgets.git")).toEqual({
      provider: "github",
      name: "acme/widgets",
    });
  });

  it("links an unknown host as 'other' but still extracts the name", () => {
    expect(parseRepo("https://git.example.com/acme/widgets")).toEqual({
      provider: "other",
      name: "acme/widgets",
    });
  });

  it("returns other/null for junk or empty input", () => {
    expect(parseRepo("not a url")).toEqual({ provider: "other", name: null });
    expect(parseRepo("   ")).toEqual({ provider: "other", name: null });
    expect(parseRepo("https://github.com/onlyowner")).toEqual({
      provider: "github",
      name: null,
    });
  });
});
