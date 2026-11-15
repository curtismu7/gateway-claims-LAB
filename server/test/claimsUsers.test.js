// "Users and groups from claims": the engine (every scenario, the order of the checks, each trap), the data (tags, tokens, hosts), the API (bounds, masking,
// strictness) and the generated docs. The pure engine is checked directly; the API is checked over HTTP like the other tabs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, CODES, claimValues, evaluateClaimsUsers, globMatch, validateIdentitySettings } from '../src/claimsUsers.js';
import { ClaimsInputError, flattenClaims } from '../src/claims.js';
import { buildClaimsUsersStory, claimsUsersScenarios, evaluateClaimsUsersRequest, CU_TAGS } from '../src/claimsUsersStory.js';
import { CEDAR_FACTS, CU_BANNER, CU_FACTS, CU_SECTIONS, CU_TALK, IDENTITY, IDENTITY_ROWS, ROUTE_ROWS, TIERS, TOOLS } from '../src/claimsUsersData.js';
import { DEFAULT_CAST, VERTICALS, unfilled } from '../src/cast.js';
import { maskDeep, maskTypedDeep } from '../src/mask.js';
import { scanHosts, scanKeys } from '../src/safety.js';
import { InputError } from '../src/errors.js';
import { N } from './secrets.js';
import { call, withServer } from './helpers.js';

const story = (cast = DEFAULT_CAST) => buildClaimsUsersStory(cast);
const run = (body, cast = DEFAULT_CAST) => evaluateClaimsUsersRequest(story(cast), body, cast);
const scenarios = (cast = DEFAULT_CAST) => claimsUsersScenarios(story(cast));
const failedStep = (r) => r.checks.find((c) => c.ok === false)?.id ?? null;

// The outcome every scenario must give: the decision, the status the caller sees (null: the console refused to save), the first failing step, and the tools granted.
const OUTCOMES = {
  'wrong-iss': ['deny', 401, 'issuer', 0], 'wrong-aud': ['deny', 401, 'audience', 0], 'lifetime-too-long': ['deny', 401, 'lifetime', 0], 'act-text': ['deny', 401, 'required_claims', 0],
  'required-claim-audience': ['deny', 401, 'required_claims', 0], 'key-unpublished': ['deny', 401, 'signing_key', 0],
  'opaque-allowed': ['allow', 200, null, 9], 'resolved-allowed': ['allow', 200, null, 3], 'resolved-missing': ['deny', 403, 'end_user', 0], 'subject-pinned': ['deny', null, 'identity_saved', 0],
  'tier-fewer': ['allow', 200, null, 3], 'tier-none': ['deny', 403, 'grant_tier', 0],
};

test('twelve scenarios in three sections; each gives its decision, status, first failing step and tool count in every vertical', () => {
  assert.equal(CU_SECTIONS.length, 3);
  assert.deepEqual(scenarios().map((s) => s.id), Object.keys(OUTCOMES));
  for (const [name, cast] of Object.entries(VERTICALS)) {
    for (const sc of scenarios(cast)) {
      const r = run({ scenario: sc.id }, cast);
      const [decision, status, step, tools] = OUTCOMES[sc.id];
      assert.deepEqual([r.decision, r.status, failedStep(r), r.toolCount], [decision, status, step, tools], `${name}/${sc.id}`);
      assert.equal(r.decision, sc.expected, `${name}/${sc.id}`);
      assert.equal(r.code, sc.code, `${name}/${sc.id}`);
      assert.equal(r.expected, sc.expected); assert.equal(r.expectedCode, sc.code);
    }
  }
});

test('the checks run in a fixed order and the first failure stops the run: later steps read "not reached"', () => {
  assert.deepEqual(CHECKS.map((c) => c[0]), ['identity_saved', 'issuer', 'signing_key', 'audience', 'lifetime', 'subject', 'required_claims', 'end_user', 'grant_tier']);
  for (const sc of scenarios()) {
    const r = run({ scenario: sc.id });
    assert.deepEqual(r.checks.map((c) => c.id), CHECKS.map((c) => c[0]), sc.id);
    const states = r.checks.map((c) => c.ok);
    const firstBad = states.findIndex((s) => s !== true);
    if (firstBad === -1) continue;
    assert.equal(states[firstBad], false, sc.id);
    assert.ok(states.slice(firstBad + 1).every((s) => s === null), `${sc.id}: steps after the failure are not reached`);
    assert.ok(r.checks.every((c) => typeof c.detail === 'string' && c.detail.length > 3 && Object.hasOwn(CU_TAGS, c.tag)), sc.id);
  }
  // Four faults at once: only the first, in order, is reported.
  const many = run({ token: { iss: 'https://idp-other.northwind.example', aud: 'x', iat: 1, exp: 99999, sub: 'a' } });
  assert.equal(failedStep(many), 'issuer'); assert.deepEqual(many.checks.slice(2).map((c) => c.ok), Array(7).fill(null));
  const noKey = run({ scenario: 'wrong-aud', kid: 'not-published' });
  assert.equal(failedStep(noKey), 'signing_key', 'the signing key is checked before the audience');
  const lifeFirst = run({ token: { iss: IDENTITY.issuer.replace('{{castHost}}', 'northwind'), aud: 'priv-nhi-northwind-example', iat: 0, exp: 7200, sub: 'x' } });
  assert.equal(failedStep(lifeFirst), 'lifetime', 'lifetime is checked before subject and required claims');
});

