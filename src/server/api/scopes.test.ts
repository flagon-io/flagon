import { describe, expect, it } from 'vitest';
import { normalizeScopes, scopeAllows } from './scopes';

describe('scopes', () => {
  it('normalizes: drops invalid, de-dupes, and empties to null', () => {
    expect(normalizeScopes(null)).toBeNull();
    expect(normalizeScopes([])).toBeNull();
    expect(normalizeScopes(['bogus'])).toBeNull();
    expect(normalizeScopes(['projects:read', 'projects:read', 'nope'])).toEqual(['projects:read']);
  });

  it('treats an unrestricted token (null/empty) as allowing everything', () => {
    expect(scopeAllows(null, 'projects:read')).toBe(true);
    expect(scopeAllows([], 'environments:write')).toBe(true);
  });

  it('limits a scoped token to exactly its scopes', () => {
    expect(scopeAllows(['projects:read'], 'projects:read')).toBe(true);
    expect(scopeAllows(['projects:read'], 'projects:write')).toBe(false);
  });
});
