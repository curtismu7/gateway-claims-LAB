// The two H2 2026 release tabs: /api/obo (on-behalf-of) and /api/agentcore-console (AgentCore gateway governance). Mounted inside the /api router, so the
// body is already parsed (8 kB cap), the Host check and the same-origin write check already ran. Every answer passes through maskDeep, a refusal is fixed
// JSON text that never echoes the request, and an unknown field anywhere refuses the whole request before anything is changed.
import express from 'express';
import { verticalFrom } from './cast.js';
import { InputError, refuse } from './errors.js';
import { maskDeep } from './mask.js';
import { workspaceFrom } from './workspaces.js';
import { buildOboStory, evaluateOboScenario, normalizeOverrides } from './oboStory.js';
import { buildConsoleStory } from './consoleStory.js';
import { newTrace } from './trace.js';
import { MOCK_TABLE } from './consoleTableData.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createReleaseRouter({ castOf, workspaces, consoles }) {
  const r = express.Router();
  r.use((_req, res, next) => { const send = res.json.bind(res); res.json = (b) => send(maskDeep(b)); res.set('Cache-Control', 'no-store'); next(); });
  const ws = (req, res) => { const id = workspaceFrom(req); if (!id) res.status(400).json({ error: 'bad_workspace' }); return id; };
  const wrap = (fn) => (req, res, next) => {
    try { return fn(req, res); } catch (e) {
      if (e instanceof InputError) return res.status(e.status).json({ error: e.code, detail: e.message });
      return next(e);
    }
  };
  // Strict body: an object whose keys are all in `allowed`. `vertical` is always allowed and is picked by name only.
  const strict = (req, allowed) => {
    const b = req.body;
    if (!isObj(b)) throw refuse('bad_request', 'the body must be a JSON object');
    if (!Object.keys(b).every((k) => k === 'vertical' || allowed.includes(k))) throw refuse('unknown_field', 'the body carries a field the lab does not take');
    return b;
  };
  // The vertical comes from the body (a write) or the query (a read); an unknown name keeps the default, and is never echoed.
  const verticalOf = (req) => verticalFrom(req.body?.vertical ?? req.query.vertical);
  const castFor = (req) => castOf(verticalOf(req));
  const info = (b) => ({ ...b, simulated: true });

  r.get('/obo', wrap((req, res) => res.json(info(buildOboStory(castFor(req))))));
  r.post('/obo/evaluate', wrap((req, res) => {
    const id = ws(req, res); if (!id) return;
    const body = strict(req, ['scenario', 'resource', 'scope']);
    const cast = castFor(req);
    const out = evaluateOboScenario(buildOboStory(cast), body.scenario, normalizeOverrides(body), cast, req.headers.traceparent);
    workspaces.record(id, { scenario: `obo:${out.scenario}`, decision: out.result.decision });
    res.set('traceparent', out.traceparent);
    return res.json({ ...out, workspace: id });
  }));

  const consoleView = (id, lab, vertical) => ({ workspace: id, vertical, ...lab.view() });
  r.get('/agentcore-console', wrap((req, res) => {
    const id = ws(req, res); if (!id) return;
    const vertical = verticalOf(req); const cast = castFor(req);
    return res.json(info({ story: buildConsoleStory(cast), ...consoleView(id, consoles.peek(id, vertical, cast), vertical) }));
  }));
  r.get('/agentcore-console/walkthroughs', wrap((req, res) => {
    const vertical = verticalOf(req);
    return res.json(info({ vertical, source: 'generated from the engine (npm run mock-table); never edited by hand', walkthroughs: MOCK_TABLE.verticals[vertical].walkthroughs }));
  }));
  const hopFor = (traceparent, label, method, url, status) => {
    const trace = newTrace(traceparent); const tp = `00-${trace.traceId}-${trace.span()}-01`;
    return { traceId: trace.traceId, traceparent: tp, hops: [{ n: 1, from: 'lab', to: 'control-api', label, traceparent: tp, request: `${method} ${url}\ntraceparent: ${tp}\n(an illustration: never sent)`, response: `HTTP/1.1 ${status}\ntraceparent: ${tp}` }] };
  };
  r.post('/agentcore-console/act', wrap((req, res) => {
    const id = ws(req, res); if (!id) return;
    if (!isObj(req.body)) throw refuse('bad_request', 'the body must be a JSON object');
    // The lab itself refuses any field the action does not take; `vertical` only picks the cast.
    const { vertical: _v, ...action } = req.body;
    const vertical = verticalOf(req); const cast = castFor(req);
    const lab = consoles.lab(id, vertical, cast);
    const result = lab.act(action);
    const h = hopFor(req.headers.traceparent, `Lab controller to the AgentCore control API: ${result.kind}`, 'POST', `https://control.agentcore.lab.example/gateways/${lab.gw.id}/${result.kind}`, '200 OK');
    res.set('traceparent', h.traceparent);
    return res.json({ ...result, hops: h.hops, traceId: h.traceId, ...consoleView(id, lab, vertical) });
  }));
  r.post('/agentcore-console/probe', wrap((req, res) => {
    const id = ws(req, res); if (!id) return;
    if (!isObj(req.body)) throw refuse('bad_request', 'the body must be a JSON object');
    const { vertical: _v, ...probe } = req.body;
    const vertical = verticalOf(req); const cast = castFor(req);
    const result = consoles.peek(id, vertical, cast).probe(probe);
    const h = hopFor(req.headers.traceparent, `Probe: ${result.kind}`, 'POST', 'https://gateway.agentcore.lab.example/invoke', result.outcome === 'allowed' || result.outcome === 'passed unscreened' ? '200 OK' : '403 Forbidden');
    res.set('traceparent', h.traceparent);
    return res.json({ ...result, hops: h.hops, traceId: h.traceId, workspace: id });
  }));
  // Unknown paths under these prefixes fall through to the /api 404.
  return r;
}
