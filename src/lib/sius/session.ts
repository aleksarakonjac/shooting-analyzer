import 'server-only';
import { open, seal, siusKey } from '@/lib/crypto/secretBox';
import { loginWithPassword, refreshTokens, SiusAuthFailure, type SiusTokens } from './auth';
import { supabaseSiusStore, type SiusLinkRow, type SiusLinkStore } from './store';

// A usable SIUS access token for a ZeroIn user: cached token, else refresh, else a password login with the
// stored password. Limits (owner, 2026-11-15): a password SIUS rejected is cleared and never retried; at most 3
// password logins per user and 30 in all per hour. Refreshes are not limited.

const HOUR = 3600_000;
const USER_LIMIT = 3;
const GLOBAL_LIMIT = 30;
const EARLY_MS = 60_000;

export class SiusReconnectNeeded extends Error {
  constructor(public reason: 'bad_password' | 'blocked') {
    super(`SIUS connection needs to be renewed (${reason})`);
    this.name = 'SiusReconnectNeeded';
  }
}
export class SiusUnavailable extends Error {
  constructor(public limit = false) {
    super(limit ? 'SIUS login limit reached' : 'SIUS unavailable');
    this.name = 'SiusUnavailable';
  }
}
export class SiusNotConnected extends Error {
  constructor() {
    super('SIUS not connected');
    this.name = 'SiusNotConnected';
  }
}
export class SiusNotConfigured extends Error {
  constructor() {
    super('SIUS credentials key not configured');
    this.name = 'SiusNotConfigured';
  }
}

export interface SessionDeps {
  store?: SiusLinkStore | null;
  key?: string | null;
  now?: () => number;
  auth?: { login: (email: string, password: string) => Promise<SiusTokens>; refresh: (rt: string) => Promise<SiusTokens> };
}

function resolve(deps: SessionDeps) {
  const key = 'key' in deps ? deps.key : siusKey();
  if (!key) throw new SiusNotConfigured();
  const store = deps.store === undefined ? supabaseSiusStore() : deps.store;
  if (!store) throw new SiusNotConfigured();
  return {
    key,
    store,
    now: deps.now ?? Date.now,
    auth: deps.auth ?? { login: (e: string, p: string) => loginWithPassword(e, p), refresh: (rt: string) => refreshTokens(rt) },
  };
}

type Ctx = ReturnType<typeof resolve>;

const cachedValid = (row: SiusLinkRow, key: string, now: number): string | null =>
  row.access_token_enc && row.access_expires_at && Date.parse(row.access_expires_at) > now + EARLY_MS
    ? open(row.access_token_enc, key)
    : null;

function tokenPatch(t: SiusTokens, key: string, now: number): Partial<SiusLinkRow> {
  return {
    access_token_enc: seal(t.accessToken, key),
    access_expires_at: new Date(now + t.expiresIn * 1000).toISOString(),
    ...(t.refreshToken ? { refresh_token_enc: seal(t.refreshToken, key) } : {}),
    ...(t.userId ? { sius_user_id: t.userId } : {}),
    last_ok_at: new Date(now).toISOString(),
  };
}

/**
 * Records the attempt first, then counts it with all others: parallel requests each see every recorded attempt,
 * so together they can never exceed the hourly caps. A rejected attempt is removed again, so one user retrying
 * cannot use up the shared budget. Throws SiusUnavailable(limit) when over a cap.
 */
async function takeLoginSlot(ctx: Ctx, userId: string) {
  const attempt = await ctx.store.recordLogin(userId);
  const since = ctx.now() - HOUR;
  const over =
    (await ctx.store.countLogins(userId, since)) > USER_LIMIT || (await ctx.store.countLogins(null, since)) > GLOBAL_LIMIT;
  if (over) {
    await ctx.store.removeLogin(attempt);
    throw new SiusUnavailable(true);
  }
}

async function passwordLogin(ctx: Ctx, userId: string, row: SiusLinkRow): Promise<string> {
  const now = ctx.now();
  if (!row.password_enc) {
    await ctx.store.save(userId, { broken_at: new Date(now).toISOString(), broken_reason: 'blocked' });
    throw new SiusReconnectNeeded('blocked');
  }
  await takeLoginSlot(ctx, userId);
  try {
    const t = await ctx.auth.login(row.email, open(row.password_enc, ctx.key));
    await ctx.store.save(userId, tokenPatch(t, ctx.key, now));
    return t.accessToken;
  } catch (e) {
    if (!(e instanceof SiusAuthFailure) || e.kind === 'unavailable') throw new SiusUnavailable();
    const stamp = new Date(now).toISOString();
    if (e.kind === 'bad_password') {
      await ctx.store.save(userId, { password_enc: null, access_token_enc: null, broken_at: stamp, broken_reason: 'bad_password' });
      throw new SiusReconnectNeeded('bad_password');
    }
    await ctx.store.save(userId, { broken_at: stamp, broken_reason: 'blocked' });
    throw new SiusReconnectNeeded('blocked');
  }
}

export async function getAccessToken(userId: string, deps: SessionDeps = {}): Promise<string> {
  const ctx = resolve(deps);
  const row = await ctx.store.get(userId);
  if (!row) throw new SiusNotConnected();
  if (row.broken_at) throw new SiusReconnectNeeded(row.broken_reason === 'bad_password' ? 'bad_password' : 'blocked');

  const cached = cachedValid(row, ctx.key, ctx.now());
  if (cached) return cached;

  if (row.refresh_token_enc) {
    try {
      const t = await ctx.auth.refresh(open(row.refresh_token_enc, ctx.key));
      await ctx.store.save(userId, tokenPatch(t, ctx.key, ctx.now()));
      return t.accessToken;
    } catch (e) {
      if (!(e instanceof SiusAuthFailure) || e.kind === 'unavailable') throw new SiusUnavailable();
      // A concurrent request may have renewed the tokens while this refresh failed: use those instead.
      const again = await ctx.store.get(userId);
      if (again && again.updated_at !== row.updated_at) {
        const fresh = cachedValid(again, ctx.key, ctx.now());
        if (fresh) return fresh;
      }
    }
  }
  return passwordLogin(ctx, userId, row);
}

/** Forgets the cached access token (SIUS refused it), so the next getAccessToken refreshes. */
export async function dropAccessToken(userId: string, deps: SessionDeps = {}): Promise<void> {
  const ctx = resolve(deps);
  await ctx.store.save(userId, { access_token_enc: null, access_expires_at: null });
}

/** Signs in once with the entered credentials and stores them; on any failure nothing is stored. */
export async function connect(userId: string, email: string, password: string, deps: SessionDeps = {}): Promise<void> {
  const ctx = resolve(deps);
  const login = email.trim();
  await takeLoginSlot(ctx, userId);
  const t = await ctx.auth.login(login, password);
  const now = ctx.now();
  await ctx.store.save(userId, {
    email: login,
    password_enc: seal(password, ctx.key),
    ...tokenPatch(t, ctx.key, now),
    connected_at: new Date(now).toISOString(),
    broken_at: null,
    broken_reason: null,
  });
}