test('TRAP act as the text "{}": act.sub does not exist because act is not an object, and the log names the claim', () => {
  const r = run({ scenario: 'act-text' });
  assert.equal(r.status, 401); assert.equal(r.code, 'required_claim');
  const act = r.claimChecks.find((c) => c.path === 'act.sub');
  assert.equal(act.ok, false); assert.equal(act.reason, 'parent_not_object'); assert.match(act.detail, /not an object/);
  assert.equal(r.claimChecks.find((c) => c.path === 'client_id').ok, true, 'client_id still matches');
  assert.deepEqual(r.log, ['mcpgw: workload token rejected: required claim "act.sub" does not match']);
  assert.equal(r.token.claims.act, '{}');
});

test('TRAP required claim typed as the audience instead of the agent id: a right token is refused, and the page can show which setting was changed', () => {
  const r = run({ scenario: 'required-claim-audience' });
  assert.equal(r.code, 'required_claim'); assert.equal(r.status, 401);
  const act = r.claimChecks.find((c) => c.path === 'act.sub');
  assert.equal(act.reason, 'mismatch'); assert.equal(act.actual, DEFAULT_CAST.castAgentId); assert.equal(act.expected, 'priv-nhi-northwind-example');
  assert.deepEqual(r.log, ['mcpgw: workload token rejected: required claim "act.sub" does not match'], 'the same log line as the {} trap');
  assert.deepEqual(r.identityView.filter((v) => v.changed).map((v) => v.id), ['required']);
  // With the rule fixed the very same token is accepted.
  assert.equal(run({ scenario: 'opaque-allowed', token: r.token.claims }).decision, 'allow');
});

test('TRAP signing key not published: refused with the measured log line, before the audience is even read', () => {
  const r = run({ scenario: 'key-unpublished' });
  assert.equal(r.code, 'key_not_published'); assert.equal(r.status, 401);
  assert.deepEqual(r.log, ['mcpgw: workload token rejected: signature does not verify against any known key']);
  assert.equal(r.token.header.kid, 'atm-central-key');
  assert.equal(run({ scenario: 'key-unpublished', kid: 'atm-agent-key' }).decision, 'allow', 'the published key passes');
  assert.match(r.checks.find((c) => c.id === 'signing_key').detail, /no real signature is checked/);
});

test('TRAP console refusal: pinning Subject to one value while the End-user claim reads sub is refused at save, nothing is called; the three ways out are accepted', () => {
  const r = run({ scenario: 'subject-pinned' });
  assert.equal(r.status, null); assert.equal(r.stage, 'console'); assert.equal(r.code, 'subject_pinned'); assert.equal(r.decision, 'deny');
  assert.match(r.checks[0].detail, /Spec\.UserClaim resolves to "sub" … every caller reads as the same end user/);
  assert.match(r.checks[0].detail, /Widen Subject to \*/);
  assert.equal(r.checks.slice(1).every((c) => c.ok === null), true);
  assert.match(r.hops[0].response, /not sent/);
  const pinned = { subject: 'orders-agent', endUser: { mode: 'opaque', claim: 'sub' } };
  assert.equal(validateIdentitySettings(pinned).code, 'subject_pinned');
  assert.equal(validateIdentitySettings({ ...pinned, subject: '*' }), null, 'widened to *');
  assert.equal(validateIdentitySettings({ ...pinned, subject: 'orders-?gent' }), null, 'a pattern is not one value');
  assert.equal(validateIdentitySettings({ ...pinned, endUser: { mode: 'opaque', claim: 'preferred_username' } }), null, 'the End-user claim reads another claim');
  assert.equal(run({ scenario: 'subject-pinned', subject: '*' }).decision, 'allow', 'the visitor can widen Subject and the same token passes');
});

test('Opaque records the person from a claim and never looks them up; Resolved needs a Privilege user and brings directory groups', () => {
  const opaque = run({ scenario: 'opaque-allowed' });
  assert.equal(opaque.decision, 'allow');
  assert.deepEqual(opaque.endUser, { mode: 'opaque', claim: 'sub', value: 'sam-rivera', resolved: null, directoryGroups: null, cedarGroupRulesApply: false });
  assert.match(opaque.checks.find((c) => c.id === 'end_user').detail, /recorded and never looked up/);
  const resolved = run({ scenario: 'resolved-allowed' });
  assert.deepEqual(resolved.endUser, { mode: 'resolved', claim: 'sub', value: 'ana-lopez', resolved: true, directoryGroups: ['northwind-team'], cedarGroupRulesApply: true });
  const missing = run({ scenario: 'resolved-missing' });
  assert.equal(missing.status, 403); assert.equal(missing.code, 'user_not_found'); assert.equal(missing.endUser.resolved, false); assert.equal(missing.endUser.cedarGroupRulesApply, false);
  assert.match(missing.log.at(-1), /is not a Privilege user/);
  // The same token, one setting apart.
  assert.equal(run({ scenario: 'opaque-allowed', endUserMode: 'resolved' }).code, 'user_not_found');
  assert.equal(run({ scenario: 'resolved-missing', endUserMode: 'opaque' }).decision, 'allow');
  // The directory groups and the token's groups are different sources: the tools follow the token.
  assert.deepEqual(resolved.tools, ['ListItems', 'GetItem', 'CountItems']);
});

