// Pure engines for the three v1.261027 scope scenarios. No I/O, no clocks. Input is bounded (scope text length and count).
// The behaviours mirror what was MEASURED live on the real gateway on 2026-10-27; every value here is invented.
import { looksLikeCredential } from './credentials.js';

export const LIMITS = { scopeText: 256, scopeCount: 20, scopeName: 64 };

export class ScopeInputError extends Error {
  constructor(code, detail) { super(detail); this.code = code; }
}

/** "openid opensearch:read" -> ['openid', 'opensearch:read']. Space separated, like an OAuth scope claim. */
export function parseScope(text) {
  if (typeof text !== 'string') throw new ScopeInputError('bad_scope', 'scope must be text');
  if (text.length > LIMITS.scopeText) throw new ScopeInputError('too_long', `scope is longer than ${LIMITS.scopeText}`);
  const parts = text.split(' ').filter(Boolean);
  if (parts.length > LIMITS.scopeCount) throw new ScopeInputError('too_many', `more than ${LIMITS.scopeCount} scopes`);
  if (parts.some((p) => p.length > LIMITS.scopeName)) throw new ScopeInputError('too_long', `a scope is longer than ${LIMITS.scopeName}`);
  // Typed text that looks like a credential is refused, never shown back. It runs after the size limits, which refuse the whole request without
  // cutting anything; masking is a heuristic.
  if (looksLikeCredential(text)) throw new ScopeInputError('credential_like', 'that text looks like a credential, so it was not used');
  return parts;
}

/**
 * A: the Cedar scope gate. Policy: forbid mcp:Invoke on the guarded tool unless the token's scopes contain the needed scope.
 * `state` "Active" enforces. Anything else (an API-created policy has State "") is a CANDIDATE: compiled and shadow-evaluated only,
 * so the call is allowed and the log records a shadow delta.
 */
export function evaluateCedarScope({ tool, scope, state, guardedTool, needScope }) {
  const scopes = parseScope(scope);
  const wouldDeny = tool === guardedTool && !scopes.includes(needScope);
  const active = state === 'Active';
  if (!wouldDeny) return { decision: 'allow', status: 200, enforced: active, shadow: false, log: [`policy_decision allow ${tool}`], scopes };
  if (active) return { decision: 'deny', status: 400, jsonRpcCode: -32600, message: 'action denied by policy', enforced: true, shadow: false, log: [`aipolicy: denied PFtoken calling ${tool} (policies=[pftoken-scope-search:1])`, 'event policy_decision'], scopes };
  return { decision: 'allow', status: 200, enforced: false, shadow: true, log: ['mcp_policy_shadow_delta: candidate policy would have returned deny where the active set returned allow'], scopes };
}

/**
 * B: which PingFederate access token manager serves a client_credentials request. With scope only, a different manager answers
 * (aud enduser, no sub or act) and the gateway cannot find the token. A resource parameter selects the agent's manager.
 */
export function evaluateAtmSelection({ scope, resource, agentUrl }) {
  const scopes = parseScope(scope);
  if (resource !== null && resource !== undefined && (typeof resource !== 'string' || resource.length > 256)) throw new ScopeInputError('bad_resource', 'resource must be short text');
  const withResource = typeof resource === 'string' && resource.length > 0;
  if (!withResource) return { atm: 'pi.atm (default)', tokenShape: { aud: 'enduser.example', sub: null, act: null, scope: scopes.join(' ') }, decision: 'deny', status: 401, log: ['auth rejected: reason=token_not_found'], scopes };
  return { atm: 'routeCTestAtm (agent token manager)', tokenShape: { aud: resource, sub: '{agent}', act: { sub: '{agent}' }, scope: scopes.join(' ') }, decision: 'allow', status: 200, log: [`token accepted for ${agentUrl}`], scopes };
}

/**
 * C: RequiredClaims on the scope claim. Each rule lists scope values (Elems = ANY OF). The token's scope claim is SPLIT per
 * value, so a required "opensearch:read" matches the token scope "openid opensearch:read"; the whole string would not.
 * Two rules on the same app are tiers: each matching rule opens its tools; no match is 403.
 */
export function evaluateTiers({ scope, rules }) {
  const scopes = parseScope(scope);
  const have = new Set(scopes);
  const matched = rules.map((r) => ({ ...r, ok: r.anyOf.some((v) => have.has(v)) }));
  const open = matched.filter((r) => r.ok);
  const tools = open.length ? Math.max(...open.map((r) => r.tools)) : 0;
  return open.length
    ? { decision: 'allow', status: 200, tools, matched, scopes, log: [`${open.length} rule(s) matched; ${tools} tools listed`] }
    : { decision: 'deny', status: 403, tools: 0, matched, scopes, log: ['403 Forbidden: no rule matched the token scopes'] };
}
