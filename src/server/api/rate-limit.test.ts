import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from './rate-limit';

describe('rateLimit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows up to the limit, then blocks within the window', () => {
    const key = 'rl-allow';
    expect(rateLimit(key, 2, 1000).ok).toBe(true);
    expect(rateLimit(key, 2, 1000).ok).toBe(true);
    const third = rateLimit(key, 2, 1000);
    expect(third.ok).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('resets after the window elapses', () => {
    const key = 'rl-reset';
    rateLimit(key, 1, 1000);
    expect(rateLimit(key, 1, 1000).ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit(key, 1, 1000).ok).toBe(true);
  });
});
