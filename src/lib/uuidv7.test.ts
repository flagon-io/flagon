import { describe, it, expect } from "vitest";
import { uuidv7 } from "./uuidv7";

describe("uuidv7", () => {
  it("produces RFC 9562 v7 uuids", () => {
    const id = uuidv7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("embeds the current timestamp in the leading 48 bits", () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const ms = parseInt(id.replace(/-/g, "").slice(0, 12), 16);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it("is unique and lexicographically time-ordered across ticks", async () => {
    const first = uuidv7();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = uuidv7();
    expect(first).not.toBe(second);
    expect(first < second).toBe(true);

    const many = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(many.size).toBe(1000);
  });
});
