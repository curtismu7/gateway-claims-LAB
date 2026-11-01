// Builds content-pack.json for the Learning Hub from the story data, so the pack cannot drift from the lab.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CAST } from '../server/src/cast.js';
import { buildStory } from '../server/src/story.js';
import { WHY } from '../server/src/releaseClaims.js';
import { NOT_MEASURED } from '../server/src/latestData.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export function buildPack() {
  const story = buildStory(DEFAULT_CAST);
  const sid = (n) => `S${String(n).padStart(2, '0')}`;
  const terms = { allowed: ['required-claims', 'flattened-claims'], 'wrong-act-sub': ['act-claim'], 'no-act': ['act-claim'], 'act-text': ['act-claim', 'flattened-claims'], 'wrong-client': ['required-claims'] };
  return {
    schema: 'demo-content-pack/1',
    id: 'gateway-claims-lab',
    title: 'Gateway Claims LAB',
    version,
    demo: { id: 'gateway-claims-lab', name: 'Gateway Claims LAB', catalog: 'D99', baseUrl: 'http://localhost:5150', doctor: '/api/health', tags: ['mcp', 'agent', 'claims', 'privilege', 'mock-only', 'token-exchange', 'agentcore'] },
    glossary: [
      { id: 'act-claim', term: 'act claim (actor)', definition: 'A token claim naming the party acting on behalf of the subject (RFC 8693). In this lab it must be an OBJECT with a sub, such as {"sub": "orders-agent"}. The text "{}" is not an object and act.sub then does not exist.', aliases: ['act.sub', 'RFC 8693'] },
      { id: 'required-claims', term: 'RequiredClaims', definition: 'A mock Privilege policy rule shape: a list of claim paths and the values they must equal. All must match or the call is denied.', aliases: ['required claims'] },
      { id: 'token-exchange', term: 'Token exchange (on-behalf-of)', definition: 'Ping release claim, UNVERIFIED on our tenant: the gateway swaps the caller\'s verified token (RFC 8693) for one minted for the downstream MCP server, so the backend validates a token issued to it instead of trusting a shared service account. In this lab it is the lab\'s own model, with a keyed-hash stand-in for a signature.', aliases: ['RFC 8693', 'OBO', 'on-behalf-of'] },
      { id: 'act-chain', term: 'act claim chain', definition: 'Ping release claim, UNVERIFIED on our tenant: the act claim preserves who the original caller was. When the caller token already carried an act, the lab nests it beneath the new one (one level per hop, capped at three actors: a lab-invented cap).', aliases: ['delegation chain'] },
      { id: 'gateway-scorecard', term: 'Gateway scorecard (twelve checks)', definition: 'Ping release claim, UNVERIFIED on our tenant: the console schema names a twelve-check compliance verdict per AgentCore gateway with a green-count score. The lab computes a score from the state of one modelled gateway; what makes each check green is the lab\'s reading.', aliases: ['GatewayScorecardJSON'] },
      { id: 'unmeasured-release', term: 'Not yet measured (2026-11-02 release)', definition: 'Ping release claim, UNVERIFIED on our tenant: features named for the 2026-11-02 release that we have not seen on our tenant. This lab lists each with our reading of its name and what a test would need; nothing is verified.', aliases: ['UNVERIFIED', 'entitlement-aware discovery', 'aggregate cap', 'OBO redeem', 'scope layers', 'hold'] },
      { id: 'flattened-claims', term: 'Flattened claims', definition: 'A token turned into dotted paths such as act.sub, so a rule can address a nested claim. That nested matching is new in gateway v1.261024 is an INFERENCE from binary symbols: UNVERIFIED.', aliases: ['dotted path', 'FlatClaims'] },
    ],
    // The two release tabs (H2 2026): glossary terms, a concept card each and a "why it matters" card each, all marked as Ping release claims.
    sources: [
      { id: 'rfc8693', title: 'RFC 8693: OAuth 2.0 Token Exchange', url: 'https://www.rfc-editor.org/rfc/rfc8693', kind: 'standard', use: 'Defines the act (actor) claim.', status: 'not-read', checked: '2026-10-27' },
    ],
    cards: [
      ...story.scenarios.map((sc, i) => ({ id: `try-${sc.id}`, label: `Scenario ${i + 1}: ${sc.title}`, description: sc.lesson, group: 'try-it', action: { type: 'route', href: `/#scenario-${sc.id}` }, terms: terms[sc.id], story: sid(i + 1) })),
      { id: 'concept-posture', label: 'AgentCore gateway posture (shape only)', description: 'Mock gateway, policy-engine and account posture fields. Shape only, values invented, UNVERIFIED against the real product.', group: 'concept', action: { type: 'route', href: '/#posture' } },
      { id: 'concept-latest', label: 'Gateway v1.261029 and v1.261030: what changed, and what we have not measured', description: `Lab readings, UNVERIFIED: nine changes read from the gateway binaries (never run), the registry facts, and the five 2026-11-02 release features we have not measured (${NOT_MEASURED.map((f) => f.feature).join(', ')}), each with what a test would need.`, group: 'concept', action: { type: 'route', href: '/#latest' }, terms: ['unmeasured-release'] },
      { id: 'concept-obo', label: 'On-behalf-of (RFC 8693): the backend gets its own token', description: 'Ping release claim, UNVERIFIED on our tenant. Thirteen scenarios: the exchanged token (aud is the backend, act names the caller), a chain, and every check that refuses. Each row says whether it is a deck claim, a swagger name, a lab reading or lab-invented.', group: 'concept', action: { type: 'route', href: '/#obo' }, terms: ['token-exchange', 'act-chain'] },
      { id: 'why-obo', label: 'Why it matters: on-behalf-of (Ping claims, slide 48)', description: `Per Ping's deck (slide ${WHY.obo.slide}), UNVERIFIED on our tenant. Challenge: ${WHY.obo.challenge} Technical value: ${WHY.obo.technical} Business value: ${WHY.obo.business}`, group: 'concept', action: { type: 'route', href: '/#obo' }, terms: ['token-exchange'] },
      { id: 'concept-console', label: 'AgentCore gateway governance: change one gateway and watch the scorecard', description: 'Ping release claim, UNVERIFIED on our tenant. Disable a tool target, switch the WAF failure mode, close a bypass route, pin an endpoint, end a session, and flip log-only to enforcing by typing the gateway name. The scorecard is computed from the state; the values are invented.', group: 'try-it', action: { type: 'route', href: '/#console' }, terms: ['gateway-scorecard'] },
      { id: 'why-console', label: 'Why it matters: AgentCore gateway governance (Ping claims, slide 45)', description: `Per Ping's deck (slide ${WHY.console.slide}), UNVERIFIED on our tenant. Challenge: ${WHY.console.challenge} Technical value: ${WHY.console.technical} Business value: ${WHY.console.business}`, group: 'concept', action: { type: 'route', href: '/#console' }, terms: ['gateway-scorecard'] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    stories: story.scenarios.map((sc, i) => ({ id: sid(i + 1), title: sc.title, say: sc.lesson })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
  console.log('wrote content-pack.json');
}
