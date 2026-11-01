// AgentCore gateway governance (slide 45): "NEW - on Bedrock AgentCore the gateway is an object of policy, not just a route: enable or disable a tool target,
// switch the WAF between fail-open and fail-closed, close a bypass route, pin an endpoint, end a session, and flip enforcement from log-only to enforcing,
// the last behind a typed confirmation." The lab models ONE gateway per workspace so a visitor can do each of those and watch a computed scorecard move.
// Field names are the console swagger's (modelAgentCoreAccountMetadata, 2026-10-31, schema only). Every value, rule and inner shape here is lab-invented
// or a lab reading. ARNs, accounts and hosts are fake (.example, account 000000000000).

export const CONSOLE_TITLE = 'AgentCore gateway governance: {{castBrand}}\'s gateway as an object of policy';
export const CONSOLE_INTRO = 'On Bedrock AgentCore the deck says the gateway itself can be governed, not only routed through. This is a model of one gateway you can change: disable a tool target, switch the WAF failure mode, close a bypass route, pin an endpoint, end a session, and flip the policy engine from log-only to enforcing (you type the gateway name to confirm). The scorecard is computed from the state after every change; the probes show what each switch does to a call.';

export const WAF_MODES = ['fail-open', 'fail-closed'];
export const ENGINE_MODES = ['LOG_ONLY', 'ENFORCE'];
export const ACTION_KINDS = ['set-target', 'set-waf', 'close-bypass', 'pin-endpoint', 'end-session', 'set-enforcement'];
export const PROBE_KINDS = ['gateway-call', 'waf-outage', 'direct-runtime'];
// Fields each action takes, besides `kind` and `vertical`. A body with any other field is refused whole.
export const ACTION_FIELDS = { 'set-target': ['target', 'enabled'], 'set-waf': ['mode'], 'close-bypass': ['runtime'], 'pin-endpoint': ['endpoint'], 'end-session': ['session'], 'set-enforcement': ['mode', 'confirm'] };
export const PROBE_FIELDS = { 'gateway-call': ['principal', 'target'], 'waf-outage': [], 'direct-runtime': ['principal', 'runtime'] };
export const MAX_AUDIT = 100;

// The twelve scorecard checks the swagger description of GatewayScorecardJSON lists, in its order. The names are the swagger's; the rule is the lab's reading.
export const CHECKS = [
  ['authorizer', 'Authorizer', 'a JWT authorizer is configured'],
  ['audience-pinning', 'Audience pinning', 'allowed audiences are listed and none is a wildcard'],
  ['enforcement', 'Enforcement', 'the policy engine is in ENFORCE, not LOG_ONLY'],
  ['policy-scope', 'Policy scope', 'at least one policy is attached to the engine'],
  ['enforcement-health', 'Enforcement health', 'the policy engine is ACTIVE'],
  ['caller-pinning', 'Caller pinning', 'the gateway endpoint is pinned (the lab\'s reading of "caller pinning")'],
  ['throttling', 'Throttling', 'a rate limit is set'],
  ['waf', 'WAF', 'the WAF fails closed'],
  ['egress-privacy', 'Egress privacy', 'egress is private'],
  ['content-checks', 'Content checks', 'content checks are on'],
  ['bypass-closed', 'Bypass closed', 'no runtime can be called around the gateway'],
  ['network-paths', 'Network paths', 'every runtime is on a private network'],
];

// Field tags for the page: what each part of the gateway comes from.
export const FIELD_ROWS = [
  { field: 'Tool targets (enable or disable)', tag: 'deck' },
  { field: 'WAF failure mode (fail-open or fail-closed)', tag: 'deck' },
  { field: 'Bypass routes (close)', tag: 'deck' },
  { field: 'Pinned endpoint', tag: 'deck' },
  { field: 'Sessions (end)', tag: 'deck' },
  { field: 'Enforcement: log-only to enforcing behind a typed confirmation', tag: 'deck' },
  { field: 'GatewayDetailJSON, GatewayScorecardJSON, GatewayBypassPostureJSON, GatewayEnginesJSON, BypassDiffJSON, GatewayCallerAccessJSON, RuntimeCallerAccessJSON, TargetCallerAccessJSON', tag: 'swagger' },
  { field: 'The twelve scorecard check names', tag: 'swagger' },
  { field: 'The rule behind each scorecard check', tag: 'reading' },
  { field: 'Every value, id, principal, target, policy and session; the typed text being the gateway name; the probes; the audit cap', tag: 'invented' },
];

export const CONSOLE_FACTS = [
  { id: 'deck-govern', tag: 'deck', text: 'NEW: on Bedrock AgentCore the gateway is an object of policy, not just a route: enable or disable a tool target, switch the WAF between fail-open and fail-closed, close a bypass route, pin an endpoint, end a session, and flip enforcement from log-only to enforcing, the last behind a typed confirmation.', source: 'deck slide 45' },
  { id: 'swagger-fields', tag: 'swagger', text: 'modelAgentCoreAccountMetadata gained GatewayBypassPostureJSON, GatewayCallerAccessJSON, GatewayDetailJSON, GatewayEnginesJSON, GatewayScorecardJSON, BypassDiffJSON, RuntimeCallerAccessJSON, TargetCallerAccessJSON and Truncated between 2026-10-26 and 2026-10-31. Each is a string of JSON text in the schema; the schema gives a name and a sentence, not the shape inside.', source: 'console swagger diff 2026-10-26 to 2026-10-31, schema only' },
  { id: 'twelve-checks', tag: 'reading', text: 'The description of GatewayScorecardJSON lists twelve checks (authorizer, audience pinning, enforcement, policy scope, enforcement health, caller pinning, throttling, WAF, egress privacy, content checks, bypass closed, network paths) and says the score is a count of the green ones. We read that as: each check is green or not, and the score is how many are green.', source: 'swagger description, read 2026-10-31' },
  { id: 'check-rules', tag: 'reading', text: 'What makes each check green is this lab\'s reading of its name. The real rules were not observed. "Caller pinning" in particular is read here as pinning the gateway endpoint; the swagger does not say.', source: 'this lab' },
  { id: 'bypass-diff', tag: 'reading', text: 'The description of BypassDiffJSON says direct callers split into gateway-mediated (they also hold a gateway allow) and bypass-only (the ungoverned path is their only path), and that bypass-only entries are the remediation list for the gateway-only action. Closing a route here reports who that locks out.', source: 'swagger description, read 2026-10-31' },
  { id: 'all-invented', tag: 'invented', text: 'Every value on this tab is invented: the gateway, its targets, its sessions, the policies, the principals, the probes and what they answer, the cap of 100 actions per workspace, and the rule that the confirmation is the gateway\'s name.', source: 'this lab' },
  { id: 'console-not-on-tenant', tag: 'measured', text: 'The gateway the owner runs is on v1.261030 and the release tag was not in ECR on 2026-10-31, so none of this was run against a release gateway or a real AgentCore account.', source: 'owner note, 2026-10-31' },
];

export const CONSOLE_TALK = { id: 'console', title: 'AgentCore gateway governance (Ping release claim)', say: 'Ping release claim, UNVERIFIED on our tenant. The deck says that on Bedrock AgentCore the gateway is an object of policy: you can disable a tool target, switch the WAF between fail-open and fail-closed, close a bypass route, pin an endpoint, end a session, and flip enforcement from log-only to enforcing, the last behind a typed confirmation. Here is a model of one gateway you can change. Try the log-only probe, flip to enforcing by typing the name, and probe again; then close the bypass route and see who it locks out. The scorecard is computed from the state, and each row says whether it is a deck claim, a swagger name, our reading or our invention.' };
