// The AgentCore console: the computed scorecard, every action and probe, the state machine, the per-workspace store and the HTTP routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VERTICALS, DEFAULT_CAST } from '../src/cast.js';
import { ConsoleLab, bypassDiff, bypassOpen, parseEndpoint, principalsOf, scorecard, seedGateway } from '../src/consoleLab.js';
import { CHECKS, MAX_AUDIT } from '../src/consoleData.js';
import { createConsoleStore } from '../src/consoleStore.js';
import { call, withServer } from './helpers.js';

const fresh = () => new ConsoleLab(DEFAULT_CAST);
const status = (lab, f) => { try { f(lab); return null; } catch (e) { return `${e.status} ${e.code}`; } };
const snap = (lab) => JSON.stringify(lab.view());
const green = (gw, id) => scorecard(gw).checks.find((c) => c.id === id).green;

test('the scorecard is computed: twelve checks in the swagger\'s order, a green count that follows the state', () => {
  const gw = seedGateway(DEFAULT_CAST);
  const sc = scorecard(gw);
  assert.deepEqual(sc.checks.map((c) => c.id), CHECKS.map((c) => c[0]));
  assert.equal(sc.total, 12);
  assert.equal(sc.greenCount, sc.checks.filter((c) => c.green).length);
  assert.equal(sc.greenCount, 7);
});

test('each of the twelve checks flips with the one field it reads (a mutant that ignores the field survives none of these)', () => {
  const flip = (id, mutate) => { const gw = seedGateway(DEFAULT_CAST); const before = green(gw, id); const n = scorecard(gw).greenCount; mutate(gw); assert.equal(green(gw, id), !before, id); assert.equal(scorecard(gw).greenCount, n + (before ? -1 : 1), `${id}: only that check moves`); };
  flip('authorizer', (g) => { g.authorizer.type = 'NONE'; });
  flip('audience-pinning', (g) => { g.authorizer.audiences = []; });
  flip('enforcement', (g) => { g.engine.mode = 'ENFORCE'; });
  flip('policy-scope', (g) => { g.engine.policyCount = 0; });
  flip('enforcement-health', (g) => { g.engine.status = 'ERROR'; });
  flip('caller-pinning', (g) => { g.pinnedEndpoint = 'https://x.example'; });
  flip('throttling', (g) => { g.rateLimit = 0; });
  flip('waf', (g) => { g.wafFailureMode = 'fail-closed'; });
  flip('egress-privacy', (g) => { g.egress = 'public'; });
  flip('content-checks', (g) => { g.contentChecks = false; });
  flip('bypass-closed', (g) => { g.runtimes.forEach((r) => { r.callers = r.callers.map((c) => ({ ...c, direct: false })); r.resourcePolicy = 'gateway-only'; }); });
  flip('network-paths', (g) => { g.runtimes.forEach((r) => { r.networkMode = 'VPC'; }); });
  const wild = seedGateway(DEFAULT_CAST); wild.authorizer.audiences = ['*']; assert.equal(green(wild, 'audience-pinning'), false, 'a wildcard audience is not pinned');
});

test('bypass is open when the resource policy is not gateway-only OR any caller reaches the runtime directly', () => {
  const rt = { resourcePolicy: 'gateway-only', callers: [{ principal: 'p', viaGateway: true, direct: false }] };
  assert.equal(bypassOpen(rt), false);
  assert.equal(bypassOpen({ ...rt, resourcePolicy: 'direct-allowed' }), true);
  assert.equal(bypassOpen({ ...rt, callers: [{ principal: 'p', viaGateway: true, direct: true }] }), true);
  const diff = bypassDiff(seedGateway(DEFAULT_CAST));
  assert.deepEqual(diff[0].bypassOnly, ['role-lab-batch-job']);
  assert.deepEqual(diff[0].gatewayMediated, ['role-lab-orders-agent']);
  assert.deepEqual(diff[1], { runtime: 'rt-2', gatewayMediated: [], bypassOnly: [] });
});

