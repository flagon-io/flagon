import { describe, it, expect } from "vitest";
import { probe } from "./probe.js";
import type { Check } from "../db/schema.js";

/**
 * Heartbeat (dead-man) evaluation is pure — it compares last_ping_at against the
 * interval + grace deadline, no network. These pin the freshness math.
 */
function hb(over: Partial<Check>): Check {
  return {
    type: "heartbeat",
    intervalSeconds: 300,
    assertions: { heartbeatGraceSeconds: 60 },
    lastPingAt: null,
    ...over,
  } as Check;
}

describe("heartbeat probe", () => {
  it("fails when no ping has ever been received", async () => {
    const r = await probe(hb({ lastPingAt: null }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no heartbeat/i);
  });

  it("passes when the last ping is within interval + grace", async () => {
    const r = await probe(hb({ lastPingAt: new Date(Date.now() - 10_000) }));
    expect(r.ok).toBe(true);
  });

  it("passes right up to the deadline (interval + grace)", async () => {
    // 300s interval + 60s grace = 360s window; 350s ago is still fresh.
    const r = await probe(hb({ lastPingAt: new Date(Date.now() - 350_000) }));
    expect(r.ok).toBe(true);
  });

  it("fails once the ping is late past interval + grace", async () => {
    // 400s ago is beyond the 360s window.
    const r = await probe(hb({ lastPingAt: new Date(Date.now() - 400_000) }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/late/i);
  });

  it("uses the default 60s grace when none is set", async () => {
    const r = await probe(hb({ assertions: {}, lastPingAt: new Date(Date.now() - 400_000) }));
    expect(r.ok).toBe(false);
  });
});
