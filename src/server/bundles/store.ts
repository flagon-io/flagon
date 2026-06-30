/**
 * BundleStore - the seam between the control plane (which publishes flag
 * bundles) and the data plane (which reads them on the hot path). The future Go
 * evaluator implements the read side of this same contract against the same
 * backing store, so extracting it requires zero changes to the control plane.
 */

import type { Bundle } from '@/core/types';

export interface BundleRef {
  organizationId: string;
  environmentId: string;
}

export interface BundleStore {
  /** Publish (overwrite) the current bundle for an environment. */
  put(ref: BundleRef, bundle: Bundle): Promise<void>;
  /** Read the current bundle for an environment, or null if never published. */
  get(ref: BundleRef): Promise<Bundle | null>;
}
