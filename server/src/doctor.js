// Preflight checks shared by `npm run doctor` and GET /api/health. Never prints a secret, needs no network.
// Each check: { id, level: 'pass' | 'info' | 'fail', detail }.
import fs from 'node:fs';
import { assertBindAllowed, bindHost, portProblem, scanHosts, scanKeys, DEFAULT_PORT, PORT_MIN, PORT_MAX } from './safety.js';
import { netguardSelfTest } from './netguard.js';
import { DEFAULT_CAST, VERTICALS, unfilled } from './cast.js';
import { buildStory, rawStory } from './story.js';
import { evaluateClaims } from './claims.js';
import { POSTURE } from './postureData.js';
import { modeFrom } from './config.js';
import { DIAGRAM_NAMES, buildDiagram } from './diagramData.js';
import { buildOboStory, evaluateOboScenario } from './oboStory.js';
import { buildConsoleStory } from './consoleStory.js';
import { CLAIM_TAGS } from './releaseClaims.js';
import { buildMockTable } from './consoleScenarios.js';
import { MOCK_TABLE } from './consoleTableData.js';
import { settingsPath } from './settings.js';
import { buildLatestStory } from './latestStory.js';
import { LATEST_FACTS } from './latestData.js';

export async function runChecks({ env = process.env, cast = DEFAULT_CAST } = {}) {
  const checks = [];
  const add = (id, level, detail) => checks.push({ id, level, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 26 ? 'pass' : 'fail', `v${process.versions.node} (need >= 26)`);

  try { add('mode', 'pass', `${modeFrom(env)} (the only mode this app has: the header Live button is refused with a message)`); }
  catch (e) { add('mode', 'fail', e.message); }

  try { add('bind', 'pass', `${assertBindAllowed(bindHost(env), env)}${env.GCLAB_BIND ? ' (GCLAB_BIND opt-in)' : ' (loopback)'}`); }
  catch (e) { add('bind', 'fail', e.message); }

  const port = env.PORT === undefined || env.PORT === '' ? DEFAULT_PORT : Number(env.PORT);
  const problem = portProblem(port);
  add('port-range', problem ? 'fail' : 'pass', problem || `${port} is inside ${PORT_MIN}-${PORT_MAX} and not reserved`);

  const file = env.STANDALONE_ENV ? env.STANDALONE_ENV : settingsPath(env);
  try { const m = fs.statSync(file).mode & 0o777; add('settings-file', m & 0o077 ? 'info' : 'pass', m & 0o077 ? 'the shared settings file is readable by others: chmod 600 it' : 'the shared settings file exists and is mode 600 (values are never printed)'); }
  catch { add('settings-file', 'info', 'no shared settings file: mock mode needs none'); }

  const raw = rawStory();
  const wrong = raw.scenarios.filter((sc) => {
    const filled = buildStory(cast).scenarios.find((x) => x.id === sc.id);
    return evaluateClaims(filled.token.claims, buildStory(cast).rule).decision !== sc.expected;
  }).map((sc) => sc.id);
  add('scenarios', raw.scenarios.length >= 5 && !wrong.length ? 'pass' : 'fail', wrong.length ? `scenarios that do not give their expected decision: ${wrong.join(', ')}` : `${raw.scenarios.length} scenarios each give their expected decision`);
  const facts = raw.facts.filter((f) => !['measured', 'inferred', 'UNVERIFIED'].includes(f.status));
  add('facts-labelled', facts.length ? 'fail' : 'pass', facts.length ? 'a fact has no status label' : 'every fact is labelled measured, inferred or UNVERIFIED');
  const text = JSON.stringify([raw, POSTURE.label]);
  const holes = unfilled(text, DEFAULT_CAST);
  add('story-tokens', holes.length ? 'fail' : 'pass', holes.length ? `unfilled {{tokens}}: ${[...new Set(holes)].join(', ')}` : 'every {{cast}} token is filled');
  const badVert = Object.entries(VERTICALS).filter(([, v]) => unfilled(text, v).length).map(([k]) => k);
  add('verticals', badVert.length ? 'fail' : 'pass', badVert.length ? `verticals missing a token: ${badVert.join(', ')}` : `${Object.keys(VERTICALS).length} vertical packs fill every token`);

  const filled = JSON.stringify([buildStory(cast), POSTURE]);
  const hosts = scanHosts(filled);
  add('story-hosts', hosts.length ? 'fail' : 'pass', hosts.length ? `non-reserved hosts: ${hosts.join(', ')}` : 'every host in the story and posture data is .invalid or .example');
  const keys = scanKeys(filled);
  add('story-keys', keys.length ? 'fail' : 'pass', keys.length ? 'key-looking values that are not sk-MOCK-' : 'no key-looking values in the story');
  // The diagram is diagram-studio/1 data; diagramData validated it on import, so reaching here means it is valid.
  add('diagrams', DIAGRAM_NAMES.every((n) => buildDiagram(cast, n).steps.length > 0) ? 'pass' : 'fail', `${DIAGRAM_NAMES.length} diagram-studio/1 diagram loads and validates`);

  // The H2 2026 release tabs: every row carries a claim tag, every scenario gives the decision and code it names in every vertical, every {{token}} is
  // filled, and the Mock walkthrough table is exactly what the engine gives now.
  const releaseRows = (cast2) => { const o = buildOboStory(cast2); const k = buildConsoleStory(cast2); return [...o.facts, ...o.claimRows, ...o.configRows, ...o.scenarios.map((s) => ({ tag: s.evidence })), ...k.facts, ...k.fieldRows]; };
  const badTag = releaseRows(cast).filter((r) => !Object.hasOwn(CLAIM_TAGS, r.tag));
  add('release-tags', badTag.length ? 'fail' : 'pass', badTag.length ? `${badTag.length} row(s) on the release tabs carry no valid claim tag` : 'every row on the release tabs is tagged deck, swagger, reading, invented or measured');
  const oboWrong = Object.values(VERTICALS).flatMap((v) => { const st = buildOboStory(v); return st.scenarios.filter((s) => { const r = evaluateOboScenario(st, s.id, {}, v).result; return r.decision !== s.expected || r.code !== s.code; }).map((s) => s.id); });
  add('obo-scenarios', oboWrong.length ? 'fail' : 'pass', oboWrong.length ? `on-behalf-of scenarios that do not give their expected result: ${[...new Set(oboWrong)].join(', ')}` : `${buildOboStory(cast).scenarios.length} on-behalf-of scenarios each give their expected decision and code in every vertical`);
  const relText = JSON.stringify(Object.values(VERTICALS).map((v) => [releaseRows(v), buildOboStory(v), buildConsoleStory(v)]));
  const relHoles = unfilled(JSON.stringify([buildOboStory(cast), buildConsoleStory(cast)]), cast);
  add('release-tokens', relHoles.length ? 'fail' : 'pass', relHoles.length ? `unfilled {{tokens}} on the release tabs: ${[...new Set(relHoles)].join(', ')}` : 'every {{cast}} token on the release tabs is filled');
  const relHosts = scanHosts(relText); const relKeys = scanKeys(relText);
  add('release-hosts', relHosts.length || relKeys.length ? 'fail' : 'pass', relHosts.length ? `non-reserved hosts on the release tabs: ${relHosts.join(', ')}` : relKeys.length ? 'key-looking values on the release tabs' : 'every host on the release tabs is .invalid or .example, no key-looking values');
  let tableOk = false;
  try { tableOk = JSON.stringify(MOCK_TABLE) === JSON.stringify(buildMockTable()); } catch { /* not equal */ }
  add('mock-table', tableOk ? 'pass' : 'fail', tableOk ? 'the AgentCore console Mock table is exactly what the engine generates' : 'the AgentCore console Mock table has drifted from the engine: run `npm run mock-table`');

  // The v1.261029 + v1.261030 tab: every fact is labelled, nothing is marked verified, and the text names no real host, key or leftover token.
  const latest = JSON.stringify(buildLatestStory());
  const badFact = LATEST_FACTS.filter((f) => !['measured', 'inferred', 'UNVERIFIED'].includes(f.status));
  const latestBad = [...scanHosts(latest), ...scanKeys(latest), ...unfilled(latest, cast)];
  add('latest-tab', badFact.length || latestBad.length || /"(status|tag)":"verified"/i.test(latest) ? 'fail' : 'pass', badFact.length || latestBad.length ? 'the v1.261029 + v1.261030 text has an unlabelled fact, a non-reserved host, a key-looking value or an unfilled token' : 'every fact on the v1.261029 + v1.261030 tab is labelled, none says verified, and its text names no real host or key');

  const ng = await netguardSelfTest();
  add('netguard', ng.ok ? 'pass' : 'fail', ng.ok ? `blocked fetch, socket, socket-by-IP, dns lookup, dns resolve, udp send and udp connect to a non-loopback host (${ng.blocked}/7)` : ng.detail);

  add('tenant', 'pass', 'mock only: no tenant, no credentials, no outbound network');
  return checks;
}

export const allPassed = (checks) => checks.every((c) => c.level !== 'fail');
