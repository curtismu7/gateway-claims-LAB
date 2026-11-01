// Recorded walkthroughs for the AgentCore console. The Mock tables are GENERATED from the engine (`npm run mock-table` writes consoleTable.json); a test
// fails when the committed file differs from what the engine gives now, and a parity test replays every step through the HTTP API and expects the same.
import { VERTICALS } from './cast.js';
import { ConsoleLab } from './consoleLab.js';

// `confirm: '<name>'` is replaced with the gateway's name for the vertical being run.
export const WALKTHROUGHS = [
  { id: 'harden', title: 'Harden the gateway, one switch at a time', say: 'Start at the seeded gateway and use the switches the deck names. The scorecard rises with each. It stops short of twelve because this model has no switch for network mode.', steps: [
    { op: 'act', params: { kind: 'set-waf', mode: 'fail-closed' } },
    { op: 'act', params: { kind: 'close-bypass', runtime: 'rt-1' } },
    { op: 'act', params: { kind: 'pin-endpoint', endpoint: 'https://gw.example.invalid' } },
    { op: 'act', params: { kind: 'set-enforcement', mode: 'ENFORCE', confirm: '<name>' } },
  ] },
  { id: 'confirmation', title: 'Enforcing needs the typed name', say: 'Flipping from log-only to enforcing is refused without the gateway\'s name, refused with a wrong one, and nothing changes until the right text is typed.', steps: [
    { op: 'act', params: { kind: 'set-enforcement', mode: 'ENFORCE' } },
    { op: 'act', params: { kind: 'set-enforcement', mode: 'ENFORCE', confirm: 'not-the-name' } },
    { op: 'act', params: { kind: 'set-enforcement', mode: 'ENFORCE', confirm: '<name>' } },
  ] },
  { id: 'log-only', title: 'Log-only logs, enforcing blocks', say: 'A principal no policy allows is let through while the engine only logs, and refused once it enforces.', steps: [
    { op: 'probe', params: { kind: 'gateway-call', principal: 'role-lab-unknown', target: 'tg-2' } },
    { op: 'act', params: { kind: 'set-enforcement', mode: 'ENFORCE', confirm: '<name>' } },
    { op: 'probe', params: { kind: 'gateway-call', principal: 'role-lab-unknown', target: 'tg-2' } },
  ] },
  { id: 'lockout', title: 'Closing a bypass can lock a caller out', say: 'The batch job reaches the runtime only directly, with no gateway allow. Closing the route reports it as locked out, and its direct call is then refused.', steps: [
    { op: 'probe', params: { kind: 'direct-runtime', principal: 'role-lab-batch-job', runtime: 'rt-1' } },
    { op: 'act', params: { kind: 'close-bypass', runtime: 'rt-1' } },
    { op: 'probe', params: { kind: 'direct-runtime', principal: 'role-lab-batch-job', runtime: 'rt-1' } },
  ] },
  { id: 'waf', title: 'WAF fail-open versus fail-closed', say: 'When the firewall is down, a fail-open gateway lets calls through unscreened and a fail-closed one refuses them.', steps: [
    { op: 'probe', params: { kind: 'waf-outage' } },
    { op: 'act', params: { kind: 'set-waf', mode: 'fail-closed' } },
    { op: 'probe', params: { kind: 'waf-outage' } },
  ] },
  { id: 'disable-target', title: 'Disable a tool target', say: 'A disabled target answers no calls, even to a principal a policy allows; enabling it again is a state change, and disabling twice is refused.', steps: [
    { op: 'act', params: { kind: 'set-target', target: 'tg-2', enabled: false } },
    { op: 'probe', params: { kind: 'gateway-call', principal: 'role-lab-batch-job', target: 'tg-2' } },
    { op: 'act', params: { kind: 'set-target', target: 'tg-2', enabled: false } },
    { op: 'act', params: { kind: 'set-target', target: 'tg-2', enabled: true } },
  ] },
];

// The status each refusal carries and the code, recorded beside the result so the table shows what a real run answered.
export function applyStep(lab, step) {
  const params = Object.fromEntries(Object.entries(step.params).map(([k, v]) => [k, v === '<name>' ? lab.gw.name : v]));
  try { return { ok: true, status: 200, result: step.op === 'act' ? lab.act(params) : lab.probe(params) }; }
  catch (e) { if (e && typeof e.code === 'string' && e.status) return { ok: false, status: e.status, code: e.code, detail: e.message }; throw e; }
}

export function runWalkthrough(cast, wt) {
  const lab = new ConsoleLab(cast);
  const steps = wt.steps.map((s) => ({ op: s.op, params: Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, v === '<name>' ? lab.gw.name : v])), ...applyStep(lab, s) }));
  const v = lab.view();
  return { id: wt.id, title: wt.title, say: wt.say, steps, final: { gateway: v.gateway, scorecard: v.scorecard, bypassDiff: v.bypassDiff, audit: v.audit } };
}

export function buildMockTable() {
  return { verticals: Object.fromEntries(Object.entries(VERTICALS).map(([name, cast]) => [name, { walkthroughs: WALKTHROUGHS.map((w) => runWalkthrough(cast, w)) }])) };
}
