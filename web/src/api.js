import { workspaceFetch } from "./workspace";

export async function getJson(url) {
  const r = await workspaceFetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// POST /api/evaluate. Returns { ok, body }: a 400 is data (a code and a detail), not an exception.
export async function evaluate(payload) {
  const r = await workspaceFetch("/api/evaluate", { method: "POST", body: JSON.stringify(payload) });
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
}

export const resetWorkspace = () => workspaceFetch("/api/reset", { method: "POST", body: "{}" }).then((r) => r.ok);

// Rule 19: POST /api/mode with exactly { source }. Returns { ok, status, body }.
export async function postJson(url, payload) {
  const r = await workspaceFetch(url, { method: "POST", body: JSON.stringify(payload) });
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
}

// POST /api/scope-gate/evaluate: a v1.261027 scenario id, optionally with the visitor's own scope text.
export async function evaluateScope(payload) {
  const r = await workspaceFetch("/api/scope-gate/evaluate", { method: "POST", body: JSON.stringify(payload) });
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
}

// POST /api/agentcore/evaluate: a v1.261028 scenario id.
export async function evaluateAgentcore(payload) {
  const r = await workspaceFetch("/api/agentcore/evaluate", { method: "POST", body: JSON.stringify(payload) });
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
}

const post = async (url, payload) => {
  const r = await workspaceFetch(url, { method: "POST", body: JSON.stringify(payload) });
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
};
// POST /api/obo/evaluate: a scenario id, optionally the backend choice and the scope text (the release tab, on-behalf-of).
export const evaluateObo = (payload) => post("/api/obo/evaluate", payload);
// POST /api/agentcore-console/act and /probe: a change to the modelled gateway, or a read-only probe of it.
export const consoleAct = (payload) => post("/api/agentcore-console/act", payload);
export const consoleProbe = (payload) => post("/api/agentcore-console/probe", payload);
