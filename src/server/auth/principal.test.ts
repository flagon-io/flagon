import { describe, expect, it } from 'vitest';
import { claimsToPrincipal, principalClaims, type Principal } from './principal';

describe('principal ↔ claims', () => {
  it('builds org-token claims bound to exactly one org', async () => {
    const p: Principal = {
      actor: 'org',
      via: 'org-token',
      tokenId: 'tok1',
      organizationId: 'orgA',
      role: 'admin',
    };
    expect(await principalClaims(p)).toEqual({
      sub: 'tok1',
      act: 'org',
      tid: 'tok1',
      orgs: { orgA: 'admin' },
    });
  });

  it('reconstructs a user principal from a JWT, carrying its org map (no DB)', () => {
    const p = claimsToPrincipal({
      sub: 'u1',
      act: 'user',
      orgs: { orgA: 'member', orgB: 'owner' },
      tid: 'tokX',
    });
    expect(p).toEqual({
      actor: 'user',
      via: 'jwt',
      userId: 'u1',
      tokenId: 'tokX',
      orgs: { orgA: 'member', orgB: 'owner' },
      scopes: null,
    });
  });

  it('reconstructs an org principal bound to its single org', () => {
    const p = claimsToPrincipal({ sub: 'tok1', act: 'org', tid: 'tok1', orgs: { orgA: 'viewer' } });
    expect(p).toEqual({
      actor: 'org',
      via: 'jwt',
      tokenId: 'tok1',
      organizationId: 'orgA',
      role: 'viewer',
      scopes: null,
    });
  });

  it('round-trips an org token through claims (org binding + role survive)', async () => {
    const p: Principal = {
      actor: 'org',
      via: 'org-token',
      tokenId: 'tok1',
      organizationId: 'orgA',
      role: 'admin',
    };
    const back = claimsToPrincipal(await principalClaims(p));
    expect(back).toMatchObject({ actor: 'org', organizationId: 'orgA', role: 'admin' });
  });

  it('carries fine-grained scopes through claims', async () => {
    const p: Principal = {
      actor: 'org',
      via: 'org-token',
      tokenId: 'tok1',
      organizationId: 'orgA',
      role: 'member',
      scopes: ['flags:read'],
    };
    const claims = await principalClaims(p);
    expect(claims.scopes).toEqual(['flags:read']);
    expect(claimsToPrincipal(claims).scopes).toEqual(['flags:read']);
  });
});
