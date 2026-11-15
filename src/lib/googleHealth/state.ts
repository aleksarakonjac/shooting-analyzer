import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StatePayload {
  userId: string;
  nonce: string;
  /** Expiry, Unix epoch milliseconds. */
  exp: number;
}

const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

/** The OAuth `state`: base64url JSON and its HMAC, so the callback knows who started the flow and when. */
export function signState(p: StatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyState(state: string, secret: string, expect: { userId: string; nonce: string; now: number }): boolean {
  const [body, sig] = state.split('.');
  if (!body || !sig) return false;
  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<StatePayload>;
    return p.userId === expect.userId && p.nonce === expect.nonce && typeof p.exp === 'number' && expect.now <= p.exp;
  } catch {
    return false;
  }
}