test('set-target: disable and enable, the effect shows in the scorecard-free state and a probe, the same state twice is 409', () => {
  const lab = fresh();
  const r = lab.act({ kind: 'set-target', target: 'tg-1', enabled: false });
  assert.equal(r.enabled, false); assert.equal(lab.gw.targets[0].enabled, false);
  assert.equal(lab.probe({ kind: 'gateway-call', principal: 'role-lab-orders-agent', target: 'tg-1' }).outcome, 'refused');
  assert.equal(status(lab, (l) => l.act({ kind: 'set-target', target: 'tg-1', enabled: false })), '409 already_in_state');
  lab.act({ kind: 'set-target', target: 'tg-1', enabled: true });
  assert.equal(lab.probe({ kind: 'gateway-call', principal: 'role-lab-orders-agent', target: 'tg-1' }).outcome, 'allowed');
  assert.equal(status(lab, (l) => l.act({ kind: 'set-target', target: 'nope', enabled: true })), '404 unknown_target');
  for (const enabled of ['false', 0, null, undefined]) assert.equal(status(lab, (l) => l.act({ kind: 'set-target', target: 'tg-1', enabled })), '400 bad_value');
});

test('set-waf: both modes, the check follows, the same mode twice is 409, other values are 400', () => {
  const lab = fresh();
  assert.equal(green(lab.gw, 'waf'), false);
  lab.act({ kind: 'set-waf', mode: 'fail-closed' }); assert.equal(green(lab.gw, 'waf'), true);
  assert.equal(status(lab, (l) => l.act({ kind: 'set-waf', mode: 'fail-closed' })), '409 already_in_state');
  lab.act({ kind: 'set-waf', mode: 'fail-open' }); assert.equal(green(lab.gw, 'waf'), false);
  for (const mode of ['FAIL_OPEN', '', 5, null, undefined, 'fail-closed ']) assert.equal(status(lab, (l) => l.act({ kind: 'set-waf', mode })), '400 bad_value');
});

test('set-enforcement: ENFORCE needs the exact typed gateway name; a wrong, missing, cased or padded one is 403 and changes nothing; going back needs none', () => {
  const lab = fresh(); const name = lab.gw.name;
  const before = snap(lab);
  for (const confirm of [undefined, '', 'nope', name.toUpperCase(), `${name} `, ` ${name}`, `${name}x`, 5, null, [name], { a: 1 }]) {
    assert.equal(status(lab, (l) => l.act({ kind: 'set-enforcement', mode: 'ENFORCE', confirm })), '403 confirmation_mismatch', JSON.stringify(confirm));
    assert.equal(snap(lab), before, 'a refusal changes nothing, not even the audit');
  }
  const r = lab.act({ kind: 'set-enforcement', mode: 'ENFORCE', confirm: name });
  assert.equal(r.engineMode, 'ENFORCE'); assert.equal(green(lab.gw, 'enforcement'), true);
  assert.equal(status(lab, (l) => l.act({ kind: 'set-enforcement', mode: 'ENFORCE', confirm: name })), '409 already_in_state');
  assert.equal(lab.act({ kind: 'set-enforcement', mode: 'LOG_ONLY' }).engineMode, 'LOG_ONLY', 'going back to log-only needs no confirmation (the lab\'s call)');
  assert.equal(status(lab, (l) => l.act({ kind: 'set-enforcement', mode: 'enforce', confirm: name })), '400 bad_value');
  assert.equal(new ConsoleLab(VERTICALS.finance).gw.name, 'fabrikam-gateway', 'the name to type follows the vertical');
});

test('close-bypass: reports who is locked out (computed), flips the check, closing twice or closing a closed route is 409', () => {
  const lab = fresh();
  assert.equal(status(lab, (l) => l.act({ kind: 'close-bypass', runtime: 'rt-2' })), '409 already_in_state');
  const r = lab.act({ kind: 'close-bypass', runtime: 'rt-1' });
  assert.deepEqual(r.lockedOut, ['role-lab-batch-job']);
  assert.deepEqual(r.stillMediated, ['role-lab-orders-agent']);
  assert.equal(green(lab.gw, 'bypass-closed'), true);
  assert.equal(lab.probe({ kind: 'direct-runtime', principal: 'role-lab-batch-job', runtime: 'rt-1' }).outcome, 'denied');
  assert.equal(status(lab, (l) => l.act({ kind: 'close-bypass', runtime: 'rt-1' })), '409 already_in_state');
  assert.equal(status(lab, (l) => l.act({ kind: 'close-bypass', runtime: 'rt-9' })), '404 unknown_runtime');
  assert.equal(status(lab, (l) => l.act({ kind: 'close-bypass' })), '404 unknown_runtime');
});

