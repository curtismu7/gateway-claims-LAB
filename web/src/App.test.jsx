import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { visible } from "./safeText";
import userEvent from "@testing-library/user-event";
import App, { BANNER_UNKNOWN } from "./App";
import { labelOffsets } from "./components/PatternDiagram";

const TOKEN = (claims) => ({ header: { alg: "RS256" }, claims, signature: "<MOCK-SIGNATURE: not a real signature>" });
const SCEN = [
  { id: "allowed", title: "Allowed: act.sub matches", expected: "allow", lesson: "Both match.", token: TOKEN({ client_id: "a", act: { sub: "a" } }) },
  { id: "act-text", title: 'Denied: act emitted as the text "{}"', expected: "deny", lesson: "The trap.", token: TOKEN({ client_id: "a", act: "{}" }) },
];
const STORY = {
  title: "t", intro: "intro text", banner: "SIMULATED, MOCK mode: a mock token", tokenLabel: "MOCK-ISSUED teaching token", verticals: ["retail", "health"],
  rule: { name: "Registered agent only (mock)", appliesTo: "P1 Privilege Agent App", note: "n", requiredClaims: [{ path: "client_id", equals: "a" }, { path: "act.sub", equals: "a" }] },
  scenarios: SCEN, cast: { castAgentId: "a" },
  facts: [{ id: "nested-match-new", status: "UNVERIFIED", text: "Nested matching is new.", source: "inference" }, { id: "x", status: "measured", text: "Seen.", source: "recipe" }],
  talkTrack: [{ id: "say-first", title: "Say first", say: "Everything is simulated." }, { id: "gate", title: "Gate", say: "Walk it." }, { id: "obo", title: "On-behalf-of", say: "Ping release claim, UNVERIFIED on our tenant. Swap the token." }, { id: "why-obo", title: "Why it matters: OBO (Ping claims)", say: "Per Ping's deck, slide 48." }, { id: "console", title: "Console", say: "Change the gateway." }, { id: "why-console", title: "Why it matters: console (Ping claims)", say: "Per Ping's deck, slide 45." }, { id: "posture", title: "Posture", say: "Shape only." }],
};
const LATEST = {
  title: "Gateway v1.261029 and v1.261030", intro: "Intro.", banner: "Lab reading, UNVERIFIED: read from binaries, never run.", releaseDate: "2026-11-02",
  facts: [{ id: "f1", status: "measured", text: "The registry has the tags.", source: "owner note" }, { id: "f2", status: "UNVERIFIED", text: "Behaviour is not known.", source: "nothing run" }],
  table: [{ tag: "v1.261028", built: "2026-10-28 17:30", binary: "244,454,104", symbols: "base" }, { tag: "v1.261029", built: "2026-10-29 09:15", binary: "244,558,704", symbols: "80 added, 26 removed" }, { tag: "v1.261030", built: "2026-10-30 16:01", binary: "244,570,600", symbols: "24 added, 22 removed" }],
  since: [{ id: "r1", version: "v1.261029", change: "A rejected approval is not held again", symbols: "aipolicy.RememberRejected", reading: "A rejected hold is remembered." }],
  notMeasured: [{ id: "cap", feature: "Aggregate cap", reading: "A cap counted across calls.", test: "A low-cap key and a small burst." }, { id: "hold", feature: "Hold", reading: "A call waits.", test: "Approve and reject." }],
  recheck: ["Look for a newer tag.", "Fetch the swagger again."], simulated: true,
};
const POSTURE = {
  label: "Shape only - field values invented - UNVERIFIED against the real product",
  gateways: [
    { name: "orders-gateway", status: "READY", region: "us-east-1", authorizerType: "CUSTOM_JWT", jwtDiscoveryUrl: "https://idp.example/x", allowedAudiences: ["https://mcp.example/a"], linkedAgents: ["agent-1"], policyEngine: { arn: "arn:aws:x:us-east-1:000000000000:pe/1", mode: "ENFORCE" }, scorecard: { score: 92, grade: "A", findings: [] }, wafFailureMode: "FAIL_CLOSED" },
    { name: "sandbox-gateway", status: "UPDATING", region: "eu-west-1", authorizerType: "NONE", jwtDiscoveryUrl: null, allowedAudiences: [], linkedAgents: [], policyEngine: null, scorecard: { score: 20, grade: "F", findings: ["no authorizer"] }, wafFailureMode: "FAIL_OPEN" },
  ],
  policyEngines: [{ name: "pe-3", policyCount: 7, attachedGateways: [], kmsKeyArn: null, orphaned: true, status: "ACTIVE" }],
  account: { accountId: "000000000000", gatewayBypassPosture: { bypassPossible: true, reason: "no authorizer", affectedGateways: ["sandbox-gateway"] }, scorecard: { score: 58, grade: "C", gatewayCount: 3, enforcingCount: 1 } },
};
const DIAGRAM = {
  title: "Nested-claim gate", intro: "diagram intro",
  nodes: [{ id: "agent", label: "Agent", kind: "actor", x: 0, y: 0 }, { id: "app", label: "P1 Privilege Agent App", kind: "gateway", x: 300, y: 0 }],
  steps: [{ from: "agent", to: "app", label: "Bearer token", say: "The agent presents the token." }, { from: "app", to: "agent", label: "Decision", say: "The app answers." }],
};
const hop = (n) => ({ n, from: "agent", to: "app", label: `hop ${n}`, traceparent: `00-${"a".repeat(32)}-${String(n).repeat(16)}-01`, request: `traceparent: 00-${"a".repeat(32)}-${String(n).repeat(16)}-01`, response: "HTTP/1.1 200 OK" });

const SCOPE = {
  title: "Gateway v1.261027: scope gates", intro: "Three measured things.", tokenLabel: "MOCK values: invented", simulated: true,
  facts: [{ id: "cedar-scope", status: "measured", text: "Cedar blocks by scope.", source: "live run" }, { id: "new-in-version", status: "UNVERIFIED", text: "Which version is unknown.", source: "none" }],
  sections: [
    { id: "cedar", title: "A. Cedar scope gate", kind: "cedar", intro: "i", policy: "forbid (...);", scenarios: [
      { id: "cedar-scope-missing", title: "Active, scope missing", evidence: "measured", tool: "SearchIndexTool", scope: "openid", state: "Active", lesson: "The forbid fires." },
      { id: "cedar-candidate", title: "Candidate policy: shadow only", evidence: "measured", tool: "SearchIndexTool", scope: "openid", state: "", lesson: "State empty is a candidate." }] },
    { id: "tiers", title: "C. RequiredClaims scope tiers", kind: "tiers", intro: "i", rules: [{ id: "read", anyOf: ["opensearch:read"], tools: 3 }], scenarios: [
      { id: "tier-read", title: "Read scope: 3 tools", evidence: "measured", scope: "openid opensearch:read", lesson: "Three tools." }] },
  ],
};
const scopeResult = (id, scope) => {
  if (id === "cedar-scope-missing") return { kind: "cedar", scenario: id, result: { decision: "deny", status: 400, jsonRpcCode: -32600, message: "action denied by policy", log: ["aipolicy: denied"] } };
  if (id === "cedar-candidate") return { kind: "cedar", scenario: id, result: { decision: "allow", status: 200, shadow: true, log: ["mcp_policy_shadow_delta: x"] } };
  const admin = /opensearch:admin/.test(scope || "");
  return { kind: "tiers", scenario: id, result: { decision: "allow", status: 200, tools: admin ? 9 : 3, matched: [{ id: "read", anyOf: ["opensearch:read"], tools: 3, ok: true }], log: [`${admin ? 9 : 3} tools listed`] } };
};

