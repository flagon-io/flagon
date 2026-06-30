import { describe, expect, it } from 'vitest';
import { evaluateFlag, evaluateAll } from './evaluate';
import { bucket } from './hash';
import type { Bundle } from './types';

/**
 * Conformance fixtures. The future Go data plane must produce identical results
 * for this exact bundle + these exact contexts. Treat changes here as a
 * cross-language contract change, not a refactor.
 */
const bundle: Bundle = {
  schemaVersion: 1,
  environmentId: 'env_test',
  etag: 'test-1',
  generatedAt: '2026-01-01T00:00:00.000Z',
  segments: {
    'internal-staff': {
      op: 'ends_with',
      attr: 'email',
      value: '@flagon.io',
    },
  },
  flags: {
    'new-dashboard': {
      state: 'ENABLED',
      type: 'boolean',
      variants: { on: true, off: false },
      defaultVariant: 'off',
      targeting: [
        { when: { op: 'segment', ref: 'internal-staff' }, then: { variant: 'on' } },
        { when: { op: 'eq', attr: 'plan', value: 'enterprise' }, then: { variant: 'on' } },
      ],
    },
    'checkout-color': {
      state: 'ENABLED',
      type: 'string',
      variants: { blue: 'blue', green: 'green', red: 'red' },
      defaultVariant: 'blue',
      targeting: [
        {
          when: { op: 'true' },
          then: {
            fractional: [
              { variant: 'blue', weight: 50 },
              { variant: 'green', weight: 50 },
            ],
          },
        },
      ],
    },
    'min-version-gate': {
      state: 'ENABLED',
      type: 'boolean',
      variants: { on: true, off: false },
      defaultVariant: 'off',
      targeting: [
        { when: { op: 'semver', attr: 'appVersion', cmp: '>=', value: '2.1.0' }, then: { variant: 'on' } },
      ],
    },
    'legacy-banner': {
      state: 'DISABLED',
      type: 'boolean',
      variants: { on: true, off: false },
      defaultVariant: 'off',
    },
  },
};

describe('evaluateFlag', () => {
  it('returns the default when no rule matches', () => {
    const r = evaluateFlag(bundle, 'new-dashboard', { targetingKey: 'u1', plan: 'free' });
    expect(r.value).toBe(false);
    expect(r.variant).toBe('off');
    expect(r.reason).toBe('DEFAULT');
  });

  it('matches a segment rule', () => {
    const r = evaluateFlag(bundle, 'new-dashboard', {
      targetingKey: 'u2',
      email: 'dev@flagon.io',
    });
    expect(r.value).toBe(true);
    expect(r.reason).toBe('TARGETING_MATCH');
  });

  it('matches an equality rule', () => {
    const r = evaluateFlag(bundle, 'new-dashboard', { targetingKey: 'u3', plan: 'enterprise' });
    expect(r.value).toBe(true);
    expect(r.reason).toBe('TARGETING_MATCH');
  });

  it('reports FLAG_NOT_FOUND for unknown flags', () => {
    const r = evaluateFlag(bundle, 'does-not-exist', { targetingKey: 'u1' });
    expect(r.reason).toBe('ERROR');
    expect(r.errorCode).toBe('FLAG_NOT_FOUND');
  });

  it('returns the default with reason DISABLED for disabled flags', () => {
    const r = evaluateFlag(bundle, 'legacy-banner', { targetingKey: 'u1' });
    expect(r.value).toBe(false);
    expect(r.reason).toBe('DISABLED');
  });

  it('evaluates semver comparisons', () => {
    expect(evaluateFlag(bundle, 'min-version-gate', { appVersion: '2.0.9' }).value).toBe(false);
    expect(evaluateFlag(bundle, 'min-version-gate', { appVersion: '2.1.0' }).value).toBe(true);
    expect(evaluateFlag(bundle, 'min-version-gate', { appVersion: '3.4.1' }).value).toBe(true);
  });

  it('buckets fractional rollouts deterministically (sticky)', () => {
    const first = evaluateFlag(bundle, 'checkout-color', { targetingKey: 'stable-user' });
    const second = evaluateFlag(bundle, 'checkout-color', { targetingKey: 'stable-user' });
    expect(first.variant).toBe(second.variant);
    expect(first.reason).toBe('SPLIT');
    expect(['blue', 'green']).toContain(first.value);
  });

  it('distributes a 50/50 split within tolerance', () => {
    let green = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      const r = evaluateFlag(bundle, 'checkout-color', { targetingKey: `user-${i}` });
      if (r.variant === 'green') green++;
    }
    const ratio = green / n;
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
  });
});

describe('evaluateAll', () => {
  it('returns one result per flag', () => {
    const results = evaluateAll(bundle, { targetingKey: 'u1' });
    expect(results).toHaveLength(Object.keys(bundle.flags).length);
  });
});

describe('bucket', () => {
  it('is stable and within range', () => {
    const b = bucket('checkout-color', 'stable-user');
    expect(b).toBe(bucket('checkout-color', 'stable-user'));
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(10000);
  });
});
