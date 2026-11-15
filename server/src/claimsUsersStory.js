// The "Users and groups from claims" tab: the cast-filled story, and one request run against the pure engine (claimsUsers.js).
// A request is a scenario id, a custom token, or a scenario with the visitor's own overrides (token claims, key id, Subject, End-user claim, End-user mode).
// Every override is bounded and checked here; a credential-looking one is refused with fixed text, and what a typed value shows back is masked.
import { fillDeep } from './cast.js';
import { refuse } from './errors.js';
import { looksLikeCredential } from './credentials.js';
import { maskTypedDeep } from './mask.js';
import { CLAIM_TAGS, NO_LIVE } from './releaseClaims.js';
import { formatTraceparent, newTrace } from './trace.js';
import { PATH_RE } from './claims.js';
import { CHECKS, KID_RE, LIMITS, SUBJECT_RE, evaluateClaimsUsers } from './claimsUsers.js';
import {
  CEDAR_FACTS, CEDAR_POLICY, CU_BANNER, CU_FACTS, CU_HEADER, CU_INTRO, CU_SECTIONS, CU_SIBLING, CU_SIGNATURE, CU_TAG_UNVERIFIED, CU_TITLE, DIRECTORY, GOOD_KID,
  IDENTITY, IDENTITY_ROWS, ROUTE_ROWS, ROUTE_WHEN, TIERS, TOOLS,
} from './claimsUsersData.js';

export const CU_TAGS = { ...CLAIM_TAGS, unverified: CU_TAG_UNVERIFIED };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const valueOf = (id, i) => ({
  issuer: i.issuer,
  jwks: `${i.jwksUri} (publishes: ${i.publishedKeys.join(', ')})`,
  audience: i.audience,
  lifetime: `${i.maxTokenLifetimeSec} seconds`,
  subject: i.subject,
  required: i.requiredClaims.map((c) => `${c.path} = ${c.equals}`).join('; '),
  endUser: `${i.endUser.mode === 'resolved' ? 'Resolved' : 'Opaque'}, End-user claim ${i.endUser.claim}`,
  scopes: i.scopes.join(' '),
})[id];
// One row per identity setting, with the value this run used; `changed` marks a value that differs from the default identity.
const identityView = (identity, base) => IDENTITY_ROWS.map((r) => ({ ...r, value: valueOf(r.id, identity), changed: valueOf(r.id, identity) !== valueOf(r.id, base) }));

export function buildClaimsUsersStory(cast) {
  const f = fillDeep({ identity: IDENTITY, directory: DIRECTORY, tools: TOOLS, tiers: TIERS, sections: CU_SECTIONS, policy: CEDAR_POLICY, title: CU_TITLE, intro: CU_INTRO }, cast);
  return {
    title: f.title, intro: f.intro, banner: CU_BANNER, sibling: CU_SIBLING, noLive: NO_LIVE, tags: CU_TAGS,
    identity: f.identity, identityRows: identityView(f.identity, f.identity), directory: f.directory, tools: f.tools, tiers: f.tiers, sections: f.sections,
    checks: CHECKS.map(([id, tag, label]) => ({ id, tag, label })),
    defaults: { kid: GOOD_KID, subject: f.identity.subject, endUserClaim: f.identity.endUser.claim, endUserMode: f.identity.endUser.mode },
    routes: { rows: ROUTE_ROWS, when: ROUTE_WHEN },
    cedar: { policy: f.policy, facts: CEDAR_FACTS },
    facts: CU_FACTS,
    limits: { subject: LIMITS.subject, kid: LIMITS.kid },
  };
}

export const claimsUsersScenarios = (story) => story.sections.flatMap((s) => s.scenarios);
const findScenario = (story, id) => (typeof id === 'string' ? claimsUsersScenarios(story).find((s) => s.id === id) || null : null);

// A typed text: right type, bounded length, not credential-shaped (refused whole, never echoed), then the character set for its field.
function typedText(v, max, re, code) {
  if (typeof v !== 'string' || v.length > max) throw refuse(code, `that value must be text of at most ${max} characters`);
  if (looksLikeCredential(v)) throw refuse('credential_like', 'that text looks like a credential, so it was not used');
  if (!re.test(v)) throw refuse(code, 'that value has a character the lab does not take');
  return v;
}