const AGC = {
  title: "Gateway v1.261028: AgentCore governance", intro: "Read from the binary.", tokenLabel: "MOCK values: invented", version: "v1.261028", simulated: true,
  manage: [["Enforcement mode", "Switch a gateway between enforcing and log-only"]], analyze: [["Caller access", "Who may call a gateway"]],
  facts: [{ id: "diff-size", status: "measured", text: "84 symbols added.", source: "symbol diff" }, { id: "rules-unknown", status: "UNVERIFIED", text: "Rules not observed.", source: "no Ping source" }],
  sections: [
    { id: "bypass", title: "A. Can the runtime be reached around the gateway?", kind: "bypass", intro: "i", scenarios: [
      { id: "bypass-open", title: "Open runtime policy", evidence: "inferred", statements: [{ effect: "Allow", action: "bedrock-agentcore:*", principal: "*" }], gatewayOnly: false, lesson: "Any principal can skip the gateway." },
      { id: "bypass-gateway-only", title: "Gateway-only switch on", evidence: "inferred", statements: [], gatewayOnly: true, lesson: "Direct callers refused." }] },
    { id: "caller", title: "B. Who may call the gateway?", kind: "caller", intro: "i", scenarios: [
      { id: "caller-jwt-open", title: "JWT, no allow-list", evidence: "inferred", authorizerType: "CUSTOM_JWT", targets: [{ name: "a", allowedWorkloads: [] }], lesson: "Any token accepted." }] },
  ],
};
const agcResult = (id) => id === "bypass-open" ? { kind: "bypass", result: { bypassPossible: true, directInvokers: ["*"], reason: "any principal can call this runtime directly" } }
  : id === "bypass-gateway-only" ? { kind: "bypass", result: { bypassPossible: false, directInvokers: [], reason: "gateway-only: direct callers are refused" } }
    : { kind: "caller", result: { callerClass: "any token from the IdP accepted", summary: "1 of 1 target(s) without a caller allow-list", risky: true } };

// ---- H2 2026 release tabs: fixtures and a small fake server for the AgentCore console ----
const TAGS = { deck: "deck claim", swagger: "console swagger name (schema only)", reading: "lab reading", invented: "lab-invented", measured: "measured (our note)" };
const WHY = { slide: 48, feature: "Intent, Purpose, Behaviour", challenge: "A tool name cannot say why.", technical: "Three separable signals.", business: "Unblocks unattended agents." };
const OBO_STORY = {
  title: "On-behalf-of title", intro: "Intro.", noLive: "Mock only: this app has no Live engine (it refuses GCLAB_MODE=live). Nothing here calls a gateway.", tags: TAGS, why: WHY, simulated: true,
  resourceChoices: ["orders", "reports", "unlisted", "none"], config: { TokenURL: "https://pf.example/as/token.oauth2", Resource: "https://mcp.example/orders/mcp", SubjectTokenType: "" },
  configRows: [{ field: "TokenURL", tag: "swagger" }, { field: "ClientSecret", tag: "swagger", note: "write-only here: the lab holds none" }, { field: "SubjectTokenType", tag: "swagger" }],
  claimRows: [{ claim: "act", tag: "deck", note: "Slide 48." }, { claim: "aud", tag: "reading", note: "Resource." }],
  facts: [{ id: "deck-obo", tag: "deck", text: "NEW: the gateway swaps the token.", source: "deck slide 48" }, { id: "x", tag: "invented", text: "The checks are ours.", source: "this lab" }],
  scenarios: [
    { id: "allowed", title: "Allowed: a token minted for the backend", expected: "allow", evidence: "reading", lesson: "The backend gets a new token." },
    { id: "expired", title: "Denied: the caller token has expired", expected: "deny", evidence: "reading", lesson: "Expired is not exchanged." },
    { id: "replay", title: "Denied: replayed", expected: "deny", evidence: "invented", lesson: "Twice." },
  ],
};
const oboRun = (id, body = {}) => {
  const deny = id !== "allowed" || body.resource === "reports";
  const checks = deny ? [{ id: "inbound_signature", ok: true, detail: "ok" }, { id: "inbound_expiry", ok: false, detail: "exp is not after the lab clock" }, { id: "resource", ok: null, detail: "not reached" }] : [{ id: "inbound_signature", ok: true, detail: "ok" }, { id: "resource", ok: true, detail: "orders" }];
  const ex = deny ? null : { header: { alg: "MOCK-HS256" }, claims: { aud: "https://mcp.example/orders/mcp", sub: "user-1001", act: { sub: "orders-agent" } }, signature: "sig" };
  return { scenario: id, request: { resource: "https://mcp.example/orders/mcp", resourceChoice: body.resource || "orders", scope: body.scope ?? "orders:read" }, inbound: { header: { alg: "MOCK-HS256" }, claims: { sub: "user-1001", aud: "https://gateway.example/mcp" }, signature: "sig" },
    result: { decision: deny ? "deny" : "allow", status: deny ? 401 : 200, oauthError: deny ? "invalid_token" : null, code: deny ? "expired" : null, checks, exchanged: ex },
    steps: id === "replay" ? [{ label: "First presentation", result: { decision: "allow" } }, { label: "Second presentation of the same token", result: { decision: "deny", code: "replayed" } }] : [{ label: "Exchange", result: { decision: deny ? "deny" : "allow", code: deny ? "expired" : null } }],
    backend: deny ? null : { audience: "https://mcp.example/orders/mcp", exchanged: { accepted: true, why: "issued to this backend" }, original: { accepted: false, why: "the audience is not this backend" }, differs: true, logWithOnBehalfOf: "user=user-1001 actor=orders-agent client=x", logWithSharedServiceAccount: "user=(unknown)" },
    hops: [{ n: 1, label: "Agent calls the gateway", traceparent: `00-${"b".repeat(32)}-${"1".repeat(16)}-01`, request: "POST https://gateway.example/mcp", response: "HTTP/1.1 200 OK" }], traceId: "b".repeat(32) };
};
const GW0 = () => ({ id: "gw-lab-01", name: "northwind-gateway", engine: { mode: "LOG_ONLY" }, wafFailureMode: "fail-open", pinnedEndpoint: null,
  targets: [{ id: "tg-1", name: "orders-tool", enabled: true }, { id: "tg-2", name: "payments-tool", enabled: true }],
  sessions: [{ id: "s-0001", principal: "role-lab-batch-job" }], runtimes: [{ id: "rt-1", name: "northwind-runtime", networkMode: "PUBLIC", resourcePolicy: "direct-allowed", callers: [{ principal: "role-lab-batch-job", direct: true }] }] });
const CONSOLE_STORY = { title: "AgentCore console title", intro: "Intro.", noLive: "Mock only: this app has no Live engine (it refuses GCLAB_MODE=live). Nothing here calls a gateway.", tags: TAGS, why: { ...WHY, slide: 45, feature: "AI Platform Agents" }, auditCap: 100, wafModes: ["fail-open", "fail-closed"],
  fieldRows: [{ field: "Tool targets", tag: "deck" }], facts: [{ id: "deck-govern", tag: "deck", text: "NEW: the gateway is an object of policy.", source: "deck slide 45" }] };
