import { describe, expect, it } from "vitest";
import { listFromResponse } from "./response-list";

describe("listFromResponse", () => {
  const key = { id: "key-1" };

  it("accepts the canonical array response", () => {
    expect(listFromResponse([key], "keys")).toEqual([key]);
  });

  it("accepts a keyed response during rolling deploys", () => {
    expect(listFromResponse({ keys: [key] }, "keys")).toEqual([key]);
  });

  it("returns an empty list for malformed responses", () => {
    expect(listFromResponse({ key }, "keys")).toEqual([]);
    expect(listFromResponse(null, "keys")).toEqual([]);
  });
});
