/**
 * Minimal Twilio REST client over fetch — no SDK. Twilio's API is a couple of
 * Basic-auth form-POST endpoints, so pulling in the SDK (and its transitive
 * surface) would cost more than it saves. Everything here takes the CUSTOMER's
 * credentials explicitly: this module never reads env, because in the BYO model
 * the account is theirs, not ours.
 */

const API_BASE = "https://api.twilio.com/2010-04-01";
// A short ceiling so a hung Twilio call can never wedge an incident page or a
// console "Test" click. Twilio normally answers in well under a second.
const TIMEOUT_MS = 8_000;

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  /** An E.164 number (+15551234567) or a Messaging Service SID (MG…). */
  from: string;
};

function authHeader(sid: string, token: string): string {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

/** A tidy one-line reason from a Twilio error body, for status display. */
async function reason(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  const detail = body?.message ? `: ${body.message}` : "";
  return `Twilio responded ${res.status}${detail}`;
}

/**
 * Verify a set of credentials by fetching the account itself. A 200 means the
 * SID + auth token are valid; 401 means they aren't. Returns a plain result
 * object (never throws) so callers can record the reason.
 */
export async function verifyCredentials(
  creds: Pick<TwilioCredentials, "accountSid" | "authToken">,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`${API_BASE}/Accounts/${creds.accountSid}.json`, {
      headers: { Authorization: authHeader(creds.accountSid, creds.authToken) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) {
      return { ok: false, message: "Invalid Account SID or auth token." };
    }
    return { ok: false, message: await reason(res) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not reach Twilio.",
    };
  }
}

export type TwilioCapabilities = { sms: boolean; voice: boolean };

/**
 * Detect what the configured sender can actually do, so we use the account
 * correctly instead of assuming. A Messaging Service SID (`MG…`) is SMS-only by
 * definition; a phone number's real capabilities come from its
 * IncomingPhoneNumbers resource (`capabilities: { sms, voice, mms }`). A number
 * that isn't in the account is a misconfiguration we surface rather than store.
 * Never throws.
 */
export async function detectSenderCapabilities(
  creds: TwilioCredentials,
): Promise<{ ok: boolean; capabilities?: TwilioCapabilities; message?: string }> {
  // A Messaging Service handles SMS/MMS only; it can't place voice calls.
  if (creds.from.startsWith("MG")) {
    return { ok: true, capabilities: { sms: true, voice: false } };
  }
  try {
    const url = `${API_BASE}/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(creds.from)}`;
    const res = await fetch(url, {
      headers: { Authorization: authHeader(creds.accountSid, creds.authToken) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, message: await reason(res) };
    const body = (await res.json().catch(() => null)) as {
      incoming_phone_numbers?: Array<{ capabilities?: { sms?: boolean; voice?: boolean } }>;
    } | null;
    const number = body?.incoming_phone_numbers?.[0];
    if (!number) {
      return {
        ok: false,
        message: "That phone number isn't in your Twilio account. Check the sender.",
      };
    }
    return {
      ok: true,
      capabilities: {
        sms: Boolean(number.capabilities?.sms),
        voice: Boolean(number.capabilities?.voice),
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not reach Twilio.",
    };
  }
}

/** Escape text for safe inclusion in a TwiML document. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Place one voice call through the customer's Twilio account that speaks
 * `spoken` and then hangs up (inline TwiML, no callback URL to host). Returns the
 * created call SID on success. Never throws.
 *
 * Voice needs a real phone number as the caller ID: a Messaging Service SID
 * (`MG…`) is SMS-only, so a from of that shape is rejected with a clear reason
 * rather than a confusing Twilio error.
 */
export async function placeCall(
  creds: TwilioCredentials,
  to: string,
  spoken: string,
): Promise<{ ok: boolean; sid?: string; message?: string }> {
  if (creds.from.startsWith("MG")) {
    return {
      ok: false,
      message:
        "Voice calls need a phone number as the caller ID, not a Messaging Service SID.",
    };
  }
  const twiml = `<Response><Say voice="alice">${escapeXml(spoken)}</Say></Response>`;
  const form = new URLSearchParams({ To: to, From: creds.from, Twiml: twiml });
  try {
    const res = await fetch(`${API_BASE}/Accounts/${creds.accountSid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: authHeader(creds.accountSid, creds.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const call = (await res.json().catch(() => null)) as { sid?: string } | null;
      return { ok: true, sid: call?.sid };
    }
    return { ok: false, message: await reason(res) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not reach Twilio.",
    };
  }
}

/**
 * Send one SMS through the customer's Twilio account. `from` routes as a
 * Messaging Service (SID starting "MG") or a plain From number. Returns the
 * created message SID on success. Never throws.
 */
export async function sendSms(
  creds: TwilioCredentials,
  to: string,
  body: string,
): Promise<{ ok: boolean; sid?: string; message?: string }> {
  const form = new URLSearchParams({ To: to, Body: body });
  if (creds.from.startsWith("MG")) form.set("MessagingServiceSid", creds.from);
  else form.set("From", creds.from);

  try {
    const res = await fetch(`${API_BASE}/Accounts/${creds.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: authHeader(creds.accountSid, creds.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const sent = (await res.json().catch(() => null)) as { sid?: string } | null;
      return { ok: true, sid: sent?.sid };
    }
    return { ok: false, message: await reason(res) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not reach Twilio.",
    };
  }
}