let gw; let audit; let consoleFail;
const score = () => { const g = gw; const checks = [{ id: "waf", name: "WAF", green: g.wafFailureMode === "fail-closed", why: "w", rule: "r" }, { id: "enf", name: "Enforcement", green: g.engine.mode === "ENFORCE", why: "e", rule: "r" }, { id: "pin", name: "Caller pinning", green: g.pinnedEndpoint !== null, why: "p", rule: "r" }]; return { checks, greenCount: checks.filter((c) => c.green).length, total: 3 }; };
const view = () => ({ gateway: gw, scorecard: score(), bypassDiff: [], principals: ["role-lab-batch-job", "role-lab-unknown"], audit, auditCap: 100, workspace: "w" });
function consoleServer(url, opts) {
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (url.startsWith("/api/agentcore-console/walkthroughs")) return json({ source: "generated from the engine", walkthroughs: [{ id: "harden", title: "Harden it", say: "Step by step.", steps: [{ op: "act", params: { kind: "set-waf", mode: "fail-closed" }, ok: true, status: 200, result: { wafFailureMode: "fail-closed" } }, { op: "act", params: { kind: "set-enforcement", mode: "ENFORCE" }, ok: false, status: 403, code: "confirmation_mismatch" }], final: { scorecard: { greenCount: 2, total: 3 } } }] });
  if (url.startsWith("/api/agentcore-console") && !url.includes("/act") && !url.includes("/probe")) return json({ story: CONSOLE_STORY, ...view() });
  const b = JSON.parse(opts.body);
  if (url === "/api/agentcore-console/probe") return json({ kind: b.kind, outcome: b.kind === "waf-outage" ? (gw.wafFailureMode === "fail-closed" ? "blocked" : "passed unscreened") : gw.engine.mode === "ENFORCE" ? "denied" : "allowed", reason: "because", hops: [] });
  if (consoleFail) return json({ error: "internal_error" }, 500);
  const before = score().greenCount;
  if (b.kind === "set-enforcement" && b.mode === "ENFORCE" && b.confirm !== gw.name) return json({ error: "confirmation_mismatch", detail: "the typed confirmation does not match the gateway name; nothing changed" }, 403);
  if (b.kind === "set-enforcement") gw.engine.mode = b.mode;
  if (b.kind === "set-waf") gw.wafFailureMode = b.mode;
  if (b.kind === "set-target") gw.targets.find((t) => t.id === b.target).enabled = b.enabled;
  if (b.kind === "pin-endpoint") gw.pinnedEndpoint = b.endpoint;
  if (b.kind === "end-session") gw.sessions = gw.sessions.filter((s) => s.id !== b.session);
  let extra = {};
  if (b.kind === "close-bypass") { gw.runtimes[0].resourcePolicy = "gateway-only"; gw.runtimes[0].callers = [{ principal: "role-lab-batch-job", direct: false }]; extra = { lockedOut: ["role-lab-batch-job"], stillMediated: [] }; }
  audit = [...audit, { n: audit.length + 1, kind: b.kind, scorecardBefore: before, scorecardAfter: score().greenCount }];
  return json({ kind: b.kind, ...extra, scorecardChange: { before, after: score().greenCount, total: 3 }, hops: [{ n: 1, request: "POST https://control.example/x", response: "HTTP/1.1 200 OK" }], ...view() });
}

let calls;
let override = {};
function mockFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    calls.push({ url, opts });
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url.startsWith("/api/scenarios")) return override.scenarios ? override.scenarios() : json(STORY);
    if (url === "/api/info") return override.info ? override.info() : json({ mode: "mock", source: "mock", realAvailable: false, realReason: "Mock only: this app has no Live engine (it refuses GCLAB_MODE=live). Nothing here calls a gateway.", modes: { mock: true, live: false }, liveRefusal: "Mock only: this app has no Live engine (it refuses GCLAB_MODE=live). Nothing here calls a gateway.", simulated: true });
    if (url === "/api/mode" && opts.method === "POST") { const b = JSON.parse(opts.body || "{}"); if (b.source === "real") return json({ error: "real_not_available", source: "mock", realAvailable: false, realReason: "Mock only: this app has no Live engine.", detail: "Mock only: this app has no Live engine." }, 409); return json({ source: "mock", realAvailable: false, realReason: "Mock only: this app has no Live engine." }); }
    if (url === "/api/posture") return json(POSTURE);
    if (url === "/api/latest") return json(LATEST);
    if (url.startsWith("/api/diagram")) return json(DIAGRAM);
    if (url.startsWith("/api/scope-gate") && !url.endsWith("/evaluate")) return json(SCOPE);
    if (url === "/api/scope-gate/evaluate") { const b = JSON.parse(opts.body); if (/ghp_/.test(b.scope || "")) return json({ error: "credential_like", detail: "that text looks like a credential, so it was not used" }, 400); return b.scenario === "bad" ? json({ error: "too_long", detail: "scope is longer than 256" }, 400) : json(scopeResult(b.scenario, b.scope, b.scope)); }
    if (url === "/api/agentcore") return json(AGC);
    if (url === "/api/agentcore/evaluate") return json(agcResult(JSON.parse(opts.body).scenario));
    if (url.startsWith("/api/obo")) { if (override.obo) return override.obo(url, opts); return url === "/api/obo/evaluate" ? json(oboRun(JSON.parse(opts.body).scenario, JSON.parse(opts.body))) : json(OBO_STORY); }
    if (url.startsWith("/api/agentcore-console")) return consoleServer(url, opts);
    if (url === "/api/shelf") return json({ shelfUrl: "https://shelf.example:8443" });
    if (url === "/api/reset") { gw = GW0(); audit = []; return json({ reset: "ok" }); }
    if (url === "/api/evaluate") {
      const body = JSON.parse(opts.body);
      if (body.scenario) {
        const s = SCEN.find((x) => x.id === body.scenario);
        const trap = s.id === "act-text";
        return json({ decision: s.expected, expected: s.expected, traceId: "a".repeat(32), hops: [hop(1), hop(2), hop(3)],
          checks: [{ path: "client_id", ok: true, reason: "match", detail: "ok" }, { path: "act.sub", ok: !trap, reason: trap ? "parent_not_object" : "match", detail: trap ? "act is the string \"{}\", not an object" : "ok" }],
          flat: trap ? [{ path: "act", value: "{}" }, { path: "client_id", value: "a" }] : [{ path: "act.sub", value: "a" }, { path: "client_id", value: "a" }] });
      }
      return json({ error: "too_deep", detail: "nesting deeper than 6" }, 400);
    }
    return json({}, 404);
  });
}
beforeEach(() => { override = {}; gw = GW0(); audit = []; consoleFail = false; mockFetch(); window.location.hash = ""; });

const ready = async () => { render(<App />); await screen.findByText("Allowed: act.sub matches"); await screen.findByTestId("verdict"); };

