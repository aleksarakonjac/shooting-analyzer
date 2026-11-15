import { describe, expect, it, vi } from 'vitest';
import { completeConnect } from '../../src/lib/googleHealth/connect';
import { GoogleHealthError, SCOPES } from '../../src/lib/googleHealth/client';
import { signState } from '../../src/lib/googleHealth/state';

const secret = 'state-secret';
const now = 1_000;
const goodState = signState({ userId: 'u1', nonce: 'n1', exp: now + 600_000 }, secret);

function deps(over: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    nonce: 'n1',
    now,
    stateSecret: secret,
    exchange: vi.fn(async () => ({ refreshToken: 'refresh', accessToken: 'access', scope: SCOPES.join(' ') })),
    identity: vi.fn(async () => ({ healthUserId: 'h1' })),
    save: vi.fn(async () => {}),
    encrypt: (plain: string) => `enc(${plain})`,
    ...over,
  };
}

describe('completeConnect', () => {
  it('Google error parameter ends in error', async () => {
    const d = deps();
    expect(await completeConnect({ code: null, state: goodState, error: 'access_denied' }, d)).toBe('error');
    expect(d.exchange).not.toHaveBeenCalled();
  });

  it('bad, expired or unmatched state ends in state', async () => {
    expect(await completeConnect({ code: 'c', state: 'junk', error: null }, deps())).toBe('state');
    expect(await completeConnect({ code: 'c', state: goodState, error: null }, deps({ nonce: null }))).toBe('state');
    expect(await completeConnect({ code: 'c', state: goodState, error: null }, deps({ userId: 'u2' }))).toBe('state');
    expect(await completeConnect({ code: 'c', state: goodState, error: null }, deps({ now: now + 700_000 }))).toBe('state');
  });

  it('missing activity scope ends in scopes and saves nothing', async () => {
    const d = deps({ exchange: vi.fn(async () => ({ refreshToken: 'r', accessToken: 'a', scope: SCOPES[0] })) });
    expect(await completeConnect({ code: 'c', state: goodState, error: null }, d)).toBe('scopes');
    expect(d.save).not.toHaveBeenCalled();
  });

  it('account not linked to the Google Health app ends in not_linked', async () => {
    const d = deps({ identity: vi.fn(async () => { throw new GoogleHealthError('not_linked', 400); }) });
    expect(await completeConnect({ code: 'c', state: goodState, error: null }, d)).toBe('not_linked');
    expect(d.save).not.toHaveBeenCalled();
  });

  it('happy path saves the encrypted token once', async () => {
    const d = deps();
    expect(await completeConnect({ code: 'c', state: goodState, error: null }, d)).toBe('ok');
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(d.save).toHaveBeenCalledWith({ userId: 'u1', refreshTokenEnc: 'enc(refresh)', healthUserId: 'h1', scopes: SCOPES.join(' ') });
  });

  it('a failed code exchange ends in error', async () => {
    const d = deps({ exchange: vi.fn(async () => { throw new GoogleHealthError('http', 400); }) });
    expect(await completeConnect({ code: 'c', state: goodState, error: null }, d)).toBe('error');
  });
});
