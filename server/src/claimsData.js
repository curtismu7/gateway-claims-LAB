// The story as data: a mock PingFederate-style agent token, a mock Privilege rule with RequiredClaims, and five scenarios.
// Text is {{token}} templated (see cast.js) so brand, agent id, client id and host come from customer.config.json or a vertical.
// Every host ends in .example. Every token is MOCK-ISSUED here, for education: no real credential, tenant or customer.
// Source for the shape: the verified "Working configuration" of the PingFederate token / Pass Agent Token recipe (owner
// notes, verified live 2026-10-26 on gateway v1.261024). Values are invented; only the SHAPE comes from that recipe.

import { OBO_TALK } from './oboData.js';
import { CONSOLE_TALK } from './consoleData.js';
import { whyTalk } from './releaseClaims.js';
import { LATEST_TALK } from './latestData.js';

export const BANNER = 'SIMULATED, MOCK mode: a mock PingFederate-style token and a mock Privilege rule. Nothing here calls a real gateway, identity provider or tenant.';

export const TITLE = 'Gateway claim gate: nested claims on {{castBrand}}\'s agent token';
export const INTRO = 'A PingFederate-style token carries the agent as an object, act.sub. The P1 Privilege Agent App rule requires client_id and act.sub to equal the registered agent. Run five tokens against the rule and see exactly which claim decided.';

// status: measured = seen in the verified recipe; inferred = our reading; UNVERIFIED = not confirmed by any Ping source.
export const FACTS = [
  { id: 'verified-config', status: 'measured', text: 'A PingFederate token with client_id and an object-valued act.sub was accepted on gateway v1.261024 and a tools/list call returned its tools; a garbage bearer got 401.', source: 'PF token exchange recipe, "Working configuration", verified live 2026-10-26' },
  { id: 'act-must-be-object', status: 'measured', text: 'act must be an OBJECT such as {"sub": "{{castAgentId}}"}. Emitted as the text "{}" it does not work.', source: 'PF token exchange recipe, access token mapping step' },
  { id: 'required-claims-pin-agent', status: 'measured', text: 'The agent is pinned by the identity\'s required claims client_id and act.sub, while the subject stays open (*).', source: 'PF token exchange recipe, Working configuration table' },
  { id: 'nested-match-new', status: 'UNVERIFIED', text: 'That nested (dotted-path) claim matching is NEW in gateway v1.261024. This is an INFERENCE from a symbol seen in the gateway binary (workloadid.Claims.FlatClaims); no release note or Ping source confirms it.', source: 'inference from binary symbols' },
  { id: 'dotted-names', status: 'inferred', text: 'A claim NAME that contains a dot (such as a flat key "act.sub") is refused with dotted_claim_name, so it cannot pass for a nested claim. This is this app\'s own rule; how the real gateway treats such names is not confirmed.', source: 'this app\'s own rule' },
  { id: 'flatten-rules', status: 'inferred', text: 'The flattened view here (act.sub, aud.0) shows how a dotted path can address a nested claim. The real gateway\'s flattening rules (arrays, depth, non-string values) are not confirmed.', source: 'this app\'s own implementation' },
];

export const RULE = {
  name: 'Registered agent only (mock)',
  appliesTo: 'P1 Privilege Agent App https://mcp.{{castHost}}.example/orders/mcp',
  note: 'Mock shape of a Privilege policy rule with RequiredClaims. Not exported from, or checked against, a real console.',
  requiredClaims: [
    { path: 'client_id', equals: '{{castClientId}}' },
    { path: 'act.sub', equals: '{{castAgentId}}' },
  ],
};

const HEADER = { alg: 'RS256', kid: 'mock-key-1', typ: 'at+jwt' };
const base = () => ({
  iss: 'https://pf.{{castHost}}.example',
  sub: '{{castClientId}}',
  aud: 'https://mcp.{{castHost}}.example/orders/mcp',
  client_id: '{{castClientId}}',
  iat: 1790000000,
  exp: 1790000600,
});
const token = (claims) => ({ header: HEADER, claims, signature: '<MOCK-SIGNATURE: not a real signature>' });