describe("shell", () => {
  it("shows the Shelf button in the header, linking to the shelf URL from /api/shelf", async () => {
    await ready();
    const link = await screen.findByRole("link", { name: "Shelf" });
    expect(link).toHaveAttribute("href", "https://shelf.example:8443");
  });
  it("shows the banner, the mode, and sends X-Workspace on API calls", async () => {
    await ready();
    expect(screen.getByTestId("banner")).toHaveTextContent(/^SIMULATED, MOCK mode/);
    expect(screen.getByTestId("mode")).toHaveTextContent("Mode: mock (no Live engine)");
    const ev = calls.find((c) => c.url === "/api/evaluate");
    expect(ev.opts.headers["x-workspace"]).toMatch(/^[a-z0-9-]{1,40}$/);
  });
  it("Reset calls /api/reset", async () => {
    await ready();
    await userEvent.click(screen.getByTestId("reset"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/reset" && c.opts.method === "POST")).toBe(true));
  });
});

describe("Mock | Live toggle (every page)", () => {
  it("is in the header on every tab; Mock is pressed; Live is refused with the server's honest message and the page stays in mock", async () => {
    await ready();
    for (const name of ["Nested-claim gate", "v1.261029 + v1.261030", "On-behalf-of", "AgentCore console", "AgentCore posture", "Diagram", "Talk track"]) {
      await userEvent.click(screen.getByRole("tab", { name }));
      expect(screen.getByRole("group", { name: "Mode" })).toBeVisible();
      expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("mode-live")).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.queryByTestId("live-refusal")).toBeNull();
    // Rule 19: Real is disabled with the server's reason; a click cannot post.
    expect(screen.getByTestId("mode-live")).toBeDisabled();
    expect(screen.getByTestId("mode-live").getAttribute("title")).toMatch(/Mock only/);
    const before = calls.length;
    await userEvent.click(screen.getByTestId("mode-live"));
    expect(calls.length).toBe(before);
    expect(screen.getByTestId("mode-live")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("mode")).toHaveTextContent("Mode: mock");
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "mock");
    // Rule 19: mock→mock posts /api/mode with exactly {source} and the server's answer reloads the info.
    await userEvent.click(screen.getByTestId("mode-mock"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/mode" && c.opts.method === "POST" && c.opts.body === JSON.stringify({ source: "mock" }))).toBe(true));
    expect(screen.queryByTestId("live-refusal")).toBeNull();
  });
  it("rule 19: a 409 from POST /api/mode shows the server's reason and the page stays mock", async () => {
    await ready();
    override.info = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ mode: "mock", source: "mock", realAvailable: false, realReason: "Mock only: this app has no Live engine (it refuses GCLAB_MODE=live). Nothing here calls a gateway.", modes: { mock: true, live: false }, liveRefusal: "Mock only: this app has no Live engine.", simulated: true }) });
    // force a switchable-looking Real by re-rendering with a 409 server: Real stays disabled so it cannot be pressed
    expect(screen.getByTestId("mode-live")).toBeDisabled();
    expect(screen.getByTestId("mode")).toHaveTextContent("Mode: mock");
    expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "mock");
  });
});

describe("nested-claim gate tab", () => {
  it("allows the matching scenario and shows token JSON, rule, flattened paths and hops", async () => {
    await ready();
    expect(screen.getByTestId("verdict")).toHaveTextContent("ALLOW");
    expect(screen.getByTestId("token-claims")).toHaveTextContent('"sub": "a"');
    expect(screen.getByTestId("rule-json")).toHaveTextContent("act.sub");
    expect(within(screen.getByTestId("flat-table")).getByText("act.sub")).toBeInTheDocument();
    expect(screen.getByTestId("hops")).toHaveTextContent(/traceparent: 00-a{32}-1{16}-01/);
    expect(screen.getByTestId("facts")).toHaveTextContent("UNVERIFIED");
  });
  it('denies the act="{}" trap with parent_not_object', async () => {
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /text "\{\}"/ }));
    await waitFor(() => expect(screen.getByTestId("verdict")).toHaveTextContent("DENY"));
    expect(screen.getByTestId("verdict").querySelector('[data-reason="parent_not_object"]')).not.toBeNull();
    expect(screen.getByTestId("lesson")).toHaveTextContent("The trap.");
  });
  it("custom editor: invalid JSON and a server 400 both show inline errors", async () => {
    await ready();
    const box = screen.getByLabelText(/Token claims/);
    await userEvent.clear(box);
    await userEvent.type(box, "not json");
    await userEvent.click(screen.getByRole("button", { name: "Evaluate custom" }));
    expect(await screen.findByTestId("custom-error")).toHaveTextContent("not valid JSON");
    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste('{"a": 1}');
    await userEvent.click(screen.getByRole("button", { name: "Evaluate custom" }));
    await waitFor(() => expect(screen.getByTestId("custom-error")).toHaveTextContent("too_deep: nesting deeper than 6"));
  });
});

describe("v1.261029 + v1.261030 tab (readings and the not-yet-measured list)", () => {
  it("shows the three images, the readings and the unmeasured features, every one UNVERIFIED, with its own banner, and nothing marked verified", async () => {
    await ready();
    await userEvent.click(screen.getByRole("tab", { name: "v1.261029 + v1.261030" }));
    expect(await screen.findByTestId("latest-tab")).toBeInTheDocument();
    expect(screen.getByTestId("latest-banner")).toHaveTextContent("UNVERIFIED");
    expect(screen.getByTestId("banner")).toBeVisible();
    expect(within(screen.getByTestId("latest-table")).getAllByRole("row")).toHaveLength(4);
    expect(screen.getByTestId("latest-since")).toHaveTextContent("A rejected approval is not held again");
    expect(screen.getByTestId("latest-since")).toHaveTextContent("UNVERIFIED");
    const nm = screen.getByTestId("latest-not-measured");
    expect(nm).toHaveTextContent("Aggregate cap"); expect(nm).toHaveTextContent("A low-cap key and a small burst.");
    expect(within(nm).getAllByText("UNVERIFIED")).toHaveLength(2);
    expect(screen.getByTestId("latest-recheck")).toHaveTextContent("Look for a newer tag.");
    expect(within(screen.getByTestId("latest-facts")).getAllByText(/^(measured|inferred|UNVERIFIED)$/)).toHaveLength(2); // a status word on every fact, none says verified
    expect(screen.getByTestId("latest-facts")).toHaveTextContent("Behaviour is not known.");
  });
  it("presenter mode keeps both banners and shows the matching talk-track entry", async () => {
    await ready();
    await userEvent.click(screen.getByRole("tab", { name: "v1.261029 + v1.261030" }));
    await screen.findByTestId("latest-tab");
    await userEvent.keyboard("p");
    expect(screen.getByTestId("banner")).toBeVisible();
    expect(screen.getByTestId("latest-banner")).toBeVisible();
    expect(document.querySelector(".app--presenter")).not.toBeNull();
  });
  it("a server failure is shown as text and the tab strip stays", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, opts) => (url === "/api/latest" ? { ok: false, status: 500, json: async () => ({}) } : orig(url, opts)));
    await ready();
    await userEvent.click(screen.getByRole("tab", { name: "v1.261029 + v1.261030" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the newer-release notes");
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});

describe("AgentCore posture tab", () => {
  it("is labelled shape-only and lists gateways, engines (orphaned) and the account posture", async () => {
    await ready();
    await userEvent.click(screen.getByRole("tab", { name: "AgentCore posture" }));
    expect(await screen.findByTestId("posture-label")).toHaveTextContent("Shape only - field values invented - UNVERIFIED against the real product");
    expect(screen.getByTestId("banner")).toBeInTheDocument();
    expect(screen.getByTestId("gateway-detail")).toHaveTextContent("CUSTOM_JWT");
    await userEvent.click(screen.getByRole("button", { name: /sandbox-gateway/ }));
    expect(screen.getByTestId("gateway-detail")).toHaveTextContent("none attached");
    expect(screen.getByTestId("engines")).toHaveTextContent("pe-3");
    expect(within(screen.getByTestId("engines")).getByText("yes")).toBeInTheDocument();
    expect(screen.getByTestId("account")).toHaveTextContent("1 of 3 gateways enforcing");
  });
});

describe("diagram tab", () => {
  it("draws the boxes from /api/diagram and Simulate highlights a step; Reset clears it", async () => {
    await ready();
    await userEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    expect(await screen.findByText("P1 Privilege Agent App")).toBeInTheDocument();
    expect(calls.some((c) => c.url.startsWith("/api/diagram?vertical=retail"))).toBe(true);
    expect(screen.getByTestId("banner")).toBeInTheDocument();
    expect(screen.getByLabelText(/Step time/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /simulate/i }));
    expect(await screen.findByTestId("pattern-now")).toHaveTextContent("Step 1: Bearer token");
    await userEvent.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.queryByTestId("pattern-now")).toBeNull());
  });
});

