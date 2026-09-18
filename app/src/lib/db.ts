import { Pool } from "pg";

// Shared across better-auth and our own custom queries (e.g. user_emails).
// Lazy connect: safe to construct with no DATABASE_URL set yet.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
