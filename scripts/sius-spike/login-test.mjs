#!/usr/bin/env node
// SIUS Shooting Sports Cloud login spike.
//
// Logs in with email + password the same way the browser does (FusionAuth hosted
// login form + PKCE), exchanges the code for tokens, refreshes once, and lists
// trainings. Prints only a summary: never tokens or the password.
//
// Run:  node scripts/sius-spike/login-test.mjs

import { createHash, randomBytes } from "node:crypto";
import readline from "node:readline";

const AUTH = "https://shootingsportscloud.com:8597";
const TRAINING = "https://shootingsportscloud.com:8598";
const CLIENT_ID = "0b659819-8568-4a56-b800-0e5981130a0c";
const REDIRECT_URI = "https://shootingsportscloud.com:443/login-callback";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

const cookies = new Map();

function fail(msg) {
  console.log(`FAIL: ${msg}`);
  process.exit(1);
}

async function request(url, { form, headers = {} } = {}) {
  const h = { "User-Agent": UA, ...headers };
  if (cookies.size) h.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  let body;
  if (form) {
    body = new URLSearchParams(form).toString();
    h["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await fetch(url, { method: form ? "POST" : "GET", headers: h, body, redirect: "manual" });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return { status: res.status, headers: res.headers, text: await res.text() };
}

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function login(email, password) {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const q = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid offline_access",
    state: b64url(randomBytes(16)),
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const page = await request(`${AUTH}/oauth2/authorize?${q}`);
  if (page.status !== 200) fail(`authorize page HTTP ${page.status}`);

  const start = page.text.indexOf('<form action="authorize"');
  if (start < 0) fail("login form not found (page layout changed?)");
  const formHtml = page.text.slice(start, page.text.indexOf("</form>", start));
  const fields = {};
  for (const m of formHtml.matchAll(/<input([^>]*)>/gs)) {
    const attrs = m[1];
    if (attrs.includes('type="checkbox"')) continue;
    const name = attrs.match(/name="?([^"\s/>]+)"?/);
    const value = attrs.match(/value="([^"]*)"/);
    if (name) fields[name[1]] = value ? value[1].replace(/&amp;/g, "&") : "";
  }
  Object.assign(fields, { loginId: email, password, rememberDevice: "true" });
  console.log("1/4 login form loaded");

  const post = await request(`${AUTH}/oauth2/authorize`, { form: fields });
  if (![301, 302, 303].includes(post.status)) {
    const text = post.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const err = text.match(/(Invalid login credentials[^.]*\.|locked[^.]*\.|captcha[^.]*\.)/i);
    fail(`login rejected, HTTP ${post.status}: ${err ? err[1] : "no redirect (unknown page)"}`);
  }
  // FusionAuth may hop through intermediate steps (complete-registration, consent)
  // that immediately redirect on. Follow same-origin redirects until the callback carries a code.
  let loc = new URL(post.headers.get("location") ?? "", AUTH);
  for (let i = 0; i < 6 && !loc.searchParams.get("code") && loc.origin === AUTH; i++) {
    console.log(`  via ${loc.pathname}`);
    const hop = await request(loc.href);
    if (![301, 302, 303].includes(hop.status))
      fail(`stopped at ${loc.pathname} (HTTP ${hop.status}): SIUS wants input on this page`);
    loc = new URL(hop.headers.get("location") ?? "", loc);
  }
  const code = loc.searchParams.get("code");
  if (!code) fail(`ended at ${loc.pathname} without an authorization code`);
  console.log("2/4 credentials accepted, got authorization code");

  const tokRes = await request(`${AUTH}/oauth2/token`, {
    form: {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    },
  });
  const tok = JSON.parse(tokRes.text);
  if (tokRes.status !== 200 || !tok.access_token)
    fail(`token exchange HTTP ${tokRes.status}: ${tok.error} ${tok.error_description ?? ""}`);
  console.log(
    `3/4 tokens received (access expires in ${tok.expires_in} s, refresh token: ${tok.refresh_token ? "yes" : "NO"})`,
  );
  return tok;
}

async function refresh(rt) {
  const r = await request(`${AUTH}/oauth2/token`, {
    form: { grant_type: "refresh_token", client_id: CLIENT_ID, refresh_token: rt },
  });
  const tok = JSON.parse(r.text);
  if (r.status !== 200) fail(`refresh HTTP ${r.status}: ${tok.error}`);
  return tok;
}

async function api(path, at) {
  const r = await request(`${TRAINING}/${path}`, {
    headers: { Authorization: `Bearer ${at}`, Accept: "application/json" },
  });
  if (r.status !== 200) fail(`GET ${path.split("?")[0]} HTTP ${r.status}`);
  return JSON.parse(r.text);
}

async function listTrainings(at) {
  const out = [];
  const take = 100;
  for (let skip = 0; ; skip += take) {
    const lo = JSON.stringify({
      sort: [{ selector: "exerciseDate", desc: true }],
      group: null,
      searchOperation: "contains",
      searchValue: null,
      skip,
      take,
      userData: {},
      stringToLower: true,
    });
    const page = (await api(`api/user-results?loadOptions=${encodeURIComponent(lo)}`, at)).data;
    out.push(...page);
    if (page.length < take) return out;
  }
}

function countShots(s) {
  const stages = s.stageResults ?? [];
  const groups = s.competitionGroups ?? stages.flatMap((st) => st.competitionGroups ?? []);
  const sighters = s.sightingShots ?? stages.flatMap((st) => st.sightingShots ?? []);
  const n = (gs) => gs.reduce((a, g) => a + g.shots.length, 0);
  return [n(sighters), n(groups)];
}

function ask(prompt, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(prompt)) rl.output.write(prompt);
      };
    }
    rl.question(prompt, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const email = (process.env.SIUS_EMAIL ?? (await ask("SIUS email: "))).trim();
const password = process.env.SIUS_PASSWORD ?? (await ask("SIUS password (hidden): ", true));

const tok = await login(email, password);
const tok2 = await refresh(tok.refresh_token);
console.log(`4/4 refresh OK (refresh token rotated: ${(tok2.refresh_token ?? tok.refresh_token) !== tok.refresh_token})`);

const trainings = await listTrainings(tok2.access_token);
console.log(`\nTrainings visible: ${trainings.length}`);
for (const t of trainings.slice(0, 5)) {
  console.log(
    `  ${t.exerciseDate.slice(0, 10)}  ${t.exerciseName.padEnd(24)} ${String(t.numberOfCompetitionShots).padStart(3)} shots  ${t.totalString}`,
  );
}
if (trainings.length) {
  const s = await api(`api/user-results/${trainings[0].exerciseId}/shots`, tok2.access_token);
  const [sighters, comp] = countShots(s);
  console.log(`\nLatest training shots: ${s.type}, ${sighters} sighters, ${comp} match shots`);
}
console.log("\nSUCCESS: server-side login works.");
