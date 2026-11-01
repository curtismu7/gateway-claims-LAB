// The v1.261027 scenarios as data: three groups, each with MEASURED-vs-INFERRED labels. Source: owner live runs on the Privilege
// gateway, 2026-10-27 (Cedar scope gate, PingFederate resource parameter, RequiredClaims scope tiers). Values are invented.
// Text is {{token}} templated (see cast.js). Hosts end in .example.

export const SCOPE_TITLE = 'Gateway v1.261027: scope gates';
export const SCOPE_INTRO = 'Three things measured on the real gateway on 2026-10-27, replayed here with invented values: a Cedar rule that blocks a tool by token scope, the PingFederate parameter that picks the right token, and a RequiredClaims rule that turns one agent into tiers.';

export const AGENT_URL = 'https://mcpgw.{{castHost}}.example/pftoken/mcp';
export const GUARDED_TOOL = 'SearchIndexTool';
export const NEED_SCOPE = 'opensearch:search';

export const CEDAR_POLICY = `forbid (principal, action in [Action::"mcp:Invoke", Action::"mcp:InvokeUnattended"],
        resource == Tool::"${GUARDED_TOOL}")
  when { context.app == "pftoken" }
  unless { context has token && context.token.scopes.contains("${NEED_SCOPE}") };`;

// anyOf = RequiredClaims { Map: { scope: { Elems: [...] } } }; tools = how many tools that rule opens.
export const TIER_RULES = [
  { id: 'read', anyOf: ['opensearch:read'], tools: 3 },
  { id: 'admin', anyOf: ['opensearch:admin'], tools: 9 },
];

export const SCOPE_FACTS = [
  { id: 'cedar-scope', status: 'measured', text: 'A Cedar forbid on context.token.scopes blocks SearchIndexTool for a PingFederate token without opensearch:search (JSON-RPC 400, -32600, "action denied by policy"); with the scope it returns 200 and other tools are unaffected.', source: 'owner live run, gateway v1.261027, 2026-10-27' },
  { id: 'state-active', status: 'measured', text: 'An AI policy created through the API has State "" and is only a candidate: it is compiled and shadow-evaluated (log mcp_policy_shadow_delta) and the call is ALLOWED. Setting State to "Active" makes it enforce.', source: 'owner live run, 2026-10-27' },
  { id: 'not-learning-mode', status: 'measured', text: 'The shadow behaviour is the candidate state, not a limit of the new version: the same policy blocks once State is Active.', source: 'owner live run, 2026-10-27' },
  { id: 'pf-resource', status: 'measured', text: 'A client_credentials request with scope but no resource is answered by a different PingFederate token manager (aud enduser, no sub or act); the gateway then logs "auth rejected: reason=token_not_found" and returns 401. Adding resource=<agent app URL> selects the agent token manager.', source: 'owner live run, 2026-10-27' },
  { id: 'elems-any-of', status: 'measured', text: 'RequiredClaims uses { Map: { "<claim path>": { Elems: [...] } } }. Elems is ANY OF. A plain string value is refused with 400.', source: 'owner live run, gateway v1.261024, 2026-10-27' },
  { id: 'scope-split', status: 'measured', text: 'The scope claim is split per value: requiring opensearch:read matches the token scope "openid opensearch:read". Requiring the whole string "openid opensearch:read" does not match.', source: 'owner live run, 2026-10-27' },
  { id: 'tiers', status: 'measured', text: 'Two rules on the same app and key with different tools and different required scopes give tiers: the admin scope lists all nine tools, the read scope lists three, a token with neither gets 403. Effective in about 20 seconds.', source: 'owner live run, 2026-10-27' },
  { id: 'clear-claims', status: 'measured', text: 'To clear RequiredClaims, delete the field from the rule. Sending an empty Map is ignored and the old value stays.', source: 'owner live run, 2026-10-27' },
  { id: 'both-scopes', status: 'inferred', text: 'A token holding BOTH read and admin should get the wider tier (nine tools). Not run on its own.', source: 'this app\'s reading of the any-of rule' },
  { id: 'new-in-version', status: 'UNVERIFIED', text: 'Which of these behaviours first appeared in v1.261027 rather than v1.261024 is not established: no release notes exist and the older version was not re-run on the same tokens.', source: 'no Ping source' },
];