// The three mock hops (rule 14). Values here are fixed words, a validated scenario id, the vertical's host and the engine's own step results.
function buildHops({ trace, cast, scenario, r }) {
  const tp = [trace.span(), trace.span(), trace.span()].map((x) => formatTraceparent(trace.traceId, x));
  const word = (c) => `${c.id}: ${c.ok === null ? 'not reached' : c.ok ? 'passed' : 'refused'}`;
  const gate = r.checks.slice(0, 7); const rest = r.checks.slice(7);
  return [
    { n: 1, from: 'agent', to: 'gateway', label: 'Agent calls the P1 Privilege Agent App with its token', traceparent: tp[0],
      request: `POST https://mcp.${cast.castHost}.example/mcp\nAuthorization: Bearer <MOCK-ISSUED token, scenario: ${scenario}>\ntraceparent: ${tp[0]}`,
      response: r.status === null ? '(not sent: the console refused to save the identity)' : `HTTP/1.1 ${r.status}\ntraceparent: ${tp[0]}` },
    { n: 2, from: 'gateway', to: 'identity', label: 'Gateway checks the token against the identity', traceparent: tp[1],
      request: `IDENTITY-CHECK (mock, in process)\ntraceparent: ${tp[1]}`, response: gate.map(word).join('\n') },
    { n: 3, from: 'gateway', to: 'grant', label: 'Gateway reads the end user and the grant tiers', traceparent: tp[2],
      request: `GRANT-EVAL (mock, in process)\ntraceparent: ${tp[2]}`, response: `${rest.map(word).join('\n')}\ntools granted: ${r.toolCount}` },
  ];
}

/** Run one request. Throws InputError (unknown scenario, bad override) or ClaimsInputError (a token that is not a bounded JSON object). */
export function evaluateClaimsUsersRequest(story, body, cast, traceparent) {
  const scenario = body.scenario === undefined ? null : findScenario(story, body.scenario);
  if (body.scenario !== undefined && !scenario) throw refuse('unknown_scenario', 'no such scenario');
  if (!scenario && body.token === undefined) throw refuse('bad_request', 'name a scenario or send a token');
  if (body.token !== undefined && !isObj(body.token)) throw refuse('bad_token', 'token must be a JSON object of claims');

  const identity = { ...story.identity, ...(scenario?.identity || {}), endUser: { ...story.identity.endUser, ...(scenario?.identity?.endUser || {}) } };
  if (body.subject !== undefined) identity.subject = typedText(body.subject, LIMITS.subject, SUBJECT_RE, 'bad_subject');
  if (body.endUserClaim !== undefined) {
    identity.endUser.claim = typedText(body.endUserClaim, 64, PATH_RE, 'bad_end_user_claim');
  }
  if (body.endUserMode !== undefined) {
    if (body.endUserMode !== 'opaque' && body.endUserMode !== 'resolved') throw refuse('bad_end_user_mode', 'the End-user mode must be opaque or resolved');
    identity.endUser.mode = body.endUserMode;
  }
  const kid = body.kid !== undefined ? typedText(body.kid, LIMITS.kid, KID_RE, 'bad_kid') : scenario ? scenario.token.kid : GOOD_KID;
  const claims = body.token !== undefined ? body.token : scenario.token.claims;

  const r = evaluateClaimsUsers({ claims, kid, identity, directory: story.directory, tiers: story.tiers, tools: story.tools });
  // Anything the visitor typed is quoted back masked (every string, the generic long-run detectors included); a scenario's own values are fixed text.
  const custom = ['token', 'kid', 'subject', 'endUserClaim', 'endUserMode'].some((k) => body[k] !== undefined);
  // A typed token's claim NAMES are object keys, which the mask does not reach, so a typed token is not echoed: `flat` (paths and values, masked) shows what was read.
  const shown = { token: body.token === undefined ? { header: { ...CU_HEADER, kid }, claims, signature: CU_SIGNATURE } : null, identityView: identityView(identity, story.identity), checks: r.checks, claimChecks: r.claimChecks, flat: r.flat, endUser: r.endUser, tiers: r.tiers, log: r.log };
  const typed = custom ? maskTypedDeep(shown) : shown;
  const id = scenario ? scenario.id : 'custom';
  const trace = newTrace(traceparent);
  const hops = buildHops({ trace, cast, scenario: id, r });
  return {
    scenario: id, custom, expected: scenario ? scenario.expected : null, expectedCode: scenario ? scenario.code : null,
    decision: r.decision, status: r.status, code: r.code, stage: r.stage, tools: r.tools, toolCount: r.toolCount, ...typed,
    hops, traceId: trace.traceId, traceparent: hops[0].traceparent,
  };
}
