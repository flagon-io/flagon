import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  RawBodyUnavailableError,
  helpersEnabled,
  readRequestBody,
} from "./vercel-request.js";

/**
 * The bug this file exists to prevent: the Vercel entry used to read Vercel's
 * PARSED `req.body` and re-serialize it with JSON.stringify. Stripe signs the exact
 * bytes it sends and pretty-prints its payloads, so every live webhook delivery
 * failed verification with a 400 — for four days, silently, looking for all the
 * world like a wrong signing secret.
 *
 * So the assertions here are the real thing: a genuine Stripe signature over a
 * genuine pretty-printed payload, verified through the SDK.
 */

const SECRET = "whsec_test_secret_for_signature_verification";
const stripe = new Stripe("sk_test_unused", {
  apiVersion: "2026-06-24.dahlia",
});

/** How Stripe actually serializes a webhook payload: pretty-printed, 2-space. */
const PAYLOAD = JSON.stringify(
  {
    id: "evt_1U1EYIEJUAjXuzmwoT6EGS9G",
    object: "event",
    type: "customer.subscription.updated",
    data: {
      object: { id: "sub_123", object: "subscription", status: "active" },
    },
  },
  null,
  2,
);

function fakeRequest(opts: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Simulate Vercel's Node helpers parsing the body onto `req.body`. */
  helpers?: boolean;
}): IncomingMessage {
  const { method = "POST", headers = {}, body, helpers = false } = opts;
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  const req = Object.assign(stream, {
    method,
    headers: { "content-type": "application/json", ...headers },
  });
  if (helpers) {
    // The helpers consume the stream, then expose the parsed value as an own getter.
    stream.resume();
    Object.defineProperty(req, "body", {
      configurable: true,
      get: () => (body === undefined ? undefined : JSON.parse(body)),
    });
  }
  return req as unknown as IncomingMessage;
}

function signed(payload: string): Record<string, string> {
  return {
    "stripe-signature": stripe.webhooks.generateTestHeaderString({
      payload,
      secret: SECRET,
    }),
  };
}

describe("readRequestBody", () => {
  it("preserves the exact bytes a Stripe signature covers", async () => {
    const headers = signed(PAYLOAD);
    const body = await readRequestBody(fakeRequest({ headers, body: PAYLOAD }));

    const event = stripe.webhooks.constructEvent(
      body as Buffer,
      headers["stripe-signature"],
      SECRET,
    );
    expect(event.id).toBe("evt_1U1EYIEJUAjXuzmwoT6EGS9G");
  });

  it("refuses a signed request when Vercel's helpers already parsed the body", async () => {
    // The old behavior — re-serializing here — produced a body that could never
    // verify. Failing loudly is the only honest answer.
    await expect(
      readRequestBody(
        fakeRequest({ headers: signed(PAYLOAD), body: PAYLOAD, helpers: true }),
      ),
    ).rejects.toBeInstanceOf(RawBodyUnavailableError);
  });

  it("re-serializing a pretty-printed payload breaks its signature", () => {
    // Guards the premise: compact and pretty JSON are equal objects, different bytes.
    const reserialized = JSON.stringify(JSON.parse(PAYLOAD));
    expect(reserialized).not.toBe(PAYLOAD);
    expect(() =>
      stripe.webhooks.constructEvent(
        reserialized,
        signed(PAYLOAD)["stripe-signature"],
        SECRET,
      ),
    ).toThrow();
  });

  it("still serves unsigned POSTs from the parsed body when helpers are on", async () => {
    const body = await readRequestBody(
      fakeRequest({ body: '{"who":"flagon"}', helpers: true }),
    );
    expect(JSON.parse(String(body))).toEqual({ who: "flagon" });
  });

  it("reads nothing for GET and HEAD", async () => {
    expect(
      await readRequestBody(fakeRequest({ method: "GET" })),
    ).toBeUndefined();
    expect(
      await readRequestBody(fakeRequest({ method: "HEAD" })),
    ).toBeUndefined();
  });
});

describe("helpersEnabled", () => {
  it("detects the helpers without invoking the getter", () => {
    const req = fakeRequest({ body: "{}", helpers: true });
    Object.defineProperty(req, "body", {
      configurable: true,
      get: () => {
        throw new Error("getter must not run — malformed JSON throws here");
      },
    });
    expect(helpersEnabled(req)).toBe(true);
    expect(helpersEnabled(fakeRequest({ body: "{}" }))).toBe(false);
  });
});