describe("talk track and presenter mode", () => {
  it("lists the talk track; presenter mode keeps the banner and shows the say-text; Esc leaves", async () => {
    await ready();
    await userEvent.click(screen.getByRole("tab", { name: "Talk track" }));
    expect(screen.getByTestId("talk-track")).toHaveTextContent("Everything is simulated.");
    await userEvent.click(screen.getByRole("tab", { name: "Nested-claim gate" }));
    await userEvent.keyboard("p");
    expect(await screen.findByTestId("presenter-say")).toHaveTextContent("Walk it.");
    expect(screen.getByTestId("banner")).toHaveTextContent(/^SIMULATED/);
    expect(document.querySelector(".app--presenter")).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector(".app--presenter")).toBeNull();
  });
  it("P ignores modifier keys (Cmd/Ctrl/Alt+P is the browser's) and keystrokes in a text box; Esc keeps the banner", async () => {
    await ready();
    await userEvent.keyboard("{Control>}p{/Control}{Meta>}p{/Meta}{Alt>}p{/Alt}");
    expect(document.querySelector(".app--presenter")).toBeNull();
    await userEvent.click(screen.getByLabelText(/Token claims/));
    await userEvent.keyboard("p");
    expect(document.querySelector(".app--presenter")).toBeNull();
    await userEvent.click(document.body);
    await userEvent.keyboard("P");
    expect(document.querySelector(".app--presenter")).not.toBeNull();
    expect(screen.getByTestId("banner")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector(".app--presenter")).toBeNull();
    expect(screen.getByTestId("banner")).toBeVisible();
  });
});

describe("diagram edge labels", () => {
  it("nudges the two labels of a back-and-forth pair in opposite directions and leaves the rest alone", () => {
    const steps = [{ from: "a", to: "b" }, { from: "b", to: "a" }, { from: "a", to: "c" }];
    expect(labelOffsets(steps)).toEqual([-16, 16, 0]);
    expect(labelOffsets([])).toEqual([]);
  });
});

describe("banner visibility on every tab and in presenter mode", () => {
  it("is visible (not hidden, not display:none) on every tab and in presenter mode", async () => {
    await ready();
    for (const name of ["Nested-claim gate", "v1.261029 + v1.261030", "AgentCore posture", "Diagram", "Talk track"]) {
      await userEvent.click(screen.getByRole("tab", { name }));
      expect(screen.getByTestId("banner")).toBeVisible();
      expect(screen.getByTestId("banner")).not.toHaveAttribute("hidden");
    }
    await userEvent.click(screen.getByRole("tab", { name: "Nested-claim gate" }));
    await userEvent.keyboard("p");
    await screen.findByTestId("presenter-say");
    expect(screen.getByTestId("banner")).toBeVisible();
  });
  it("until /api/scenarios answers the banner is the fixed MOCK text, never blank and never claiming anything else", async () => {
    override.scenarios = () => new Promise(() => {});
    render(<App />);
    expect(screen.getByTestId("banner")).toHaveTextContent(BANNER_UNKNOWN);
    expect(screen.getByTestId("banner")).toBeVisible();
    expect(BANNER_UNKNOWN).toMatch(/^SIMULATED, MOCK mode/);
  });
  it("while nothing has answered, and when both calls fail, the fixed banner stays visible", async () => {
    override.info = () => new Promise(() => {});
    override.scenarios = () => new Promise(() => {});
    const { unmount } = render(<App />);
    expect(screen.getByTestId("banner")).toHaveTextContent(BANNER_UNKNOWN);
    unmount();
    override.info = async () => ({ ok: false, status: 500, json: async () => ({}) });
    override.scenarios = async () => ({ ok: false, status: 500, json: async () => ({}) });
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the lab");
    expect(screen.getByTestId("banner")).toHaveTextContent(BANNER_UNKNOWN);
    expect(screen.getByTestId("banner")).toBeVisible();
  });
});

describe("links from the content pack: /#scenario-<id>", () => {
  it("opens the gate tab on that scenario and runs it", async () => {
    window.location.hash = "#scenario-act-text";
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("verdict")).toHaveTextContent("DENY"));
    expect(screen.getByRole("tab", { name: "Nested-claim gate" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /text "\{\}"/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("verdict").querySelector('[data-reason="parent_not_object"]')).not.toBeNull();
  });
  it("an unknown or hostile id falls back to the first scenario", async () => {
    for (const h of ["#scenario-nope", "#scenario-__proto__", "#scenario-" + "a".repeat(80)]) {
      window.location.hash = h;
      const { unmount } = render(<App />);
      await waitFor(() => expect(screen.getByTestId("verdict")).toHaveTextContent("ALLOW"));
      expect(screen.getByRole("button", { name: /Allowed/ })).toHaveAttribute("aria-pressed", "true");
      unmount();
    }
  });
  it("a hash change while open switches the scenario", async () => {
    await ready();
    window.location.hash = "#scenario-act-text";
    await waitFor(() => expect(screen.getByTestId("verdict")).toHaveTextContent("DENY"));
  });
});

describe("accessibility structure and display safety", () => {
  it("has one main landmark, one banner status inside the header, and a tabpanel that is not the main", async () => {
    await ready();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("banner")).toContainElement(screen.getByTestId("banner"));
    expect(screen.getByRole("tabpanel")).not.toBe(screen.getByRole("main"));
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("tabpanel"));
  });
  it("control and bidi characters are shown as visible escapes", () => {
    expect(visible("a" + String.fromCharCode(0x202e) + "b" + String.fromCharCode(7) + "c" + String.fromCharCode(0x200b) + "d" + String.fromCharCode(0x85) + "e")).toBe("a" + String.fromCharCode(92) + "u202eb" + String.fromCharCode(92) + "u0007c" + String.fromCharCode(92) + "u200bd" + String.fromCharCode(92) + "u0085e");
    expect(visible("line" + String.fromCharCode(10) + "Tab" + String.fromCharCode(9))).toBe("line\nTab\t");
  });
});

