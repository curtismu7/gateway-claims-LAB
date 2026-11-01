// The ORIGINAL endpoints (claim gate, scope gates, AgentCore checks, runs, reset, diagram, health) get the same protection as the release tabs: credential-shaped
// text typed into any field, query, path, header or unknown key is absent from every answer, from the state afterwards, and from stdout/stderr. Ordinary input
// is unchanged. Masking is a heuristic (the page says so).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateClaims } from '../src/claims.js';
import { maskDeep, maskTypedDeep } from '../src/mask.js';
import { DEFAULT_CAST, VERTICALS } from '../src/cast.js';
import { buildStory } from '../src/story.js';
import { buildScopeStory } from '../src/scopeStory.js';
import { buildAgentcoreStory } from '../src/agentcoreStory.js';
import { buildDiagram, DIAGRAM_NAMES } from '../src/diagramData.js';
import { POSTURE } from '../src/postureData.js';
import { N, SECRETS, needleOf } from './secrets.js';
import { call, withServer } from './helpers.js';

const RULE = { requiredClaims: [{ path: 'act.sub', equals: 'orders-agent' }] };
const place = (s) => {
  const enc = encodeURIComponent(s.slice(0, 300));
  const tok = (claims) => ({ token: claims, rule: RULE });
  return [
    // POST /api/evaluate: the scenario id, every part of a custom token and rule, names as well as values
    ['POST', '/api/evaluate', { scenario: s }], ['POST', '/api/evaluate', tok({ client_id: s, act: { sub: s } })], ['POST', '/api/evaluate', tok({ [s]: 'x', act: { sub: 'a' } })], ['POST', '/api/evaluate', tok({ a: { [s]: s } })],
    ['POST', '/api/evaluate', tok({ act: s })], ['POST', '/api/evaluate', tok({ aud: [s, s], act: { sub: 'x' } })], ['POST', '/api/evaluate', { token: { act: { sub: s } }, rule: { requiredClaims: [{ path: 'act.sub', equals: s }] } }],
    ['POST', '/api/evaluate', { token: { act: { sub: 'x' } }, rule: { requiredClaims: [{ path: s, equals: s }] } }], ['POST', '/api/evaluate', { token: s, rule: RULE }], ['POST', '/api/evaluate', { token: {}, rule: s }],
    ['POST', '/api/evaluate', { token: {}, rule: { requiredClaims: [s] } }], ['POST', '/api/evaluate', { token: {}, rule: { requiredClaims: s } }], ['POST', '/api/evaluate', { scenario: 'allowed', [s]: 1 }],
    ['POST', '/api/evaluate', tok({ 'a.b': s })], ['POST', '/api/evaluate', tok({ a: 'x'.repeat(600) + s })], ['POST', '/api/evaluate', tok({ n: 1, ...Object.fromEntries(Array.from({ length: 220 }, (_, i) => [`k${i}`, s.slice(0, 20)])) })],
    // POST /api/scope-gate/evaluate
    ['POST', '/api/scope-gate/evaluate', { scenario: s }], ['POST', '/api/scope-gate/evaluate', { scenario: 'tier-read', scope: s }], ['POST', '/api/scope-gate/evaluate', { scenario: 'cedar-scope-missing', scope: `openid ${s}` }],
    ['POST', '/api/scope-gate/evaluate', { scenario: 'pf-with-resource', scope: s }], ['POST', '/api/scope-gate/evaluate', { scenario: 'tier-read', scope: { a: s } }], ['POST', '/api/scope-gate/evaluate', { scenario: 'tier-read', [s]: 1 }],
    ['POST', '/api/scope-gate/evaluate', { scenario: 'tier-read', scope: s.slice(0, 250) + ' ' + s.slice(0, 40) }],
    // POST /api/agentcore/evaluate, runs, reset
    ['POST', '/api/agentcore/evaluate', { scenario: s }], ['POST', '/api/agentcore/evaluate', { scenario: 'bypass-open', [s]: 1 }], ['GET', '/api/runs', undefined], ['POST', '/api/reset', { [s]: 1 }],
    // query, path, headers, malformed JSON
    ['GET', `/api/scenarios?vertical=${enc}`], ['GET', `/api/scope-gate?vertical=${enc}`], ['GET', `/api/diagram?vertical=${enc}&name=${enc}`], ['GET', `/api/posture?x=${enc}`], ['GET', `/api/agentcore?x=${enc}`], ['GET', `/api/info?x=${enc}`], ['GET', `/api/health?x=${enc}`],
    ['GET', `/api/${enc}`], ['POST', `/api/${enc}`, {}], ['GET', `/api/health/${enc}`], ['POST', `/api/evaluate/${enc}`, {}], ['PUT', `/${enc}`, {}], ['DELETE', `/zzz/${enc}`, {}],
    ['POST', '/api/evaluate', { scenario: 'allowed' }, { 'x-workspace': s }], ['GET', '/api/runs', undefined, { 'x-workspace': s }], ['POST', '/api/reset', {}, { 'x-workspace': s }], ['POST', '/api/scope-gate/evaluate', { scenario: 'tier-read' }, { 'x-workspace': s }],
    ['POST', '/api/evaluate', { scenario: 'allowed' }, { traceparent: s }], ['POST', '/api/scope-gate/evaluate', { scenario: 'tier-read' }, { traceparent: s }],
    ['POST', '/api/evaluate', undefined, {}, `{"token":{"a":"${s.replace(/["\\\n]/g, '')}"`],
  ].map(([m, p, body, headers, raw]) => ({ m, p, body, headers: headers || {}, raw }));
};

