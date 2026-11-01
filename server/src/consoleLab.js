// The AgentCore gateway model for one workspace and vertical: state, a computed twelve-check scorecard, six actions and three probes.
// Pure and synchronous (no I/O, no clock): a request is applied whole or refused whole, and nothing is changed before every check has passed, so two
// parallel requests cannot interleave. The shapes inside are LAB-INVENTED (the swagger gives names and one sentence each). A refusal is an InputError
// with an honest HTTP status and fixed text: it never echoes what the visitor typed.
import { refuse } from './errors.js';
import { looksLikeCredential } from './credentials.js';
import { isReservedHost } from './safety.js';
import { ACTION_FIELDS, CHECKS, ENGINE_MODES, MAX_AUDIT, PROBE_FIELDS, WAF_MODES } from './consoleData.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const byId = (list, id) => (typeof id === 'string' ? list.find((x) => x.id === id) : undefined);

// ---------- the model --------------------------------------------------------------------------------------------------------------------------------
export function seedGateway(cast) {
  const agentRole = `role-lab-${cast.castAgentId}`;
  return {
    id: 'gw-lab-01', name: `${cast.castHost}-gateway`, status: 'READY',
    authorizer: { type: 'JWT', discoveryUrl: `https://idp.${cast.castHost}.example/.well-known/openid-configuration`, audiences: [`https://mcp.${cast.castHost}.example/orders/mcp`] },
    engine: { id: 'eng-lab-01', mode: 'LOG_ONLY', status: 'ACTIVE', policyCount: 4 },
    wafFailureMode: 'fail-open', rateLimit: 100, egress: 'private', contentChecks: true, pinnedEndpoint: null,
    targets: [{ id: 'tg-1', name: 'orders-tool', enabled: true, tools: 6 }, { id: 'tg-2', name: 'payments-tool', enabled: true, tools: 3 }, { id: 'tg-3', name: 'search-tool', enabled: true, tools: 2 }],
    sessions: [{ id: 's-0001', principal: agentRole }, { id: 's-0002', principal: 'role-lab-batch-job' }, { id: 's-0003', principal: 'role-lab-analyst' }],
    runtimes: [
      { id: 'rt-1', name: `${cast.castHost}-runtime`, networkMode: 'PUBLIC', authorizer: 'IAM', jwtGatewayPin: false, resourcePolicy: 'direct-allowed', callers: [{ principal: agentRole, viaGateway: true, direct: true }, { principal: 'role-lab-batch-job', viaGateway: false, direct: true }] },
      { id: 'rt-2', name: `${cast.castHost}-worker`, networkMode: 'VPC', authorizer: 'IAM', jwtGatewayPin: true, resourcePolicy: 'gateway-only', callers: [{ principal: agentRole, viaGateway: true, direct: false }] },
    ],
    // The engine's policies, as (principal, target) allows. '*' is any principal.
    cedar: [{ principal: agentRole, target: 'tg-1' }, { principal: '*', target: 'tg-3' }, { principal: 'role-lab-batch-job', target: 'tg-2' }],
  };
}
export const principalsOf = (gw) => [...new Set([...gw.sessions.map((s) => s.principal), ...gw.runtimes.flatMap((r) => r.callers.map((c) => c.principal)), 'role-lab-unknown'])].sort();

export const bypassOpen = (rt) => rt.resourcePolicy !== 'gateway-only' || rt.callers.some((c) => c.direct);
export const bypassDiff = (gw) => gw.runtimes.map((rt) => ({
  runtime: rt.id,
  gatewayMediated: rt.callers.filter((c) => c.direct && c.viaGateway).map((c) => c.principal),
  bypassOnly: rt.callers.filter((c) => c.direct && !c.viaGateway).map((c) => c.principal),
}));

