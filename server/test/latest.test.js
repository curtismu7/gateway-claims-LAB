import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLatestStory } from '../src/latestStory.js';
import { LATEST_FACTS, LATEST_TALK, NOT_MEASURED, RECHECK_STEPS, RELEASE_TABLE, SINCE_ROWS } from '../src/latestData.js';
import { maskDeep } from '../src/mask.js';
import { scanHosts, scanKeys } from '../src/safety.js';
import { unfilled, DEFAULT_CAST } from '../src/cast.js';
import { withServer, call } from './helpers.js';

test('the story carries the two newer versions, the registry table, nine readings, five unmeasured features and three re-check steps', () => {
  const s = buildLatestStory();
  assert.deepEqual(s.table.map((r) => r.tag), ['v1.261028', 'v1.261029', 'v1.261030']);
  assert.equal(s.since.length, 9);
  assert.deepEqual(s.notMeasured.map((f) => f.id), ['discovery', 'cap', 'obo', 'layers', 'hold']);
  assert.equal(s.recheck.length, 3);
  assert.equal(s.releaseDate, '2026-11-02');
});

test('nothing on the tab is marked verified: facts are measured, inferred or UNVERIFIED, and no field says verified', () => {
  for (const f of LATEST_FACTS) assert.ok(['measured', 'inferred', 'UNVERIFIED'].includes(f.status), f.id);
  // A fact about the 2026-11-02 release itself (its features) is never "measured": only registry and API facts are.
  for (const f of LATEST_FACTS.filter((x) => x.status === 'measured')) assert.match(f.source, /^owner note/, f.id);
  const text = JSON.stringify(buildLatestStory());
  assert.doesNotMatch(text, /"(status|tag)":"verified"/i);
  for (const r of SINCE_ROWS) assert.ok(r.reading.length > 20 && r.status === undefined, r.id); // every row is a reading, none carries a status of its own
  assert.ok(LATEST_FACTS.some((f) => f.status === 'UNVERIFIED' && /not known/.test(f.text)), 'one fact says plainly that behaviour is not known');
  for (const f of NOT_MEASURED) { assert.ok(f.reading.includes('our reading') || /already|unknown|waits/.test(f.reading), f.id); assert.ok(f.test.length > 40, f.id); }
});

test('the banner and the talk entry say UNVERIFIED, and the talk entry is in the shared talk track', async () => {
  const s = buildLatestStory();
  assert.match(s.banner, /UNVERIFIED/);
  assert.match(LATEST_TALK.say, /UNVERIFIED/);
  await withServer(async (url) => {
    const talk = (await (await fetch(`${url}/api/scenarios`)).json()).talkTrack;
    assert.ok(talk.some((t) => t.id === 'latest'));
  });
});

test('GET /api/latest answers, is uncached, and the answer passes the response mask unchanged', async () => {
  await withServer(async (url) => {
    const r = await call(url, 'GET', '/api/latest');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.json.simulated, true);
    const { simulated: _s, ...story } = r.json;
    assert.deepEqual(story, buildLatestStory());
    assert.deepEqual(maskDeep(story), story, 'a fixed lab text must not look like a credential');
    assert.equal((await call(url, 'POST', '/api/latest', {})).status, 404);
  });
});

test('the text names no host other than .example, no key-looking value, no {{token}} left, and no environment or tenant identifier', () => {
  const text = JSON.stringify([buildLatestStory(), LATEST_TALK]);
  assert.deepEqual(scanHosts(text), []);
  assert.deepEqual(scanKeys(text), []);
  assert.deepEqual(unfilled(text, DEFAULT_CAST), []);
  assert.doesNotMatch(text, /ping-devops|pingone\.|agentless|AI-DEMO|kubectl|[0-9a-f]{8}-[0-9a-f]{4}-/);
  assert.ok(RELEASE_TABLE.every((r) => r.built.startsWith('2026-10-')));
  assert.ok(RECHECK_STEPS.every((x) => x.length > 20));
});
