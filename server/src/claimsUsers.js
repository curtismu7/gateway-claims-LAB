// Pure engine for the "Users and groups from claims" tab. No I/O, no clocks, no real signing. A mock token is read in a fixed order:
// the identity settings, the identity gate (issuer, signing key, audience, lifetime, subject, required claims), the end user (Opaque or Resolved),
// then the claim-conditioned grant tiers. The first failing step refuses; the steps after it read "not reached".
// It reuses flattenClaims and evaluateClaims from claims.js (bounded, iterative) and adds only what is new here: a wildcard match for Subject, a
// claim value reader for tiers, and the console's save-time check. Every typed value that is quoted back goes through maskKeepShape first.
import { evaluateClaims, flattenClaims } from './claims.js';
import { maskKeepShape } from './credentials.js';

export const LIMITS = { subject: 64, kid: 64 };
export const SUBJECT_RE = /^[A-Za-z0-9._:*?-]{1,64}$/;
export const KID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const DEFAULT_MAX_LIFETIME = 3600; // MaxTokenLifetimeSec 0 means the gateway default of 3600 (our notes)

// The steps, in the order they run, each with the tag its row carries on the page.
export const CHECKS = [
  ['identity_saved', 'measured', 'The console accepts the identity settings'],
  ['issuer', 'reading', 'iss equals the identity\'s Issuer, exactly'],
  ['signing_key', 'measured', 'The token\'s signing key is published in the issuer\'s JWKS'],
  ['audience', 'reading', 'aud is the Audience Privilege generated for the identity'],
  ['lifetime', 'reading', 'exp minus iat is within the maximum token lifetime'],
  ['subject', 'reading', 'sub matches the Subject pattern (* and ? wildcards)'],
  ['required_claims', 'measured', 'Every required claim matches, by dotted path'],
  ['end_user', 'reading', 'The end user is recorded (Opaque) or found (Resolved)'],
  ['grant_tier', 'unverified', 'At least one claim-conditioned grant tier matches'],
];
// code -> [step index, HTTP status the caller sees (null: nothing was called, the console refused to save)]
const FAIL = {
  subject_pinned: [0, null], issuer_mismatch: [1, 401], key_not_published: [2, 401], audience_mismatch: [3, 401], lifetime_too_long: [4, 401], lifetime_unreadable: [4, 401],
  subject_mismatch: [5, 401], required_claim: [6, 401], end_user_claim_missing: [7, 401], user_not_found: [7, 403], no_tier: [8, 403],
};
export const CODES = Object.keys(FAIL);

const shown = (v) => maskKeepShape(v);
const describe = (v) => (typeof v === 'string' ? `"${shown(v)}"` : Array.isArray(v) ? `a list of ${v.length}` : v === undefined ? 'missing' : v !== null && typeof v === 'object' ? 'an object' : String(v));

/** Wildcard match: * is any run of characters, ? is one character, everything else is literal. Iterative, no regex, so user text cannot backtrack. */
export function globMatch(pattern, text) {
  let p = 0; let t = 0; let star = -1; let mark = 0;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === '*') { star = p++; mark = t; }
    else if (p < pattern.length && (pattern[p] === '?' || pattern[p] === text[t])) { p++; t++; }
    else if (star !== -1) { p = star + 1; t = ++mark; }
    else return false;
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}

/** The text values a claim carries, for tier matching: a text claim is one value (the scope claim is split per value, as measured), a list gives one value per item. */
export function claimValues(flat, path) {
  const out = [];
  const own = flat.get(path);
  if (typeof own === 'string') out.push(...(path === 'scope' ? own.split(' ').filter(Boolean) : [own]));
  const prefix = `${path}.`;
  for (const [p, v] of flat) if (typeof v === 'string' && p.startsWith(prefix) && /^\d+$/.test(p.slice(prefix.length))) out.push(v);
  return out;
}

/** What the console checks when the identity is saved. Pinning Subject to one value while the End-user claim reads sub is refused (measured). null = accepted. */
export function validateIdentitySettings(identity) {
  if (identity.endUser.claim === 'sub' && !/[*?]/.test(identity.subject)) {
    return { code: 'subject_pinned', detail: 'The console refuses to save: Spec.UserClaim resolves to "sub" … every caller reads as the same end user. Subject pins sub to one value while the End-user claim also reads sub. Widen Subject to * and pin the agent with a required claim instead.' };
  }
  return null;
}

/**
 * Run one mock token. `claims` is the token's payload, `kid` the key id in its header, `identity` the mock Federated Identity, `directory` the mock Privilege
 * users ({ user, groups }), `tiers` the grant tiers ({ id, label, claims: [{ path, anyOf }], tools }) and `tools` every tool name, in display order.
 * Throws ClaimsInputError (claims.js) on a token that is not a bounded JSON object.
 */
