/**
 * Drizzle schema entrypoint. drizzle.config.ts points here; re-export every
 * table so migrations and the query builder see the full schema.
 */

export * from './schema/auth';
export * from './schema/app';
