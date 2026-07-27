// The marketing site never talks to a database directly — every dynamic
// bit (like the waitlist) goes through the API.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
