import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsConfigStore } from "./fs";

describe("filesystem config store", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "flagon-cfg-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports absent before anything is written", async () => {
    const store = createFsConfigStore(root);
    expect(await store.read("org", null)).toEqual({ status: "absent" });
    expect(await store.head("org", null)).toEqual({ status: "absent" });
  });

  it("round-trips a written artifact and returns its etag", async () => {
    const store = createFsConfigStore(root);
    const etag = await store.write("org", '{"hello":1}');
    const object = await store.read("org", null);
    expect(object).toMatchObject({ status: "modified", body: '{"hello":1}' });
    if (object.status === "modified") expect(object.etag).toBe(etag);
  });

  it("returns not-modified when the caller's etag still matches", async () => {
    const store = createFsConfigStore(root);
    const etag = await store.write("org", '{"v":1}');
    expect(await store.read("org", etag)).toEqual({
      status: "not-modified",
      etag,
    });
    expect(await store.head("org", etag)).toEqual({
      status: "not-modified",
      etag,
    });
  });

  it("reports modified after an overwrite changes the bytes", async () => {
    const store = createFsConfigStore(root);
    const first = await store.write("org", '{"v":1}');
    const second = await store.write("org", '{"v":2,"more":true}');
    expect(second).not.toBe(first);
    const object = await store.read("org", first);
    expect(object).toMatchObject({ status: "modified", body: '{"v":2,"more":true}' });
  });
});