test('typed credential-shaped values never come back from the ORIGINAL endpoints: every field, name, query, path, header, unknown key and shape; and not in the state, stdout or stderr', async () => {
  const out = []; const err = [];
  const so = process.stdout.write.bind(process.stdout); const se = process.stderr.write.bind(process.stderr);
  await withServer(async (url) => {
    let hits = 0;
    process.stdout.write = (c, ...a) => { out.push(String(c)); return so(c, ...a); }; process.stderr.write = (c, ...a) => { err.push(String(c)); return se(c, ...a); };
    try {
      for (const s of SECRETS) {
        const needle = needleOf(s);
        for (const { m, p, body, headers, raw } of place(s)) {
          let r;
          try { r = await call(url, m, p, body, { ws: headers['x-workspace'] ? undefined : 'mx-w', headers: Object.fromEntries(Object.entries(headers).filter(([, v]) => /^[\x20-\x7e]*$/.test(v) && v.length < 7000)), raw }); } catch { continue; }
          hits++;
          const all = `${r.status} ${[...r.headers].map(([k, v]) => `${k}: ${v}`).join('\n')} ${r.text}`;
          assert.ok(!all.includes(needle), `${m} ${p.slice(0, 50)} echoed a secret (${r.status}): ${needle.slice(0, 12)}`);
          assert.ok(r.status !== 500, `${m} ${p.slice(0, 40)} gave 500`);
        }
      }
      assert.ok(hits > 1000, `exercised ${hits} requests`);
    } finally { process.stdout.write = so; process.stderr.write = se; }
    for (const ws of ['mx-w', 'default']) {
      for (const p of ['/api/runs', '/api/scenarios', '/api/scope-gate', '/api/posture', '/api/agentcore', '/api/info', '/api/health', '/api/diagram']) {
        const v = await call(url, 'GET', p, undefined, { ws });
        for (const s of SECRETS) assert.ok(!v.text.includes(needleOf(s)), `${p} holds a secret from ${s.slice(0, 20)}`);
      }
    }
  });
  for (const s of SECRETS) { assert.ok(!out.join('').includes(needleOf(s))); assert.ok(!err.join('').includes(needleOf(s))); }
});