test('pin-endpoint: https on a reserved host only; path, port, userinfo, query, http, real hosts and credential-looking text are all refused', () => {
  const lab = fresh();
  assert.equal(lab.act({ kind: 'pin-endpoint', endpoint: 'https://GW.Northwind.Example' }).pinnedEndpoint, 'https://gw.northwind.example');
  assert.equal(green(lab.gw, 'caller-pinning'), true);
  assert.equal(status(lab, (l) => l.act({ kind: 'pin-endpoint', endpoint: 'https://gw.northwind.example' })), '409 already_in_state');
  assert.equal(lab.act({ kind: 'pin-endpoint', endpoint: 'https://other.example.invalid' }).pinnedEndpoint, 'https://other.example.invalid');
  const before = snap(lab);
  for (const e of ['http://gw.example', 'https://gw.example/path', 'https://gw.example:8443', 'https://u:p@gw.example', 'https://gw.example/?q=1', 'https://gw.example/#f', 'https://real-company.com', 'https://gw.example.com',
    'gw.example', '', 'https://', 'x'.repeat(200), 5, null, {}, ['https://gw.example'], 'https://ghp_AbCdEfGhIjKlMnOp1234.example', 'https://%67w.example/%70assword=Zq9vLm', 'ftp://gw.example', 'https://gw_underscore.example', 'https://-gw.example']) {
    assert.equal(status(lab, (l) => l.act({ kind: 'pin-endpoint', endpoint: e })), '400 bad_endpoint', String(e).slice(0, 30));
  }
  assert.equal(snap(lab), before);
  assert.equal(parseEndpoint('https://gw.example.'), 'https://gw.example', 'a trailing dot is dropped');
});

test('end-session: removes exactly that session, the second end is 404, ids must be text', () => {
  const lab = fresh();
  assert.equal(lab.act({ kind: 'end-session', session: 's-0002' }).principal, 'role-lab-batch-job');
  assert.deepEqual(lab.gw.sessions.map((s) => s.id), ['s-0001', 's-0003']);
  assert.equal(status(lab, (l) => l.act({ kind: 'end-session', session: 's-0002' })), '404 unknown_session');
  for (const s of [undefined, 5, null, {}, ['s-0001'], '__proto__']) assert.equal(status(lab, (l) => l.act({ kind: 'end-session', session: s })), '404 unknown_session');
});

test('an action is applied whole or refused whole: unknown fields, unknown kinds, wrong types change nothing', () => {
  const lab = fresh(); const before = snap(lab);
  for (const a of [{ kind: 'set-waf', mode: 'fail-closed', extra: 1 }, { kind: 'set-waf', mode: 'fail-closed', confirm: 'x' }, { kind: 'set-target', target: 'tg-1', enabled: false, mode: 'x' }, { kind: 'pin-endpoint', endpoint: 'https://a.example', session: 'x' },
    { kind: 'nope' }, { kind: '__proto__' }, { kind: 'constructor' }, { kind: 5 }, {}, { mode: 'fail-closed' }, { kind: 'set-waf', mode: 'fail-closed', __proto__x: 1 }]) {
    assert.ok(status(lab, (l) => l.act(a)), JSON.stringify(a));
  }
  for (const a of [null, [], 'x', 5, undefined]) assert.equal(status(lab, (l) => l.act(a)), '400 bad_request');
  assert.equal(snap(lab), before);
  assert.equal(status(lab, (l) => l.act(JSON.parse('{"kind":"set-waf","mode":"fail-closed","__proto__":{"a":1}}'))), '400 unknown_field');
});

test('the audit trail records each change with the computed scorecard before and after, and the cap refuses the WHOLE request before mutating', () => {
  const lab = fresh();
  const r = lab.act({ kind: 'set-waf', mode: 'fail-closed' });
  assert.deepEqual(lab.view().audit[0], { n: 1, kind: 'set-waf', wafFailureMode: 'fail-closed', scorecardBefore: 7, scorecardAfter: 8 });
  assert.deepEqual(r.scorecardChange, { before: 7, after: 8, total: 12 });
  for (let i = 1; i < MAX_AUDIT; i++) lab.act({ kind: 'set-target', target: 'tg-1', enabled: i % 2 === 0 });
  assert.equal(lab.view().audit.length, MAX_AUDIT);
  const before = snap(lab);
  assert.equal(status(lab, (l) => l.act({ kind: 'set-waf', mode: 'fail-open' })), '429 audit_full');
  assert.equal(snap(lab), before, 'nothing was changed and nothing was dropped');
  assert.equal(lab.view().audit[0].n, 1, 'the oldest entry is still there: nothing was evicted');
});

