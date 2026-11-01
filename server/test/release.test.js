// The release tabs' data: every claim tagged, every token filled, only fake hosts, the banner words, and the wording rules (no "door").
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CAST, VERTICALS, fill, unfilled } from '../src/cast.js';
import { CLAIM_TAGS, NO_LIVE, RELEASE_BANNER, RELEASE_TABS, WHY } from '../src/releaseClaims.js';
import { BACKENDS, CLAIM_ROWS, CONFIG_ROWS, LAB_NOW, MAX_ACT_DEPTH, OBO_CONFIG, OBO_FACTS, OBO_SCENARIOS } from '../src/oboData.js';
import { CHECKS, CONSOLE_FACTS, FIELD_ROWS, MAX_AUDIT } from '../src/consoleData.js';
import { buildConsoleStory } from '../src/consoleStory.js';
import { buildOboStory } from '../src/oboStory.js';
import { scanHosts, scanKeys } from '../src/safety.js';

const everything = (cast) => [buildOboStory(cast), buildConsoleStory(cast)];

test('the five tags exist and are exactly the vocabulary the brief names', () => {
  assert.deepEqual(Object.values(CLAIM_TAGS), ['deck claim', 'console swagger name (schema only)', 'lab reading', 'lab-invented', 'measured (our note)']);
});

test('every fact, row and scenario on the release tabs carries a valid tag, and no row is tagged as measured unless it names its source', () => {
  const rows = [...OBO_FACTS, ...CLAIM_ROWS, ...CONFIG_ROWS, ...CONSOLE_FACTS, ...FIELD_ROWS, ...OBO_SCENARIOS.map((s) => ({ tag: s.evidence, id: s.id }))];
  assert.ok(rows.length > 40);
  for (const r of rows) assert.ok(Object.hasOwn(CLAIM_TAGS, r.tag), JSON.stringify(r).slice(0, 80));
  for (const f of [...OBO_FACTS, ...CONSOLE_FACTS]) { assert.ok(f.source && f.source.length > 5, f.id); if (f.tag === 'measured') assert.match(f.source, /owner note|measured/); }
  assert.equal(new Set([...OBO_FACTS, ...CONSOLE_FACTS].map((f) => f.id)).size, OBO_FACTS.length + CONSOLE_FACTS.length, 'fact ids are unique');
});

test('swagger-tagged config rows are bare field names (schema only); the write-only fields are named but never held; behaviour is tagged as a reading or the deck', () => {
  for (const r of CONFIG_ROWS) { assert.equal(r.tag, 'swagger'); assert.match(r.field, /^[A-Za-z]+$/); }
  assert.deepEqual(CONFIG_ROWS.map((r) => r.field), ['TokenURL', 'ClientID', 'ClientSecret', 'AuthMethod', 'Resource', 'Scope', 'PrivateKeyPEM', 'KeyID', 'SubjectTokenType', 'RequestedTokenType', 'Redeem']);
  assert.ok(!('ClientSecret' in OBO_CONFIG) && !('PrivateKeyPEM' in OBO_CONFIG));
  assert.equal(CLAIM_ROWS.find((r) => r.claim === 'act').tag, 'deck');
  assert.equal(CLAIM_ROWS.find((r) => r.claim === 'aud').tag, 'reading');
  for (const f of [...OBO_FACTS, ...CONSOLE_FACTS].filter((x) => x.tag === 'swagger')) assert.match(f.text, /schema|name/i, f.id);
});

test('the twelve scorecard checks are the swagger\'s twelve, in its order, and the six deck operations are tagged as deck claims', () => {
  assert.deepEqual(CHECKS.map((c) => c[0]), ['authorizer', 'audience-pinning', 'enforcement', 'policy-scope', 'enforcement-health', 'caller-pinning', 'throttling', 'waf', 'egress-privacy', 'content-checks', 'bypass-closed', 'network-paths']);
  assert.equal(FIELD_ROWS.filter((r) => r.tag === 'deck').length, 6);
  assert.ok(FIELD_ROWS.some((r) => r.tag === 'reading') && FIELD_ROWS.some((r) => r.tag === 'invented') && FIELD_ROWS.some((r) => r.tag === 'swagger'));
});

test('the banner, the no-live line and the why-it-matters lines say what the brief requires, and the release tabs are exactly obo and console', () => {
  assert.match(RELEASE_BANNER, /^Ping release claim, UNVERIFIED on our tenant/);
  assert.match(NO_LIVE, /no Live engine/);
  assert.deepEqual(RELEASE_TABS, ['obo', 'console']);
  assert.equal(WHY.obo.slide, 48); assert.equal(WHY.console.slide, 45);
  for (const w of Object.values(WHY)) for (const k of ['challenge', 'technical', 'business', 'feature']) assert.ok(w[k].length > 20, k);
  const b = buildOboStory(DEFAULT_CAST); const c = buildConsoleStory(DEFAULT_CAST);
  for (const s of [b, c]) { assert.equal(s.banner, RELEASE_BANNER); assert.equal(s.noLive, NO_LIVE); assert.deepEqual(s.tags, CLAIM_TAGS); }
});

test('every {{token}} on the release tabs is defined by every vertical, and no copy says "door"', () => {
  for (const [name, cast] of Object.entries(VERTICALS)) {
    const raw = JSON.stringify([OBO_SCENARIOS, OBO_CONFIG, BACKENDS, buildOboStory(VERTICALS.retail), buildConsoleStory(VERTICALS.retail)]);
    assert.deepEqual(unfilled(raw, cast), [], name);
    assert.deepEqual(unfilled(JSON.stringify(everything(cast)), cast), [], name);
  }
  assert.equal(fill('{{nope}}', DEFAULT_CAST), '{{nope}}');
  assert.ok(!/\bdoors?\b/i.test(JSON.stringify([everything(DEFAULT_CAST), WHY, CLAIM_ROWS])));
});

test('only .example hosts, no key-looking values, fake account ids; the lab clock and caps are the documented ones', () => {
  for (const cast of Object.values(VERTICALS)) { const t = JSON.stringify(everything(cast)); assert.deepEqual(scanHosts(t), []); assert.deepEqual(scanKeys(t), []); }
  assert.ok(!/\b\d{12}\b/.test(JSON.stringify(everything(DEFAULT_CAST))) || /000000000000/.test(JSON.stringify(everything(DEFAULT_CAST))));
  assert.equal(LAB_NOW, 1790000300); assert.equal(MAX_ACT_DEPTH, 3); assert.equal(MAX_AUDIT, 100);
});

test('no claim is presented as measured by us except the one note about the gateway tag, and nothing says the release was run', () => {
  const measured = [...OBO_FACTS, ...CONSOLE_FACTS].filter((f) => f.tag === 'measured');
  assert.equal(measured.length, 2);
  for (const m of measured) assert.match(m.text, /was not in ECR|not in ECR/);
  assert.ok(!/we (ran|measured|tested|verified)/i.test(JSON.stringify([OBO_FACTS, CONSOLE_FACTS])));
});