export function evaluateClaimsUsers({ claims, kid, identity, directory, tiers, tools }) {
  const flat = flattenClaims(claims);
  const checks = []; const log = [];
  const state = { claimChecks: [], endUser: null, tiers: null, tools: [] };
  const meta = (i) => ({ id: CHECKS[i][0], tag: CHECKS[i][1], label: CHECKS[i][2] });
  const result = (decision, status, code) => ({
    decision, status, code, stage: code === 'subject_pinned' ? 'console' : 'gateway',
    checks: [...checks, ...CHECKS.slice(checks.length).map((_, k) => ({ ...meta(checks.length + k), ok: null, detail: 'not reached' }))],
    log, flat: [...flat].map(([path, value]) => ({ path, value })), claimChecks: state.claimChecks, endUser: state.endUser, tiers: state.tiers, tools: state.tools, toolCount: state.tools.length,
  });
  const pass = (i, detail) => checks.push({ ...meta(i), ok: true, detail });
  const fail = (code, detail, logLine) => {
    const [i, status] = FAIL[code];
    checks.push({ ...meta(i), ok: false, code, detail });
    if (logLine) log.push(logLine);
    return result('deny', status, code);
  };
  const reject = (reason) => `mcpgw: workload token rejected: ${reason}`;

  const saved = validateIdentitySettings(identity);
  if (saved) return fail(saved.code, saved.detail);
  pass(0, 'Subject and the End-user claim do not collide, so the console would save these settings');

  if (claims.iss !== identity.issuer) return fail('issuer_mismatch', `iss is ${describe(claims.iss)}, not the identity's Issuer (an exact match is needed)`, reject('issuer does not match the identity'));
  pass(1, 'iss is exactly the identity\'s Issuer');

  if (!identity.publishedKeys.includes(kid)) return fail('key_not_published', `the token is signed with the key "${shown(kid)}", which the issuer's JWKS does not publish (it publishes ${identity.publishedKeys.length}). In this lab the key is a name in a list; no real signature is checked`, reject('signature does not verify against any known key'));
  pass(2, `the key "${shown(kid)}" is published in the issuer's JWKS`);

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(identity.audience)) return fail('audience_mismatch', `aud is ${describe(claims.aud)}, not the Audience Privilege generated for this identity`, reject('audience does not match the identity'));
  pass(3, 'aud is the Audience Privilege generated for this identity');

  const max = identity.maxTokenLifetimeSec > 0 ? identity.maxTokenLifetimeSec : DEFAULT_MAX_LIFETIME;
  const life = Number.isFinite(claims.exp) && Number.isFinite(claims.iat) ? claims.exp - claims.iat : NaN;
  if (!(life >= 0)) return fail('lifetime_unreadable', 'iat and exp must both be numbers with exp not before iat, so the lifetime cannot be read', reject('token lifetime cannot be read'));
  if (life > max) return fail('lifetime_too_long', `exp minus iat is ${life} seconds; the identity allows at most ${max}`, reject(`token lifetime ${life}s exceeds the maximum ${max}s`));
  pass(4, `exp minus iat is ${life} seconds, within the ${max} the identity allows`);

  if (typeof claims.sub !== 'string' || !globMatch(identity.subject, claims.sub)) return fail('subject_mismatch', `sub is ${describe(claims.sub)}, which does not match the Subject pattern "${shown(identity.subject)}"`, reject('subject does not match the identity'));
  pass(5, identity.subject === '*' ? 'Subject is *, so any sub passes: the agent is pinned by the required claims instead' : `sub matches the Subject pattern "${shown(identity.subject)}"`);

  const required = evaluateClaims(claims, { requiredClaims: identity.requiredClaims });
  state.claimChecks = required.checks;
  const bad = required.checks.find((c) => !c.ok);
  if (bad) return fail('required_claim', bad.detail, reject(`required claim "${bad.path}" does not match`));
  pass(6, `every required claim matches (${identity.requiredClaims.map((c) => c.path).join(', ')})`);
  log.push(`mcpgw: workload token accepted for key ${identity.keyName} issuer=${shown(claims.iss)} subject=${shown(claims.sub)}`);

  const { mode, claim } = identity.endUser;
  const raw = flat.get(claim);
  if (typeof raw !== 'string' || raw === '') return fail('end_user_claim_missing', `the End-user claim "${shown(claim)}" is not in the token as text, so there is no end user to record`, `end-user claim "${shown(claim)}" is not in the token`);
  const person = mode === 'resolved' ? directory.find((u) => u.user === raw) : null;
  state.endUser = { mode, claim, value: raw, resolved: mode === 'resolved' ? !!person : null, directoryGroups: person ? person.groups : null, cedarGroupRulesApply: !!person };
  if (mode === 'resolved' && !person) return fail('user_not_found', `${describe(raw)} (read from ${shown(claim)}) is not a user in the mock Privilege directory. Resolved needs the person to exist in Privilege`, `end user "${shown(raw)}" is not a Privilege user`);
  pass(7, mode === 'opaque'
    ? `${describe(raw)} (read from ${shown(claim)}) is recorded and never looked up, so this person need exist nowhere in PingOne`
    : `${describe(raw)} (read from ${shown(claim)}) is a user in the mock Privilege directory; directory groups and per-user rules apply`);

  state.tiers = tiers.map((t) => {
    const cl = t.claims.map((c) => { const found = claimValues(flat, c.path); const hit = c.anyOf.find((v) => found.includes(v)); return { path: c.path, anyOf: c.anyOf, found, matched: hit ?? null, ok: hit !== undefined }; });
    return { id: t.id, label: t.label, claims: cl, tools: t.tools, ok: cl.every((c) => c.ok) };
  });
  const open = state.tiers.filter((t) => t.ok);
  if (!open.length) return fail('no_tier', 'no tier matched the token\'s claims, so no tool is granted: a claim-conditioned tier never falls back to all tools', '403 Forbidden to the caller. No gateway log line is known for a claim mismatch');
  const granted = new Set(open.flatMap((t) => t.tools));
  state.tools = tools.filter((n) => granted.has(n));
  pass(8, `${open.map((t) => t.id).join(' and ')} tier${open.length > 1 ? 's' : ''} matched: ${state.tools.length} tool${state.tools.length === 1 ? '' : 's'} granted`);
  log.push(`tools/list returned ${state.tools.length} tools`);
  return result('allow', 200, null);
}