export const SCENARIOS = [
  { id: 'allowed', title: 'Allowed: act.sub matches', expected: 'allow', lesson: 'client_id and act.sub both equal the registered agent, so the rule passes.', token: token({ ...base(), act: { sub: '{{castAgentId}}' } }) },
  { id: 'wrong-act-sub', title: 'Denied: act.sub is a different agent', expected: 'deny', lesson: 'The token is valid and signed, but it acts for another agent. The nested claim decides, not the signature.', token: token({ ...base(), act: { sub: 'other-agent' } }) },
  { id: 'no-act', title: 'Denied: no act claim at all', expected: 'deny', lesson: 'Without act there is no act.sub to match. A token that proves only a client is not enough for this rule.', token: token(base()) },
  { id: 'act-text', title: 'Denied: act emitted as the text "{}"', expected: 'deny', lesson: 'The real trap: the PingFederate mapping produced the text "{}" instead of an object, so act.sub does not exist. Fix the mapping expression, not the rule.', token: token({ ...base(), act: '{}' }) },
  { id: 'wrong-client', title: 'Denied: wrong client_id', expected: 'deny', lesson: 'act.sub is right but client_id names another client. Both required claims must match.', token: token({ ...base(), client_id: 'unregistered-client', act: { sub: '{{castAgentId}}' } }) },
];

// The talk track, as data, so the web talk-track view and presenter mode read the same words as docs/talk-track.md.
export const TALK_TRACK = [
  { id: 'say-first', title: 'Say first', say: 'Everything here is simulated. The token, the rule and the posture data are invented by this app; only their shape follows what we verified.' },
  { id: 'gate', title: 'Nested-claim gate', say: 'The agent gets a token from PingFederate. In the token, act is an object: {"sub": "{{castAgentId}}"}. The P1 Privilege Agent App has a rule with two required claims, client_id and act.sub, both equal to the registered agent. Walk the five scenarios: allowed, wrong act.sub, no act, act as the text "{}", wrong client_id.' },
  { id: 'trap', title: 'The "{}" trap', say: 'The PingFederate mapping produced the string "{}" instead of an object, so act.sub does not exist. The fix is the mapping expression (it must produce an object), not the rule.' },
  { id: 'scope-gates', title: 'Gateway v1.261027: scope gates', say: 'Three measured results, replayed with invented values. A Cedar rule blocks SearchIndexTool unless the token carries opensearch:search, but only once the policy State is Active: an API-created policy is a candidate and only shadow-evaluates. Ask PingFederate for the token with resource=<agent app URL>, or a different token manager answers and the gateway cannot find it. And RequiredClaims on the scope claim turns one agent into tiers: admin sees nine tools, read sees three, neither is 403.' },
  { id: 'agentcore-gov', title: 'Gateway v1.261028: AgentCore governance', say: 'Gateway image v1.261028 (since followed by v1.261029 and v1.261030, see their entry) gained a large block of AgentCore code: ways to change a gateway (enforcement mode, rate limits, policy engines, Cedar policies, runtime gateway-only) and ways to grade it (who can call it, whether a runtime can be reached around the gateway). We read this from the binary; the console API did not change, and nothing was run against a real AgentCore account. The two checks here are our mock readings of the finding wording.' },
  LATEST_TALK,
  OBO_TALK,
  whyTalk('obo'),
  CONSOLE_TALK,
  whyTalk('console'),
  { id: 'unverified', title: 'What we do not claim', say: 'That nested matching is NEW in gateway v1.261024 is our inference from binary symbols. It is UNVERIFIED. Which of the scope behaviours first appeared in v1.261027 is not established either, and the v1.261028 AgentCore behaviour is read from names in the binary, never run.' },
  { id: 'posture', title: 'AgentCore gateway posture', say: 'Shape only - field values invented - UNVERIFIED against the real product. These are the questions a posture view answers; we do not claim the real product answers them this way.' },
  { id: 'close', title: 'Close', say: 'Reset clears your workspace. Nothing was sent anywhere.' },
];
