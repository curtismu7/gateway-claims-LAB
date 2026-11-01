// Pure engines for the v1.261028 AgentCore governance scenarios. No I/O, no clocks, bounded input.
// The gateway binary gained functions that evaluate IAM statements (glob match), classify who may call a gateway,
// and report runtime bypass posture. Their real rules were NOT observed; these are our mock readings, UNVERIFIED.
export const LIMITS = { statements: 10, text: 128 };
const INVOKE = 'bedrock-agentcore:InvokeAgentRuntime';

export class GovInputError extends Error {
  constructor(code, detail) { super(detail); this.code = code; }
}

/** '*' matches any run of characters; everything else is literal. Case-insensitive like IAM action names. */
export function globMatch(pattern, value) {
  if (typeof pattern !== 'string' || typeof value !== 'string' || pattern.length > LIMITS.text) return false;
  const parts = pattern.toLowerCase().split('*');
  let rest = value.toLowerCase();
  if (!rest.startsWith(parts[0])) return false;
  rest = rest.slice(parts[0].length);
  for (let i = 1; i < parts.length; i += 1) {
    const last = i === parts.length - 1;
    if (last) return parts[i] === '' || rest.endsWith(parts[i]);
    const at = rest.indexOf(parts[i]);
    if (at < 0) return false;
    rest = rest.slice(at + parts[i].length);
  }
  return true;
}

function checkStatements(statements) {
  if (!Array.isArray(statements) || statements.length > LIMITS.statements) throw new GovInputError('bad_statements', `statements must be a list of at most ${LIMITS.statements}`);
  for (const s of statements) {
    if (!s || typeof s !== 'object' || !['Allow', 'Deny'].includes(s.effect) || typeof s.action !== 'string' || typeof s.principal !== 'string' || s.action.length > LIMITS.text || s.principal.length > LIMITS.text) throw new GovInputError('bad_statements', 'each statement needs effect Allow or Deny, an action and a principal (short text)');
  }
  return statements;
}

/**
 * Can something call the agent runtime directly, around the gateway? An Allow whose action pattern matches InvokeAgentRuntime
 * opens the runtime to its principal ('*' = any principal in the account) unless a matching Deny covers that principal.
 * The gateway's own role is the intended path, not a bypass. With gatewayOnly set, direct callers are refused whatever the statements say.
 */
export function evaluateRuntimeBypass({ statements, gatewayOnly, gatewayPrincipal = 'role/gateway-service' }) {
  const list = checkStatements(statements);
  const matches = list.filter((s) => globMatch(s.action, INVOKE));
  const denied = new Set(matches.filter((s) => s.effect === 'Deny').map((s) => s.principal));
  const granted = [...new Set(matches.filter((s) => s.effect === 'Allow').map((s) => s.principal))];
  // The gateway's own role is not a bypass: it is the intended path.
  const allowed = granted.filter((p) => !denied.has(p) && !denied.has('*') && p !== gatewayPrincipal);
  if (gatewayOnly === true) return { bypassPossible: false, directInvokers: [], reason: 'gateway-only: direct callers are refused', gatewayOnly: true };
  if (!allowed.length) return { bypassPossible: false, directInvokers: [], reason: granted.length ? 'only the gateway role, or principals an explicit Deny covers, can invoke the runtime' : 'no statement lets a principal invoke the runtime directly', gatewayOnly: false };
  const any = allowed.includes('*');
  return { bypassPossible: true, directInvokers: allowed, reason: any ? 'any principal with bedrock-agentcore:InvokeAgentRuntime in the account can call this runtime directly' : `${allowed.join(', ')} can call this runtime directly`, gatewayOnly: false };
}

/** Who may call a gateway, from its authorizer and an optional workload allow-list per target. */
export function classifyGatewayCaller({ authorizerType, targets }) {
  if (!['NONE', 'AWS_IAM', 'CUSTOM_JWT'].includes(authorizerType)) throw new GovInputError('bad_authorizer', 'authorizerType must be NONE, AWS_IAM or CUSTOM_JWT');
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > LIMITS.statements) throw new GovInputError('bad_targets', `targets must list 1 to ${LIMITS.statements} targets`);
  const without = targets.filter((t) => !Array.isArray(t.allowedWorkloads) || t.allowedWorkloads.length === 0).length;
  const caller = authorizerType === 'NONE' ? 'no authentication: anyone can call' : authorizerType === 'AWS_IAM' ? 'any IAM principal allowed by the gateway role policy' : without === targets.length ? 'any token from the IdP accepted' : 'only allow-listed workloads';
  return { callerClass: caller, targetsWithoutAllowList: without, targetCount: targets.length, summary: `${without} of ${targets.length} target(s) without a caller allow-list`, risky: without > 0 };
}
