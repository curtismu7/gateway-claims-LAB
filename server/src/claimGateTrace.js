// "What Privilege did" for the nested-claim gate (POST /api/evaluate). This lab is mock only, so the trace is always source 'mock'
// and every decision is 'checked': evaluateClaims() really computed each one, one per RequiredClaims entry, in the order it ran them
// (it checks every entry; nothing is skipped). The simulation has no request body and no reply body, so none is shown (null): the
// rule reads only the token's claims. The host is a non-real one (.invalid). The token itself is never shown, only its placeholder.
// Build it from the answer that is returned (typed text already masked), so the trace quotes nothing the reply does not.
import { mockTrace } from './gatewayTrace.js';

export function claimGateTrace({ cast, scenario, decision, checks, traceparent }) {
  return mockTrace({
    url: `https://mcp.${cast.castHost}.invalid/orders/mcp`,
    authorization: `Bearer <MOCK-ISSUED token, scenario: ${scenario}>`,
    rpc: null,
    status: decision === 'allow' ? 200 : 403,
    headers: { traceparent },
    body: null,
    decisions: checks.map((c) => ({ id: `claim-${c.path}`, label: `Required claim ${c.path}`, outcome: c.ok ? 'pass' : 'fail', evidence: c.detail })),
    record: `rule-eval scenario=${scenario} decision=${decision} reasons=${checks.map((c) => c.reason).join(',')}`,
  });
}
