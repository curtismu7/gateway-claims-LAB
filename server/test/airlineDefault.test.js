// The default story is AirGuard Airlines, a fictional airline (fleet spec 2026-11-28): the `airlines` vertical pack is the
// server default and the three older packs (retail, health, finance) still work. A sweep over every default GET route
// finds no other brand.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_CAST, DEFAULT_VERTICAL, VERTICALS, verticalFrom, loadCast, unfilled } from '../src/cast.js';
import { rawStory } from '../src/story.js';
import { POSTURE } from '../src/postureData.js';
import { rawDiagram } from '../src/diagramData.js';
import { MOCK_TABLE } from '../src/consoleTableData.js';
import { withServer, call } from './helpers.js';

// Brand strings of the other packs, and the earlier airline name (retired by the 2026-11-28 decision).
const OTHER_BRANDS = /fabrikam|northwind|contoso|harbor|vellum|meridian air|meridianair/i;
const GET_ROUTES = ['/api/scenarios', '/api/scope-gate', '/api/posture', '/api/agentcore', '/api/latest', '/api/obo', '/api/agentcore-console', '/api/agentcore-console/walkthroughs', '/api/claims-users'];

test('the default vertical is airlines (AirGuard Airlines); four packs; unknown ids fall back to it', () => {
  assert.equal(DEFAULT_VERTICAL, 'airlines');
  assert.deepEqual(Object.keys(VERTICALS).sort(), ['airlines', 'finance', 'health', 'retail']);
  assert.equal(DEFAULT_CAST.castBrand, 'AirGuard Airlines');
  assert.equal(DEFAULT_CAST.castHost, 'airguard');
  assert.equal(loadCast(null).castBrand, 'AirGuard Airlines');
  for (const bad of [undefined, null, '', 'nope', '__proto__', 'Airlines']) assert.equal(verticalFrom(bad), 'airlines', String(bad));
  for (const v of ['finance', 'health', 'retail']) assert.equal(verticalFrom(v), v, `${v} is still selectable`);
});

test('the airlines pack fills every {{token}} the story, posture and diagram data use (an undefined token fails)', () => {
  assert.deepEqual(unfilled(JSON.stringify([rawStory(), POSTURE, rawDiagram()]), VERTICALS.airlines), []);
  assert.deepEqual(unfilled('a {{castBrand}} {{castTool}}', VERTICALS.airlines), ['castTool'], 'a token the pack does not define is caught');
});

test('a run with no config shows AirGuard Airlines and no other brand on any default route, and the Mock table carries an airlines pack', async () => {
  const hits = [];
  await withServer(async (url) => {
    for (const route of GET_ROUTES) {
      const r = await call(url, 'GET', route);
      assert.equal(r.status, 200, route);
      if (OTHER_BRANDS.test(r.text)) hits.push(`${route}: ${r.text.match(OTHER_BRANDS)[0]}`);
      assert.doesNotMatch(r.text, /Airlines's/, `${route}: no clumsy possessive`);
    }
    for (const name of ['claim-gate', 'obo', 'scope-gate']) {
      const r = await call(url, 'GET', `/api/diagram?name=${name}`);
      if (OTHER_BRANDS.test(r.text)) hits.push(`diagram ${name}`);
    }
    assert.match((await call(url, 'GET', '/api/scenarios')).json.title, /AirGuard Airlines agent token/);
    assert.match((await call(url, 'GET', '/api/obo')).json.title, /AirGuard Airlines gateway/);
    assert.match((await call(url, 'GET', '/api/agentcore-console')).json.story.title, /AirGuard Airlines gateway/);
    assert.match((await call(url, 'GET', '/api/claims-users')).json.title, /AirGuard Airlines agent/);
    // A run is also free of the other brands (the evaluate output echoes the cast).
    const run = await call(url, 'POST', '/api/evaluate', { scenario: 'allowed' });
    assert.equal(run.status, 200);
    if (OTHER_BRANDS.test(run.text)) hits.push('/api/evaluate');
  });
  assert.deepEqual(hits, []);
  assert.ok(MOCK_TABLE.verticals.airlines.walkthroughs.length > 0);
  assert.ok(!OTHER_BRANDS.test(JSON.stringify(MOCK_TABLE.verticals.airlines)), 'the airlines Mock table has no other brand');
});

test('the retail, health and finance packs still render their own brand, and an unknown vertical gives the airline', async () => {
  await withServer(async (url) => {
    for (const [v, brand] of [['retail', /Northwind Retail/], ['health', /Contoso Health/], ['finance', /Fabrikam Bank/]]) {
      assert.match((await call(url, 'GET', `/api/scenarios?vertical=${v}`)).json.title, brand, v);
      assert.doesNotMatch((await call(url, 'GET', `/api/obo?vertical=${v}`)).text, /AirGuard/, v);
    }
    assert.match((await call(url, 'GET', '/api/scenarios?vertical=nope')).json.title, /AirGuard Airlines/);
    assert.deepEqual((await call(url, 'GET', '/api/scenarios')).json.verticals, ['airlines', 'retail', 'health', 'finance']);
  });
});

test('customer.config.example.json names the airline default', () => {
  const ex = JSON.parse(fs.readFileSync(new URL('../../customer.config.example.json', import.meta.url), 'utf8'));
  assert.deepEqual(ex.cast, { brand: DEFAULT_CAST.castBrand, agentId: DEFAULT_CAST.castAgentId, clientId: DEFAULT_CAST.castClientId, host: DEFAULT_CAST.castHost });
});
