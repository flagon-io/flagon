import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import type { Check } from "../db/schema.js";

/**
 * The probes. Each takes a check and returns a normalized ProbeResult (ok + latency +
 * status/error). Pure I/O: no DB, no state, no thresholds — the sweep turns a stream of
 * these into confirmed transitions. HTTP/keyword ride native fetch; tcp/tls use node's
 * sockets. Every path resolves (never throws) so the sweep always records a data point.
 */

export type ProbeResult = { ok: boolean; statusCode?: number; responseMs?: number; error?: string };

export async function probe(check: Check): Promise<ProbeResult> {
  const start = Date.now();
  try {
    switch (check.type) {
      case "http":
      case "keyword":
        return await probeHttp(check, start);
      case "tls_expiry":
        return await probeTls(check, start);
      case "tcp":
        return await probeTcp(check, start);
      case "heartbeat":
        return probeHeartbeat(check);
      default:
        return { ok: false, error: `unknown check type: ${check.type}` };
    }
  } catch (err) {
    return { ok: false, responseMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

async function probeHttp(check: Check, start: number): Promise<ProbeResult> {
  const t = check.target;
  if (!t.url) return { ok: false, error: "no url configured" };
  const res = await fetch(t.url, {
    method: t.method ?? "GET",
    headers: t.headers,
    body: t.body,
    redirect: t.followRedirects === false ? "manual" : "follow",
    signal: AbortSignal.timeout(check.timeoutMs),
  });
  const ms = Date.now() - start;
  const a = check.assertions;
  const min = a.expectedStatusMin ?? 200;
  const max = a.expectedStatusMax ?? 399;
  const failures: string[] = [];
  if (res.status < min || res.status > max) failures.push(`status ${res.status} not in ${min}-${max}`);
  if (a.maxLatencyMs && ms > a.maxLatencyMs) failures.push(`latency ${ms}ms > ${a.maxLatencyMs}ms`);
  if (check.type === "keyword" && a.keyword) {
    const bodyText = await res.text().catch(() => "");
    const present = bodyText.includes(a.keyword);
    if (a.keywordAbsent && present) failures.push(`keyword "${a.keyword}" present`);
    if (!a.keywordAbsent && !present) failures.push(`keyword "${a.keyword}" absent`);
  }
  return { ok: failures.length === 0, statusCode: res.status, responseMs: ms, error: failures.join("; ") || undefined };
}

/** Heartbeat: no outbound probe — evaluate whether the last inbound ping is still
 *  fresh (within interval + grace). A missed ping fails the check. */
function probeHeartbeat(check: Check): ProbeResult {
  const last = check.lastPingAt ? check.lastPingAt.getTime() : 0;
  if (!last) return { ok: false, error: "no heartbeat received yet" };
  const graceMs = (check.assertions.heartbeatGraceSeconds ?? 60) * 1000;
  const deadline = last + check.intervalSeconds * 1000 + graceMs;
  const lateBy = Math.round((Date.now() - deadline) / 1000);
  if (Date.now() > deadline) return { ok: false, error: `heartbeat late by ${lateBy}s` };
  return { ok: true };
}

function probeTcp(check: Check, start: number): Promise<ProbeResult> {
  const { host, port } = check.target;
  if (!host || !port) return Promise.resolve({ ok: false, error: "tcp check needs host and port" });
  return new Promise((resolve) => {
    const socket = netConnect({ host, port });
    const done = (r: ProbeResult) => {
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(check.timeoutMs);
    socket.once("connect", () => done({ ok: true, responseMs: Date.now() - start }));
    socket.once("timeout", () => done({ ok: false, responseMs: Date.now() - start, error: "connection timed out" }));
    socket.once("error", (e) => done({ ok: false, responseMs: Date.now() - start, error: e.message }));
  });
}

function probeTls(check: Check, start: number): Promise<ProbeResult> {
  const t = check.target;
  let host = t.host;
  let port = t.port ?? 443;
  if (!host && t.url) {
    try {
      const u = new URL(t.url);
      host = u.hostname;
      port = u.port ? Number(u.port) : 443;
    } catch {
      // fall through to the missing-host error
    }
  }
  if (!host) return Promise.resolve({ ok: false, error: "tls check needs a host or https url" });
  const minDays = check.assertions.tlsMinDaysRemaining ?? 14;
  const serverName = host;
  return new Promise((resolve) => {
    const socket = tlsConnect({ host: serverName, port, servername: serverName, timeout: check.timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      const ms = Date.now() - start;
      socket.end();
      if (!cert || !cert.valid_to) {
        resolve({ ok: false, responseMs: ms, error: "no certificate presented" });
        return;
      }
      const days = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
      if (days < 0) resolve({ ok: false, responseMs: ms, error: `certificate expired ${-days}d ago` });
      else if (days < minDays) resolve({ ok: false, responseMs: ms, error: `certificate expires in ${days}d (< ${minDays}d)` });
      else resolve({ ok: true, responseMs: ms });
    });
    socket.setTimeout(check.timeoutMs);
    socket.once("timeout", () => {
      socket.destroy();
      resolve({ ok: false, responseMs: Date.now() - start, error: "tls handshake timed out" });
    });
    socket.once("error", (e) => {
      socket.destroy();
      resolve({ ok: false, responseMs: Date.now() - start, error: e.message });
    });
  });
}
