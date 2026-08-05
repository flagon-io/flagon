// The marketing site never talks to a database directly; anything dynamic goes
// through the API. Today that's just the base URL used by the API reference page.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