export const SCOPE_SECTIONS = [
  {
    id: 'cedar', title: 'A. Cedar scope gate', kind: 'cedar', policy: CEDAR_POLICY,
    intro: 'A Cedar policy forbids one tool unless the token carries the needed scope. The policy only enforces when its State is Active.',
    scenarios: [
      { id: 'cedar-scope-present', title: 'Active, scope present', evidence: 'measured', tool: GUARDED_TOOL, scope: 'openid opensearch:search', state: 'Active', lesson: 'The token carries opensearch:search, so the unless clause holds and the call goes through.' },
      { id: 'cedar-scope-missing', title: 'Active, scope missing', evidence: 'measured', tool: GUARDED_TOOL, scope: 'openid opensearch:read', state: 'Active', lesson: 'Valid token, wrong scope: the forbid fires. The gateway answers JSON-RPC 400, code -32600, "action denied by policy".' },
      { id: 'cedar-other-tool', title: 'Other tools unaffected', evidence: 'measured', tool: 'ListIndexTool', scope: 'openid', state: 'Active', lesson: 'The forbid names one tool. Calls to any other tool are not touched, even with no extra scope.' },
      { id: 'cedar-candidate', title: 'Candidate policy: shadow only', evidence: 'measured', tool: GUARDED_TOOL, scope: 'openid opensearch:read', state: '', lesson: 'The trap. A policy created through the API has State "": it is compiled and shadow-evaluated, so the call is allowed and the log only records what would have happened. PUT the policy with State "Active".' },
    ],
  },
  {
    id: 'pf', title: 'B. PingFederate: scope alone picks the wrong token', kind: 'pf',
    intro: 'The agent asks PingFederate for a token. Without a resource parameter a different token manager answers, and the gateway cannot use its token.',
    scenarios: [
      { id: 'pf-scope-only', title: 'scope only', evidence: 'measured', scope: 'openid opensearch:search', resource: null, lesson: 'scope= alone is served by the default token manager: audience enduser, no sub, no act. The gateway logs token_not_found and returns 401.' },
      { id: 'pf-with-resource', title: 'scope and resource', evidence: 'measured', scope: 'openid opensearch:search', resource: AGENT_URL, lesson: 'Adding resource=<agent app URL> selects the agent token manager. The token has sub, act and the requested scopes, and the call is accepted.' },
    ],
  },
  {
    id: 'tiers', title: 'C. RequiredClaims scope tiers', kind: 'tiers',
    intro: 'One agent, one app, two rules. Each rule requires a scope (any of) and opens a set of tools. Which tools a call sees depends on the token scope.',
    rules: TIER_RULES,
    scenarios: [
      { id: 'tier-admin', title: 'Admin scope: 9 tools', evidence: 'measured', scope: 'openid opensearch:admin', lesson: 'The admin rule matches the scope opensearch:admin, so all nine tools are listed.' },
      { id: 'tier-read', title: 'Read scope: 3 tools', evidence: 'measured', scope: 'openid opensearch:read', lesson: 'Only the read rule matches, so three tools are listed.' },
      { id: 'tier-none', title: 'Neither scope: 403', evidence: 'measured', scope: 'openid', lesson: 'No rule matches. Mismatch is 403 Forbidden, with no clear log line.' },
      { id: 'tier-both', title: 'Both scopes', evidence: 'inferred', scope: 'openid opensearch:read opensearch:admin', lesson: 'Both rules match; the wider tier wins and nine tools are listed. Reading of the rule, not run on its own.' },
    ],
  },
];
