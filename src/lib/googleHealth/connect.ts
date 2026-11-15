import { GoogleHealthError, SCOPES } from './client';
import { verifyState } from './state';

export type ConnectOutcome = 'ok' | 'scopes' | 'not_linked' | 'state' | 'error';

export interface ConnectDeps {
  /** Signed-in active user, null otherwise. */
  userId: string | null;
  /** Nonce from the httpOnly cookie set when the flow started. */
  nonce: string | null;
  now: number;
  stateSecret: string;
  exchange(code: string): Promise<{ refreshToken: string; accessToken: string; scope: string }>;
  identity(accessToken: string): Promise<{ healthUserId: string }>;
  save(row: { userId: string; refreshTokenEnc: string; healthUserId: string; scopes: string }): Promise<void>;
  encrypt(plain: string): string;
}

/** The OAuth callback: checks who started the flow, that both scopes were granted, and stores the connection. */
export async function completeConnect(
  q: { code: string | null; state: string | null; error: string | null },
  deps: ConnectDeps,
): Promise<ConnectOutcome> {
  if (q.error) return 'error';
  if (!deps.userId || !deps.nonce || !q.state || !verifyState(q.state, deps.stateSecret, { userId: deps.userId, nonce: deps.nonce, now: deps.now })) {
    return 'state';
  }
  if (!q.code) return 'error';
  try {
    const tokens = await deps.exchange(q.code);
    const granted = new Set(tokens.scope.split(/\s+/));
    if (!SCOPES.every((s) => granted.has(s))) return 'scopes';
    const { healthUserId } = await deps.identity(tokens.accessToken);
    await deps.save({ userId: deps.userId, refreshTokenEnc: deps.encrypt(tokens.refreshToken), healthUserId, scopes: tokens.scope });
    return 'ok';
  } catch (e) {
    if (e instanceof GoogleHealthError && e.code === 'not_linked') return 'not_linked';
    return 'error';
  }
}
