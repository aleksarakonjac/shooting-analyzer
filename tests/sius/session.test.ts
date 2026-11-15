import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { open, seal } from '@/lib/crypto/secretBox';
import { SiusAuthFailure, type SiusTokens } from '@/lib/sius/auth';
import {
  connect,
  getAccessToken,
  SiusNotConfigured,
  SiusNotConnected,
  SiusReconnectNeeded,
  SiusUnavailable,
} from '@/lib/sius/session';
import type { SiusLinkRow, SiusLinkStore } from '@/lib/sius/store';

const KEY = Buffer.alloc(32, 3).toString('base64');
const NOW = Date.parse('2026-11-15T12:00:00Z');
const U = 'user-1';

function memStore(initial: Partial<SiusLinkRow> | null) {
  const rows = new Map<string, SiusLinkRow>();
  if (initial) rows.set(U, { user_id: U, email: 'me@x', password_enc: null, refresh_token_enc: null, access_token_enc: null, access_expires_at: null, sius_user_id: null, broken_at: null, broken_reason: null, updated_at: new Date(NOW - 3600_000).toISOString(), ...initial });
  const logins: { id: number; userId: string; at: number }[] = [];
  let seq = 0;
  const store: SiusLinkStore = {
    get: vi.fn(async (id) => (rows.has(id) ? { ...rows.get(id)! } : null)),
    save: vi.fn(async (id, patch) => {
      const prev = rows.get(id);
      rows.set(id, { ...(prev ?? ({ user_id: id } as SiusLinkRow)), ...patch, updated_at: new Date(NOW).toISOString() });
    }),
    remove: vi.fn(async (id) => void rows.delete(id)),
    countLogins: vi.fn(async (id, since) => logins.filter((l) => (id === null || l.userId === id) && l.at >= since).length),
    recordLogin: vi.fn(async (id) => {
      const row = { id: ++seq, userId: id, at: NOW };
      logins.push(row);
      return row.id;
    }),
    removeLogin: vi.fn(async (attempt) => {
      const i = logins.findIndex((l) => l.id === attempt);
      if (i >= 0) logins.splice(i, 1);
    }),
  };
  return { rows, logins, store };
}

const tokens = (at: string, rt: string | null = 'RT-new'): SiusTokens => ({ accessToken: at, refreshToken: rt, expiresIn: 1799, userId: 'sius-u' });

type Login = (email: string, password: string) => Promise<SiusTokens>;
type Refresh = (rt: string) => Promise<SiusTokens>;
function deps(store: SiusLinkStore, auth: { login?: Mock<Login>; refresh?: Mock<Refresh> } = {}) {
  return {
    store,
    key: KEY as string | null,
    now: () => NOW,
    auth: {
      login: auth.login ?? vi.fn<Login>(async () => tokens('AT-login')),
      refresh: auth.refresh ?? vi.fn<Refresh>(async () => tokens('AT-refreshed', null)),
    },
  };
}