test('the End-user claim is a dotted claim path; a claim that is not in the token as text is refused', () => {
  const nested = run({ scenario: 'opaque-allowed', token: { ...run({ scenario: 'opaque-allowed' }).token.claims, user: { login: 'kim-adeyemi' } }, endUserClaim: 'user.login' });
  assert.equal(nested.decision, 'allow'); assert.equal(nested.endUser.value, 'kim-adeyemi'); assert.equal(nested.endUser.claim, 'user.login');
  const absent = run({ scenario: 'opaque-allowed', endUserClaim: 'user.login' });
  assert.equal(absent.status, 401); assert.equal(absent.code, 'end_user_claim_missing'); assert.equal(absent.endUser, null);
  const number = run({ scenario: 'opaque-allowed', endUserClaim: 'iat' });
  assert.equal(number.code, 'end_user_claim_missing', 'a number is not a person');
});

test('Subject uses * and ? wildcards, matched without a regex and in bounded time', () => {
  for (const [p, t, want] of [['*', 'anything', true], ['*', '', true], ['', '', true], ['', 'a', false], ['ana-*', 'ana-lopez', true], ['ana-*', 'ben-okafor', false], ['a?a', 'ana', true], ['a?a', 'aa', false], ['?', 'x', true], ['abc', 'abc', true], ['abc', 'abd', false], ['*-lopez', 'ana-lopez', true], ['a*b*c', 'aXXbYYc', true], ['a*b*c', 'aXXbYY', false], ['a.c', 'abc', false], ['a[b]c', 'abc', false]]) assert.equal(globMatch(p, t), want, `${p} ~ ${t}`);
  const t0 = Date.now();
  assert.equal(globMatch('*'.repeat(30).replace(/\*/g, '*a'), 'a'.repeat(500)), true);
  assert.equal(globMatch(`${'*a'.repeat(31)}b`, 'a'.repeat(512)), false);
  assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0} ms`);
  assert.equal(run({ scenario: 'opaque-allowed', subject: 'sam-*' }).decision, 'allow');
  assert.equal(run({ scenario: 'opaque-allowed', subject: 'sam-riverz', endUserClaim: 'user.login', token: { ...run({ scenario: 'opaque-allowed' }).token.claims, user: { login: 'x' } } }).code, 'subject_mismatch');
  assert.equal(run({ scenario: 'opaque-allowed', subject: 'ben-*', endUserClaim: 'client_id' }).code, 'subject_mismatch');
});

// Review gaps (the behaviour was right; these pin it so a later change cannot loosen it unnoticed).
test('Opaque never looks anyone up, even a person who IS in the directory', () => {
  const base = run({ scenario: 'opaque-allowed' }).token.claims;
  const r = run({ scenario: 'opaque-allowed', token: { ...base, sub: 'ana-lopez' } });
  assert.equal(r.decision, 'allow');
  assert.deepEqual(r.endUser, { mode: 'opaque', claim: 'sub', value: 'ana-lopez', resolved: null, directoryGroups: null, cedarGroupRulesApply: false });
});

test('the audience is an exact match: a prefix, a suffix or a longer value is refused, and a list that contains it is accepted', () => {
  const base = run({ scenario: 'opaque-allowed' }).token.claims;
  for (const aud of [`${base.aud}x`, `x${base.aud}`, base.aud.slice(0, -1), base.aud.toUpperCase()]) assert.equal(run({ scenario: 'opaque-allowed', token: { ...base, aud } }).code, 'audience_mismatch', aud);
  assert.equal(run({ scenario: 'opaque-allowed', token: { ...base, aud: [base.aud] } }).decision, 'allow');
});

test('a token with no iat has no readable lifetime and is refused, not treated as issued at zero', () => {
  const { iat, ...noIat } = run({ scenario: 'opaque-allowed' }).token.claims;
  const r = run({ scenario: 'opaque-allowed', token: noIat });
  assert.equal(r.status, 401); assert.equal(r.code, 'lifetime_unreadable'); assert.equal(failedStep(r), 'lifetime');
});

test('the Subject pattern is anchored over the whole sub, end to end through the engine', () => {
  const base = run({ scenario: 'opaque-allowed' }).token.claims;
  assert.equal(run({ scenario: 'opaque-allowed', subject: 'sam-*', token: { ...base, sub: 'xsam-rivera' } }).code, 'subject_mismatch');
  assert.equal(run({ scenario: 'opaque-allowed', subject: '*-rivera', token: { ...base, sub: 'sam-rivera-x' } }).code, 'subject_mismatch');
  assert.equal(run({ scenario: 'opaque-allowed', subject: 'sam-*', token: { ...base, sub: 'sam-rivera' } }).decision, 'allow');
});

test('Resolved looks the person up with an exact match: a different case is not the same user', () => {
  const base = run({ scenario: 'resolved-allowed' }).token.claims;
  const r = run({ scenario: 'resolved-allowed', token: { ...base, sub: 'Ana-Lopez' } });
  assert.equal(r.status, 403); assert.equal(r.code, 'user_not_found'); assert.equal(r.endUser.resolved, false);
});

test('grant tiers: any one listed value matches a claim, every claim in a rule must match, a tier grants only its own tools and never falls back to all tools', () => {
  const s = story();
  const flat = (o) => flattenClaims(o);
  assert.deepEqual(claimValues(flat({ groups: ['a', 'b'] }), 'groups'), ['a', 'b']);
  assert.deepEqual(claimValues(flat({ groups: 'a' }), 'groups'), ['a']);
  assert.deepEqual(claimValues(flat({ realm_access: { roles: ['x'] } }), 'realm_access.roles'), ['x']);
  assert.deepEqual(claimValues(flat({ scope: 'openid mcp' }), 'scope'), ['openid', 'mcp'], 'the scope claim is split per value');
  assert.deepEqual(claimValues(flat({ groups: [1, { a: 'b' }, 'c'] }), 'groups'), ['c'], 'only text values count');
  assert.deepEqual(claimValues(flat({ groupsx: ['a'] }), 'groups'), [], 'another claim with the same prefix is not this claim');
  const base = run({ scenario: 'opaque-allowed' }).token.claims;
  const evalWith = (claims, tiers = s.tiers) => evaluateClaimsUsers({ claims, kid: 'atm-agent-key', identity: s.identity, directory: s.directory, tiers, tools: s.tools });
  // groups only (reader), roles only (admin), both (union = nine), neither (403).
  const only = (extra, drop) => { const c = { ...base, ...extra }; for (const k of drop) delete c[k]; return c; };
  assert.equal(evalWith(only({ groups: ['northwind-support'] }, ['realm_access'])).toolCount, 3, 'the second listed value matches (any one)');
  assert.equal(evalWith(only({}, ['groups'])).toolCount, 9, 'the admin role alone opens all nine');
  assert.equal(evalWith(base).toolCount, 9, 'both tiers match: the union');
  const none = evalWith(only({ groups: ['x'] }, ['realm_access']));
  assert.equal(none.decision, 'deny'); assert.equal(none.status, 403); assert.deepEqual(none.tools, []); assert.equal(none.toolCount, 0);
  assert.equal(none.tiers.every((t) => !t.ok), true);
  // Every claim of one rule must match.
  const two = [{ id: 'both', label: 'Both', claims: [{ path: 'groups', anyOf: ['northwind-support'] }, { path: 'realm_access.roles', anyOf: ['wrong-role'] }], tools: ['ListItems'] }];
  assert.equal(evalWith(base, two).code, 'no_tier');
  assert.equal(evalWith(base, [{ ...two[0], claims: [two[0].claims[0], { path: 'realm_access.roles', anyOf: ['x', 'northwind-admin'] }] }]).toolCount, 1);
  // The tool list keeps the lab's order whatever order the tiers list them in.
  const odd = [{ id: 'o', label: 'O', claims: [{ path: 'groups', anyOf: ['northwind-support'] }], tools: ['PurgeItems', 'ListItems'] }];
  assert.deepEqual(evalWith(base, odd).tools, ['ListItems', 'PurgeItems']);
  assert.ok(TIERS.every((t) => t.tools.every((n) => TOOLS.includes(n))));
});

test('the identity gate checks, one at a time, with the reason in plain words', () => {
  const good = run({ scenario: 'opaque-allowed' }).token.claims;
  const r = (extra, drop = []) => { const c = { ...good, ...extra }; for (const k of drop) delete c[k]; return run({ token: c }); };
  assert.equal(r({ iss: `${good.iss}/` }).code, 'issuer_mismatch', 'a trailing slash is not an exact match');
  assert.equal(r({}, ['iss']).code, 'issuer_mismatch');
  assert.equal(r({ aud: [good.aud, 'x'] }).decision, 'allow', 'aud may be a list that contains the audience');
  assert.equal(r({ aud: ['x'] }).code, 'audience_mismatch');
  assert.equal(r({}, ['aud']).code, 'audience_mismatch');
  assert.equal(r({ exp: good.iat + 900 }).decision, 'allow', 'exactly the maximum is allowed');
  assert.equal(r({ exp: good.iat + 901 }).code, 'lifetime_too_long');
  assert.equal(r({ exp: good.iat - 1 }).code, 'lifetime_unreadable');
  assert.equal(r({}, ['exp']).code, 'lifetime_unreadable');
  assert.equal(r({ iat: '1790000000' }).code, 'lifetime_unreadable');
  assert.equal(r({}, ['sub']).code, 'subject_mismatch');
  assert.equal(r({ sub: 5 }).code, 'subject_mismatch');
  assert.equal(r({ client_id: 'someone-else' }).code, 'required_claim');
  assert.equal(r({ act: { sub: 'other-agent' } }).claimChecks.find((c) => c.path === 'act.sub').reason, 'mismatch');
  assert.equal(r({}, ['act']).claimChecks.find((c) => c.path === 'act.sub').reason, 'missing');
  assert.equal(r({ act: 7 }).claimChecks.find((c) => c.path === 'act.sub').reason, 'parent_not_object');
  const life = run({ scenario: 'lifetime-too-long' });
  assert.match(life.checks.find((c) => c.id === 'lifetime').detail, /7200 seconds; the identity allows at most 900/);
  assert.deepEqual(life.log, ['mcpgw: workload token rejected: token lifetime 7200s exceeds the maximum 900s']);
  assert.deepEqual(CODES, ['subject_pinned', 'issuer_mismatch', 'key_not_published', 'audience_mismatch', 'lifetime_too_long', 'lifetime_unreadable', 'subject_mismatch', 'required_claim', 'end_user_claim_missing', 'user_not_found', 'no_tier']);
});

test('MaxTokenLifetimeSec 0 means the gateway default of 3600', () => {
  const s = story(); const claims = run({ scenario: 'opaque-allowed' }).token.claims;
  const go = (max, exp) => evaluateClaimsUsers({ claims: { ...claims, exp }, kid: 'atm-agent-key', identity: { ...s.identity, maxTokenLifetimeSec: max }, directory: s.directory, tiers: s.tiers, tools: s.tools });
  assert.equal(go(0, claims.iat + 3600).decision, 'allow'); assert.equal(go(0, claims.iat + 3601).code, 'lifetime_too_long');
});

test('the accepted log line names the key, the issuer and the subject; a refusal at a later step still shows that the token was accepted', () => {
  const ok = run({ scenario: 'opaque-allowed' });
  assert.deepEqual(ok.log, ['mcpgw: workload token accepted for key orders-agent-key issuer=https://idp.northwind.example subject=sam-rivera', 'tools/list returned 9 tools']);
  const none = run({ scenario: 'tier-none' });
  assert.match(none.log[0], /workload token accepted/); assert.match(none.log[1], /No gateway log line is known for a claim mismatch/);
  assert.equal(run({ scenario: 'wrong-iss' }).log.length, 1);
});

test('the engine is deterministic and does not change its inputs', () => {
  const s = story(); const snapshot = JSON.stringify(s);
  for (const sc of claimsUsersScenarios(s)) {
    const a = evaluateClaimsUsersRequest(s, { scenario: sc.id }, DEFAULT_CAST, '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    const b = evaluateClaimsUsersRequest(s, { scenario: sc.id }, DEFAULT_CAST, '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    const { hops: ha, traceparent: ta, ...ra } = a; const { hops: hb, traceparent: tb, ...rb } = b; void [ha, ta, hb, tb];
    assert.deepEqual(ra, rb, sc.id);
    assert.equal(a.traceId, '0af7651916cd43dd8448eb211c80319c', 'a valid incoming traceparent continues its trace');
    assert.ok(a.hops.every((h) => h.traceparent.startsWith(`00-${a.traceId}-`)));
  }
  assert.equal(JSON.stringify(s), snapshot);
});

test('hostile input is bounded: depth, claim count, value length, dotted names, array size; each refused with a code', () => {
  const code = (token) => { try { run({ token }); return 'ran'; } catch (e) { assert.ok(e instanceof ClaimsInputError, String(e)); return e.code; } };
  assert.equal(code({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }), 'too_deep');
  assert.equal(code(Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, 1]))), 'too_many');
  assert.equal(code({ a: 'x'.repeat(513) }), 'too_long');
  assert.equal(code({ 'act.sub': 'x' }), 'dotted_claim_name');
  assert.equal(code({ groups: Array.from({ length: 21 }, () => 'a') }), 'too_many');
  const bad = (body) => { try { run(body); return 'ran'; } catch (e) { assert.ok(e instanceof InputError, String(e)); return e.code; } };
  assert.equal(bad({}), 'bad_request'); assert.equal(bad({ scenario: 'nope' }), 'unknown_scenario'); assert.equal(bad({ scenario: 5 }), 'unknown_scenario');
  assert.equal(bad({ token: [] }), 'bad_token'); assert.equal(bad({ token: 'x' }), 'bad_token'); assert.equal(bad({ scenario: 'wrong-iss', token: null }), 'bad_token');
  assert.equal(bad({ scenario: 'wrong-iss', kid: 'x'.repeat(65) }), 'bad_kid'); assert.equal(bad({ scenario: 'wrong-iss', kid: 'a b' }), 'bad_kid'); assert.equal(bad({ scenario: 'wrong-iss', kid: 5 }), 'bad_kid');
  assert.equal(bad({ scenario: 'wrong-iss', subject: 'x'.repeat(65) }), 'bad_subject'); assert.equal(bad({ scenario: 'wrong-iss', subject: '' }), 'bad_subject'); assert.equal(bad({ scenario: 'wrong-iss', subject: 'a/b' }), 'bad_subject');
  assert.equal(bad({ scenario: 'wrong-iss', endUserClaim: 'a..b' }), 'bad_end_user_claim'); assert.equal(bad({ scenario: 'wrong-iss', endUserClaim: '1abc' }), 'bad_end_user_claim'); assert.equal(bad({ scenario: 'wrong-iss', endUserClaim: 'a.b.c.d.e.f.g.h' }), 'bad_end_user_claim');
  assert.equal(bad({ scenario: 'wrong-iss', endUserMode: 'both' }), 'bad_end_user_mode'); assert.equal(bad({ scenario: 'wrong-iss', endUserMode: 'Opaque' }), 'bad_end_user_mode');
  let deep = {}; for (let i = 0; i < 100000; i++) deep = { v: deep };
  assert.equal(code(deep), 'too_deep');
});

test('the data: every {{token}} is defined by every vertical, only .example hosts, no key-looking values, fixed ids, no "door"', () => {
  for (const [name, cast] of Object.entries(VERTICALS)) {
    const everything = JSON.stringify([story(cast), scenarios(cast).map((s) => run({ scenario: s.id }, cast))]);
    assert.deepEqual(unfilled(everything, cast), [], name);
    assert.deepEqual(scanHosts(everything), [], name); assert.deepEqual(scanKeys(everything), [], name);
    assert.ok(!/\bdoors?\b/i.test(everything), name);
    assert.ok(!/@/.test(everything), `${name}: no email-shaped value (the response mask would blank it)`);
  }
  assert.deepEqual(unfilled(JSON.stringify([CU_SECTIONS, IDENTITY, TIERS, CU_FACTS, CEDAR_FACTS, ROUTE_ROWS]), DEFAULT_CAST), [], 'the raw data names only tokens the cast defines');
  const ids = scenarios().map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every fact, row, check and scenario carries a valid tag; measured rows name a dated source; the owner statement is UNVERIFIED', () => {
  const s = story();
  const rows = [...CU_FACTS, ...CEDAR_FACTS, ...ROUTE_ROWS, ...IDENTITY_ROWS, ...s.checks, ...scenarios().map((x) => ({ tag: x.evidence, id: x.id }))];
  assert.ok(rows.length > 45);
  for (const r of rows) assert.ok(Object.hasOwn(CU_TAGS, r.tag), JSON.stringify(r).slice(0, 80));
  assert.deepEqual(Object.values(CU_TAGS), ['deck claim', 'console swagger name (schema only)', 'lab reading', 'lab-invented', 'measured (our note)', 'UNVERIFIED']);
  for (const f of [...CU_FACTS, ...CEDAR_FACTS]) { assert.ok(f.source.length > 5, f.id); if (f.tag === 'measured') assert.match(f.source, /owner (live|console) run|console (walkthrough|editor)|walked 20\d\d-\d\d-\d\d/, f.id); }
  assert.equal(new Set([...CU_FACTS, ...CEDAR_FACTS].map((f) => f.id)).size, CU_FACTS.length + CEDAR_FACTS.length);
  const owner = CU_FACTS.find((f) => f.id === 'any-claim');
  assert.equal(owner.tag, 'unverified'); assert.match(owner.source, /owner statement, 2026-11-15, not measured/);
  assert.equal(CU_FACTS.find((f) => f.id === 'tiers-groups').tag, 'unverified');
  assert.equal(CU_FACTS.find((f) => f.id === 'subject-question').tag, 'unverified');
  // Measured is only what the notes measured: the gate accepting a PF token, the three traps, the console refusal, scope tiers, the bare 403, Opaque in the working setup.
  assert.deepEqual(CU_FACTS.filter((f) => f.tag === 'measured').map((f) => f.id), ['gate-accepts-pf-token', 'act-object', 'key-published', 'end-user-refusal', 'opaque-working', 'scope-tiers', 'bare-403']);
  assert.ok(s.checks.find((c) => c.id === 'grant_tier').tag === 'unverified');
  assert.ok(!/we (ran|measured|tested|verified)/i.test(JSON.stringify([CU_FACTS, CEDAR_FACTS])));
});

test('the page says plainly it is a simulation, and the owner statement is named as not measured', () => {
  assert.match(CU_BANNER, /^SIMULATION, mock only/);
  assert.match(CU_BANNER, /2026-11-15, not measured: UNVERIFIED/);
  assert.match(CU_TALK.say, /^Simulation, mock only/); assert.match(CU_TALK.say, /UNVERIFIED/);
  assert.equal(story().banner, CU_BANNER); assert.match(story().noLive, /no Live engine/);
});

test('the lab\'s own fixed texts survive both masks unchanged in every vertical (over-masking would blank a lesson: "token:" followed by a word reads as an assignment)', () => {
  for (const cast of Object.values(VERTICALS)) {
    const s = story(cast);
    const runs = claimsUsersScenarios(s).map((sc) => run({ scenario: sc.id }, cast));
    assert.deepEqual(maskDeep(s), s); assert.deepEqual(maskDeep(runs), runs);
    for (const r of runs) { const typed = { token: r.token, identityView: r.identityView, checks: r.checks, claimChecks: r.claimChecks, flat: r.flat, endUser: r.endUser, tiers: r.tiers, log: r.log }; assert.deepEqual(maskTypedDeep(typed), typed, r.scenario); }
  }
});

// ---- over HTTP ----
const post = (url, body, ws = 'cu-w', headers = {}) => call(url, 'POST', '/api/claims-users/evaluate', body, { ws, headers });

test('GET /api/claims-users: the story, three verticals, no-store, simulated', async () => {
  await withServer(async (url) => {
    const r = await call(url, 'GET', '/api/claims-users');
    assert.equal(r.status, 200); assert.equal(r.json.simulated, true); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.json.sections.length, 3); assert.equal(claimsUsersScenarios(r.json).length, 12); assert.equal(r.json.checks.length, 9);
    assert.equal(r.json.banner, CU_BANNER); assert.deepEqual(r.json.tags, CU_TAGS);
    assert.match(r.json.title, /Northwind Retail/);
    const fin = await call(url, 'GET', '/api/claims-users?vertical=finance');
    assert.match(fin.json.title, /Fabrikam Bank/); assert.equal(fin.json.identity.requiredClaims[1].equals, 'payments-agent');
    assert.match((await call(url, 'GET', '/api/claims-users?vertical=nope')).json.title, /Northwind/, 'an unknown vertical keeps the default');
  });
});

test('POST /api/claims-users/evaluate: every scenario over HTTP, per vertical, with hops, a traceparent header and a workspace record', async () => {
  await withServer(async (url) => {
    for (const vertical of Object.keys(VERTICALS)) {
      for (const [id, [decision, status, step, tools]] of Object.entries(OUTCOMES)) {
        const r = await post(url, { scenario: id, vertical }, `cu-${vertical}`);
        assert.equal(r.status, 200, `${vertical}/${id}`);
        assert.deepEqual([r.json.decision, r.json.status, failedStep(r.json), r.json.toolCount], [decision, status, step, tools], `${vertical}/${id}`);
        assert.equal(r.json.simulated, true); assert.equal(r.json.workspace, `cu-${vertical}`); assert.equal(r.json.custom, false);
        assert.equal(r.json.hops.length, 3); assert.match(r.headers.get('traceparent'), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
        assert.ok(r.json.hops.every((h) => h.traceparent.includes(r.json.traceId)));
      }
    }
    const runs = (await call(url, 'GET', '/api/runs', undefined, { ws: 'cu-retail' })).json.runs;
    assert.equal(runs.length, 12); assert.ok(runs.every((x) => x.scenario.startsWith('claims-users:')));
    assert.equal((await call(url, 'POST', '/api/reset', {}, { ws: 'cu-retail' })).status, 200);
    assert.equal((await call(url, 'GET', '/api/runs', undefined, { ws: 'cu-retail' })).json.runs.length, 0);
    const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    assert.equal((await post(url, { scenario: 'wrong-iss' }, 'cu-w', { traceparent: tp })).json.traceId, '0af7651916cd43dd8448eb211c80319c');
  });
});

test('POST /api/claims-users/evaluate: overrides, a custom token, bad input and the strict body', async () => {
  await withServer(async (url) => {
    const base = (await post(url, { scenario: 'opaque-allowed' })).json.token.claims;
    const widen = await post(url, { scenario: 'subject-pinned', subject: '*' });
    assert.equal(widen.json.decision, 'allow'); assert.equal(widen.json.custom, true); assert.ok(widen.json.identityView.find((v) => v.id === 'subject').changed === false, '* is the default Subject');
    const kid = await post(url, { scenario: 'opaque-allowed', kid: 'atm-central-key' });
    assert.equal(kid.json.code, 'key_not_published'); assert.equal(kid.json.token.header.kid, 'atm-central-key');
    const custom = await post(url, { token: { ...base, groups: ['northwind-readers'], realm_access: { roles: [] } }, endUserMode: 'opaque' });
    assert.equal(custom.json.scenario, 'custom'); assert.equal(custom.json.expected, null); assert.equal(custom.json.toolCount, 3); assert.equal(custom.json.token, null, 'a typed token is not echoed');
    assert.ok(custom.json.flat.some((f) => f.path === 'groups.0' && f.value === 'northwind-readers'));
    const refused = [
      [{ scenario: 'nope' }, 400, 'unknown_scenario'], [{}, 400, 'bad_request'], [{ scenario: 'wrong-iss', extra: 1 }, 400, 'unknown_field'], [{ token: [] }, 400, 'bad_token'], [{ token: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } }, 400, 'too_deep'],
      [{ token: { 'a.b': 1 } }, 400, 'dotted_claim_name'], [{ scenario: 'wrong-iss', kid: 'a b' }, 400, 'bad_kid'], [{ scenario: 'wrong-iss', endUserMode: 'x' }, 400, 'bad_end_user_mode'], [{ scenario: 'wrong-iss', subject: 'ghp_AbCdEfGhIjKlMnOpQr' }, 400, 'credential_like'],
      [{ scenario: 'wrong-iss', kid: `sk-live-${N}abcdefghij` }, 400, 'credential_like'], [{ scenario: 'wrong-iss', endUserClaim: 'a b' }, 400, 'bad_end_user_claim'],
    ];
    for (const [body, status, error] of refused) { const r = await post(url, body); assert.equal(r.status, status, JSON.stringify(body).slice(0, 60)); assert.equal(r.json.error, error, JSON.stringify(body).slice(0, 60)); }
    assert.equal((await post(url, [])).status, 400);
    assert.equal((await post(url, { scenario: 'wrong-iss' }, 'ghp-abcdefghij1234567890')).status, 400);
    assert.equal((await call(url, 'POST', '/api/claims-users/evaluate', undefined, { ws: 'cu-w', raw: '{"scenario":' })).status, 400);
    assert.equal((await call(url, 'POST', '/api/claims-users/evaluate', undefined, { ws: 'cu-w', raw: JSON.stringify({ scenario: 'wrong-iss', pad: 'x'.repeat(9000) }) })).status, 413);
    assert.equal((await call(url, 'POST', '/api/claims-users/evaluate', { scenario: 'wrong-iss' }, { ws: 'cu-w', headers: { origin: 'https://evil.example' } })).status, 403, 'a cross-origin write is refused');
    assert.equal((await call(url, 'GET', '/api/claims-users/evaluate')).status, 404);
  });
});

test('a credential typed into a claim is masked in every field of the answer and the decision is unchanged; ordinary custom input comes back as the engine gives it', async () => {
  await withServer(async (url) => {
    const claims = run({ scenario: 'opaque-allowed' }).token.claims;
    const plain = await post(url, { token: { ...claims, note: 'plain words' } });
    const { realm_access: _roles, ...noRoles } = claims; void _roles;
    const secret = await post(url, { token: { ...noRoles, note: `password=${N}`, groups: [`ghp_${N}AbCdEfGhIjKl`], [`sk-live-${N}abcdefghij`]: 'v' } });
    assert.equal(secret.status, 200); assert.ok(!secret.text.includes(N), 'no part of the secret comes back');
    assert.equal(secret.json.decision, 'deny', 'the groups no longer match a tier, as if they were any other text');
    assert.ok(secret.json.flat.some((f) => f.path === 'note' && /\[masked:/.test(f.value)));
    assert.deepEqual(plain.json.flat.find((f) => f.path === 'note'), { path: 'note', value: 'plain words' });
    // A long key-like run with no keyword in front is only caught by the typed-value mask (the response mask skips the generic detectors).
    const blob = await post(url, { token: { ...claims, note: `${N}0123456789abcdef0123456789abcdef`, sub: `${N}0123456789abcdef0123456789abcdef` } });
    assert.equal(blob.status, 200); assert.ok(!blob.text.includes(N), 'a bare key-like run is masked in what is shown back');
    const iss = await post(url, { token: { ...claims, iss: `https://user:${N}@host.example/x` } });
    assert.equal(iss.json.code, 'issuer_mismatch'); assert.ok(!iss.text.includes(N));
    const sub = await post(url, { token: { ...claims, sub: `my password is ${N}!` } });
    assert.ok(!sub.text.includes(N));
    const runs = (await call(url, 'GET', '/api/runs', undefined, { ws: 'cu-w' })).text;
    assert.ok(!runs.includes(N));
  });
});

test('docs/talk-track.md carries the new entry and scenario list, and the content pack has a card that opens the tab', async () => {
  const fs = await import('node:fs');
  const { rawStory, renderTalkTrackMarkdown } = await import('../src/story.js');
  const doc = fs.readFileSync(new URL('../../docs/talk-track.md', import.meta.url), 'utf8');
  assert.equal(doc, renderTalkTrackMarkdown(DEFAULT_CAST));
  assert.ok(rawStory().talkTrack.some((t) => t.id === 'claims-users'));
  assert.ok(doc.includes('## Users and groups from claims'));
  for (const sc of scenarios()) assert.ok(doc.includes(sc.title), sc.id);
  const pack = JSON.parse(fs.readFileSync(new URL('../../content-pack.json', import.meta.url), 'utf8'));
  const card = pack.cards.find((c) => c.id === 'concept-claims-users');
  assert.ok(card); assert.equal(card.action.href, '/#claimsusers'); assert.match(card.description, /UNVERIFIED/);
});
