// The "Users and groups from claims" tab: GET /api/claims-users and POST /api/claims-users/evaluate. Mounted inside the /api router, so the body is already
// parsed (8 kB cap), the Host check and the same-origin write check already ran, and every answer passes through maskDeep. A refusal is fixed JSON text that
// never echoes the request; an unknown field anywhere refuses the whole request before anything is run.
import express from 'express';
import { verticalFrom } from './cast.js';
import { ClaimsInputError } from './claims.js';
import { InputError, refuse } from './errors.js';
import { maskDeep } from './mask.js';
import { workspaceFrom } from './workspaces.js';
import { buildClaimsUsersStory, evaluateClaimsUsersRequest } from './claimsUsersStory.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const FIELDS = ['scenario', 'token', 'kid', 'subject', 'endUserClaim', 'endUserMode'];

export function createClaimsUsersRouter({ castOf, workspaces }) {
  const r = express.Router();
  r.use((_req, res, next) => { const send = res.json.bind(res); res.json = (b) => send(maskDeep(b)); res.set('Cache-Control', 'no-store'); next(); });
  const wrap = (fn) => (req, res, next) => {
    try { return fn(req, res); } catch (e) {
      if (e instanceof InputError) return res.status(e.status).json({ error: e.code, detail: e.message });
      if (e instanceof ClaimsInputError) return res.status(400).json({ error: e.code, detail: e.message });
      return next(e);
    }
  };
  const castFor = (req) => castOf(verticalFrom(req.body?.vertical ?? req.query.vertical));

  r.get('/claims-users', wrap((req, res) => res.json({ ...buildClaimsUsersStory(castFor(req)), simulated: true })));
  r.post('/claims-users/evaluate', wrap((req, res) => {
    const id = workspaceFrom(req);
    if (!id) return res.status(400).json({ error: 'bad_workspace' });
    const b = req.body;
    if (!isObj(b)) throw refuse('bad_request', 'the body must be a JSON object');
    if (!Object.keys(b).every((k) => k === 'vertical' || FIELDS.includes(k))) throw refuse('unknown_field', 'the body carries a field the lab does not take');
    const cast = castFor(req);
    const out = evaluateClaimsUsersRequest(buildClaimsUsersStory(cast), b, cast, req.headers.traceparent);
    workspaces.record(id, { scenario: `claims-users:${out.scenario}`, decision: out.decision });
    res.set('traceparent', out.traceparent);
    return res.json({ ...out, workspace: id, simulated: true });
  }));
  return r;
}
