// Loads .env.local / .env for tests (Vitest does not auto-load them).
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

// Tests must NEVER deliver real email: force the console provider regardless
// of what the developer's .env.local contains.
delete process.env.RESEND_API_KEY;
