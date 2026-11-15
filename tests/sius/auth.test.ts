import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { loginWithPassword, refreshTokens, SiusAuthFailure } from '@/lib/sius/auth';

const AUTH = 'https://shootingsportscloud.com:8597';
const CALLBACK = 'https://shootingsportscloud.com:443/login-callback';

const FORM = `<html><body>
<form action="authorize" method="post" class="full">
  <input type="hidden" name="captcha_token" value=""/>
  <input type="hidden" name="client_id" value="0b659819-8568-4a56-b800-0e5981130a0c"/>
  <input type="hidden" name="code_challenge" value="CHALLENGE_FROM_QUERY"/>
  <input type="hidden" name="state" value="a&amp;b"/>
  <input id="loginId" name="loginId" type="text" value=""/>
  <input id="password" name="password" type="password" value=""/>
  <input type="checkbox" name="rememberDevice" value="true"/>
</form></body></html>`;

type Call = { url: string; method: string; body: URLSearchParams | null; cookie: string | null };
type Reply = { status: number; body?: string; headers?: [string, string][] };

/** A scripted SIUS: each handler gets the call and returns a reply. Records every call. */
function fakeSius(handlers: ((c: Call) => Reply | undefined)[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? new URLSearchParams(init.body) : null,
      cookie: headers.get('cookie'),
    };
    calls.push(call);
    if (url.startsWith(CALLBACK)) throw new Error('callback must never be fetched');
    for (const h of handlers) {
      const r = h(call);
      if (r) return new Response(r.body ?? null, { status: r.status, headers: new Headers(r.headers ?? []) });
    }
    return new Response('not scripted', { status: 404 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const authorizePage = (c: Call): Reply | undefined =>
  c.method === 'GET' && c.url.startsWith(`${AUTH}/oauth2/authorize?`)
    ? { status: 200, body: FORM, headers: [['set-cookie', 'fa.sso=one; Path=/; HttpOnly']] }
    : undefined;
const postRedirect = (c: Call): Reply | undefined =>
  c.method === 'POST' && c.url === `${AUTH}/oauth2/authorize`
    ? { status: 302, headers: [['location', '/oauth2/complete-registration?x=1'], ['set-cookie', 'fa.two=two; Path=/']] }
    : undefined;
const hops = (c: Call): Reply | undefined => {
  if (c.url.startsWith(`${AUTH}/oauth2/complete-registration`)) return { status: 302, headers: [['location', '/oauth2/consent']] };
  if (c.url.startsWith(`${AUTH}/oauth2/consent`)) return { status: 302, headers: [['location', `${CALLBACK}?code=abc&state=s`]] };
  return undefined;
};
const tokenOk = (c: Call): Reply | undefined =>
  c.method === 'POST' && c.url === `${AUTH}/oauth2/token`
    ? { status: 200, body: JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 1799, userId: 'u-1' }) }
    : undefined;

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('loginWithPassword', () => {
  it('follows the hosted form and redirect hops to tokens', async () => {
    const f = fakeSius([authorizePage, postRedirect, hops, tokenOk]);
    const t = await loginWithPassword('me@example.com', 'secret', f.fetchImpl);
    expect(t).toEqual({ accessToken: 'AT', refreshToken: 'RT', expiresIn: 1799, userId: 'u-1' });

    const authorize = f.calls[0];
    const challenge = new URL(authorize.url).searchParams.get('code_challenge');
    expect(new URL(authorize.url).searchParams.get('scope')).toBe('openid offline_access');

    const post = f.calls.find((c) => c.method === 'POST' && c.url === `${AUTH}/oauth2/authorize`)!;
    expect(post.body!.get('loginId')).toBe('me@example.com');
    expect(post.body!.get('password')).toBe('secret');
    expect(post.body!.get('client_id')).toBe('0b659819-8568-4a56-b800-0e5981130a0c');
    expect(post.body!.get('state')).toBe('a&b');
    expect(post.body!.get('captcha_token')).toBe('');
    expect(post.body!.getAll('rememberDevice')).toEqual(['true']);
    expect(post.cookie).toContain('fa.sso=one');

    const consent = f.calls.find((c) => c.url.includes('/oauth2/consent'))!;
    expect(consent.cookie).toContain('fa.two=two');

    const token = f.calls.find((c) => c.url === `${AUTH}/oauth2/token`)!;
    expect(token.body!.get('grant_type')).toBe('authorization_code');
    expect(token.body!.get('code')).toBe('abc');
    expect(token.body!.get('redirect_uri')).toBe(CALLBACK);
    const verifier = token.body!.get('code_verifier')!;
    expect(b64url(createHash('sha256').update(verifier).digest())).toBe(challenge);
  });

  it('Invalid login credentials page → bad_password', async () => {
    const f = fakeSius([
      authorizePage,
      (c) => (c.method === 'POST' ? { status: 200, body: '<div class="alert">Invalid login credentials.</div>' } : undefined),
    ]);
    await expect(loginWithPassword('a', 'b', f.fetchImpl)).rejects.toMatchObject({ kind: 'bad_password' });
  });

  it('page without the form → blocked', async () => {
    const f = fakeSius([(c) => (c.method === 'GET' ? { status: 200, body: '<html>captcha challenge</html>' } : undefined)]);
    const err = await loginWithPassword('a', 'b', f.fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(SiusAuthFailure);
    expect(err.kind).toBe('blocked');
  });

  it('unknown page → blocked', async () => {
    const f = fakeSius([
      authorizePage,
      postRedirect,
      (c) => (c.url.includes('complete-registration') ? { status: 200, body: '<form>please fill in your birthday</form>' } : undefined),
    ]);
    await expect(loginWithPassword('a', 'b', f.fetchImpl)).rejects.toMatchObject({ kind: 'blocked' });
  });

  it('redirect off the auth host without a code → blocked', async () => {
    const f = fakeSius([
      authorizePage,
      (c) => (c.method === 'POST' ? { status: 302, headers: [['location', 'https://evil.example/landing']] } : undefined),
    ]);
    await expect(loginWithPassword('a', 'b', f.fetchImpl)).rejects.toMatchObject({ kind: 'blocked' });
    expect(f.calls.some((c) => c.url.startsWith('https://evil.example'))).toBe(false);
  });

  it('503 twice → unavailable (one retry)', async () => {
    const f = fakeSius([() => ({ status: 503 })]);
    await expect(loginWithPassword('a', 'b', f.fetchImpl)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(f.calls).toHaveLength(2);
  });

  it('network error once then success → retried', async () => {
    let failed = false;
    const f = fakeSius([authorizePage, postRedirect, hops, tokenOk]);
    const flaky = (async (u: RequestInfo | URL, i?: RequestInit) => {
      if (!failed) {
        failed = true;
        throw new TypeError('fetch failed');
      }
      return f.fetchImpl(u, i);
    }) as typeof fetch;
    await expect(loginWithPassword('a', 'b', flaky)).resolves.toMatchObject({ accessToken: 'AT' });
  });

  it('never puts the password in an error message', async () => {
    const f = fakeSius([authorizePage, (c) => (c.method === 'POST' ? { status: 200, body: 'Invalid login credentials.' } : undefined)]);
    const err = await loginWithPassword('a', 'hunter2-secret', f.fetchImpl).catch((e) => e);
    expect(String(err.message)).not.toContain('hunter2-secret');
  });
});

describe('refreshTokens', () => {
  it('returns a new access token and keeps a missing refresh token as null', async () => {
    const f = fakeSius([(c) => (c.url === `${AUTH}/oauth2/token` ? { status: 200, body: JSON.stringify({ access_token: 'AT2', expires_in: 1799 }) } : undefined)]);
    await expect(refreshTokens('RT', f.fetchImpl)).resolves.toEqual({ accessToken: 'AT2', refreshToken: null, expiresIn: 1799, userId: null });
    const body = f.calls[0].body!;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('RT');
    expect(body.get('client_id')).toBe('0b659819-8568-4a56-b800-0e5981130a0c');
  });

  it('invalid_grant → blocked', async () => {
    const f = fakeSius([() => ({ status: 400, body: JSON.stringify({ error: 'invalid_grant' }) })]);
    await expect(refreshTokens('RT', f.fetchImpl)).rejects.toMatchObject({ kind: 'blocked' });
  });

  it('5xx → unavailable', async () => {
    const f = fakeSius([() => ({ status: 502 })]);
    await expect(refreshTokens('RT', f.fetchImpl)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
