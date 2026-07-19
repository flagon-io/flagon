// Loads .env.local / .env for tests (Vitest does not auto-load them).
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });
