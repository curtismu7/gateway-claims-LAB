import { useCallback, useEffect, useState } from "react";
import Json from "./Json";
import { evaluateScope } from "../api";
import { visible } from "../safeText";

const STATUS_CLASS = { measured: "tag tag--ok", inferred: "tag", UNVERIFIED: "tag tag--warn" };

function Outcome({ run }) {
  if (!run) return <p className="muted" data-testid="scope-empty">Pick a scenario to run it.</p>;
  const { result } = run;
  const allow = result.decision === "allow";
  return (
    <div className={`verdict verdict--${allow ? "allow" : "deny"}`} data-testid="scope-verdict" role="status">
      <strong className="verdict__word">{allow ? "ALLOW" : "DENY"}</strong> <span>HTTP {result.status}</span>
      {result.jsonRpcCode !== undefined && <span> JSON-RPC {result.jsonRpcCode}: {visible(result.message)}</span>}
      {result.shadow && <p>Shadow only: the policy is a candidate (State is not Active), so nothing was enforced.</p>}
      {run.kind === "pf" && <p>Token served by <code>{visible(result.atm)}</code></p>}
      {run.kind === "tiers" && <ul className="verdict__reasons">{result.matched.map((r) => <li key={r.id}><code>{visible(r.id)}</code> rule ({r.anyOf.map(visible).join(" or ")}): {r.ok ? `matched, opens ${r.tools} tools` : "no match"}</li>)}</ul>}
      <ul className="verdict__reasons">{result.log.map((l) => <li key={l}><code>{visible(l)}</code></li>)}</ul>
    </div>
  );
}

function Section({ section, resetSignal }) {
  const [id, setId] = useState(section.scenarios[0].id);
  const [scope, setScope] = useState(section.scenarios[0].scope);
  const [run, setRun] = useState(null);
  const [fail, setFail] = useState(null);
  const scenario = section.scenarios.find((s) => s.id === id) || section.scenarios[0];
  const exec = useCallback(async (sid, text) => {
    setFail(null);
    const res = await evaluateScope({ scenario: sid, ...(text !== undefined ? { scope: text } : {}) }).catch(() => ({ ok: false, status: 0, body: {} }));
    if (res.ok) setRun(res.body); else { setRun(null); setFail(`Could not evaluate (${res.body.error || res.status}${res.body.detail ? `: ${res.body.detail}` : ""}).`); }
  }, []);
  useEffect(() => { setScope(scenario.scope); exec(id); }, [id, resetSignal, exec]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Request pane shows the scope the SERVER accepted (its answer echoes it), never text still in the box or refused as credential-like.
  const shownScope = run && run.input && typeof run.input.scope === "string" ? run.input.scope : scenario.scope;
  const request = section.kind === "pf"
    ? { method: "POST", url: "https://pf.example/as/token.oauth2", form: { grant_type: "client_credentials", scope: shownScope, ...(scenario.resource ? { resource: scenario.resource } : {}) } }
    : section.kind === "cedar" ? { method: "POST", url: "<agent app URL>", jsonrpc: { method: "tools/call", params: { name: scenario.tool } }, bearerScope: shownScope, policyState: scenario.state === "Active" ? "Active" : "(empty: candidate)" }
      : { method: "POST", url: "<agent app URL>", jsonrpc: { method: "tools/list" }, bearerScope: shownScope };
  return (
    <section className="panel" aria-labelledby={`sg-${section.id}`} data-testid={`scope-section-${section.id}`}>
      <h2 id={`sg-${section.id}`}>{section.title}</h2>
      <p className="muted">{section.intro}</p>
      {section.policy && <Json value={section.policy} label="Cedar policy" />}
      {section.rules && <Json value={{ RequiredClaims_rules: section.rules.map((r) => ({ rule: r.id, Map: { scope: { Elems: r.anyOf } }, opens_tools: r.tools })) }} label="RequiredClaims rules" />}
      <div className="seg" role="group" aria-label={`${section.title} scenario`}>
        {section.scenarios.map((s) => <button key={s.id} type="button" aria-pressed={s.id === id} onClick={() => setId(s.id)}>{s.title}</button>)}
      </div>
      <p><span className={STATUS_CLASS[scenario.evidence] || "tag"}>{scenario.evidence}</span> <span className="lesson" data-testid={`scope-lesson-${section.id}`}>{scenario.lesson}</span></p>
      {fail && <p className="field-error" role="alert">{fail}</p>}
      <Outcome run={run} />
      <h3>Request</h3><Json value={request} label="Request" />
      {run && <><h3>Response</h3><Json value={run.result} label="Response" /></>}
      <label htmlFor={`sg-scope-${section.id}`}>Try your own scope (space separated)</label>
      <input id={`sg-scope-${section.id}`} type="text" value={scope} maxLength={256} onChange={(e) => setScope(e.target.value)} spellCheck={false} autoComplete="off" />
      <button type="button" onClick={() => exec(id, scope)}>Evaluate this scope</button>
    </section>
  );
}

export default function ScopeGate({ scope: story, resetSignal }) {
  return (
    <div className="gate">
      <section className="panel"><h2>{story.title}</h2><p>{story.intro}</p><p className="tag tag--warn">{story.tokenLabel}</p></section>
      {story.sections.map((s) => <Section key={s.id} section={s} resetSignal={resetSignal} />)}
      <section className="panel" aria-labelledby="sg-facts">
        <h2 id="sg-facts">What we know, and how well</h2>
        <ul className="facts" data-testid="scope-facts">
          {story.facts.map((f) => <li key={f.id}><span className={STATUS_CLASS[f.status] || "tag"}>{f.status}</span> {f.text} <span className="muted">Source: {f.source}.</span></li>)}
        </ul>
      </section>
    </div>
  );
}