/** The twelve checks, computed from the state. Each is { id, name, rule, green, why }; greenCount is how many are green. */
export function scorecard(gw) {
  const open = gw.runtimes.filter(bypassOpen); const pub = gw.runtimes.filter((r) => r.networkMode !== 'VPC');
  const green = {
    authorizer: [gw.authorizer.type === 'JWT', gw.authorizer.type === 'JWT' ? 'a JWT authorizer is configured' : 'no JWT authorizer'],
    'audience-pinning': [gw.authorizer.audiences.length > 0 && !gw.authorizer.audiences.includes('*'), `${gw.authorizer.audiences.length} audience(s) listed`],
    enforcement: [gw.engine.mode === 'ENFORCE', `the policy engine is in ${gw.engine.mode}`],
    'policy-scope': [gw.engine.policyCount > 0, `${gw.engine.policyCount} policies attached`],
    'enforcement-health': [gw.engine.status === 'ACTIVE', `the engine is ${gw.engine.status}`],
    'caller-pinning': [gw.pinnedEndpoint !== null, gw.pinnedEndpoint ? 'the endpoint is pinned' : 'the endpoint is not pinned'],
    throttling: [gw.rateLimit > 0, gw.rateLimit > 0 ? `${gw.rateLimit} requests per minute` : 'no rate limit'],
    waf: [gw.wafFailureMode === 'fail-closed', `the WAF fails ${gw.wafFailureMode === 'fail-closed' ? 'closed' : 'open'}`],
    'egress-privacy': [gw.egress === 'private', `egress is ${gw.egress}`],
    'content-checks': [gw.contentChecks === true, gw.contentChecks ? 'content checks are on' : 'content checks are off'],
    'bypass-closed': [open.length === 0, open.length ? `bypass open on ${open.map((r) => r.id).join(', ')}` : 'no runtime can be called around the gateway'],
    'network-paths': [pub.length === 0, pub.length ? `public network on ${pub.map((r) => r.id).join(', ')}` : 'every runtime is on a private network'],
  };
  const checks = CHECKS.map(([id, name, rule]) => ({ id, name, rule, green: green[id][0], why: green[id][1] }));
  return { checks, greenCount: checks.filter((c) => c.green).length, total: checks.length };
}

// ---------- actions ----------------------------------------------------------------------------------------------------------------------------------
/** A pinnable endpoint: https, a reserved (.example or .invalid) host, no userinfo, path, query, fragment or port. Returns the pinned text or null. Never echoes. */
export function parseEndpoint(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 120 || looksLikeCredential(value)) return null;
  let u;
  try { u = new URL(value); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || u.pathname !== '/') return null;
  const host = u.hostname.replace(/\.$/, '');
  if (!/^[a-z0-9]([a-z0-9.-]{0,78}[a-z0-9])?$/.test(host) || !isReservedHost(host) || looksLikeCredential(host)) return null;
  return `https://${host}`;
}

export class ConsoleLab {
  constructor(cast) { this.cast = cast; this.gw = seedGateway(cast); this.audit = []; }

  view() {
    return { gateway: structuredClone(this.gw), scorecard: scorecard(this.gw), bypassDiff: bypassDiff(this.gw), principals: principalsOf(this.gw), audit: structuredClone(this.audit), auditCap: MAX_AUDIT };
  }

  /** Apply one action. Throws InputError and changes NOTHING when any check fails. Returns what changed. */
  act(a) {
    if (!isObj(a)) throw refuse('bad_request', 'the action must be an object');
    if (typeof a.kind !== 'string' || !Object.hasOwn(ACTION_FIELDS, a.kind)) throw refuse('bad_action', 'kind must be one of the gateway actions');
    if (!Object.keys(a).every((k) => k === 'kind' || ACTION_FIELDS[a.kind].includes(k))) throw refuse('unknown_field', 'the action carries a field the lab does not take');
    if (this.audit.length >= MAX_AUDIT) throw refuse('audit_full', `this workspace has made ${MAX_AUDIT} changes; Reset to start again`, 429);
    const g = this.gw;
    const before = scorecard(g).greenCount;
    let result; let apply;
    if (a.kind === 'set-target') {
      const t = byId(g.targets, a.target);
      if (!t) throw refuse('unknown_target', 'no such tool target', 404);
      if (typeof a.enabled !== 'boolean') throw refuse('bad_value', 'enabled must be true or false');
      if (t.enabled === a.enabled) throw refuse('already_in_state', 'the target is already in that state', 409);
      result = { target: t.id, enabled: a.enabled, effect: a.enabled ? 'the target is callable again' : 'the target answers no calls' };
      apply = () => { t.enabled = a.enabled; };
    } else if (a.kind === 'set-waf') {
      if (!WAF_MODES.includes(a.mode)) throw refuse('bad_value', 'mode must be fail-open or fail-closed');
      if (g.wafFailureMode === a.mode) throw refuse('already_in_state', 'the WAF is already in that failure mode', 409);
      result = { wafFailureMode: a.mode };
      apply = () => { g.wafFailureMode = a.mode; };
    } else if (a.kind === 'set-enforcement') {
      if (!ENGINE_MODES.includes(a.mode)) throw refuse('bad_value', 'mode must be LOG_ONLY or ENFORCE');
      if (g.engine.mode === a.mode) throw refuse('already_in_state', 'the policy engine is already in that mode', 409);
      // Only the flip to enforcing needs the typed name (the deck says "the last behind a typed confirmation"). Whether going back needs one is the lab's call: it does not.
      if (a.mode === 'ENFORCE' && (typeof a.confirm !== 'string' || a.confirm !== g.name)) throw refuse('confirmation_mismatch', 'the typed confirmation does not match the gateway name; nothing changed', 403);
      result = { engineMode: a.mode };
      apply = () => { g.engine.mode = a.mode; };
    } else if (a.kind === 'close-bypass') {
      const r = byId(g.runtimes, a.runtime);
      if (!r) throw refuse('unknown_runtime', 'no such runtime', 404);
      if (!bypassOpen(r)) throw refuse('already_in_state', 'that bypass route is already closed', 409);
      const diff = bypassDiff(g).find((d) => d.runtime === r.id);
      // The principals whose ONLY path was the bypass are locked out: they had no gateway allow.
      result = { runtime: r.id, lockedOut: [...diff.bypassOnly], stillMediated: [...diff.gatewayMediated] };
      apply = () => { r.callers = r.callers.map((c) => ({ ...c, direct: false })); r.resourcePolicy = 'gateway-only'; r.jwtGatewayPin = true; };
    } else if (a.kind === 'pin-endpoint') {
      const pinned = parseEndpoint(a.endpoint);
      if (!pinned) throw refuse('bad_endpoint', 'endpoint must be an https address on a .example or .invalid host, with no path, port or credentials');
      if (g.pinnedEndpoint === pinned) throw refuse('already_in_state', 'that endpoint is already pinned', 409);
      result = { pinnedEndpoint: pinned };
      apply = () => { g.pinnedEndpoint = pinned; };
    } else {
      const s = byId(g.sessions, a.session);
      if (!s) throw refuse('unknown_session', 'no such session', 404);
      result = { ended: s.id, principal: s.principal };
      apply = () => { g.sessions = g.sessions.filter((x) => x.id !== s.id); };
    }
    apply();
    const after = scorecard(g).greenCount;
    this.audit.push({ n: this.audit.length + 1, kind: a.kind, ...result, scorecardBefore: before, scorecardAfter: after });
    return { kind: a.kind, ...result, scorecardChange: { before, after, total: CHECKS.length } };
  }

