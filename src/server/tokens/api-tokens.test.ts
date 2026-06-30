import { describe, expect, it } from 'vitest';
import { generateApiToken, hashApiToken, isApiTokenFormat } from './api-tokens';

describe('api token minting', () => {
  it('tags user PATs and keeps a display prefix + matching hash', () => {
    const t = generateApiToken('user');
    expect(t.plaintext).toMatch(/^flagon_pat_/);
    expect(t.prefix).toBe(t.plaintext.slice(0, 18));
    expect(t.hashedKey).toBe(hashApiToken(t.plaintext));
    expect(t.hashedKey).toHaveLength(64); // sha-256 hex
  });

  it('tags org tokens distinctly', () => {
    expect(generateApiToken('org').plaintext).toMatch(/^flagon_oat_/);
  });

  it('mints a unique secret each time', () => {
    expect(generateApiToken('user').plaintext).not.toBe(generateApiToken('user').plaintext);
  });

  it('recognizes only its own token format (not SDK keys or JWTs)', () => {
    expect(isApiTokenFormat('flagon_pat_abc')).toBe(true);
    expect(isApiTokenFormat('flagon_oat_abc')).toBe(true);
    expect(isApiTokenFormat('flagon_srv_abc')).toBe(false); // sdk key
    expect(isApiTokenFormat('aaa.bbb.ccc')).toBe(false); // jwt
    expect(isApiTokenFormat('whatever')).toBe(false);
  });
});
