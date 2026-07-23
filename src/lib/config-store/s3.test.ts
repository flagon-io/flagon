import { afterEach, describe, expect, it, vi } from "vitest";
import { createS3ConfigStore } from "./s3";

const store = () =>
  createS3ConfigStore({
    endpoint: "http://localhost:4566",
    bucket: "flagon-config",
    accessKeyId: "test",
    secretAccessKey: "test",
    region: "us-east-1",
    prefix: "config",
  });

/** Capture the (signed) Request aws4fetch hands to fetch, and reply with `response`. */
function stubFetch(response: Response) {
  const calls: Request[] = [];
  const mock = vi.fn(async (input: Request | string) => {
    calls.push(input as Request);
    return response;
  });
  vi.stubGlobal("fetch", mock);
  return { calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("s3 config store", () => {
  it("maps a 200 to a modified read with the object's body and etag", async () => {
    stubFetch(
      new Response('{"flags":[]}', {
        status: 200,
        headers: { etag: '"abc"' },
      }),
    );
    const result = await store().read("org-1", null);
    expect(result).toEqual({
      status: "modified",
      etag: '"abc"',
      body: '{"flags":[]}',
    });
  });

  it("maps a 304 to not-modified and echoes the caller's etag", async () => {
    stubFetch(new Response(null, { status: 304 }));
    const result = await store().read("org-1", '"abc"');
    expect(result).toEqual({ status: "not-modified", etag: '"abc"' });
  });

  it("maps a 404 to absent", async () => {
    stubFetch(new Response(null, { status: 404 }));
    expect(await store().read("org-1", null)).toEqual({ status: "absent" });
  });

  it("sends If-None-Match and a path-style, prefixed key on a conditional read", async () => {
    const { calls } = stubFetch(new Response(null, { status: 304 }));
    await store().read("org-1", '"abc"');
    const request = calls[0];
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      "http://localhost:4566/flagon-config/config/org-1.json",
    );
    expect(request.headers.get("if-none-match")).toBe('"abc"');
    // aws4fetch signed the request.
    expect(request.headers.get("authorization")).toContain("AWS4-HMAC-SHA256");
  });

  it("PUTs on write and returns the stored etag", async () => {
    const { calls } = stubFetch(
      new Response(null, { status: 200, headers: { etag: '"new"' } }),
    );
    const etag = await store().write("org-1", '{"flags":[]}');
    expect(etag).toBe('"new"');
    expect(calls[0].method).toBe("PUT");
  });

  it("throws on an unexpected status so the caller can fall back to the database", async () => {
    stubFetch(new Response("nope", { status: 500 }));
    await expect(store().read("org-1", null)).rejects.toThrow();
  });
});