describe("v1.261027 scope gates tab", () => {
  const openScope = async () => { await ready(); await userEvent.click(screen.getByRole("tab", { name: "v1.261027 scope gates" })); await screen.findByTestId("scope-section-cedar"); };
  it("runs the Cedar scenarios: an Active policy denies with the JSON-RPC code, a candidate only shadows", async () => {
    await openScope();
    const cedar = screen.getByTestId("scope-section-cedar");
    await waitFor(() => expect(within(cedar).getByTestId("scope-verdict")).toHaveTextContent("DENY"));
    expect(cedar).toHaveTextContent("JSON-RPC -32600");
    await userEvent.click(within(cedar).getByRole("button", { name: "Candidate policy: shadow only" }));
    await waitFor(() => expect(within(cedar).getByTestId("scope-verdict")).toHaveTextContent("Shadow only"));
    expect(within(cedar).getByTestId("scope-verdict")).toHaveTextContent("ALLOW");
  });
  it("tries the visitor's own scope and shows a server refusal as text", async () => {
    await openScope();
    const tiers = screen.getByTestId("scope-section-tiers");
    await waitFor(() => expect(within(tiers).getByTestId("scope-verdict")).toHaveTextContent("opens 3 tools"));
    const input = within(tiers).getByLabelText("Try your own scope (space separated)");
    await userEvent.clear(input); await userEvent.type(input, "openid opensearch:admin");
    await userEvent.click(within(tiers).getByRole("button", { name: "Evaluate this scope" }));
    await waitFor(() => expect(within(tiers).getByTestId("scope-verdict")).toHaveTextContent("9 tools listed"));
    expect(calls.filter((c) => c.url === "/api/scope-gate/evaluate").every((c) => c.opts.headers["x-workspace"])).toBe(true);
  });
  it("a credential-looking scope is refused with the server's fixed text and is never drawn back into the Request pane", async () => {
    await openScope();
    const tiers = screen.getByTestId("scope-section-tiers");
    await waitFor(() => expect(within(tiers).getByTestId("scope-verdict")).toHaveTextContent("opens 3 tools"));
    const input = within(tiers).getByLabelText("Try your own scope (space separated)");
    await userEvent.clear(input); await userEvent.type(input, "openid ghp_Zq9vLmN3xRAbCdEfGhIjKl");
    await userEvent.click(within(tiers).getByRole("button", { name: "Evaluate this scope" }));
    expect(await within(tiers).findByRole("alert")).toHaveTextContent("credential_like: that text looks like a credential");
    expect(tiers.textContent).not.toContain("Zq9vLmN3xR");
  });
  it("labels each fact and keeps the UNVERIFIED one visible", async () => {
    await openScope();
    const facts = screen.getByTestId("scope-facts");
    expect(facts).toHaveTextContent("measured");
    expect(facts).toHaveTextContent("UNVERIFIED");
  });
  it("the diagram tab offers the second diagram by name", async () => {
    await ready();
    await userEvent.click(screen.getByRole("tab", { name: "Diagram" }));
    await userEvent.click(await screen.findByRole("button", { name: "v1.261027 scope gates" }));
    await waitFor(() => expect(calls.some((c) => /name=scope-gate/.test(c.url))).toBe(true));
  });
});

