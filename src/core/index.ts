/**
 * Flagon evaluation core - public surface.
 *
 * Framework-free and dependency-free. Safe to import from route handlers, the
 * bundle compiler, tests, or (eventually) a separate process. Do not add
 * runtime-specific imports here.
 */

export * from './types';
export { evaluateFlag, evaluateAll } from './evaluate';
export { matches, compareSemver } from './targeting';
export { fnv1a32, bucket } from './hash';
