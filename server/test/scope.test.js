import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAtmSelection, evaluateCedarScope, evaluateTiers, parseScope, ScopeInputError } from '../src/scopeGate.js';
import { SCOPE_SECTIONS, TIER_RULES, SCOPE_FACTS } from '../src/scopeData.js';
import { buildScopeStory, evaluateScopeScenario } from '../src/scopeStory.js';
import { DEFAULT_CAST } from '../src/cast.js';
import { withServer } from './helpers.js';

const G = { guardedTool: 'SearchIndexTool', needScope: 'opensearch:search' };

test('Cedar scope gate: Active enforces, a candidate (State empty) only shadows, other tools are untouched', () => {
  const deny = evaluateCedarScope({ tool: 'SearchIndexTool', scope: 'openid opensearch:read', state: 'Active', ...G });
  assert.equal(deny.decision, 'deny'); assert.equal(deny.status, 400); assert.equal(deny.jsonRpcCode, -32600);
  assert.equal(evaluateCedarScope({ tool: 'SearchIndexTool', scope: 'openid opensearch:search', state: 'Active', ...G }).decision, 'allow');
  assert.equal(evaluateCedarScope({ tool: 'ListIndexTool', scope: 'openid', state: 'Active', ...G }).decision, 'allow');
  const shadow = evaluateCedarScope({ tool: 'SearchIndexTool', scope: 'openid', state: '', ...G });
  assert.equal(shadow.decision, 'allow'); assert.equal(shadow.shadow, true); assert.match(shadow.log[0], /mcp_policy_shadow_delta/);
});

test('PF token manager: scope alone is served by the default manager and the gateway cannot find the token; resource selects the agent manager', () => {
  const a = evaluateAtmSelection({ scope: 'openid', resource: null, agentUrl: 'https://x.example/m' });
  assert.equal(a.decision, 'deny'); assert.equal(a.status, 401); assert.equal(a.tokenShape.act, null); assert.match(a.log[0], /token_not_found/);
  const b = evaluateAtmSelection({ scope: 'openid', resource: 'https://x.example/m', agentUrl: 'https://x.example/m' });
  assert.equal(b.decision, 'allow'); assert.equal(b.tokenShape.aud, 'https://x.example/m');
  assert.throws(() => evaluateAtmSelection({ scope: 'openid', resource: 5, agentUrl: 'x' }), ScopeInputError);
});

test('RequiredClaims tiers: scope is split per value (any-of); 9 / 3 / 403; the whole string never matches', () => {
  const t = (scope) => evaluateTiers({ scope, rules: TIER_RULES });
  assert.equal(t('openid opensearch:admin').tools, 9);
  assert.equal(t('openid opensearch:read').tools, 3);
  assert.equal(t('openid').status, 403);
  assert.equal(t('openid opensearch:read opensearch:admin').tools, 9);
  assert.equal(evaluateTiers({ scope: 'openid opensearch:read', rules: [{ id: 'whole', anyOf: ['openid opensearch:read'], tools: 3 }] }).status, 403);
});

test('scope input is bounded and typed', () => {
  assert.throws(() => parseScope('x'.repeat(257)), (e) => e.code === 'too_long');
  assert.throws(() => parseScope(Array(21).fill('a').join(' ')), (e) => e.code === 'too_many');
  assert.throws(() => parseScope(5), (e) => e.code === 'bad_scope');
  assert.deepEqual(parseScope('  a   b '), ['a', 'b']);
});

test('every scenario evaluates; every measured scenario has a measured fact; nothing real leaks into the data', () => {
  const story = buildScopeStory(DEFAULT_CAST);
  const ids = story.sections.flatMap((s) => s.scenarios.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(['allow', 'deny'].includes(evaluateScopeScenario(story, id, undefined, DEFAULT_CAST).result.decision));
  assert.equal(SCOPE_FACTS.filter((f) => f.status === 'UNVERIFIED').length, 1);
  assert.ok(SCOPE_SECTIONS.every((s) => s.scenarios.every((x) => ['measured', 'inferred'].includes(x.evidence))));
  assert.doesNotMatch(JSON.stringify(story), /\.ping-devops\.com|\.pingone\.|[0-9a-f]{8}-[0-9a-f]{4}-/);
});

test('GET /api/scope-gate and POST /api/scope-gate/evaluate: scenario, own scope, bad input, workspace record', async () => {
  await withServer(async (url) => {
    const j = await (await fetch(`${url}/api/scope-gate`)).json();
    assert.equal(j.sections.length, 3); assert.equal(j.simulated, true);
    const post = (body, ws = 'tester') => fetch(`${url}/api/scope-gate/evaluate`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url, 'x-workspace': ws }, body: JSON.stringify(body) });
    const ok = await (await post({ scenario: 'cedar-scope-missing' })).json();
    assert.equal(ok.result.decision, 'deny'); assert.equal(ok.result.jsonRpcCode, -32600);
    const own = await (await post({ scenario: 'tier-read', scope: 'openid opensearch:admin' })).json();
    assert.equal(own.result.tools, 9);
    assert.equal((await post({ scenario: 'nope' })).status, 400);
    assert.equal((await post({ scenario: 'tier-read', scope: 5 })).status, 400);
    assert.equal((await post({ scenario: 'tier-read', scope: 'x'.repeat(300) })).status, 400);
    const runs = await (await fetch(`${url}/api/runs`, { headers: { 'x-workspace': 'tester' } })).json();
    assert.equal(runs.runs.length, 2);
    const d = await (await fetch(`${url}/api/diagram?name=scope-gate`)).json();
    assert.match(d.title, /Scope gates/);
    const fallback = await (await fetch(`${url}/api/diagram?name=../../etc/passwd`)).json();
    assert.match(fallback.title, /Nested-claim gate/);
  });
});