test('a credential typed as a scope is REFUSED with fixed text (400 credential_like), a credential in a custom claim is MASKED in the answer, and the decision is the same', async () => {
  await withServer(async (url) => {
    for (const s of SECRETS.filter((x) => x.length < 200)) {
      const sc = await call(url, 'POST', '/api/scope-gate/evaluate', { scenario: 'tier-read', scope: s }, { ws: 'mx-r' });
      assert.equal(sc.status, 400); assert.ok(['credential_like', 'too_long', 'too_many'].includes(sc.json.error), sc.json.error);
    }
    const plain = await call(url, 'POST', '/api/evaluate', { token: { client_id: 'c', act: { sub: 'orders-agent' } }, rule: RULE }, { ws: 'mx-r' });
    const masked = await call(url, 'POST', '/api/evaluate', { token: { client_id: 'c', act: { sub: 'orders-agent' }, note: `password=${N}` }, rule: RULE }, { ws: 'mx-r' });
    assert.equal(masked.json.decision, plain.json.decision);
    assert.ok(!masked.text.includes(N));
    assert.ok(masked.json.flat.some((f) => f.path === 'note' && /\[masked:/.test(f.value)), 'the claim is still listed, its value masked');
    const named = await call(url, 'POST', '/api/evaluate', { token: { [`ghp_${N}AbCdEfGhIjKl`]: 'v', act: { sub: 'orders-agent' } }, rule: RULE }, { ws: 'mx-r' });
    assert.equal(named.status, 200); assert.ok(!named.text.includes(N)); assert.equal(named.json.decision, 'allow');
    const runs = (await call(url, 'GET', '/api/runs', undefined, { ws: 'mx-r' })).text;
    assert.ok(!runs.includes(N));
  });
});

test('errors name no keys, paths or values: every refusal of a custom token is fixed text', async () => {
  await withServer(async (url) => {
    const key = `ghp_${N}AbCdEfGhIjKl`; const cases = [
      { token: { [key]: 'x'.repeat(600) }, rule: RULE }, { token: { a: { [key]: 'x'.repeat(600) } }, rule: RULE }, { token: { [`${key}.b`]: 1 }, rule: RULE }, { token: { [key.repeat(4)]: 1 }, rule: RULE },
      { token: { [key]: Array.from({ length: 30 }, () => 'a') }, rule: RULE }, { token: { a: 1 }, rule: { requiredClaims: [{ path: `${key}..x`, equals: 'x' }] } },
    ];
    for (const b of cases) { const r = await call(url, 'POST', '/api/evaluate', b, { ws: 'mx-e' }); assert.equal(r.status, 400); assert.ok(!r.text.includes(N), JSON.stringify(r.json)); assert.ok(r.json.error && r.json.detail); }
  });
});

test('ORDINARY input is unchanged: custom claims, names, rules and scopes come back exactly as the pure engine gives them', async () => {
  const tokens = [
    { client_id: 'orders-agent', act: { sub: 'orders-agent' }, iss: 'https://pf.northwind.example', aud: ['https://mcp.northwind.example/orders/mcp'], exp: 1790000600, n: null, ok: true, name: 'naïve café', quoted: 'say "hi"', spaced: ' a  b ', lines: 'a\nb' },
    { act: '{}' }, { act: { sub: 'other-agent' } }, {}, { 'x-y_z': 'v', deep: { a: { b: { c: 'd' } } } },
  ];
  await withServer(async (url) => {
    for (const token of tokens) {
      const want = evaluateClaims(token, RULE);
      const r = await call(url, 'POST', '/api/evaluate', { token, rule: RULE }, { ws: 'mx-o' });
      assert.equal(r.status, 200);
      assert.deepEqual({ decision: r.json.decision, checks: r.json.checks, flat: r.json.flat }, want, JSON.stringify(token).slice(0, 60));
    }
    for (const scope of ['openid opensearch:read', 'openid opensearch:admin', '', 'a b c', 'opensearch:search']) {
      const r = await call(url, 'POST', '/api/scope-gate/evaluate', { scenario: 'tier-read', scope }, { ws: 'mx-o' });
      assert.equal(r.status, 200, scope);
    }
    assert.equal((await call(url, 'POST', '/api/scope-gate/evaluate', { scenario: 'tier-read' }, { ws: 'mx-o' })).status, 200);
  });
});

test('every FIXED lab text of the original endpoints survives the response mask unchanged (all verticals; a "token:" followed by a word would read as an assignment)', () => {
  for (const cast of Object.values(VERTICALS)) {
    const story = buildStory(cast);
    const lab = story.scenarios.map((sc) => { const r = evaluateClaims(sc.token.claims, story.rule); return { ...r }; });
    for (const doc of [story, lab, buildScopeStory(cast), buildAgentcoreStory(), POSTURE, ...DIAGRAM_NAMES.map((n) => buildDiagram(cast, n))]) assert.deepEqual(maskDeep(doc), doc);
  }
  assert.deepEqual(maskTypedDeep({ a: 'ordinary', b: [1, 'x y'], c: { d: null } }), { a: 'ordinary', b: [1, 'x y'], c: { d: null } });
  let deep = 'x'; for (let i = 0; i < 100000; i++) deep = { v: deep };
  assert.doesNotThrow(() => maskTypedDeep(deep));
});

test('the response mask covers a value the visitor never typed: a secret-looking customer.config brand is masked on EVERY endpoint that shows it', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gcl-m-')), 'customer.config.json');
  fs.writeFileSync(file, JSON.stringify({ cast: { brand: `my password is ${N}` } }));
  await withServer(async (url) => {
    for (const p of ['/api/scenarios', '/api/scope-gate', '/api/diagram', '/api/diagram?name=scope-gate', '/api/diagram?name=obo', '/api/obo', '/api/agentcore-console']) {
      const r = await call(url, 'GET', p);
      assert.equal(r.status, 200, p);
      assert.ok(!r.text.includes(N), `${p} shows the brand unmasked`);
    }
  }, { configFile: file });
});
