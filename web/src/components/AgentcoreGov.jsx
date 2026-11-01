import { useCallback, useEffect, useState } from "react";
import Json from "./Json";
import { evaluateAgentcore } from "../api";
import { visible } from "../safeText";

const STATUS_CLASS = { measured: "tag tag--ok", inferred: "tag", UNVERIFIED: "tag tag--warn" };

function Outcome({ run }) {
  if (!run) return <p className="muted" data-testid="ag-empty">Pick a scenario to run it.</p>;
  const r = run.result;
  const bad = run.kind === "bypass" ? r.bypassPossible : r.risky;
  return (
    <div className={`verdict verdict--${bad ? "deny" : "allow"}`} data-testid="ag-verdict" role="status">
      <strong className="verdict__word">{run.kind === "bypass" ? (r.bypassPossible ? "BYPASS POSSIBLE" : "NO BYPASS") : visible(r.callerClass)}</strong>
      {run.kind === "bypass" ? <p>{visible(r.reason)}</p> : <p>{visible(r.summary)}</p>}
      {run.kind === "bypass" && r.directInvokers.length > 0 && <p>Direct callers: <code>{r.directInvokers.map(visible).join(", ")}</code></p>}
    </div>
  );
}

function Section({ section, resetSignal }) {
  const [id, setId] = useState(section.scenarios[0].id);
  const [run, setRun] = useState(null);
  const [fail, setFail] = useState(null);
  const scenario = section.scenarios.find((s) => s.id === id) || section.scenarios[0];
  const exec = useCallback(async (sid) => {
    setFail(null);
    const res = await evaluateAgentcore({ scenario: sid }).catch(() => ({ ok: false, status: 0, body: {} }));
    if (res.ok) setRun(res.body); else { setRun(null); setFail(`Could not evaluate (${res.body.error || res.status}).`); }
  }, []);
  useEffect(() => { exec(id); }, [id, resetSignal, exec]);
  const input = section.kind === "bypass" ? { runtimePolicyStatements: scenario.statements, gatewayOnly: scenario.gatewayOnly } : { authorizerType: scenario.authorizerType, targets: scenario.targets };
  return (
    <section className="panel" aria-labelledby={`ag-${section.id}`} data-testid={`ag-section-${section.id}`}>
      <h2 id={`ag-${section.id}`}>{section.title}</h2>
      <p className="muted">{section.intro}</p>
      <div className="seg" role="group" aria-label={`${section.title} scenario`}>
        {section.scenarios.map((s) => <button key={s.id} type="button" aria-pressed={s.id === id} onClick={() => setId(s.id)}>{s.title}</button>)}
      </div>
      <p><span className={STATUS_CLASS[scenario.evidence] || "tag"}>{scenario.evidence}</span> <span className="lesson" data-testid={`ag-lesson-${section.id}`}>{scenario.lesson}</span></p>
      {fail && <p className="field-error" role="alert">{fail}</p>}
      <Outcome run={run} />
      <h3>Input (mock)</h3><Json value={input} label="Input" />
      {run && <><h3>Result</h3><Json value={run.result} label="Result" /></>}
    </section>
  );
}

function Table({ rows, caption }) {
  return (
    <div className="scroll">
      <table className="tbl">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">What it appears to do</th></tr></thead>
        <tbody>{rows.map(([n, d]) => <tr key={n}><th scope="row">{n}</th><td>{d}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function AgentcoreGov({ story, resetSignal }) {
  return (
    <div className="gate">
      <section className="panel"><h2>{story.title}</h2><p>{story.intro}</p><p className="tag tag--warn">{story.tokenLabel}</p></section>
      <section className="panel" aria-labelledby="ag-caps">
        <h2 id="ag-caps">What the gateway gained (read from the binary)</h2>
        <Table rows={story.manage} caption="Change an AgentCore gateway (INFERRED from function names)" />
        <Table rows={story.analyze} caption="Grade what exists (INFERRED from function names)" />
      </section>
      {story.sections.map((s) => <Section key={s.id} section={s} resetSignal={resetSignal} />)}
      <section className="panel" aria-labelledby="ag-facts">
        <h2 id="ag-facts">What we know, and how well</h2>
        <ul className="facts" data-testid="ag-facts">
          {story.facts.map((f) => <li key={f.id}><span className={STATUS_CLASS[f.status] || "tag"}>{f.status}</span> {f.text} <span className="muted">Source: {f.source}.</span></li>)}
        </ul>
      </section>
    </div>
  );
}
