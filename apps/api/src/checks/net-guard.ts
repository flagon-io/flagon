import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * SSRF egress guard for check targets. A check probes a URL/host the customer supplies,
 * so without a guard a tenant could point one at `169.254.169.254` (cloud metadata →
 * steal instance credentials), `127.0.0.1`, or an RFC1918 address (scan/hit internal
 * services). This classifies an IP as public or blocked, and resolves a hostname to catch
 * a name that points at a private address (basic DNS-rebinding defense).
 *
 * Blocking is ON in production and OFF elsewhere (dev/test monitor localhost freely, and
 * `CHECKS_ALLOW_PRIVATE_TARGETS=1` force-allows) — but the pure classifier is always
 * exercised by tests. When private locations land (own-network runners), those bypass the
 * guard by design; a public location never should.
 */

/** IPv4 CIDR blocks that must never be a public check target. */
const BLOCKED_V4: Array<[base: string, bits: number, label: string]> = [
  ["0.0.0.0", 8, "unspecified"],
  ["10.0.0.0", 8, "private"],
  ["100.64.0.0", 10, "cgnat"],
  ["127.0.0.0", 8, "loopback"],
  ["169.254.0.0", 16, "link-local"], // includes 169.254.169.254 cloud metadata
  ["172.16.0.0", 12, "private"],
  ["192.0.0.0", 24, "ietf"],
  ["192.0.2.0", 24, "test-net"],
  ["192.168.0.0", 16, "private"],
  ["198.18.0.0", 15, "benchmark"],
  ["198.51.100.0", 24, "test-net"],
  ["203.0.113.0", 24, "test-net"],
  ["224.0.0.0", 4, "multicast"],
  ["240.0.0.0", 4, "reserved"],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const o = Number(p);
    if (o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

function classifyIPv4(ip: string): string | null {
  const addr = ipv4ToInt(ip);
  if (addr === null) return null;
  for (const [base, bits, label] of BLOCKED_V4) {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((addr & mask) === (b & mask)) return label;
  }
  return null;
}

/** Expand an IPv6 address to its 8 numeric hextets (handles `::` and v4-mapped tails). */
function ipv6Hextets(ip: string): number[] | null {
  let s = ip.trim();
  // A trailing embedded IPv4 (e.g. ::ffff:1.2.3.4) becomes two hextets.
  const v4m = s.match(/(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4m) {
    const v4 = ipv4ToInt(v4m[2]!);
    if (v4 === null) return null;
    s = v4m[1]! + ((v4 >>> 16) & 0xffff).toString(16) + ":" + (v4 & 0xffff).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const parts = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...tail];
  if (parts.length !== 8) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(p || "0")) return null;
    out.push(parseInt(p || "0", 16));
  }
  return out;
}

function classifyIPv6(ip: string): string | null {
  const h = ipv6Hextets(ip);
  if (!h) return null;
  const isZero = h.every((x) => x === 0);
  if (isZero) return "unspecified"; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return "loopback"; // ::1
  // v4-mapped ::ffff:0:0/96 → classify the embedded IPv4
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff) {
    const v4 = `${(h[6] >> 8) & 0xff}.${h[6] & 0xff}.${(h[7] >> 8) & 0xff}.${h[7] & 0xff}`;
    return classifyIPv4(v4);
  }
  if ((h[0] & 0xfe00) === 0xfc00) return "unique-local"; // fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return "link-local"; // fe80::/10
  if ((h[0] & 0xff00) === 0xff00) return "multicast"; // ff00::/8
  if (h[0] === 0x2001 && h[1] === 0x0db8) return "documentation"; // 2001:db8::/32
  return null;
}

/** The block reason for an IP literal, or null if it's a public address. */
export function classifyIp(ip: string): string | null {
  const v = isIP(ip);
  if (v === 4) return classifyIPv4(ip);
  if (v === 6) return classifyIPv6(ip);
  return null; // not an IP literal
}

export function isPublicIp(ip: string): boolean {
  return isIP(ip) !== 0 && classifyIp(ip) === null;
}

/** Whether private/internal targets are permitted (dev/test, or explicit opt-in). */
export function privateTargetsAllowed(): boolean {
  return (
    process.env.CHECKS_ALLOW_PRIVATE_TARGETS === "1" || process.env.NODE_ENV !== "production"
  );
}

export class BlockedTargetError extends Error {
  constructor(
    readonly host: string,
    readonly reason: string,
  ) {
    super(`Target "${host}" is not allowed (${reason} address). Public checks can only reach public hosts.`);
    this.name = "BlockedTargetError";
  }
}

/**
 * Assert a hostname/IP is a permitted public target, resolving DNS names so a name that
 * points at a private address is caught too. Throws {@link BlockedTargetError} if blocked.
 * A no-op when {@link privateTargetsAllowed} (unless `force`), so dev/test hit localhost.
 */
export async function assertPublicHost(host: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && privateTargetsAllowed()) return;
  const literal = classifyIp(host);
  if (literal) throw new BlockedTargetError(host, literal);
  if (isIP(host) !== 0) return; // a public IP literal
  // A DNS name: block if ANY resolved address is private (rebinding defense).
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    return; // unresolvable — the probe itself will fail; nothing to exfiltrate
  }
  for (const { address } of addrs) {
    const reason = classifyIp(address);
    if (reason) throw new BlockedTargetError(host, reason);
  }
}

/** Same, for a full URL — validates its hostname. Throws {@link BlockedTargetError}. */
export async function assertPublicUrl(rawUrl: string, opts: { force?: boolean } = {}): Promise<void> {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, ""); // strip [ ] from IPv6 literals
  } catch {
    return; // malformed URL — the probe handles the error
  }
  await assertPublicHost(host, opts);
}