test('probes: the gateway-call matrix over principal x target x engine mode, disabled targets, and the wildcard policy', () => {
  const lab = fresh();
  const gc = (principal, target) => lab.probe({ kind: 'gateway-call', principal, target });
  for (const [p, t, logOnly, enforce] of [
    ['role-lab-orders-agent', 'tg-1', 'allowed', 'allowed'], ['role-lab-batch-job', 'tg-1', 'allowed', 'denied'], ['role-lab-unknown', 'tg-1', 'allowed', 'denied'],
    ['role-lab-batch-job', 'tg-2', 'allowed', 'allowed'], ['role-lab-orders-agent', 'tg-2', 'allowed', 'denied'],
    ['role-lab-unknown', 'tg-3', 'allowed', 'allowed'], ['role-lab-analyst', 'tg-3', 'allowed', 'allowed'],
  ]) assert.equal(gc(p, t).outcome, logOnly, `log-only ${p} ${t}`);
  assert.match(gc('role-lab-unknown', 'tg-1').policy, /logged only/);
  lab.act({ kind: 'set-enforcement', mode: 'ENFORCE', confirm: lab.gw.name });
  for (const [p, t, , enforce] of [
    ['role-lab-orders-agent', 'tg-1', 0, 'allowed'], ['role-lab-batch-job', 'tg-1', 0, 'denied'], ['role-lab-unknown', 'tg-1', 0, 'denied'],
    ['role-lab-batch-job', 'tg-2', 0, 'allowed'], ['role-lab-orders-agent', 'tg-2', 0, 'denied'], ['role-lab-unknown', 'tg-3', 0, 'allowed'],
  ]) assert.equal(gc(p, t).outcome, enforce, `enforce ${p} ${t}`);
  assert.equal(gc('role-lab-unknown', 'tg-1').engineMode, 'ENFORCE');
  lab.act({ kind: 'set-target', target: 'tg-3', enabled: false });
  assert.equal(gc('role-lab-unknown', 'tg-3').outcome, 'refused');
});

test('probes: the WAF outage drill follows the failure mode and the direct-runtime probe follows the callers; probes never change state', () => {
  const lab = fresh(); const before = snap(lab);
  assert.equal(lab.probe({ kind: 'waf-outage' }).outcome, 'passed unscreened');
  assert.equal(lab.probe({ kind: 'direct-runtime', principal: 'role-lab-batch-job', runtime: 'rt-1' }).outcome, 'allowed');
  assert.equal(lab.probe({ kind: 'direct-runtime', principal: 'role-lab-batch-job', runtime: 'rt-2' }).outcome, 'denied');
  assert.equal(lab.probe({ kind: 'direct-runtime', principal: 'role-lab-unknown', runtime: 'rt-1' }).outcome, 'denied');
  assert.equal(lab.probe({ kind: 'direct-runtime', principal: 'role-lab-orders-agent', runtime: 'rt-1' }).bypassRoute, 'open');
  assert.equal(snap(lab), before);
  lab.act({ kind: 'set-waf', mode: 'fail-closed' });
  assert.equal(lab.probe({ kind: 'waf-outage' }).outcome, 'blocked');
  for (const p of [{ kind: 'gateway-call', target: 'nope', principal: 'role-lab-batch-job' }, { kind: 'gateway-call', target: 'tg-1', principal: 'nobody' }, { kind: 'gateway-call', target: 'tg-1' }, { kind: 'direct-runtime', runtime: 'rt-9', principal: 'role-lab-batch-job' },
    { kind: 'direct-runtime', runtime: 'rt-1', principal: 5 }, { kind: 'waf-outage', extra: 1 }, { kind: 'nope' }, { kind: '__proto__' }, {}, null, []]) assert.ok(status(lab, (l) => l.probe(p)), JSON.stringify(p));
  assert.deepEqual(principalsOf(lab.gw), ['role-lab-analyst', 'role-lab-batch-job', 'role-lab-orders-agent', 'role-lab-unknown']);
});

