/**
 * Bundle store factory. Selects the driver from BUNDLE_STORE_DRIVER:
 *   - "postgres" (default): durable, zero-infra, ideal for local + self-host.
 *   - "r2": Cloudflare R2 / any S3, the production edge read path.
 *
 * A single instance is memoized per server process.
 */

import { PostgresBundleStore } from './postgres-store';
import { R2BundleStore } from './r2-store';
import type { BundleStore } from './store';

let instance: BundleStore | undefined;

export function bundleStore(): BundleStore {
  if (!instance) {
    const driver = (process.env.BUNDLE_STORE_DRIVER ?? 'postgres').toLowerCase();
    instance = driver === 'r2' ? new R2BundleStore() : new PostgresBundleStore();
  }
  return instance;
}

export type { BundleStore, BundleRef } from './store';
