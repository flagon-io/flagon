import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tcpMonitor } from "./tcp.js";
import type { RunContext } from "./types.js";

/** TCP adapter against a real local socket server (connect ok) and a closed port. */
let server: net.Server;
let openPort = 0;
let closedPort = 0;

const ctx = (): RunContext => ({
  orgId: "o",
  checkId: "c",
  now: new Date(),
  location: "default",
  signal: new AbortController().signal,
});

beforeAll(async () => {
  server = net.createServer((sock) => sock.end());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  openPort = (server.address() as net.AddressInfo).port;

  // A reliably-closed port: open then immediately close a throwaway server.
  const throwaway = net.createServer();
  await new Promise<void>((r) => throwaway.listen(0, "127.0.0.1", () => r()));
  closedPort = (throwaway.address() as net.AddressInfo).port;
  await new Promise<void>((r) => throwaway.close(() => r()));
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe("tcp monitor", () => {
  it("passes when the port accepts a connection", async () => {
    const result = await tcpMonitor.run(tcpMonitor.configSchema.parse({ host: "127.0.0.1", port: openPort }), ctx());
    expect(result.status).toBe("passing");
    expect(result.detail).toMatchObject({ port: openPort });
  });

  it("fails when the connection is refused", async () => {
    const result = await tcpMonitor.run(tcpMonitor.configSchema.parse({ host: "127.0.0.1", port: closedPort }), ctx());
    expect(result.status).toBe("failing");
    expect(result.error?.code).toBe("connect_error");
  });
});
