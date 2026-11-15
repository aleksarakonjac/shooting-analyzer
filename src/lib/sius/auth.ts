import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

// Server-side SIUS Shooting Sports Cloud login (port of scripts/sius-spike/login-test.mjs).
// The password grant is disabled for SIUS's client, so this signs in the way the browser does: FusionAuth's
// hosted login form with PKCE, then exchanges the code. Never logs or returns the password or tokens in errors.

export const SIUS_AUTH = 'https://shootingsportscloud.com:8597';
export const SIUS_CLIENT_ID = '0b659819-8568-4a56-b800-0e5981130a0c';
const REDIRECT_URI = 'https://shootingsportscloud.com:443/login-callback';
const SCOPE = 'openid offline_access';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const TIMEOUT_MS = 10_000;
const MAX_HOPS = 6;

export type SiusTokens = { accessToken: string; refreshToken: string | null; expiresIn: number; userId: string | null };
export type SiusAuthError = 'bad_password' | 'blocked' | 'unavailable';

export class SiusAuthFailure extends Error {
  constructor(public kind: SiusAuthError, detail?: string) {
    super(`SIUS login ${kind}${detail ? `: ${detail}` : ''}`);
    this.name = 'SiusAuthFailure';
  }
}

type Res = { status: number; headers: Headers; text: string };

/**
 * One SIUS request with a 10 s timeout and one retry on a network error or 5xx; a second failure is
 * `unavailable`. Redirects are never followed automatically. `jar` collects cookies across the login.
 */
export async function siusRequest(
  fetchImpl: typeof fetch,
  url: string,
  opts: { form?: Record<string, string>; headers?: Record<string, string>; jar?: Map<string, string>; json?: unknown } = {},
): Promise<Res> {
  const headers: Record<string, string> = { 'User-Agent': UA, ...opts.headers };
  if (opts.jar?.size) headers.Cookie = [...opts.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  let body: string | undefined;
  if (opts.form) {
    body = new URLSearchParams(opts.form).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['Content-Type'] = 'application/json';
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: body !== undefined ? 'POST' : 'GET',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      continue;
    }
    if (res.status >= 500) continue;
    if (opts.jar) {
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) opts.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    }
    return { status: res.status, headers: res.headers, text: await res.text() };
  }
  throw new SiusAuthFailure('unavailable', new URL(url).pathname);
}

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const isRedirect = (s: number) => s === 301 || s === 302 || s === 303;

function formFields(html: string): Record<string, string> | null {
  const start = html.indexOf('<form action="authorize"');
  if (start < 0) return null;
  const end = html.indexOf('</form>', start);
  const formHtml = html.slice(start, end < 0 ? undefined : end);
  const fields: Record<string, string> = {};
  for (const m of formHtml.matchAll(/<input([^>]*)>/gs)) {
    const attrs = m[1];
    if (/type="checkbox"/.test(attrs)) continue;
    const name = attrs.match(/name="?([^"\s/>]+)"?/);
    const value = attrs.match(/value="([^"]*)"/);
    if (name) fields[name[1]] = value ? value[1].replace(/&amp;/g, '&') : '';
  }
  return fields;
}

function toTokens(json: Record<string, unknown>): SiusTokens {
  return {
    accessToken: String(json.access_token),
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 1799,
    userId: typeof json.userId === 'string' ? json.userId : null,
  };
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Signs in with the SIUS email and password and returns tokens. Throws `SiusAuthFailure`. */
export async function loginWithPassword(email: string, password: string, fetchImpl: typeof fetch = fetch): Promise<SiusTokens> {
  const jar = new Map<string, string>();
  const verifier = b64url(randomBytes(48));
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: SIUS_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state: b64url(randomBytes(16)),
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  });

  const page = await siusRequest(fetchImpl, `${SIUS_AUTH}/oauth2/authorize?${q}`, { jar });
  if (page.status !== 200) throw new SiusAuthFailure('blocked', `authorize page HTTP ${page.status}`);
  const fields = formFields(page.text);
  if (!fields) throw new SiusAuthFailure('blocked', 'login form not found');
  Object.assign(fields, { loginId: email, password, rememberDevice: 'true' });

  const post = await siusRequest(fetchImpl, `${SIUS_AUTH}/oauth2/authorize`, { form: fields, jar });
  if (!isRedirect(post.status)) {
    if (/Invalid login credentials/i.test(post.text)) throw new SiusAuthFailure('bad_password');
    throw new SiusAuthFailure('blocked', `login answered HTTP ${post.status} without a redirect`);
  }

  // FusionAuth may hop through steps (complete-registration, consent) that redirect on by themselves.
  // Follow same-origin redirects until the callback URL carries a code; the callback itself is never requested.
  let loc = new URL(post.headers.get('location') ?? '', SIUS_AUTH);
  for (let i = 0; i < MAX_HOPS && !loc.searchParams.get('code') && loc.origin === SIUS_AUTH; i++) {
    const hop = await siusRequest(fetchImpl, loc.href, { jar });
    if (!isRedirect(hop.status)) throw new SiusAuthFailure('blocked', `stopped at ${loc.pathname} (HTTP ${hop.status})`);
    loc = new URL(hop.headers.get('location') ?? '', loc);
  }
  const code = loc.searchParams.get('code');
  // Compare parsed URLs: the default port 443 in REDIRECT_URI is dropped by URL parsing.
  const callback = new URL(REDIRECT_URI);
  const atCallback = loc.origin === callback.origin && loc.pathname === callback.pathname;
  if (!code || !atCallback) throw new SiusAuthFailure('blocked', `ended at ${loc.pathname} without a code`);

  const tok = await siusRequest(fetchImpl, `${SIUS_AUTH}/oauth2/token`, {
    form: { grant_type: 'authorization_code', client_id: SIUS_CLIENT_ID, code, redirect_uri: REDIRECT_URI, code_verifier: verifier },
  });
  const json = parseJson(tok.text);
  if (tok.status !== 200 || typeof json.access_token !== 'string') {
    throw new SiusAuthFailure('blocked', `token exchange HTTP ${tok.status}`);
  }
  return toTokens(json);
}

/** New access token from a refresh token. Rejected refresh → `blocked` (the caller signs in again). */
export async function refreshTokens(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<SiusTokens> {
  const r = await siusRequest(fetchImpl, `${SIUS_AUTH}/oauth2/token`, {
    form: { grant_type: 'refresh_token', client_id: SIUS_CLIENT_ID, refresh_token: refreshToken },
  });
  const json = parseJson(r.text);
  if (r.status !== 200 || typeof json.access_token !== 'string') {
    throw new SiusAuthFailure('blocked', `refresh HTTP ${r.status}`);
  }
  return toTokens(json);
}
