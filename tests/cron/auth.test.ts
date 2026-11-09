import { describe, expect, it } from 'vitest';
import { isCronAuthorized } from '@/lib/cron';
import { decideRoute } from '@/lib/auth/guard';

describe('isCronAuthorized', () => {
  it('accepts the exact bearer secret', () => {
    expect(isCronAuthorized('Bearer s3cret-value', 's3cret-value')).toBe(true);
  });

  it('rejects a wrong, missing or malformed header', () => {
    expect(isCronAuthorized('Bearer nope', 's3cret-value')).toBe(false);
    expect(isCronAuthorized(null, 's3cret-value')).toBe(false);
    expect(isCronAuthorized('s3cret-value', 's3cret-value')).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(isCronAuthorized('Bearer ', '')).toBe(false);
    expect(isCronAuthorized('Bearer undefined', undefined)).toBe(false);
  });
});

describe('cron route and the sign-in guard', () => {
  it('lets the cron route through without a session (it checks its own secret)', () => {
    expect(decideRoute('/api/cron/purge', null, false)).toEqual({ allow: true });
  });

  it('does not open other api paths', () => {
    expect(decideRoute('/api/other', null, false)).toEqual({ redirect: '/login' });
  });
});
