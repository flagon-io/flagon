import { describe, expect, it } from "vitest";
import { classifyIp, isPublicIp, assertPublicHost, assertPublicUrl, BlockedTargetError } from "./net-guard.js";

describe("classifyIp — blocked ranges", () => {
  const blocked: Array<[string, string]> = [
    ["169.254.169.254", "link-local"], // cloud metadata — the headline threat
    ["127.0.0.1", "loopback"],
    ["0.0.0.0", "unspecified"],
    ["10.1.2.3", "private"],
    ["172.16.5.4", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "cgnat"],
    ["198.18.0.5", "benchmark"],
    ["224.0.0.1", "multicast"],
    ["::1", "loopback"],
    ["::", "unspecified"],
    ["fc00::1", "unique-local"],
    ["fd12:3456::1", "unique-local"],
    ["fe80::1", "link-local"],
    ["::ffff:169.254.169.254", "link-local"], // v4-mapped metadata
    ["::ffff:10.0.0.1", "private"],
  ];
  for (const [ip, reason] of blocked) {
    it(`blocks ${ip} (${reason})`, () => {
      expect(classifyIp(ip)).toBe(reason);
      expect(isPublicIp(ip)).toBe(false);
    });
  }
});

describe("classifyIp — public addresses pass", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "172.32.0.1", "192.169.0.1"]) {
    it(`allows ${ip}`, () => {
      expect(classifyIp(ip)).toBeNull();
      expect(isPublicIp(ip)).toBe(true);
    });
  }
  it("returns null for non-IP strings", () => {
    expect(classifyIp("example.com")).toBeNull();
    expect(isPublicIp("example.com")).toBe(false);
  });
});

describe("assertPublicHost / assertPublicUrl (force=true)", () => {
  it("throws BlockedTargetError for a private IP literal", async () => {
    await expect(assertPublicHost("169.254.169.254", { force: true })).rejects.toBeInstanceOf(BlockedTargetError);
    await expect(assertPublicUrl("http://127.0.0.1:8080/admin", { force: true })).rejects.toBeInstanceOf(
      BlockedTargetError,
    );
    await expect(assertPublicUrl("https://[::1]/", { force: true })).rejects.toBeInstanceOf(BlockedTargetError);
  });

  it("allows a public IP literal", async () => {
    await expect(assertPublicHost("8.8.8.8", { force: true })).resolves.toBeUndefined();
    await expect(assertPublicUrl("https://1.1.1.1/", { force: true })).resolves.toBeUndefined();
  });

  it("resolves a DNS name and blocks when it points at a private address", async () => {
    // localhost resolves to 127.0.0.1 / ::1 — the rebinding case.
    await expect(assertPublicHost("localhost", { force: true })).rejects.toBeInstanceOf(BlockedTargetError);
  });

  it("does not throw on a malformed URL (the probe surfaces the error)", async () => {
    await expect(assertPublicUrl("not a url", { force: true })).resolves.toBeUndefined();
  });
});