describe('getAccessToken', () => {
  let base: Partial<SiusLinkRow>;
  beforeEach(() => {
    base = { password_enc: seal('pw', KEY), refresh_token_enc: seal('RT', KEY) };
  });

  it('uses a cached token valid for more than 60 s without network', async () => {
    const m = memStore({ ...base, access_token_enc: seal('AT-cached', KEY), access_expires_at: new Date(NOW + 120_000).toISOString() });
    const d = deps(m.store);
    await expect(getAccessToken(U, d)).resolves.toBe('AT-cached');
    expect(d.auth.refresh).not.toHaveBeenCalled();
    expect(d.auth.login).not.toHaveBeenCalled();
  });

  it('refreshes an expiring token, saves it and keeps the refresh token when none is returned', async () => {
    const m = memStore({ ...base, access_token_enc: seal('AT-old', KEY), access_expires_at: new Date(NOW + 30_000).toISOString() });
    const d = deps(m.store);
    await expect(getAccessToken(U, d)).resolves.toBe('AT-refreshed');
    expect(d.auth.refresh).toHaveBeenCalledWith('RT');
    const row = m.rows.get(U)!;
    expect(open(row.access_token_enc!, KEY)).toBe('AT-refreshed');
    expect(open(row.refresh_token_enc!, KEY)).toBe('RT');
    expect(Date.parse(row.access_expires_at!)).toBe(NOW + 1799_000);
  });

  it('replaces the refresh token when SIUS returns a new one', async () => {
    const m = memStore(base);
    const d = deps(m.store, { refresh: vi.fn(async (_rt: string) => tokens('AT2', 'RT2')) });
    await getAccessToken(U, d);
    expect(open(m.rows.get(U)!.refresh_token_enc!, KEY)).toBe('RT2');
  });

  it('refresh rejected → signs in with the stored password, saves all tokens, counts the login', async () => {
    const m = memStore(base);
    const d = deps(m.store, { refresh: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('blocked'); }) });
    await expect(getAccessToken(U, d)).resolves.toBe('AT-login');
    expect(d.auth.login).toHaveBeenCalledWith('me@x', 'pw');
    expect(m.store.recordLogin).toHaveBeenCalledWith(U);
    const row = m.rows.get(U)!;
    expect(open(row.refresh_token_enc!, KEY)).toBe('RT-new');
    expect(row.sius_user_id).toBe('sius-u');
  });

  it('password rejected → cleared, marked broken, never tried again', async () => {
    const m = memStore(base);
    const login = vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('bad_password'); });
    const d = deps(m.store, { login, refresh: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('blocked'); }) });
    const err = await getAccessToken(U, d).catch((e) => e);
    expect(err).toBeInstanceOf(SiusReconnectNeeded);
    expect(err.reason).toBe('bad_password');
    const row = m.rows.get(U)!;
    expect(row.password_enc).toBeNull();
    expect(row.broken_at).not.toBeNull();
    expect(row.broken_reason).toBe('bad_password');
    await expect(getAccessToken(U, d)).rejects.toBeInstanceOf(SiusReconnectNeeded);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('unknown login page → broken as blocked, password kept', async () => {
    const m = memStore(base);
    const d = deps(m.store, {
      login: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('blocked'); }),
      refresh: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('blocked'); }),
    });
    await expect(getAccessToken(U, d)).rejects.toMatchObject({ reason: 'blocked' });
    const row = m.rows.get(U)!;
    expect(row.broken_reason).toBe('blocked');
    expect(row.password_enc).not.toBeNull();
  });

  it('4th password login in an hour for one user → unavailable without calling SIUS', async () => {
    const m = memStore(base);
    for (let i = 0; i < 3; i++) m.logins.push({ id: -1, userId: U, at: NOW - 10_000 });
    const d = deps(m.store, { refresh: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('blocked'); }) });
    const err = await getAccessToken(U, d).catch((e) => e);
    expect(err).toBeInstanceOf(SiusUnavailable);
    expect(err.limit).toBe(true);
    expect(d.auth.login).not.toHaveBeenCalled();
  });

  it('parallel requests cannot pass the per-user limit together', async () => {
    const m = memStore(base);
    for (let i = 0; i < 2; i++) m.logins.push({ id: -1, userId: U, at: NOW - 10_000 });
    const login = vi.fn<Login>(async () => tokens('AT-login'));
    const d = deps(m.store, { login, refresh: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('blocked'); }) });
    await Promise.allSettled([getAccessToken(U, d), getAccessToken(U, d), getAccessToken(U, d)]);
    expect(login.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('rejected attempts do not use up the global budget', async () => {
    const m = memStore(base);
    for (let i = 0; i < 3; i++) m.logins.push({ id: -1, userId: U, at: NOW - 10_000 });
    const d = deps(m.store, { refresh: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('blocked'); }) });
    for (let i = 0; i < 40; i++) await getAccessToken(U, d).catch(() => undefined);
    expect(await m.store.countLogins(null, NOW - 3600_000)).toBe(3);
  });

  it('31st password login in an hour across users → unavailable', async () => {
    const m = memStore(base);
    for (let i = 0; i < 30; i++) m.logins.push({ id: -1, userId: `other-${i}`, at: NOW - 10_000 });
    const d = deps(m.store, { refresh: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('blocked'); }) });
    await expect(getAccessToken(U, d)).rejects.toBeInstanceOf(SiusUnavailable);
    expect(d.auth.login).not.toHaveBeenCalled();
  });

  it('logins older than an hour do not count', async () => {
    const m = memStore(base);
    for (let i = 0; i < 3; i++) m.logins.push({ id: -1, userId: U, at: NOW - 3700_000 });
    const d = deps(m.store, { refresh: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('blocked'); }) });
    await expect(getAccessToken(U, d)).resolves.toBe('AT-login');
  });

  it('broken link → reconnect needed immediately', async () => {
    const m = memStore({ ...base, broken_at: new Date(NOW).toISOString(), broken_reason: 'blocked' });
    const d = deps(m.store);
    await expect(getAccessToken(U, d)).rejects.toMatchObject({ reason: 'blocked' });
    expect(d.auth.refresh).not.toHaveBeenCalled();
  });

  it('no key → not configured; no row → not connected', async () => {
    const m = memStore(base);
    await expect(getAccessToken(U, { ...deps(m.store), key: null })).rejects.toBeInstanceOf(SiusNotConfigured);
    await expect(getAccessToken(U, deps(memStore(null).store))).rejects.toBeInstanceOf(SiusNotConnected);
  });

  it('SIUS down during refresh → unavailable, no password login', async () => {
    const m = memStore(base);
    const d = deps(m.store, { refresh: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('unavailable'); }) });
    await expect(getAccessToken(U, d)).rejects.toBeInstanceOf(SiusUnavailable);
    expect(d.auth.login).not.toHaveBeenCalled();
  });

  it('another request refreshed meanwhile → uses its token instead of signing in', async () => {
    const m = memStore(base);
    const refresh = vi.fn(async (): Promise<SiusTokens> => {
      // A concurrent request stored a fresh token while this refresh failed.
      m.rows.set(U, { ...m.rows.get(U)!, access_token_enc: seal('AT-other', KEY), access_expires_at: new Date(NOW + 1000_000).toISOString(), updated_at: new Date(NOW).toISOString() });
      throw new SiusAuthFailure('blocked');
    });
    const d = deps(m.store, { refresh });
    await expect(getAccessToken(U, d)).resolves.toBe('AT-other');
    expect(d.auth.login).not.toHaveBeenCalled();
  });
});

