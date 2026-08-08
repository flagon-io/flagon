import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getChannelType, listChannelTypes, channelDestination } from "./channel-types.js";
import type { AlertContent } from "./channel-types.js";

const content: AlertContent = {
  kind: "alert",
  checkKey: "home",
  checkName: "Home page",
  orgSlug: "acme",
  status: "failing",
  latencyMs: 1234,
  httpStatus: 500,
  errorMessage: "Internal Server Error",
  link: "http://localhost:3001/acme/checks/home",
  subject: "[Flagon] Home page is failing",
  text: "[Flagon] Home page is failing. 1234ms http://localhost:3001/acme/checks/home",
  html: "<p>Home page is failing.</p>",
};

describe("alert channel registry", () => {
  it("registers email, sms, phone, webhook", () => {
    expect(listChannelTypes().map((t) => t.key)).toEqual(["email", "sms", "phone", "webhook"]);
  });

  it("gates sms/phone on integration capabilities, not email/webhook", () => {
    expect(getChannelType("email")!.gatesCapability).toBeNull();
    expect(getChannelType("webhook")!.gatesCapability).toBeNull();
    expect(getChannelType("sms")!.gatesCapability).toBe("sms");
    expect(getChannelType("phone")!.gatesCapability).toBe("voice");
  });

  it("validates config per type", () => {
    expect(getChannelType("email")!.configSchema.safeParse({ address: "a@b.com" }).success).toBe(true);
    expect(getChannelType("email")!.configSchema.safeParse({ address: "nope" }).success).toBe(false);
    expect(getChannelType("webhook")!.configSchema.safeParse({ url: "https://x.test/hook" }).success).toBe(true);
    expect(getChannelType("webhook")!.configSchema.safeParse({ url: "ftp://x" }).success).toBe(false);
    expect(getChannelType("sms")!.configSchema.safeParse({ phone: "+15551234567" }).success).toBe(true);
    expect(getChannelType("sms")!.configSchema.safeParse({ phone: "" }).success).toBe(false);
  });

  it("summarizes destinations", () => {
    expect(channelDestination("email", { address: "a@b.com" })).toBe("a@b.com");
    expect(channelDestination("webhook", { url: "https://x.test/hook" })).toBe("https://x.test/hook");
  });
});

describe("webhook delivery", () => {
  let server: Server;
  let url: string;
  const received: { body: string; sig?: string }[] = [];

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ body, sig: req.headers["x-flagon-signature"] as string | undefined });
        res.writeHead(req.url === "/fail" ? 500 : 200);
        res.end("ok");
      });
    });
    url = await new Promise<string>((r) =>
      server.listen(0, "127.0.0.1", () => {
        const a = server.address();
        r(`http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`);
      }),
    );
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("POSTs a signed JSON payload the endpoint accepts", async () => {
    const res = await getChannelType("webhook")!.deliver("org", { url, secret: "shh" }, content);
    expect(res.ok).toBe(true);
    const last = received.at(-1)!;
    const payload = JSON.parse(last.body);
    expect(payload.check).toBe("Home page");
    expect(payload.alertType).toBe("alert");
    expect(payload.status).toBe("failing");
    expect(last.sig).toBe(createHmac("sha256", "shh").update(last.body).digest("hex"));
  });

  it("reports a non-2xx endpoint as a failure", async () => {
    const res = await getChannelType("webhook")!.deliver("org", { url: `${url}/fail` }, content);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("500");
  });

  it("fails cleanly on a missing url", async () => {
    const res = await getChannelType("webhook")!.deliver("org", {}, content);
    expect(res.ok).toBe(false);
  });
});