test('a Reset-style new lab starts from the seed again; two labs never share state', () => {
  const a = fresh(); const b = fresh();
  a.act({ kind: 'set-waf', mode: 'fail-closed' });
  assert.equal(b.gw.wafFailureMode, 'fail-open');
  assert.equal(snap(fresh()), snap(b));
});

test('the store: one lab per workspace and vertical, reads never create one, a new workspace is refused at the cap (nothing evicted), idle ones expire, reset is per workspace', () => {
  let t = 0;
  const store = createConsoleStore({ max: 2, ttlMs: 1000, now: () => t });
  store.lab('a', 'retail', DEFAULT_CAST).act({ kind: 'set-waf', mode: 'fail-closed' });
  store.lab('b', 'retail', DEFAULT_CAST);
  assert.equal(store.size(), 2);
  assert.throws(() => store.lab('c', 'retail', DEFAULT_CAST), (e) => e.status === 429 && e.code === 'too_many_workspaces');
  assert.equal(store.lab('a', 'retail', DEFAULT_CAST).gw.wafFailureMode, 'fail-closed', 'a was not evicted');
  assert.equal(store.lab('a', 'finance', VERTICALS.finance).gw.wafFailureMode, 'fail-open', 'another vertical is another lab');
  assert.equal(store.peek('zzz', 'retail', DEFAULT_CAST).gw.wafFailureMode, 'fail-open');
  assert.equal(store.size(), 2, 'a read created nothing');
  store.reset('a'); assert.equal(store.peek('a', 'retail', DEFAULT_CAST).gw.wafFailureMode, 'fail-open'); assert.equal(store.size(), 1);
  t = 5000; assert.equal(store.size(), 0, 'idle workspaces expire');
  assert.doesNotThrow(() => store.lab('c', 'retail', DEFAULT_CAST));
});

