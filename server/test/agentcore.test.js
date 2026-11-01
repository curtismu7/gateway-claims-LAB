import test from 'node:test';
import assert from 'node:assert/strict';
import { GovInputError, classifyGatewayCaller, evaluateRuntimeBypass, globMatch } from '../src/agentcoreGov.js';
import { AG_FACTS, AG_SECTIONS } from '../src/agentcoreData.js';
import { buildAgentcoreStory, evaluateAgentcoreScenario } from '../src/agentcoreStory.js';
import { withServer } from './helpers.js';

const OPEN = [{ effect: 'Allow', action: 'bedrock-agentcore:*', principal: '*' }];

test('globMatch: star matches any run, case-insensitive, no regex from input', () => {
  assert.equal(globMatch('bedrock-agentcore:*', 'bedrock-agentcore:InvokeAgentRuntime'), true);
  assert.equal(globMatch('*', 'anything'), true);
  assert.equal(globMatch('bedrock-agentcore:Invoke*Runtime', 'bedrock-agentcore:InvokeAgentRuntime'), true);
  assert.equal(globMatch('s3:*', 'bedrock-agentcore:InvokeAgentRuntime'), false);
  assert.equal(globMatch('BEDROCK-AGENTCORE:INVOKEAGENTRUNTIME', 'bedrock-agentcore:invokeagentruntime'), true);
  assert.equal(globMatch('(a+)+$', 'aaaaaaaaaaaaaaaaaaaaaaaa!'), false);
  assert.equal(globMatch(5, 'x'), false);
});

test('runtime bypass: wildcard opens it, the gateway role alone does not, a Deny wins, gateway-only refuses direct callers', () => {
  const r = evaluateRuntimeBypass({ statements: OPEN, gatewayOnly: false });
  assert.equal(r.bypassPossible, true); assert.match(r.reason, /any principal with bedrock-agentcore:InvokeAgentRuntime/);
  assert.equal(evaluateRuntimeBypass({ statements: [{ effect: 'Allow', action: 'bedrock-agentcore:InvokeAgentRuntime', principal: 'role/gateway-service' }], gatewayOnly: false }).bypassPossible, false);
  assert.equal(evaluateRuntimeBypass({ statements: [...OPEN, { effect: 'Deny', action: 'bedrock-agentcore:InvokeAgentRuntime', principal: '*' }], gatewayOnly: false }).bypassPossible, false);
  assert.equal(evaluateRuntimeBypass({ statements: [{ effect: 'Allow', action: 'bedrock-agentcore:InvokeAgentRuntime', principal: 'role/other' }], gatewayOnly: false }).directInvokers[0], 'role/other');
  assert.equal(evaluateRuntimeBypass({ statements: OPEN, gatewayOnly: true }).bypassPossible, false);
  assert.equal(evaluateRuntimeBypass({ statements: [], gatewayOnly: false }).bypassPossible, false);
});

test('runtime bypass input is validated and bounded', () => {
  assert.throws(() => evaluateRuntimeBypass({ statements: 'x', gatewayOnly: false }), GovInputError);
  assert.throws(() => evaluateRuntimeBypass({ statements: Array(11).fill(OPEN[0]), gatewayOnly: false }), GovInputError);
  assert.throws(() => evaluateRuntimeBypass({ statements: [{ effect: 'Maybe', action: 'a', principal: 'b' }], gatewayOnly: false }), GovInputError);
  assert.throws(() => evaluateRuntimeBypass({ statements: [{ effect: 'Allow', action: 'x'.repeat(200), principal: 'b' }], gatewayOnly: false }), GovInputError);
});

test('gateway caller class: none, any IdP token, mixed and locked, with the N of M summary', () => {
  const t = (n, w) => Array.from({ length: n }, (_, i) => ({ name: `t${i}`, allowedWorkloads: i < w ? ['a'] : [] }));
  assert.match(classifyGatewayCaller({ authorizerType: 'NONE', targets: t(1, 0) }).callerClass, /no authentication/);
  assert.equal(classifyGatewayCaller({ authorizerType: 'CUSTOM_JWT', targets: t(2, 0) }).callerClass, 'any token from the IdP accepted');
  const mixed = classifyGatewayCaller({ authorizerType: 'CUSTOM_JWT', targets: t(2, 1) });
  assert.equal(mixed.summary, '1 of 2 target(s) without a caller allow-list'); assert.equal(mixed.risky, true);
  assert.equal(classifyGatewayCaller({ authorizerType: 'CUSTOM_JWT', targets: t(2, 2) }).risky, false);
  assert.throws(() => classifyGatewayCaller({ authorizerType: 'X', targets: t(1, 0) }), GovInputError);
  assert.throws(() => classifyGatewayCaller({ authorizerType: 'NONE', targets: [] }), GovInputError);
});

test('every scenario evaluates; facts are labelled; one UNVERIFIED; no real ids or hosts', () => {
  const ids = AG_SECTIONS.flatMap((s) => s.scenarios.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(evaluateAgentcoreScenario(id).result);
  assert.throws(() => evaluateAgentcoreScenario('nope'), GovInputError);
  assert.equal(AG_FACTS.filter((f) => f.status === 'UNVERIFIED').length, 1);
  assert.ok(AG_FACTS.every((f) => ['measured', 'inferred', 'UNVERIFIED'].includes(f.status)));
  assert.doesNotMatch(JSON.stringify(buildAgentcoreStory()), /\.ping-devops\.com|\.pingone\.|[0-9a-f]{8}-[0-9a-f]{4}-/);
});

test('GET /api/agentcore and POST /api/agentcore/evaluate', async () => {
  await withServer(async (url) => {
    const j = await (await fetch(`${url}/api/agentcore`)).json();
    assert.equal(j.version, 'v1.261028'); assert.equal(j.sections.length, 2); assert.equal(j.simulated, true);
    const post = (body) => fetch(`${url}/api/agentcore/evaluate`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url, 'x-workspace': 'ag' }, body: JSON.stringify(body) });
    const ok = await (await post({ scenario: 'bypass-open' })).json();
    assert.equal(ok.result.bypassPossible, true);
    assert.equal((await post({ scenario: 'nope' })).status, 400);
    assert.equal((await post([])).status, 400);
    const runs = await (await fetch(`${url}/api/runs`, { headers: { 'x-workspace': 'ag' } })).json();
    assert.equal(runs.runs.length, 1);
  });
});