  /** Read-only: what a call would do now. Throws InputError for a bad field; never changes state. */
  probe(p) {
    if (!isObj(p)) throw refuse('bad_request', 'the probe must be an object');
    if (typeof p.kind !== 'string' || !Object.hasOwn(PROBE_FIELDS, p.kind)) throw refuse('bad_probe', 'kind must be one of the probes');
    if (!Object.keys(p).every((k) => k === 'kind' || PROBE_FIELDS[p.kind].includes(k))) throw refuse('unknown_field', 'the probe carries a field the lab does not take');
    const g = this.gw;
    const principals = principalsOf(g);
    const known = (x) => typeof x === 'string' && principals.includes(x);
    if (p.kind === 'waf-outage') {
      const closed = g.wafFailureMode === 'fail-closed';
      return { kind: p.kind, outcome: closed ? 'blocked' : 'passed unscreened', reason: closed ? 'the WAF is down and fails closed: calls are refused until it is back' : 'the WAF is down and fails open: calls go through without the firewall\'s screening', wafFailureMode: g.wafFailureMode };
    }
    if (p.kind === 'gateway-call') {
      const t = byId(g.targets, p.target);
      if (!t) throw refuse('unknown_target', 'no such tool target', 404);
      if (!known(p.principal)) throw refuse('unknown_principal', 'no such principal', 404);
      if (!t.enabled) return { kind: p.kind, outcome: 'refused', reason: 'the target is disabled', policy: 'not evaluated', engineMode: g.engine.mode };
      const allowed = g.cedar.some((c) => c.target === t.id && (c.principal === '*' || c.principal === p.principal));
      if (allowed) return { kind: p.kind, outcome: 'allowed', reason: 'a policy allows this principal on this target', policy: 'allow', engineMode: g.engine.mode };
      if (g.engine.mode === 'ENFORCE') return { kind: p.kind, outcome: 'denied', reason: 'no policy allows this principal on this target, and the engine enforces', policy: 'deny', engineMode: g.engine.mode };
      return { kind: p.kind, outcome: 'allowed', reason: 'no policy allows this principal on this target, but the engine only logs: the call goes through and the log records that it would have been denied', policy: 'deny (logged only)', engineMode: g.engine.mode };
    }
    const rt = byId(g.runtimes, p.runtime);
    if (!rt) throw refuse('unknown_runtime', 'no such runtime', 404);
    if (!known(p.principal)) throw refuse('unknown_principal', 'no such principal', 404);
    const direct = rt.callers.some((c) => c.principal === p.principal && c.direct);
    return { kind: p.kind, outcome: direct ? 'allowed' : 'denied', reason: direct ? 'this principal holds a direct invoke allow on the runtime, so the gateway is bypassed' : 'this principal has no direct invoke allow on the runtime', bypassRoute: bypassOpen(rt) ? 'open' : 'closed' };
  }
}