describe('connect', () => {
  it('signs in once and stores email, sealed password and tokens, clearing a broken state', async () => {
    const m = memStore({ broken_at: new Date(NOW).toISOString(), broken_reason: 'bad_password' });
    const d = deps(m.store);
    await connect(U, ' me@new ', 'pw2', d);
    const row = m.rows.get(U)!;
    expect(row.email).toBe('me@new');
    expect(open(row.password_enc!, KEY)).toBe('pw2');
    expect(open(row.access_token_enc!, KEY)).toBe('AT-login');
    expect(row.broken_at).toBeNull();
    expect(row.broken_reason).toBeNull();
    expect(m.store.recordLogin).toHaveBeenCalledWith(U);
  });

  it('bad password stores nothing', async () => {
    const m = memStore(null);
    const d = deps(m.store, { login: vi.fn(async (): Promise<SiusTokens> => { throw new SiusAuthFailure('bad_password'); }) });
    await expect(connect(U, 'a', 'b', d)).rejects.toMatchObject({ kind: 'bad_password' });
    expect(m.rows.size).toBe(0);
    expect(m.store.save).not.toHaveBeenCalled();
  });

  it('respects the per-user limit', async () => {
    const m = memStore(null);
    for (let i = 0; i < 3; i++) m.logins.push({ id: -1, userId: U, at: NOW - 1000 });
    const d = deps(m.store);
    await expect(connect(U, 'a', 'b', d)).rejects.toMatchObject({ limit: true });
    expect(d.auth.login).not.toHaveBeenCalled();
  });

  it('no key → not configured, nothing stored', async () => {
    const m = memStore(null);
    await expect(connect(U, 'a', 'b', { ...deps(m.store), key: null })).rejects.toBeInstanceOf(SiusNotConfigured);
    expect(m.store.save).not.toHaveBeenCalled();
  });
});
