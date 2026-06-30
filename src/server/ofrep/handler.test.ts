import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bundle } from '@/core/types';
import type { BundleRef } from '@/server/bundles/store';

/**
 * OFREP org-binding contract (PROJECT.md §11). Two orgs can share a flag key
 * (here both have `new-dashboard`); an SDK key must only ever read its own org's
 * bundle. The org + environment both come from the resolved SDK key, so the
 * handler can never be steered to another tenant's data by the request. These
 * tests lock that in at the handler seam (no DB) — the bundle store is mocked so
 * we can assert exactly which (org, env) ref it is asked for.
 */

const bundleFor = (org: string, env: string, defaultVariant: 'on' | 'off'): Bundle => ({
  schemaVersion: 1,
  environmentId: env,
  etag: `${org}-1`,
  generatedAt: '2026-01-01T00:00:00.000Z',
  segments: {},
  flags: {
    'new-dashboard': {
      state: 'ENABLED',
      type: 'boolean',
      variants: { on: true, off: false },
      defaultVariant,
      targeting: [],
    },
  },
});

// Org A serves `on` (true); Org B serves `off` (false) for the same flag key.
const bundleA = bundleFor('orgA', 'envA', 'on');
const bundleB = bundleFor('orgB', 'envB', 'off');

/** Every (org, env) the handler asked the store for — the assertion surface. */
const getCalls: BundleRef[] = [];

const store = {
  put: vi.fn(async () => {}),
  get: vi.fn(async (ref: BundleRef): Promise<Bundle | null> => {
    getCalls.push(ref);
    if (ref.organizationId === 'orgA' && ref.environmentId === 'envA') return bundleA;
    if (ref.organizationId === 'orgB' && ref.environmentId === 'envB') return bundleB;
    return null;
  }),
};

vi.mock('@/server/bundles', () => ({ bundleStore: () => store }));

vi.mock('@/server/flags/sdk-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/flags/sdk-keys')>();
  return {
    ...actual, // keep the real bearerFromHeader (pure parsing)
    resolveSdkKey: async (token: string) => {
      if (token === 'keyA') return { keyId: 'kA', organizationId: 'orgA', environmentId: 'envA', scope: 'server' };
      if (token === 'keyB') return { keyId: 'kB', organizationId: 'orgB', environmentId: 'envB', scope: 'server' };
      return null;
    },
  };
});

const { evaluateSingle, evaluateBulk } = await import('./handler');

function req(token: string | null, body: unknown = { context: {} }): Request {
  return new Request('http://localhost/ofrep', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getCalls.length = 0;
  store.get.mockClear();
});

describe('OFREP handler — org binding', () => {
  it('serves each org its own value for a shared flag key (single eval)', async () => {
    const a = await (await evaluateSingle(req('keyA'), 'new-dashboard')).json();
    const b = await (await evaluateSingle(req('keyB'), 'new-dashboard')).json();
    expect(a.value).toBe(true); // org A
    expect(b.value).toBe(false); // org B — same key, different bundle
  });

  it('serves each org its own value in bulk eval', async () => {
    const a = await (await evaluateBulk(req('keyA'))).json();
    const b = await (await evaluateBulk(req('keyB'))).json();
    expect(a.flags.find((f: { key: string }) => f.key === 'new-dashboard').value).toBe(true);
    expect(b.flags.find((f: { key: string }) => f.key === 'new-dashboard').value).toBe(false);
  });

  it('only ever asks the store for the SDK key\'s own (org, env) pair', async () => {
    await evaluateSingle(req('keyA'), 'new-dashboard');
    await evaluateBulk(req('keyB'));
    // No call may mix one org with another's environment.
    for (const ref of getCalls) {
      const ok =
        (ref.organizationId === 'orgA' && ref.environmentId === 'envA') ||
        (ref.organizationId === 'orgB' && ref.environmentId === 'envB');
      expect(ok, `cross-tenant ref leaked: ${JSON.stringify(ref)}`).toBe(true);
    }
  });

  it('rejects an invalid SDK key with 401 and never touches the store', async () => {
    const res = await evaluateSingle(req('bogus'), 'new-dashboard');
    expect(res.status).toBe(401);
    expect(store.get).not.toHaveBeenCalled();
  });

  it('rejects a missing SDK key with 401', async () => {
    const res = await evaluateBulk(req(null));
    expect(res.status).toBe(401);
  });
});
