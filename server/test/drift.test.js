// The Mock walkthrough tables are generated from the engine. A test fails if they drift, if the talk-track doc drifts, and if the HTTP API gives a different
// result than the scripted run for the same steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MOCK_TABLE } from '../src/consoleTableData.js';
import { WALKTHROUGHS, buildMockTable } from '../src/consoleScenarios.js';
import { DEFAULT_CAST, VERTICALS } from '../src/cast.js';
import { renderTalkTrackMarkdown, rawStory } from '../src/story.js';
import { call, withServer } from './helpers.js';

test('the committed Mock table is exactly what the engine generates now (run `npm run mock-table` after a change)', () => {
  assert.deepEqual(MOCK_TABLE, buildMockTable());
  assert.deepEqual(Object.keys(MOCK_TABLE.verticals), Object.keys(VERTICALS));
  for (const v of Object.values(MOCK_TABLE.verticals)) assert.equal(v.walkthroughs.length, WALKTHROUGHS.length);
});

test('a drifted table is caught: change one recorded number and it no longer matches the engine', () => {
  const real = buildMockTable();
  const tampered = JSON.parse(JSON.stringify(real)); tampered.verticals.retail.walkthroughs[0].final.scorecard.greenCount += 1;
  assert.notDeepEqual(tampered, buildMockTable());
});

test('every walkthrough step gives the result its say promises, in every vertical', () => {
  const EXPECT = { harden: ['ok', 'ok', 'ok', 'ok'], confirmation: ['confirmation_mismatch', 'confirmation_mismatch', 'ok'], 'log-only': ['ok', 'ok', 'ok'], lockout: ['ok', 'ok', 'ok'], waf: ['ok', 'ok', 'ok'], 'disable-target': ['ok', 'ok', 'already_in_state', 'ok'] };
  assert.deepEqual(Object.keys(EXPECT), WALKTHROUGHS.map((w) => w.id));
  for (const [name, v] of Object.entries(MOCK_TABLE.verticals)) for (const w of v.walkthroughs) assert.deepEqual(w.steps.map((s) => (s.ok ? 'ok' : s.code)), EXPECT[w.id], `${name}/${w.id}`);
  const t = MOCK_TABLE.verticals.finance;
  assert.equal(t.walkthroughs.find((w) => w.id === 'log-only').steps.map((s) => s.result.outcome).filter(Boolean).join(), 'allowed,denied');
  assert.deepEqual(t.walkthroughs.find((w) => w.id === 'lockout').steps.map((s) => s.result.outcome ?? s.result.lockedOut), ['allowed', ['role-lab-batch-job'], 'denied']);
  assert.equal(t.walkthroughs.find((w) => w.id === 'harden').final.scorecard.greenCount, 11);
  assert.equal(t.walkthroughs.find((w) => w.id === 'confirmation').steps[2].params.confirm, 'fabrikam-gateway');
});

test('docs/talk-track.md is exactly what the talk-track data generates (run `npm run talk-track`), and every entry is in it', () => {
  const doc = fs.readFileSync(new URL('../../docs/talk-track.md', import.meta.url), 'utf8');
  assert.equal(doc, renderTalkTrackMarkdown(DEFAULT_CAST));
  for (const id of ['obo', 'why-obo', 'console', 'why-console']) assert.ok(rawStory().talkTrack.some((t) => t.id === id), id);
  for (const t of rawStory().talkTrack) assert.ok(doc.includes(`## ${t.title}`), t.id);
});

test('each new talk-track entry says it is a Ping release claim, UNVERIFIED on our tenant, and the why-it-matters ones are marked as Ping claims with their slide', () => {
  const t = Object.fromEntries(rawStory().talkTrack.map((x) => [x.id, x]));
  for (const id of ['obo', 'console']) assert.match(t[id].say, /Ping release claim, UNVERIFIED on our tenant/);
  assert.match(t['why-obo'].title, /\(Ping claims\)/); assert.match(t['why-obo'].say, /slide 48/); assert.match(t['why-obo'].say, /Challenge: .*Technical value: .*Business value: /);
  assert.match(t['why-console'].title, /\(Ping claims\)/); assert.match(t['why-console'].say, /slide 45/); assert.match(t['why-console'].say, /UNVERIFIED on our tenant/);
});

test('MOCK/LIVE PARITY: replaying every walkthrough through the HTTP API gives exactly the steps and the final state the Mock table holds', async () => {
  await withServer(async (url) => {
    let n = 0;
    for (const vertical of ['retail', 'health', 'finance']) {
      for (const wt of MOCK_TABLE.verticals[vertical].walkthroughs) {
        const ws = `parity-${n++}`;
        for (const step of wt.steps) {
          const r = await call(url, 'POST', `/api/agentcore-console/${step.op === 'act' ? 'act' : 'probe'}`, { ...step.params, vertical }, { ws });
          assert.equal(r.status, step.status, `${vertical}/${wt.id}`);
          if (step.ok) { const { hops, traceId, workspace, vertical: _v, gateway, scorecard, bypassDiff, principals, audit, auditCap, scorecardChange, ...rest } = r.json; void [hops, traceId, workspace, _v, gateway, scorecard, bypassDiff, principals, audit, auditCap]; const want = { ...step.result }; if (scorecardChange === undefined) delete want.scorecardChange; assert.deepEqual({ ...rest, ...(scorecardChange ? { scorecardChange } : {}) }, want, `${vertical}/${wt.id}`); } else assert.equal(r.json.error, step.code);
        }
        const live = (await call(url, 'GET', `/api/agentcore-console?vertical=${vertical}`, undefined, { ws })).json;
        assert.deepEqual({ gateway: live.gateway, scorecard: live.scorecard, bypassDiff: live.bypassDiff, audit: live.audit }, wt.final, `${vertical}/${wt.id}`);
      }
    }
    const served = (await call(url, 'GET', '/api/agentcore-console/walkthroughs?vertical=health')).json;
    assert.deepEqual(served.walkthroughs, MOCK_TABLE.verticals.health.walkthroughs);
    assert.match(served.source, /generated from the engine/);
  });
});