describe("v1.261028 AgentCore tab", () => {
  const openAg = async () => { await ready(); await userEvent.click(screen.getByRole("tab", { name: "v1.261028 AgentCore" })); await screen.findByTestId("ag-section-bypass"); };
  it("shows a bypass for the open runtime policy and none once gateway-only is on", async () => {
    await openAg();
    const sec = screen.getByTestId("ag-section-bypass");
    await waitFor(() => expect(within(sec).getByTestId("ag-verdict")).toHaveTextContent("BYPASS POSSIBLE"));
    await userEvent.click(within(sec).getByRole("button", { name: "Gateway-only switch on" }));
    await waitFor(() => expect(within(sec).getByTestId("ag-verdict")).toHaveTextContent("NO BYPASS"));
  });
  it("shows the caller class and the N of M summary, and sends the workspace header", async () => {
    await openAg();
    const sec = screen.getByTestId("ag-section-caller");
    await waitFor(() => expect(within(sec).getByTestId("ag-verdict")).toHaveTextContent("any token from the IdP accepted"));
    expect(sec).toHaveTextContent("1 of 1 target(s) without a caller allow-list");
    expect(calls.filter((c) => c.url === "/api/agentcore/evaluate").every((c) => c.opts.headers["x-workspace"])).toBe(true);
  });
  it("labels every fact and keeps the UNVERIFIED one visible", async () => {
    await openAg();
    const facts = screen.getByTestId("ag-facts");
    expect(facts).toHaveTextContent("measured"); expect(facts).toHaveTextContent("UNVERIFIED");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// H2 2026 release tabs: on-behalf-of and the AgentCore console
// ---------------------------------------------------------------------------------------------------------------------------------------------
const RELEASE_WORDS = /^Ping release claim, UNVERIFIED on our tenant/;
const openTab = async (name) => { await userEvent.click(screen.getByRole("tab", { name })); };
const pickVertical = async (v) => { await userEvent.selectOptions(screen.getByLabelText(/Vertical/), v); };
const ALL_TABS = ["Nested-claim gate", "v1.261027 scope gates", "v1.261028 AgentCore", "v1.261029 + v1.261030", "On-behalf-of", "AgentCore console", "AgentCore posture", "Diagram", "Talk track"];

describe("release tabs: banner, mode and presenter", () => {
  it("both new tabs are in the strip and show the release banner (and the mock-only line) on top of the simulation banner", async () => {
    await ready();
    expect(screen.queryByTestId("release-banner")).toBeNull(); // the old tabs are unchanged
    for (const [name, noLive] of [["On-behalf-of", "obo-no-live"], ["AgentCore console", "gc-no-live"]]) {
      await openTab(name);
      expect(screen.getByTestId("release-banner")).toHaveTextContent(RELEASE_WORDS);
      expect(screen.getByTestId("release-banner")).toBeVisible();
      expect(screen.getByTestId("banner")).toHaveTextContent(/^SIMULATED, MOCK mode/);
      expect(screen.getByTestId("mode")).toHaveTextContent("Mode: mock (no Live engine)");
      expect(await screen.findByTestId(noLive)).toHaveTextContent("no Live engine");
    }
  });
  it("the release banner stays in presenter mode, with the matching talk track and the why-it-matters line", async () => {
    await ready();
    await openTab("On-behalf-of"); await screen.findByTestId("obo-tab");
    await userEvent.keyboard("p");
    expect(await screen.findByTestId("presenter-say")).toHaveTextContent("Swap the token.");
    expect(screen.getByTestId("presenter-say")).toHaveTextContent("slide 48");
    expect(screen.getByTestId("release-banner")).toBeVisible();
    await openTab("AgentCore console"); await screen.findByTestId("gc-tab");
    expect(screen.getByTestId("presenter-say")).toHaveTextContent("Change the gateway.");
    expect(screen.getByTestId("release-banner")).toHaveTextContent(RELEASE_WORDS);
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector(".app--presenter")).toBeNull();
  });
  it("the banner is there even while the tab is still loading or its server call failed", async () => {
    override.obo = () => new Promise(() => {});
    await ready(); await openTab("On-behalf-of");
    expect(screen.getByTestId("release-banner")).toBeVisible();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    override.obo = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await userEvent.click(screen.getByTestId("reset")); await pickVertical("health");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the on-behalf-of tab");
    expect(screen.getByTestId("release-banner")).toBeVisible();
  });
  it("opens from the content-pack links /#obo and /#console", async () => {
    for (const [h, name, id] of [["#obo", "On-behalf-of", "obo-tab"], ["#console", "AgentCore console", "gc-tab"]]) {
      window.location.hash = h; const { unmount } = render(<App />);
      expect(await screen.findByTestId(id)).toBeInTheDocument();
      expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true"); unmount();
    }
  });
});

describe("render guard: changing the vertical on EVERY tab never blanks the page", () => {
  it("every tab keeps the header, banner, tab strip and a non-empty panel across vertical changes", async () => {
    await ready();
    for (const name of ALL_TABS) {
      await openTab(name);
      for (const v of ["health", "retail"]) {
        await pickVertical(v);
        expect(screen.getByTestId("banner")).toBeVisible();
        expect(screen.getByRole("tablist")).toBeInTheDocument();
        expect(screen.queryByTestId("tab-crash")).toBeNull();
        await waitFor(() => expect(screen.getByRole("tabpanel").textContent.length).toBeGreaterThan(20));
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Gateway Claims LAB");
      }
    }
  });
  it("a tab that cannot be drawn shows a notice, keeps the banner and the tabs, and clears on another tab or another vertical", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      override.obo = async (url) => (url === "/api/obo/evaluate" ? { ok: true, status: 200, json: async () => ({}) } : { ok: true, status: 200, json: async () => OBO_STORY }); // an answer with no result
      await ready(); await openTab("On-behalf-of");
      expect(await screen.findByTestId("tab-crash")).toHaveTextContent("could not be drawn");
      expect(screen.getByTestId("banner")).toBeVisible(); expect(screen.getByTestId("release-banner")).toBeVisible(); expect(screen.getByRole("tablist")).toBeInTheDocument();
      await openTab("AgentCore console");
      expect(screen.queryByTestId("tab-crash")).toBeNull(); expect(await screen.findByTestId("gc-tab")).toBeInTheDocument();
      override.obo = undefined; await openTab("On-behalf-of");
      expect(await screen.findByTestId("obo-verdict")).toBeInTheDocument();
    } finally { spy.mockRestore(); }
  });
});

describe("on-behalf-of tab", () => {
  const openObo = async () => { await ready(); await openTab("On-behalf-of"); await screen.findByTestId("obo-verdict"); };
  it("runs the first scenario, shows the checks, the two tokens, the backend view and the mock hops with a traceparent", async () => {
    await openObo();
    await waitFor(() => expect(screen.getByTestId("obo-verdict")).toHaveTextContent("ALLOW"));
    expect(screen.getByTestId("obo-checks")).toHaveTextContent("passed");
    expect(screen.getByTestId("obo-exchanged")).toHaveTextContent("MOCK-HS256");
    expect(screen.getByTestId("obo-inbound")).toHaveTextContent("user-1001");
    expect(screen.getByTestId("obo-backend")).toHaveTextContent(/Exchanged token\s*accepted/);
    expect(screen.getByTestId("obo-backend")).toHaveTextContent(/Caller's own token\s*refused/);
    expect(screen.getByTestId("obo-hops")).toHaveTextContent(/POST https:\/\/gateway\.example\/mcp/);
    expect(calls.filter((c) => c.url === "/api/obo/evaluate").every((c) => c.opts.headers["x-workspace"] && JSON.parse(c.opts.body).vertical === "retail")).toBe(true);
  });
  it("a refused scenario says which check refused and which were not reached, and no token is minted", async () => {
    await openObo();
    await userEvent.click(screen.getByRole("button", { name: /caller token has expired/ }));
    await waitFor(() => expect(screen.getByTestId("obo-verdict")).toHaveTextContent("DENY"));
    expect(screen.getByTestId("obo-checks")).toHaveTextContent(/inbound_expiry: refused/);
    expect(screen.getByTestId("obo-checks")).toHaveTextContent(/resource: not reached/);
    expect(screen.getByTestId("obo-exchanged")).toHaveTextContent("None");
    expect(screen.getByTestId("obo-backend")).toHaveTextContent("nothing reached the backend");
    expect(screen.getByTestId("obo-lesson")).toHaveTextContent("Expired is not exchanged.");
  });
  it("the replay scenario lists both presentations", async () => {
    await openObo();
    await userEvent.click(screen.getByRole("button", { name: /replayed/ }));
    await waitFor(() => expect(screen.getByTestId("obo-verdict")).toHaveTextContent("Second presentation of the same token: refused (replayed)"));
    expect(screen.getByTestId("obo-verdict")).toHaveTextContent("First presentation: allowed");
  });
  it("changing the backend and the requested scope each send that field to the server, then show the new verdict", async () => {
    await openObo();
    await userEvent.selectOptions(screen.getByLabelText("Backend (Resource)"), "reports");
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/obo/evaluate").some((c) => JSON.parse(c.opts.body).resource === "reports")).toBe(true));
    await waitFor(() => expect(screen.getByTestId("obo-verdict")).toHaveTextContent("DENY"));
    const box = screen.getByLabelText(/Requested scope/);
    await userEvent.clear(box); await userEvent.type(box, "orders:read orders:write");
    await userEvent.click(screen.getByRole("button", { name: "Evaluate this request" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/obo/evaluate" && JSON.parse(c.opts.body).scope === "orders:read orders:write")).toBe(true));
  });
  it("a server refusal is shown as text, not as markup", async () => {
    override.obo = async (url) => (url === "/api/obo/evaluate" ? { ok: false, status: 400, json: async () => ({ error: "bad_scope", detail: "a scope name has a character the lab does not take" }) } : { ok: true, status: 200, json: async () => OBO_STORY });
    await ready(); await openTab("On-behalf-of");
    expect(await screen.findByTestId("obo-fail")).toHaveTextContent("bad_scope: a scope name has a character the lab does not take");
  });
  it("ignores a slow answer that arrives after a newer one (stale-response guard)", async () => {
    let release; const slow = new Promise((r) => { release = r; });
    let n = 0;
    override.obo = (url, opts) => {
      if (url !== "/api/obo/evaluate") return { ok: true, status: 200, json: async () => OBO_STORY };
      const b = JSON.parse(opts.body); n += 1;
      if (n === 1) return slow.then(() => ({ ok: true, status: 200, json: async () => oboRun("allowed", b) }));
      return { ok: true, status: 200, json: async () => oboRun(b.scenario, b) };
    };
    await ready(); await openTab("On-behalf-of"); await screen.findByTestId("obo-tab");
    await userEvent.click(screen.getByRole("button", { name: /caller token has expired/ }));
    await waitFor(() => expect(screen.getByTestId("obo-verdict")).toHaveTextContent("DENY"));
    release();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByTestId("obo-verdict")).toHaveTextContent("DENY"); // the first (allow) answer did not overwrite it
  });
  it("tags every row: deck, swagger, reading and invented are all shown, and the write-only fields are named but never given a value", async () => {
    await openObo();
    const claimRows = within(screen.getByTestId("obo-claim-rows"));
    expect(claimRows.getByText("deck claim")).toBeInTheDocument(); expect(claimRows.getByText("lab reading")).toBeInTheDocument();
    const cfg = within(screen.getByTestId("obo-config-rows"));
    expect(cfg.getAllByText("console swagger name (schema only)").length).toBe(3);
    expect(screen.getByTestId("obo-config-rows")).toHaveTextContent("write-only here");
    expect(screen.getByTestId("obo-facts")).toHaveTextContent("lab-invented");
    expect(screen.getByTestId("why-matters")).toHaveTextContent("Per Ping's deck, slide 48");
    expect(screen.getByTestId("why-matters")).toHaveTextContent("Business value");
  });
  it("Reset runs the scenario again from its own defaults", async () => {
    await openObo();
    await userEvent.selectOptions(screen.getByLabelText("Backend (Resource)"), "reports");
    await waitFor(() => expect(screen.getByTestId("obo-verdict")).toHaveTextContent("DENY"));
    await userEvent.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.getByTestId("obo-verdict")).toHaveTextContent("ALLOW"));
    expect(screen.getByLabelText("Backend (Resource)")).toHaveValue("orders");
  });
  it("the diagram tab offers the on-behalf-of diagram by name", async () => {
    await ready(); await openTab("Diagram");
    await userEvent.click(await screen.findByRole("button", { name: "On-behalf-of" }));
    await waitFor(() => expect(calls.some((c) => /name=obo/.test(c.url))).toBe(true));
  });
});

describe("AgentCore console tab", () => {
  const openGc = async () => { await ready(); await openTab("AgentCore console"); await screen.findByTestId("gc-scorecard"); const b = screen.getByRole("button", { name: "Disable orders-tool" }); await waitFor(() => expect(b).toBeEnabled()); };
  it("shows the computed scorecard, the controls and the recorded walkthroughs, all tagged", async () => {
    await openGc();
    expect(screen.getByTestId("gc-green")).toHaveTextContent("0 of 3 checks green");
    expect(screen.getByTestId("gc-controls")).toHaveTextContent("northwind-gateway");
    expect(await screen.findByTestId("gc-walkthroughs")).toHaveTextContent("Harden it");
    expect(screen.getByTestId("gc-walkthroughs")).toHaveTextContent("refused (confirmation_mismatch)");
    expect(screen.getByTestId("gc-field-rows")).toHaveTextContent("deck claim");
    expect(screen.getByTestId("gc-facts")).toHaveTextContent("deck slide 45");
    expect(screen.getByTestId("why-matters")).toHaveTextContent("slide 45");
  });
  it("disables and enables a tool target, sending the target and the flag, and the audit trail records it", async () => {
    await openGc();
    await userEvent.click(screen.getByRole("button", { name: "Disable orders-tool" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enable orders-tool" })).toBeEnabled());
    const c = calls.filter((x) => x.url === "/api/agentcore-console/act").map((x) => JSON.parse(x.opts.body));
    expect(c[0]).toMatchObject({ kind: "set-target", target: "tg-1", enabled: false, vertical: "retail" });
    expect(screen.getByTestId("gc-audit")).toHaveTextContent("set-target");
    expect(calls.filter((x) => x.url === "/api/agentcore-console/act").every((x) => x.opts.headers["x-workspace"])).toBe(true);
  });
  it("the WAF buttons switch the mode and the scorecard follows; the pressed one does nothing", async () => {
    await openGc();
    const closed = screen.getByRole("button", { name: "fail-closed" }); const open = screen.getByRole("button", { name: "fail-open" });
    expect(open).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(open); expect(calls.some((x) => x.url === "/api/agentcore-console/act")).toBe(false);
    await userEvent.click(closed);
    await waitFor(() => expect(screen.getByTestId("gc-green")).toHaveTextContent("1 of 3"));
    expect(screen.getByRole("button", { name: "fail-closed" })).toHaveAttribute("aria-pressed", "true");
  });
  it("log-only to enforcing needs the typed name: the button waits for text, a wrong name is refused and changes nothing, the right one switches", async () => {
    await openGc();
    const btn = screen.getByRole("button", { name: "Switch to ENFORCE" });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    btn.focus(); await userEvent.click(btn);
    expect(document.activeElement).toBe(btn); // aria-disabled keeps focus, and pressing it does nothing
    expect(calls.some((x) => x.url === "/api/agentcore-console/act")).toBe(false);
    const input = screen.getByLabelText("Type the gateway name to enforce");
    await userEvent.type(input, "wrong-name");
    await waitFor(() => expect(btn).not.toHaveAttribute("aria-disabled"));
    await userEvent.click(btn);
    expect(await screen.findByTestId("gc-fail")).toHaveTextContent("Refused (confirmation_mismatch)");
    expect(screen.getByTestId("gc-engine-mode")).toHaveTextContent("LOG_ONLY");
    expect(screen.getByTestId("gc-green")).toHaveTextContent("0 of 3");
    await userEvent.clear(input); await userEvent.type(input, "northwind-gateway");
    await userEvent.click(screen.getByRole("button", { name: "Switch to ENFORCE" }));
    await waitFor(() => expect(screen.getByTestId("gc-engine-mode")).toHaveTextContent("ENFORCE"));
    expect(screen.getByTestId("gc-green")).toHaveTextContent("1 of 3");
    expect(screen.queryByTestId("gc-fail")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Back to LOG_ONLY" }));
    await waitFor(() => expect(screen.getByTestId("gc-engine-mode")).toHaveTextContent("LOG_ONLY"));
  });
  it("closing a bypass route names who it locks out; pinning an endpoint and ending a session each send their own field", async () => {
    await openGc();
    await userEvent.click(screen.getByRole("button", { name: "Close bypass on northwind-runtime" }));
    expect(await screen.findByTestId("gc-locked-out")).toHaveTextContent("role-lab-batch-job");
    await waitFor(() => expect(screen.getByRole("button", { name: "Close bypass on northwind-runtime" })).toHaveAttribute("aria-disabled", "true"));
    await userEvent.type(screen.getByLabelText(/Endpoint to pin/), "https://gw.northwind.example");
    await userEvent.click(screen.getByRole("button", { name: "Pin endpoint" }));
    await waitFor(() => expect(screen.getByTestId("gc-pinned")).toHaveTextContent("https://gw.northwind.example"));
    await userEvent.click(screen.getByRole("button", { name: "End s-0001" }));
    await waitFor(() => expect(screen.getByText("No sessions are open.")).toBeInTheDocument());
    const kinds = calls.filter((x) => x.url === "/api/agentcore-console/act").map((x) => JSON.parse(x.opts.body));
    expect(kinds.map((k) => k.kind)).toEqual(["close-bypass", "pin-endpoint", "end-session"]);
    expect(kinds[1].endpoint).toBe("https://gw.northwind.example"); expect(kinds[2].session).toBe("s-0001");
  });
  it("probes show the outcome and change nothing; the WAF drill follows the mode", async () => {
    await openGc();
    await userEvent.click(screen.getByRole("button", { name: "Send a call" }));
    expect(await screen.findByTestId("gc-probe-result")).toHaveTextContent("ALLOWED");
    await userEvent.click(screen.getByRole("button", { name: "WAF outage drill" }));
    await waitFor(() => expect(screen.getByTestId("gc-probe-result")).toHaveTextContent("PASSED UNSCREENED"));
    expect(calls.some((x) => x.url === "/api/agentcore-console/act")).toBe(false);
    expect(calls.filter((x) => x.url === "/api/agentcore-console/probe").every((x) => JSON.parse(x.opts.body).vertical === "retail")).toBe(true);
  });
  it("a server failure on a change shows the error and leaves the page as it was", async () => {
    await openGc();
    consoleFail = true;
    await userEvent.click(screen.getByRole("button", { name: "Disable orders-tool" }));
    expect(await screen.findByTestId("gc-fail")).toHaveTextContent("Refused (internal_error)");
    expect(screen.getByRole("button", { name: "Disable orders-tool" })).toBeInTheDocument();
  });
  it("Reset puts the gateway back; changing the vertical loads that vertical's gateway", async () => {
    await openGc();
    await userEvent.click(screen.getByRole("button", { name: "fail-closed" }));
    await waitFor(() => expect(screen.getByTestId("gc-green")).toHaveTextContent("1 of 3"));
    await userEvent.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.getByTestId("gc-green")).toHaveTextContent("0 of 3"));
    await pickVertical("health");
    await waitFor(() => expect(calls.some((x) => /agentcore-console\?vertical=health/.test(x.url))).toBe(true));
  });
});
