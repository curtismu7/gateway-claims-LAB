// What the Help dialog says. Plain, and as hedged as the rest of the lab (rule 2): what was measured, what is simulated, what is UNVERIFIED.
export const HELP_SECTIONS = [
  {
    heading: "What this lab is",
    body: [
      "A mock-only lab for what the Privilege gateway (mcpgw) versions added: a nested-claim gate, scope gates, AgentCore governance, on-behalf-of, an AgentCore console, and readings of the newest images with the 2026-11-02 release features we have not measured.",
      "Every host ends in .example, the account id in ARNs is fake, and a netguard blocks outbound connections. Every Ping release claim shown here is UNVERIFIED on our tenant."
    ]
  },
  {
    heading: "What was measured, and what was not",
    body: [
      "Measured live (owner notes) and replayed here with invented values: the token shape with an object-valued act claim, the act-emitted-as-text-\"{}\" trap, RequiredClaims client_id + act.sub, the unpublished-signing-key refusal, the console refusal when Subject is pinned while the End-user claim reads sub, and the v1.261027 scope-gate results (Cedar forbid, the PingFederate resource= parameter, scope tiers of 9 / 3 tools / 403).",
      "UNVERIFIED: that nested claim matching is NEW in v1.261024 (inferred from a binary symbol); every reading of v1.261028, v1.261029 and v1.261030 (symbol and string diffs, relayed owner notes); the posture panel (field names seen in a binary, values and scoring invented); and that Privilege can take the user and the groups from ANY claim (owner statement, 2026-11-15). Every row carries a tag: deck claim, console swagger name (schema only), lab reading, lab-invented, or measured (our note)."
    ]
  },
  {
    heading: "How to use the page",
    body: [
      "Tabs: Nested-claim gate (pick a scenario, or edit your own mock token and rule — bounded input; the raw decoded token, the rule and a flattened dotted-path view are shown), Users and groups from claims (twelve scenarios in three steps: identity gate, end user, claim-conditioned grant tiers, with a register-vs-claims comparison panel), v1.261027 scope gates, v1.261028 AgentCore, v1.261029 + v1.261030 (text only: registry facts, nine binary readings, the not-yet-measured list), On-behalf-of (13 exchange scenarios, editable backend and scope), AgentCore console (one modelled gateway you change: disable a target, WAF fail-open or fail-closed, close a bypass route, pin an endpoint, end a session, flip log-only to enforcing by typing the gateway name; a twelve-check scorecard), AgentCore posture, Diagram, Talk track.",
      "Diagram boxes can be dragged; Reset in the header restores them and clears this workspace's evaluations. Presenter is the P key (Esc leaves); the simulation banner stays. Vertical packs (airlines, retail, health, finance) change every name; the default is AirGuard Airlines."
    ]
  },
  {
    heading: "Mock and Real",
    body: [
      "Mock is the default and the only mode that works. Pressing Live shows why it is refused — this app has no Live engine — and the page stays in mock.",
      "No cryptography runs here: the signing key check is a key id in a list. \"Your gateway\" on the AgentCore console tab is the lab's in-memory model for your workspace, never a call to anything."
    ]
  }
];
