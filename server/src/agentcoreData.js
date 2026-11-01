// v1.261028: what the gateway binary gained for AgentCore governance, shown in mock. SOURCE: a symbol and string diff of the
// gateway image v1.261027 against v1.261028 (2026-10-28), plus a byte-for-byte check that the console swagger did not change.
// NOTHING here was run against a real AWS AgentCore account: every capability is INFERRED from names, every value is invented.
// ARNs use the fake account 000000000000. Hosts end in .example.

export const AG_TITLE = 'Gateway v1.261028: AgentCore governance';
export const AG_INTRO = 'The v1.261028 gateway image added a large AgentCore block: ways to change a gateway, and ways to grade who can still get around it. Ping published no release notes, so this is read from the binary. UNVERIFIED against the real product.';
export const AG_VERSION = 'v1.261028';

export const AG_FACTS = [
  { id: 'running', status: 'measured', text: 'The gateways the owner runs all ran the image tag v1.261028 (read from their deployment specs on 2026-10-28).', source: 'owner note, 2026-10-28' },
  { id: 'diff-size', status: 'measured', text: 'Against v1.261027 the two gateway binaries gained 84 and 83 symbols and lost 2 and 1; the change is almost entirely AgentCore code. The console API spec (swagger) is byte-identical to the 2026-10-26 baseline, so none of it is in the console API.', source: 'symbol diff, 2026-10-28' },
  { id: 'manage', status: 'inferred', text: 'New functions suggest the gateway can CHANGE AgentCore gateways: set enforcement mode, rate limits, WAF mode, content check, authorizer, attach a policy engine, create/update/delete Cedar policies and policy engines, set a target\'s allowed workloads and headers, and set a runtime to gateway-only.', source: 'function names in the binary' },
  { id: 'analyze', status: 'inferred', text: 'Other new functions suggest it can GRADE what exists: caller access for gateways, targets and runtimes, runtime bypass posture and bypass diff, enforcement health, gateway compliance grade, engine-to-gateway attachments, and evaluation of IAM policy statements (including glob matching).', source: 'function names in the binary' },
  { id: 'scan', status: 'inferred', text: 'The agent scan workflow gained steps to link agents to the gateways they use and to enrich them with AgentCore governance data.', source: 'function names in the binary' },
  { id: 'messages', status: 'inferred', text: 'Strings in the binary name three findings: "any principal with bedrock-agentcore:InvokeAgentRuntime in the account can call this runtime directly", "any token from the IdP accepted", and "N of M target(s) without a caller allow-list".', source: 'strings in the binary' },
  { id: 'audit-rename', status: 'inferred', text: 'The policy audit hook was renamed from auditAIPolicy to auditPolicyEvent, which suggests policy audit events now cover more than AI policies.', source: 'function names in the binary' },
  { id: 'rules-unknown', status: 'UNVERIFIED', text: 'How the real gateway decides each finding (the exact rules, scores and grades) was not observed. The two checks below are this app\'s own mock readings of the finding wording.', source: 'no Ping source' },
];

export const MANAGE_ACTIONS = [
  ['Enforcement mode', 'Switch a gateway between enforcing and log-only'],
  ['Rate limits', 'Set request limits on a gateway'],
  ['WAF mode', 'Choose fail-open or fail-closed when the firewall fails'],
  ['Content check', 'Turn content inspection on for a gateway'],
  ['Authorizer', 'Change how callers authenticate to a gateway'],
  ['Policy engine', 'Create, update, delete and attach a policy engine'],
  ['Cedar policies', 'Create, update and delete Cedar policies inside an engine'],
  ['Target allowed workloads and headers', 'Limit which workloads may call a target and set its headers'],
  ['Runtime gateway-only', 'Make an agent runtime reachable only through its gateway'],
];

export const ANALYZE_VIEWS = [
  ['Caller access', 'Who may call a gateway, a target or a runtime'],
  ['Runtime bypass posture and diff', 'Which runtimes can be called around the gateway, and what changed'],
  ['Enforcement health', 'Whether each gateway is really enforcing'],
  ['Compliance grade', 'A graded summary per gateway'],
  ['Engine and gateway attachments', 'Which engines serve which gateways'],
  ['IAM statement evaluation', 'Reading IAM policy statements, with glob matching on actions'],
];

const OPEN = [{ effect: 'Allow', action: 'bedrock-agentcore:*', principal: '*' }];
const NARROW = [{ effect: 'Allow', action: 'bedrock-agentcore:InvokeAgentRuntime', principal: 'role/gateway-service' }];

export const AG_SECTIONS = [
  {
    id: 'bypass', title: 'A. Can the runtime be reached around the gateway?', kind: 'bypass',
    intro: 'An agent runtime has its own IAM policy. If that policy lets callers invoke it directly, the gateway can be bypassed.',
    scenarios: [
      { id: 'bypass-open', title: 'Open runtime policy', evidence: 'inferred', statements: OPEN, gatewayOnly: false, lesson: 'A wildcard Allow matches InvokeAgentRuntime for any principal, so anything in the account can skip the gateway. This is the wording the binary uses.' },
      { id: 'bypass-narrow', title: 'Only the gateway role', evidence: 'inferred', statements: NARROW, gatewayOnly: false, lesson: 'Only role/gateway-service may invoke. That role is the gateway itself, so it is the only direct caller.' },
      { id: 'bypass-denied', title: 'Open, but explicitly denied', evidence: 'inferred', statements: [...OPEN, { effect: 'Deny', action: 'bedrock-agentcore:InvokeAgentRuntime', principal: '*' }], gatewayOnly: false, lesson: 'An explicit Deny that covers every principal wins over the wildcard Allow.' },
      { id: 'bypass-gateway-only', title: 'Gateway-only switch on', evidence: 'inferred', statements: OPEN, gatewayOnly: true, lesson: 'The binary can set a runtime to gateway-only. We read it as refusing direct callers whatever the statements say.' },
    ],
  },
  {
    id: 'caller', title: 'B. Who may call the gateway?', kind: 'caller',
    intro: 'The gateway authorizer decides who can call it, and each target can carry a workload allow-list.',
    scenarios: [
      { id: 'caller-none', title: 'No authorizer', evidence: 'inferred', authorizerType: 'NONE', targets: [{ name: 'orders', allowedWorkloads: [] }], lesson: 'No authentication at all: anyone who can reach the gateway can call it.' },
      { id: 'caller-jwt-open', title: 'JWT, no allow-list', evidence: 'inferred', authorizerType: 'CUSTOM_JWT', targets: [{ name: 'orders', allowedWorkloads: [] }, { name: 'reports', allowedWorkloads: [] }], lesson: 'Callers must present a token from the IdP, but every valid token is accepted. This is the "any token from the IdP accepted" finding.' },
      { id: 'caller-jwt-mixed', title: 'JWT, one target allow-listed', evidence: 'inferred', authorizerType: 'CUSTOM_JWT', targets: [{ name: 'orders', allowedWorkloads: ['agent-orders-01'] }, { name: 'reports', allowedWorkloads: [] }], lesson: 'One target is limited to named workloads; the other is not. The summary counts targets without an allow-list.' },
      { id: 'caller-jwt-locked', title: 'JWT, every target allow-listed', evidence: 'inferred', authorizerType: 'CUSTOM_JWT', targets: [{ name: 'orders', allowedWorkloads: ['agent-orders-01'] }, { name: 'reports', allowedWorkloads: ['agent-reports-03'] }], lesson: 'Every target names the workloads allowed to call it.' },
    ],
  },
];
