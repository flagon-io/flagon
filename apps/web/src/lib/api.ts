// The marketing site never talks to a database directly — every dynamic
// bit (like the waitlist and the enterprise contact form) goes through the API.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

export type ContactInput = {
  email: string;
  name?: string;
  company?: string;
  message?: string;
};

/**
 * Submit an enterprise/sales inquiry to the API's public contact endpoint
 * (POST /v1/contact -> leads pipeline). Resolves true on success; throws with a
 * useful message on rate-limit (429) or any failure so the form can show it.
 */
export async function submitContact(input: ContactInput): Promise<boolean> {
  const res = await fetch(`${API_URL}/v1/contact`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 429) {
    throw new Error("Too many submissions. Please try again in a few minutes.");
  }
  if (!res.ok) {
    throw new Error("Something went wrong on our end. Please try again.");
  }
  const data = (await res.json().catch(() => null)) as { accepted?: boolean } | null;
  return Boolean(data?.accepted);
}