// ---------- HTTP ----------
test('HTTP: GET the console (a read creates nothing), act, probe, see the state, Reset; per-workspace isolation; hops carry a traceparent', async () => {
  const consoles = createConsoleStore();
  await withServer(async (url) => {
    const g = await call(url, 'GET', '/api/agentcore-console', undefined, { ws: 'k-a' });
    assert.equal(g.status, 200);
    assert.match(g.json.story.banner, /^Ping release claim, UNVERIFIED/);
    assert.equal(g.json.scorecard.greenCount, 7); assert.equal(consoles.size(), 0);
    const a = await call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-waf', mode: 'fail-closed' }, { ws: 'k-a' });
    assert.equal(a.status, 200); assert.equal(a.json.scorecardChange.after, 8); assert.equal(a.json.scorecard.greenCount, 8); assert.equal(a.json.gateway.wafFailureMode, 'fail-closed');
    assert.match(a.headers.get('traceparent'), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/); assert.match(a.json.hops[0].traceparent, /^00-/);
    assert.equal((await call(url, 'GET', '/api/agentcore-console', undefined, { ws: 'k-b' })).json.gateway.wafFailureMode, 'fail-open');
    const p = await call(url, 'POST', '/api/agentcore-console/probe', { kind: 'waf-outage' }, { ws: 'k-a' });
    assert.equal(p.json.outcome, 'blocked');
    assert.equal((await call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-waf', mode: 'fail-closed' }, { ws: 'k-a' })).status, 409);
    assert.equal((await call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-waf', mode: 'fail-closed', vertical: 'finance' }, { ws: 'k-a' })).json.gateway.name, 'fabrikam-gateway');
    assert.equal((await call(url, 'POST', '/api/reset', {}, { ws: 'k-a' })).status, 200);
    assert.equal((await call(url, 'GET', '/api/agentcore-console', undefined, { ws: 'k-a' })).json.gateway.wafFailureMode, 'fail-open', 'Reset clears the console too');
  }, { consoles });
});

test('HTTP: honest statuses on refusal and a refusal leaves the state exactly as it was', async () => {
  await withServer(async (url) => {
    const act = (b) => call(url, 'POST', '/api/agentcore-console/act', b, { ws: 'k-s' });
    const state = async () => JSON.stringify((await call(url, 'GET', '/api/agentcore-console', undefined, { ws: 'k-s' })).json.gateway);
    await act({ kind: 'set-waf', mode: 'fail-closed' });
    const before = await state();
    for (const [b, s, e] of [
      [{ kind: 'set-enforcement', mode: 'ENFORCE' }, 403, 'confirmation_mismatch'], [{ kind: 'set-enforcement', mode: 'ENFORCE', confirm: 'wrong' }, 403, 'confirmation_mismatch'],
      [{ kind: 'set-waf', mode: 'fail-closed' }, 409, 'already_in_state'], [{ kind: 'close-bypass', runtime: 'rt-9' }, 404, 'unknown_runtime'], [{ kind: 'set-target', target: 'tg-1', enabled: 'no' }, 400, 'bad_value'],
      [{ kind: 'nope' }, 400, 'bad_action'], [{ kind: 'set-waf', mode: 'fail-open', zzz: 1 }, 400, 'unknown_field'], [{ kind: 'pin-endpoint', endpoint: 'https://real.com' }, 400, 'bad_endpoint'],
      [[], 400, 'bad_request'], [null, 400, 'bad_request'],
    ]) { const r = await act(b); assert.equal(r.status, s, JSON.stringify(b)); assert.equal(r.json.error, e, JSON.stringify(b)); assert.ok(!('state' in r.json) && !('gateway' in r.json), 'a refusal carries no state'); }
    assert.equal(await state(), before);
    assert.equal((await call(url, 'POST', '/api/agentcore-console/probe', { kind: 'gateway-call', target: 'tg-1', principal: 'nobody' }, { ws: 'k-s' })).status, 404);
    assert.equal((await call(url, 'POST', '/api/agentcore-console/probe', { kind: 'zzz' }, { ws: 'k-s' })).status, 400);
  });
});

test('HTTP: parallel requests are serialised per workspace: ten identical changes give exactly one success, nine 409s, and one audit entry', async () => {
  await withServer(async (url) => {
    const rs = await Promise.all(Array.from({ length: 10 }, () => call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-target', target: 'tg-1', enabled: false }, { ws: 'k-p' })));
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    assert.equal((await call(url, 'GET', '/api/agentcore-console', undefined, { ws: 'k-p' })).json.audit.length, 1);
    const name = (await call(url, 'GET', '/api/agentcore-console', undefined, { ws: 'k-p' })).json.gateway.name;
    const e = await Promise.all(Array.from({ length: 6 }, () => call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-enforcement', mode: 'ENFORCE', confirm: name }, { ws: 'k-p' })));
    assert.deepEqual(e.map((r) => r.status).sort(), [200, 409, 409, 409, 409, 409]);
  });
});

test('HTTP: the workspace cap refuses a NEW workspace with 429 and the existing ones keep their state', async () => {
  const consoles = createConsoleStore({ max: 2 });
  await withServer(async (url) => {
    await call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-waf', mode: 'fail-closed' }, { ws: 'k-c1' });
    await call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-waf', mode: 'fail-closed' }, { ws: 'k-c2' });
    const refused = await call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-waf', mode: 'fail-closed' }, { ws: 'k-c3' });
    assert.equal(refused.status, 429); assert.equal(refused.json.error, 'too_many_workspaces');
    assert.equal((await call(url, 'GET', '/api/agentcore-console', undefined, { ws: 'k-c2' })).json.gateway.wafFailureMode, 'fail-closed', 'the existing workspace survived');
    assert.equal((await call(url, 'GET', '/api/agentcore-console', undefined, { ws: 'k-c3' })).status, 200, 'a read of a new workspace still works and creates nothing');
    assert.equal(consoles.size(), 2);
  }, { consoles });
});

test('HTTP: the audit cap is 429 with the whole request refused', async () => {
  await withServer(async (url) => {
    let last;
    for (let i = 0; i < MAX_AUDIT + 1; i++) last = await call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-target', target: 'tg-2', enabled: i % 2 === 0 ? false : true }, { ws: 'k-cap' });
    assert.equal(last.status, 429); assert.equal(last.json.error, 'audit_full');
    const v = (await call(url, 'GET', '/api/agentcore-console', undefined, { ws: 'k-cap' })).json;
    assert.equal(v.audit.length, MAX_AUDIT);
    assert.equal((await call(url, 'POST', '/api/reset', {}, { ws: 'k-cap' })).status, 200);
    assert.equal((await call(url, 'POST', '/api/agentcore-console/act', { kind: 'set-waf', mode: 'fail-closed' }, { ws: 'k-cap' })).status, 200);
  });
});
