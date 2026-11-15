// "What Privilege did" for the nested-claim gate: the trace in the POST /api/evaluate reply. Mock only, so every decision is "checked"
// (evaluateClaims computed it) and the trace passes the shared contract (assertTrace) with no secret in it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer, call } from './helpers.js';
import { assertTrace, mockTrace, realTrace } from '../src/gatewayTrace.js';
import { SECRETS, needleOf } from './secrets.js';

const evaluate = (url, body) => call(url, 'POST', '/api/evaluate', body);

test('a scenario reply carries a mock trace that satisfies the contract: one checked decision per required claim, in rule order', async () => {
  await withServer(async (url) => {
    const { json } = await evaluate(url, { scenario: 'allowed' });
    assert.deepEqual(assertTrace(json.trace), []);
    assert.equal(json.trace.source, 'mock');
    assert.equal(json.trace.response.status, 200);
    assert.deepEqual(json.trace.decisions.map((d) => d.id), json.checks.map((c) => `claim-${c.path}`));
    assert.deepEqual(json.trace.decisions.map((d) => d.outcome), json.checks.map((c) => (c.ok ? 'pass' : 'fail')));
    assert.ok(json.trace.decisions.every((d) => d.basis === 'checked'));
    assert.match(json.trace.request.headers.authorization, /^Bearer <MOCK-ISSUED token, scenario: allowed>$/, 'the placeholder survives the reply mask');
    assert.match(new URL(json.trace.request.url).hostname, /\.invalid$/);
    assert.equal(json.trace.response.headers.traceparent, json.hops[0].traceparent);
  });
});

test('the act-as-text trap is a 403 whose failing decision is the nested claim, with the reason the engine computed', async () => {
  await withServer(async (url) => {
    const { json } = await evaluate(url, { scenario: 'act-text' });
    assert.deepEqual(assertTrace(json.trace), []);
    assert.equal(json.decision, 'deny');
    assert.equal(json.trace.response.status, 403);
    const failed = json.trace.decisions.filter((d) => d.outcome === 'fail');
    assert.deepEqual(failed.map((d) => d.id), ['claim-act.sub']);
    assert.match(failed[0].evidence, /not an object/);
  });
});

test('the trace never holds the token claims, and nothing secret when a visitor types a credential into a custom token', async () => {
  await withServer(async (url) => {
    const scen = await evaluate(url, { scenario: 'allowed' });
    assert.ok(!JSON.stringify(scen.json.trace).includes('MOCK-SIGNATURE'));
    let ran = 0;
    for (const secret of SECRETS) {
      const { status, json, text } = await evaluate(url, { token: { client_id: secret, act: { sub: secret } }, rule: { requiredClaims: [{ path: 'client_id', equals: 'a' }, { path: 'act.sub', equals: 'a' }] } });
      if (status !== 200) continue;
      ran++;
      assert.deepEqual(assertTrace(json.trace), []);
      assert.ok(!JSON.stringify(json.trace).includes(needleOf(secret)), `the trace leaks ${secret.slice(0, 12)}`);
      assert.ok(!text.includes(needleOf(secret)));
    }
    assert.ok(ran > 5, 'the sweep ran');
  });
});

test('the shared contract has teeth here: a "checked" decision in a real trace, and a full bearer token, are both reported', () => {
  const real = realTrace({ url: 'https://gw.invalid/x', authorization: 'Bearer x', rpc: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, status: 200, headers: {}, body: { result: { tools: [] } } });
  assert.deepEqual(assertTrace(real), []);
  assert.ok(assertTrace({ ...real, decisions: [{ ...real.decisions[0], basis: 'checked' }] }).length > 0);
  const mock = mockTrace({ url: 'https://gw.invalid/x', authorization: 'Bearer x', rpc: null, status: 200, body: null, decisions: [{ id: 'a', label: 'A', outcome: 'pass', evidence: 'e' }] });
  assert.deepEqual(assertTrace(mock), []);
  assert.ok(mock.decisions.every((d) => d.basis === 'checked'));
});
